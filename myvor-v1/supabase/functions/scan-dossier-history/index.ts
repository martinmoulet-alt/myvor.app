import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.111.0";
import {corsHeaders} from "npm:@supabase/supabase-js@2.111.0/cors";

const H={...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENGINE="canonical-corpus-reader-v13-eu-derived-recall";
const DERIVED_ENGINE="eu-derived-recall-v1";
const CELLAR="https://publications.europa.eu";

type Canonical={id:string;url:string;jurisdiction:"EU"|"FR"};
type DerivedCandidate={celex:string;root_celex:string;relation:"implementing"|"delegated"|"amending"};
type DerivedDoc={celex:string;root_celex:string;relation:string;title:string;nature:string;url:string;published_at:string|null;text:string};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:H});}
function clip(v:unknown,n:number){return String(v??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,n).trim();}
function list(v:unknown){return Array.isArray(v)?v.map(x=>String(x||"").trim()).filter(Boolean):[];}
function adminKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const k=JSON.parse(raw),v=k?.default||Object.values(k||{})[0];if(typeof v==="string"&&v)return v;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function norm(v:unknown){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function outputText(p:any){if(typeof p?.output_text==="string")return p.output_text;return(p?.output||[]).flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||"").join("");}
function safeDate(v:unknown){const t=Date.parse(String(v||""));return Number.isFinite(t)&&t<=Date.now()+36*3600_000&&t>Date.UTC(1900,0,1)?new Date(t).toISOString():null;}

function identifiers(refs:string[]):Canonical[]{
  const out:Canonical[]=[];const seen=new Set<string>();
  for(const ref of refs){
    const upper=ref.toUpperCase();
    const celex=upper.match(/\b([356][0-9A-Z()_.-]{5,70})\b/)?.[1];
    const fr=upper.match(/\b(JORFTEXT\d+|LEGITEXT\d+|LEGIARTI\d+|JORFARTI\d+|CNILTEXT\d+)\b/)?.[1];
    if(celex&&!seen.has(celex)){seen.add(celex);out.push({id:celex,jurisdiction:"EU",url:`https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:${celex}`});}
    if(fr&&!seen.has(fr)){seen.add(fr);const url=fr.startsWith("LEGITEXT")?`https://www.legifrance.gouv.fr/codes/texte_lc/${fr}/`:fr.startsWith("LEGIARTI")?`https://www.legifrance.gouv.fr/codes/article_lc/${fr}`:`https://www.legifrance.gouv.fr/jorf/id/${fr}`;out.push({id:fr,jurisdiction:"FR",url});}
  }
  return out;
}

function rootNumber(celex:string){
  const m=celex.toUpperCase().match(/^3(20\d{2})[RLD](\d{4,5})$/);
  if(!m)return"";
  return `${m[1]}/${String(Number(m[2]))}`;
}

