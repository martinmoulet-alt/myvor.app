import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.111.0";
import {corsHeaders} from "npm:@supabase/supabase-js@2.111.0/cors";

const H={...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:H});}
function clip(v:unknown,n:number){return String(v??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,n).trim();}
function list(v:unknown){return Array.isArray(v)?v.map(x=>String(x||"").trim()).filter(Boolean):[];}
function adminKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const k=JSON.parse(raw),v=k?.default||Object.values(k||{})[0];if(typeof v==="string"&&v)return v;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function identifiers(refs:string[]){const out:{id:string;url:string;jurisdiction:"EU"|"FR"}[]=[];const seen=new Set<string>();for(const ref of refs){const upper=ref.toUpperCase();const celex=upper.match(/\b([356][0-9A-Z()_.-]{5,70})\b/)?.[1];const fr=upper.match(/\b(JORFTEXT\d+|LEGITEXT\d+|LEGIARTI\d+|JORFARTI\d+|CNILTEXT\d+)\b/)?.[1];if(celex&&!seen.has(celex)){seen.add(celex);out.push({id:celex,jurisdiction:"EU",url:`https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:${celex}`});}if(fr&&!seen.has(fr)){seen.add(fr);const url=fr.startsWith("LEGITEXT")?`https://www.legifrance.gouv.fr/codes/texte_lc/${fr}/`:fr.startsWith("LEGIARTI")?`https://www.legifrance.gouv.fr/codes/article_lc/${fr}`:`https://www.legifrance.gouv.fr/jorf/id/${fr}`;out.push({id:fr,jurisdiction:"FR",url});}}return out;}
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
  const{data:d,error:de}=await admin.from("dossiers").select("id,user_id,organization_id,reference_texts").eq("id",dossierId).maybeSingle();
  if(de||!d)return json({error:"Dossier introuvable"},404);
  const{data:membership,error:me}=await admin.from("organization_members").select("user_id").eq("organization_id",d.organization_id).eq("user_id",user.id).maybeSingle();
  if(me)return json({error:"Vérification des droits impossible"},503);
  if(!(d.user_id===user.id||!!membership))return json({error:"Accès interdit"},403);

  const refs=list(d.reference_texts),canonical=identifiers(refs);
  if(canonical.length){
    const exactUrls=canonical.map(x=>x.url);
    const{data:exact,error:ie}=await admin.from("watch_items").select("id,title,nature,source_url,dossier_id,qualification_confidence,qualification_reason,change_type,change_summary,published_at,created_at").eq("organization_id",d.organization_id).in("source_url",exactUrls);
    if(ie)return json({error:`Lecture du corpus canonique impossible : ${clip(ie.message,180)}`},500);
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
    const results=canonical.map(c=>{const item:any=byUrl.get(c.url);if(!item)return null;return{id:item.id,title:item.title,score:.999,status:"linked",reason:item.qualification_reason||`Texte ${c.jurisdiction==="FR"?"français":"européen"} du corpus juridique canonique.`,change_type:item.change_type,change_summary:item.change_summary,jurisdiction:c.jurisdiction,canonical_id:c.id};}).filter(Boolean);
    const fr=results.filter((x:any)=>x.jurisdiction==="FR").length,eu=results.filter((x:any)=>x.jurisdiction==="EU").length;
    return json({ok:true,engine:"canonical-corpus-reader-v12-fr-eu",dossier_id:d.id,canonical_reference_count:canonical.length,scanned:results.length,processed:results.length,linked:results.length,suggested:0,rejected:0,unlinked:0,fr,eu,auto_link_threshold:1,review_threshold:1,results,message:`${results.length} texte(s) du corpus canonique — ${fr} FR / ${eu} UE.`});
  }

  const{data:links,error:le}=await admin.from("watch_item_dossier_links").select("watch_item_id,score,reason").eq("dossier_id",d.id).eq("status","linked").order("score",{ascending:false}).limit(250);
  if(le)return json({error:`Lecture des rattachements impossible : ${clip(le.message,180)}`},500);
  const ids=(links||[]).map((x:any)=>x.watch_item_id);
  let items:any[]=[];
  if(ids.length){const r=await admin.from("watch_items").select("id,title,nature,source_url,dossier_id,qualification_confidence,qualification_reason,change_type,change_summary,published_at,created_at").in("id",ids);if(r.error)return json({error:`Lecture des textes liés impossible : ${clip(r.error.message,180)}`},500);items=r.data||[];}
  const scoreById=new Map((links||[]).map((x:any)=>[String(x.watch_item_id),Number(x.score)||0]));
  const results=items.map((item:any)=>({id:item.id,title:item.title,score:scoreById.get(String(item.id))||0,status:"linked",reason:item.qualification_reason||"Texte déjà rattaché au dossier.",change_type:item.change_type,change_summary:item.change_summary}));
  return json({ok:true,engine:"linked-items-reader-v12-m2m",dossier_id:d.id,scanned:results.length,processed:results.length,linked:results.length,suggested:0,rejected:0,unlinked:0,results,message:`${results.length} texte(s) déjà rattaché(s).`});
});