function decodeEntities(value:string){
  const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",laquo:"«",raquo:"»",ndash:"–",mdash:"—",hellip:"…",eacute:"é",egrave:"è",ecirc:"ê",agrave:"à",ccedil:"ç",ugrave:"ù",rsquo:"’",ldquo:"“",rdquo:"”"};
  return value.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,raw:string)=>{const n=raw.toLowerCase().startsWith("x")?parseInt(raw.slice(1),16):parseInt(raw,10);try{return Number.isFinite(n)?String.fromCodePoint(n):_;}catch{return _;}})
    .replace(/&([a-z][a-z0-9]+);/gi,(whole,name:string)=>named[name.toLowerCase()]??whole);
}
function cleanHtml(value:string){
  return clip(decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<svg\b[\s\S]*?<\/svg>/gi," ").replace(/<nav\b[\s\S]*?<\/nav>/gi," ").replace(/<header\b[\s\S]*?<\/header>/gi," ").replace(/<footer\b[\s\S]*?<\/footer>/gi," ").replace(/<[^>]+>/g," ")),70000);
}
function titleFromHtml(html:string,celex:string){
  const candidates=[
    html.match(/<meta[^>]+(?:name|property)=["'](?:DC\.title|dcterms\.title|og:title)["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:DC\.title|dcterms\.title|og:title)["']/i)?.[1],
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  ].map(x=>x?clip(decodeEntities(String(x).replace(/<[^>]+>/g," ")),1200):"").filter(Boolean);
  return candidates.find(x=>x.length>=12&&!/publications office|eur-lex|access to european union law/i.test(x.toLowerCase()))||candidates[0]||`Acte UE — CELEX ${celex}`;
}
function dateFromHtml(html:string){
  for(const p of [
    /<meta[^>]+(?:name|property)=["'](?:DC\.date|dcterms\.date|date|article:published_time)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:DC\.date|dcterms\.date|date|article:published_time)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i
  ]){const d=safeDate(html.match(p)?.[1]);if(d)return d;}
  return null;
}
function natureFromTitle(title:string,relation:string){
  const n=norm(title);
  if(n.includes("delegated regulation")||n.includes("reglement delegue")||relation==="delegated")return"Règlement délégué de l’Union européenne";
  if(n.includes("implementing regulation")||n.includes("reglement d execution")||relation==="implementing")return"Règlement d’exécution de l’Union européenne";
  if(n.includes("directive"))return"Directive de l’Union européenne";
  if(n.includes("decision"))return"Décision de l’Union européenne";
  return"Règlement de l’Union européenne";
}
async function fetchCelex(celex:string){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),14000);
  try{
    const r=await fetch(`${CELLAR}/resource/celex/${encodeURIComponent(celex)}`,{redirect:"follow",cache:"no-store",signal:ctl.signal,headers:{"User-Agent":"Myvor-EU-Recall/1.0","Accept":"application/xhtml+xml,text/html,*/*","Accept-Language":"fr,en;q=0.8"}});
    if(!r.ok)throw new Error(`Cellar HTTP ${r.status}`);
    const html=await r.text();
    if(html.length>3_000_000)throw new Error("Réponse Cellar trop volumineuse");
    return{html,text:cleanHtml(html),title:titleFromHtml(html,celex),published_at:dateFromHtml(html)};
  }finally{clearTimeout(timer);}
}
function verifiesDirectDerivation(title:string,text:string,root:string){
  const number=rootNumber(root);if(!number)return false;
  const nt=norm(title),nf=norm(text.slice(0,14000)),needle=norm(number);
  if(!nt.includes(needle)&&!nf.includes(needle))return false;
  const relation=/(supplement|complet|pursuant|conformement|implement|execution|application|specif|precis|amend|modif|laying down|etablissant)/;
  return relation.test(nt)||relation.test(nf.slice(0,5500));
}

async function askDerivedCandidates(api:string,roots:string[],dossier:any):Promise<DerivedCandidate[]>{
  if(!api||!roots.length)return[];
  const schema={type:"object",additionalProperties:false,properties:{candidates:{type:"array",maxItems:10,items:{type:"object",additionalProperties:false,properties:{celex:{type:"string"},root_celex:{type:"string"},relation:{type:"string",enum:["implementing","delegated","amending"]}},required:["celex","root_celex","relation"]}}},required:["candidates"]};
  const instructions=[
    "Tu complètes un corpus juridique européen avec une exigence de précision maximale.",
    "À partir des actes UE racines fournis, retourne uniquement des actes juridiques UE ADOPTÉS ET PUBLIÉS qui découlent directement d'un acte racine.",
    "Sont admis uniquement : règlements d'exécution, règlements délégués, décisions d'exécution ou actes modificatifs dont la base juridique ou le titre cite explicitement l'acte racine.",
    "Exclus : propositions COM, consultations, orientations, FAQ, communiqués, actes seulement thématiques, actes simplement cités par la racine, textes que la racine modifie elle-même.",
    "Ne retourne jamais l'acte racine lui-même. N'invente aucun CELEX. Si tu n'es pas certain, omets le candidat.",
    "Le contrôle final sera effectué sur le texte officiel EUR-Lex."
  ].join("\n");
  const input=JSON.stringify({roots,dossier:{title:clip(dossier.title,400),objective:clip(dossier.objective,1000),context:clip(dossier.context,1000)}});
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),22000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:ctl.signal,headers:{Authorization:`Bearer ${api}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("OPENAI_DOSSIER_MODEL")||"gpt-5-mini",store:false,instructions,input,reasoning:{effort:"low"},max_output_tokens:900,text:{verbosity:"low",format:{type:"json_schema",name:"eu_derived_candidates_v1",strict:true,schema}}})});
    if(!r.ok)return[];
    const p=await r.json(),raw=outputText(p);let parsed:any={};
    try{parsed=JSON.parse(raw||"{}");}catch{return[];}
    const allowedRoots=new Set(roots.map(x=>x.toUpperCase()));
    return(Array.isArray(parsed?.candidates)?parsed.candidates:[]).map((x:any)=>({celex:clip(x.celex,80).toUpperCase(),root_celex:clip(x.root_celex,80).toUpperCase(),relation:String(x.relation||"") as DerivedCandidate["relation"]}))
      .filter((x:DerivedCandidate)=>/^3[0-9A-Z()_.-]{5,70}$/.test(x.celex)&&allowedRoots.has(x.root_celex)&&x.celex!==x.root_celex&&["implementing","delegated","amending"].includes(x.relation))
      .slice(0,10);
  }catch{return[];}finally{clearTimeout(timer);}
}

async function expandDerivedEU(admin:any,d:any,roots:string[],createdBy:string){
  const api=Deno.env.get("OPENAI_API_KEY")||"";
  const candidates=await askDerivedCandidates(api,roots,d);
  const verified:DerivedDoc[]=[];const rejected:string[]=[];
  for(const c of candidates){
    try{
      const fetched=await fetchCelex(c.celex);
      if(fetched.text.length<150||!verifiesDirectDerivation(fetched.title,fetched.text,c.root_celex)){rejected.push(c.celex);continue;}
      verified.push({celex:c.celex,root_celex:c.root_celex,relation:c.relation,title:fetched.title,nature:natureFromTitle(fetched.title,c.relation),url:`https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:${c.celex}`,published_at:fetched.published_at,text:fetched.text});
    }catch{rejected.push(c.celex);}
  }
  if(!verified.length)return{candidates:candidates.length,verified:0,added:0,rejected};
  const now=new Date().toISOString();let added=0;
  const refSet=new Map<string,string>();
  for(const ref of list(d.reference_texts)){const id=String(ref).match(/\b([356][0-9A-Z()_.-]{5,70}|JORFTEXT\d+|LEGITEXT\d+|LEGIARTI\d+|JORFARTI\d+|CNILTEXT\d+)\b/i)?.[1]?.toUpperCase();if(id)refSet.set(id,ref);}
  for(const doc of verified){
    await admin.from("watch_items").upsert({user_id:d.user_id,organization_id:d.organization_id,created_by:createdBy,dossier_id:null,title:doc.title,nature:doc.nature,source_url:doc.url,source_name:"EUR-Lex / Cellar",published_at:doc.published_at,urgency:"moyen"},{onConflict:"organization_id,source_url",ignoreDuplicates:true});
    const{data:item,error:itemError}=await admin.from("watch_items").select("id,dossier_id").eq("organization_id",d.organization_id).eq("source_url",doc.url).maybeSingle();
    if(itemError||!item)continue;
    await admin.from("watch_item_content").upsert({watch_item_id:item.id,organization_id:d.organization_id,source_text:doc.text,source_text_chars:doc.text.length,fetched_at:now,updated_at:now},{onConflict:"watch_item_id"});
    const reason=`Acte UE directement dérivé de ${rootNumber(doc.root_celex)||doc.root_celex}, vérifié dans la source officielle (${doc.relation}).`;
    const{error:linkError}=await admin.from("watch_item_dossier_links").upsert({watch_item_id:item.id,dossier_id:d.id,organization_id:d.organization_id,status:"linked",score:.995,reason,engine:DERIVED_ENGINE,updated_at:now},{onConflict:"watch_item_id,dossier_id"});
    if(linkError)continue;
    if(!item.dossier_id||item.dossier_id===d.id)await admin.from("watch_items").update({dossier_id:d.id,qualification_confidence:.995,qualification_reason:reason,qualified_at:now}).eq("id",item.id);
    refSet.set(doc.celex,`${doc.celex} — ${doc.title}`);added++;
  }
  const refs=[...refSet.values()];
  if(added&&JSON.stringify(refs)!==JSON.stringify(list(d.reference_texts)))await admin.from("dossiers").update({reference_texts:refs}).eq("id",d.id);
  return{candidates:candidates.length,verified:verified.length,added,rejected};
}

async function readCanonical(admin:any,d:any,canonical:Canonical[]){
  const exactUrls=canonical.map(x=>x.url);
  const{data:exact,error:ie}=await admin.from("watch_items").select("id,title,nature,source_url,dossier_id,qualification_confidence,qualification_reason,change_type,change_summary,published_at,created_at").eq("organization_id",d.organization_id).in("source_url",exactUrls);
  if(ie)throw ie;
  const byUrl=new Map((exact||[]).map((x:any)=>[String(x.source_url),x]));
  const missing=canonical.filter(x=>!byUrl.has(x.url));
  if(missing.length){
    const links=await admin.from("watch_item_dossier_links").select("watch_item_id,score,reason,engine").eq("dossier_id",d.id).eq("status","linked");
    if(!links.error&&links.data?.length){
      const ids=links.data.map((x:any)=>x.watch_item_id);
      const w=await admin.from("watch_items").select("id,title,nature,source_url,dossier_id,qualification_confidence,qualification_reason,change_type,change_summary,published_at,created_at").in("id",ids);
      for(const item of w.data||[]){const src=String((item as any).source_url||"");for(const m of missing){if(src.includes(m.id)){byUrl.set(m.url,item);break;}}}
    }
  }
  return canonical.map(c=>{const item:any=byUrl.get(c.url);if(!item)return null;return{id:item.id,title:item.title,score:.999,status:"linked",reason:item.qualification_reason||`Texte ${c.jurisdiction==="FR"?"français":"européen"} du corpus juridique canonique.`,change_type:item.change_type,change_summary:item.change_summary,jurisdiction:c.jurisdiction,canonical_id:c.id};}).filter(Boolean);
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",key=adminKey(),authorization=req.headers.get("Authorization")||"";
  if(!url||!key)return json({error:"Configuration serveur incomplète"},503);
  if(!authorization.startsWith("Bearer "))return json({error:"Authentification requise"},401);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),token=authorization.replace(/^Bearer\s+/i,"").trim();
  const{data:authData,error:authError}=await admin.auth.getUser(token),user=authData?.user;
  if(authError||!user)return json({error:"Session invalide"},401);
  const body=await req.json().catch(()=>null),dossierId=clip(body?.dossier_id,80);
  if(!UUID.test(dossierId))return json({error:"dossier_id invalide"},400);
  const{data:d,error:de}=await admin.from("dossiers").select("id,user_id,created_by,organization_id,title,objective,context,reference_texts").eq("id",dossierId).maybeSingle();
  if(de||!d)return json({error:"Dossier introuvable"},404);
  const{data:membership,error:me}=await admin.from("organization_members").select("user_id").eq("organization_id",d.organization_id).eq("user_id",user.id).maybeSingle();
  if(me)return json({error:"Vérification des droits impossible"},503);
  if(!(d.user_id===user.id||!!membership))return json({error:"Accès interdit"},403);

  let refs=list(d.reference_texts),canonical=identifiers(refs);
  const rootEu=canonical.filter(x=>x.jurisdiction==="EU"&&x.id.startsWith("3")).map(x=>x.id).slice(0,4);
  let expansion={candidates:0,verified:0,added:0,rejected:[] as string[]};
  if(rootEu.length){
    expansion=await expandDerivedEU(admin,d,rootEu,String(d.created_by||d.user_id||user.id));
    if(expansion.added){
      const{data:fresh}=await admin.from("dossiers").select("reference_texts").eq("id",d.id).maybeSingle();
      refs=list(fresh?.reference_texts);canonical=identifiers(refs);
    }
  }

  if(canonical.length){
    let results:any[]=[];
    try{results=await readCanonical(admin,d,canonical);}catch(error:any){return json({error:`Lecture du corpus canonique impossible : ${clip(error?.message||error,180)}`},500);}
    const fr=results.filter((x:any)=>x.jurisdiction==="FR").length,eu=results.filter((x:any)=>x.jurisdiction==="EU").length;
    return json({ok:true,engine:ENGINE,dossier_id:d.id,canonical_reference_count:canonical.length,expansion,scanned:results.length,processed:results.length,linked:results.length,suggested:0,rejected:0,unlinked:0,fr,eu,auto_link_threshold:1,review_threshold:1,results,message:`${results.length} texte(s) du corpus canonique — ${fr} FR / ${eu} UE. ${expansion.added?`${expansion.added} acte(s) UE dérivé(s) ajouté(s).`:""}`.trim()});
  }

  const{data:links,error:le}=await admin.from("watch_item_dossier_links").select("watch_item_id,score,reason").eq("dossier_id",d.id).eq("status","linked").order("score",{ascending:false}).limit(250);
  if(le)return json({error:`Lecture des rattachements impossible : ${clip(le.message,180)}`},500);
  const ids=(links||[]).map((x:any)=>x.watch_item_id);let items:any[]=[];
  if(ids.length){const r=await admin.from("watch_items").select("id,title,nature,source_url,dossier_id,qualification_confidence,qualification_reason,change_type,change_summary,published_at,created_at").in("id",ids);if(r.error)return json({error:`Lecture des textes liés impossible : ${clip(r.error.message,180)}`},500);items=r.data||[];}
  const scoreById=new Map((links||[]).map((x:any)=>[String(x.watch_item_id),Number(x.score)||0]));
  const results=items.map((item:any)=>({id:item.id,title:item.title,score:scoreById.get(String(item.id))||0,status:"linked",reason:item.qualification_reason||"Texte déjà rattaché au dossier.",change_type:item.change_type,change_summary:item.change_summary}));
  return json({ok:true,engine:"linked-items-reader-v13",dossier_id:d.id,expansion,scanned:results.length,processed:results.length,linked:results.length,suggested:0,rejected:0,unlinked:0,results,message:`${results.length} texte(s) déjà rattaché(s).`});
});
