import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.111.0";
import {corsHeaders} from "npm:@supabase/supabase-js@2.111.0/cors";

type Dossier={
  id:string;user_id:string;organization_id:string;title:string;objective:string;context?:string|null;
  sector?:string|null;activity?:string|null;strategic_issues?:string[]|null;risks_to_avoid?:string[]|null;
  opportunities?:string[]|null;client_position?:string|null;key_actors?:string[]|null;
  watch_keywords?:string[]|null;watch_priority_phrases?:string[]|null;watch_excluded_keywords?:string[]|null;
  watch_topics?:string[]|null;watch_subtopics?:string[]|null;reference_texts?:string[]|null;
};
type WatchItem={
  id:string;user_id:string;organization_id:string;title:string;nature:string;source_url:string;
  dossier_id:string|null;suggested_dossier_id:string|null;qualification_reason:string|null;
  published_at?:string|null;created_at?:string|null;change_type?:string|null;change_summary?:string|null;
};
type Score={score:number;matches:string[];reason:string};
type Result={id:string;title:string;score:number;status:string;reason:string;change_type?:string|null;change_summary?:string|null};
type PendingWrite={item:WatchItem;score:Score;status:string;reason:string;payload:Record<string,unknown>};

const H={...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const PAGE_SIZE=200;
const SOURCE_EXCERPT_CHARS=24000;
const AUTO_THRESHOLD=.58;
const REVIEW_THRESHOLD=.36;
const ENGINE_BASE="myvor-corpus-applicable-v7-secure-generic-batched";
const RULE_PREFIX="Corpus applicable v7 —";
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WEAK=new Set([
  "article","articles","loi","lois","decret","decrets","arrete","arretes","code","journal","officiel","publication",
  "gouvernement","ministere","ministre","assemblee","nationale","senat","france","europe","europeen","commission","conseil",
  "entreprise","entreprises","public","publique","service","services","nouveau","nouvelle","application","applicable","relatif",
  "relative","concernant","texte","textes","objectif","dossier","veille","reforme","reglementation","reglementaire","mise","conformite"
]);
const STOP=new Set(["de","du","des","la","le","les","un","une","et","ou","a","au","aux","en","dans","sur","pour","par","avec","sans","vers","l","d","relative","relatif","concernant"]);
const CHANGE_LABELS:Record<string,string>={socle_initial:"Socle initial",nouveau:"Nouveau",modification:"Modification",precision:"Précision",application:"Application",abrogation:"Abrogation",aucun_changement:"Aucun changement",indetermine:"À préciser"};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:H})}
function clip(v:unknown,max:number){return String(v??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max).trim()}
function adminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const v=keys?.default||Object.values(keys||{})[0];if(typeof v==="string"&&v)return v}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}
function norm(v:unknown){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function list(v:unknown):string[]{return Array.isArray(v)?[...new Set(v.map(x=>String(x||"").trim()).filter(Boolean))]:[]}
function contains(text:string,phrase:string){const n=norm(phrase);return !!n&&` ${text} `.includes(` ${n} `)}
function words(v:unknown){return[...new Set(norm(v).split(" ").filter(w=>w.length>=5&&!WEAK.has(w)&&!/^\d+$/.test(w)))]}
function allProfileText(d:Dossier){return [d.title,d.objective,d.context||"",d.sector||"",d.activity||"",d.client_position||"",...list(d.strategic_issues),...list(d.risks_to_avoid),...list(d.opportunities),...list(d.key_actors),...list(d.watch_keywords),...list(d.watch_priority_phrases),...list(d.watch_topics),...list(d.watch_subtopics),...list(d.reference_texts)].join(" ")}
function legalRefs(v:unknown){const n=norm(v),out:string[]=[];for(const m of n.matchAll(/\b20\d{2}[ -]\d{2,}\b/g))out.push(m[0]);for(const m of n.matchAll(/\b[lr]\s*\d{2,}(?:\s*\d+)*\b/g))out.push(m[0]);for(const m of n.matchAll(/\bjorftext\s*\d{8,}\b/g))out.push(m[0]);for(const m of n.matchAll(/\blegiarti\s*\d{8,}\b/g))out.push(m[0]);for(const m of n.matchAll(/\bcelex\s*[0-9a-z]{6,}\b/g))out.push(m[0]);return[...new Set(out)]}
function phraseCandidates(v:unknown,max=30){const tokens=norm(v).split(" ").filter(Boolean);const out:string[]=[];for(let n=2;n<=4;n++){for(let i=0;i+n<=tokens.length;i++){const chunk=tokens.slice(i,i+n);const meaningful=chunk.filter(t=>!STOP.has(t));if(meaningful.length<2)continue;const phrase=chunk.join(" ");if(phrase.length>=5)out.push(phrase)}}return[...new Set(out)].sort((a,b)=>b.length-a.length).slice(0,max)}
function strongTerm(v:string){const n=norm(v);return !!n&&n.length>=4&&(/\b20\d{2}[ -]\d{2,}\b/.test(n)||/\b[lr]\s*\d{2,}/.test(n)||phraseCandidates(n,2).length>0||words(n).length>0)}
function delta(item:WatchItem){if(!item.change_type||!item.change_summary)return"";if(item.change_type==="socle_initial")return`Socle de référence — ${clip(item.change_summary,520)}`;return`Ce qui change — ${CHANGE_LABELS[item.change_type]||"Évolution"} : ${clip(item.change_summary,520)}`}
function profileStrength(d:Dossier){let n=2;if(clip(d.context,20))n++;if(list(d.watch_keywords).length)n++;if(list(d.watch_topics).length||list(d.watch_subtopics).length)n++;if(list(d.reference_texts).length)n++;if(clip(d.sector,2)||clip(d.activity,2))n++;if(list(d.strategic_issues).length||list(d.key_actors).length)n++;return Math.min(8,n)}
async function fingerprint(d:Dossier){const raw=JSON.stringify({title:d.title,objective:d.objective,context:d.context||"",sector:d.sector||"",activity:d.activity||"",issues:list(d.strategic_issues),risks:list(d.risks_to_avoid),opportunities:list(d.opportunities),position:d.client_position||"",actors:list(d.key_actors),keywords:list(d.watch_keywords),priority:list(d.watch_priority_phrases),excluded:list(d.watch_excluded_keywords),topics:list(d.watch_topics),subtopics:list(d.watch_subtopics),refs:list(d.reference_texts)});const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));return Array.from(new Uint8Array(bytes)).slice(0,8).map(x=>x.toString(16).padStart(2,"0")).join("")}

function scoreItem(item:WatchItem,sourceText:string,d:Dossier):Score{
  const title=norm(`${item.title} ${item.nature||""}`);
  const full=norm(`${item.title} ${item.nature||""} ${sourceText.slice(0,SOURCE_EXCERPT_CHARS)}`);
  const blocked=list(d.watch_excluded_keywords).find(t=>contains(full,t));
  if(blocked)return{score:0,matches:[],reason:`Exclusion détectée : ${blocked}`};

  const references=list(d.reference_texts).filter(strongTerm);
  const priorities=list([...list(d.watch_priority_phrases),...references]).filter(strongTerm);
  const strategic=list([...list(d.watch_keywords),...list(d.watch_topics),...list(d.watch_subtopics),...list(d.strategic_issues),...list(d.key_actors),d.sector||"",d.activity||""]).filter(strongTerm);
  const profile=allProfileText(d);
  const refs=legalRefs(profile);
  const refMatches=refs.filter(r=>contains(full,r));
  if(refMatches.length)return{score:.995,matches:refMatches.slice(0,8),reason:`Référence juridique exacte : ${refMatches.slice(0,3).join(", ")}`};

  const priorityTitle=priorities.filter(t=>contains(title,t));
  if(priorityTitle.length)return{score:.99,matches:priorityTitle.slice(0,6),reason:`Expression prioritaire dans le titre : ${priorityTitle[0]}`};
  const priorityBody=priorities.filter(t=>contains(full,t));
  if(priorityBody.length>=2)return{score:.97,matches:priorityBody.slice(0,6),reason:"Plusieurs expressions prioritaires dans le texte"};
  if(priorityBody.length===1)return{score:.94,matches:priorityBody,reason:`Expression prioritaire dans le texte : ${priorityBody[0]}`};

  const dossierPhrases=[...phraseCandidates(d.title,24),...phraseCandidates(d.objective,24)].filter(p=>p.length>=5);
  const phraseTitle=dossierPhrases.filter(p=>contains(title,p));
  if(phraseTitle.length>=2)return{score:.96,matches:phraseTitle.slice(0,6),reason:"Plusieurs expressions propres au dossier dans le titre"};
  if(phraseTitle.length===1)return{score:.91,matches:phraseTitle,reason:`Expression propre au dossier dans le titre : ${phraseTitle[0]}`};
  const phraseBody=dossierPhrases.filter(p=>contains(full,p));
  if(phraseBody.length>=2)return{score:.88,matches:phraseBody.slice(0,6),reason:"Plusieurs expressions propres au dossier dans le texte"};
  if(phraseBody.length===1&&phraseBody[0].split(" ").length>=3)return{score:.76,matches:phraseBody,reason:`Expression propre au dossier dans le texte : ${phraseBody[0]}`};

  const strategicTitle=strategic.filter(t=>contains(title,t));
  if(strategicTitle.length>=2)return{score:.95,matches:strategicTitle.slice(0,6),reason:"Plusieurs signaux métier exacts dans le titre"};
  if(strategicTitle.length===1)return{score:.88,matches:strategicTitle,reason:`Signal métier exact dans le titre : ${strategicTitle[0]}`};
  const strategicBody=strategic.filter(t=>contains(full,t));
  if(strategicBody.length>=3)return{score:.88,matches:strategicBody.slice(0,8),reason:"Plusieurs signaux métier exacts dans le texte"};
  if(strategicBody.length===2)return{score:.80,matches:strategicBody,reason:"Deux signaux métier exacts dans le texte"};
  if(strategicBody.length===1)return{score:.67,matches:strategicBody,reason:`Signal métier détecté : ${strategicBody[0]}`};

  const core=[...new Set([...words(d.title),...words(d.objective)])];
  const support=[...new Set([...words(d.context||""),...words(d.sector||""),...words(d.activity||""),...list(d.strategic_issues).flatMap(words),...list(d.watch_topics).flatMap(words),...list(d.watch_subtopics).flatMap(words)])];
  const titleWords=new Set(words(title));
  const fullWords=new Set(words(full));
  const coreTitle=core.filter(w=>titleWords.has(w));
  const coreFull=core.filter(w=>fullWords.has(w));
  const supportFull=support.filter(w=>fullWords.has(w));
  const total=[...new Set([...coreFull,...supportFull])];
  if(coreTitle.length>=2&&total.length>=3)return{score:.86,matches:total.slice(0,8),reason:`Correspondance forte au cœur du dossier : ${total.slice(0,5).join(", ")}`};
  if(coreTitle.length>=1&&total.length>=4)return{score:.76,matches:total.slice(0,8),reason:"Correspondance dossier forte avec signal dans le titre"};
  if(coreFull.length>=3&&total.length>=5)return{score:.72,matches:total.slice(0,8),reason:"Correspondance thématique forte dans le texte"};
  if(total.length>=5)return{score:.62,matches:total.slice(0,8),reason:"Correspondance thématique étendue"};
  if(coreFull.length>=2&&total.length>=3)return{score:.47,matches:total.slice(0,8),reason:"Correspondance thématique à valider"};
  if(coreFull.length>=1&&total.length>=3&&profileStrength(d)>=4)return{score:.39,matches:total.slice(0,8),reason:"Correspondance partielle à valider"};
  return{score:0,matches:[],reason:"Aucun signal suffisamment discriminant"};
}

async function batches(tasks:Array<()=>Promise<void>>,size=10){for(let i=0;i<tasks.length;i+=size)await Promise.all(tasks.slice(i,i+size).map(t=>t()))}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{status:200,headers:H});
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);
  const contentLength=Number(req.headers.get("content-length")||"0");
  if(Number.isFinite(contentLength)&&contentLength>4096)return json({error:"Requête trop volumineuse"},413);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=adminKey();
  const authorization=req.headers.get("Authorization")||"";
  if(!url||!key)return json({error:"Configuration serveur incomplète"},503);
  if(!authorization.startsWith("Bearer "))return json({error:"Authentification requise"},401);

  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=authorization.replace(/^Bearer\s+/i,"").trim();
  const{data:authData,error:authError}=await admin.auth.getUser(token);
  const user=authData?.user;
  if(authError||!user)return json({error:"Session invalide"},401);

  const{data:quota,error:quotaError}=await admin.rpc("consume_changes_corpus_quota_for_user",{p_user_id:user.id});
  if(quotaError)return json({error:"Contrôle de fréquence indisponible"},503);
  if(quota!==true)return json({error:"Trop de reconstructions du corpus. Réessayez dans quelques minutes."},429);

  const body=await req.json().catch(()=>null);
  const dossierId=clip(body?.dossier_id,80);
  if(!UUID_RE.test(dossierId))return json({error:"dossier_id invalide"},400);

  const{data:drow,error:de}=await admin.from("dossiers").select("id,user_id,organization_id,title,objective,context,sector,activity,strategic_issues,risks_to_avoid,opportunities,client_position,key_actors,watch_keywords,watch_priority_phrases,watch_excluded_keywords,watch_topics,watch_subtopics,reference_texts").eq("id",dossierId).maybeSingle();
  if(de||!drow)return json({error:"Dossier introuvable"},404);
  const d=drow as Dossier;
  if(!d.organization_id)return json({error:"Dossier sans organisation"},409);

  const{data:membership,error:membershipError}=await admin.from("organization_members").select("user_id").eq("organization_id",d.organization_id).eq("user_id",user.id).maybeSingle();
  if(membershipError)return json({error:"Vérification des droits impossible"},503);
  const authorized=d.user_id===user.id||!!membership;
  if(!authorized)return json({error:"Accès interdit"},403);

  const profileHash=await fingerprint(d);
  const engine=`${ENGINE_BASE}-${profileHash}`;
  const{data:existing,error:existingError}=await admin.from("watch_item_dossier_links").select("watch_item_id,status,score,reason,engine").eq("dossier_id",d.id).eq("organization_id",d.organization_id);
  if(existingError)return json({error:"Impossible de charger l'état du corpus applicable"},500);
  const existingMap=new Map((existing||[]).map((x:any)=>[String(x.watch_item_id),x]));

  const results:Result[]=[];
  let linked=0,suggested=0,relevant=0,reused=0,processed=0,scanned=0;
  for(const row of existing||[]){
    if(String((row as any).engine)!==engine)continue;
    const status=String((row as any).status),score=Number((row as any).score)||0;
    if(status!=="rejected"){
      relevant++;
      if(status==="linked")linked++;else if(status==="suggested")suggested++;
      results.push({id:String((row as any).watch_item_id),title:"",score,status:"cached",reason:String((row as any).reason||"")});
    }
    reused++;
  }

  let offset=0;
  while(true){
    const{data:rows,error:we}=await admin.from("watch_items").select("id,user_id,organization_id,title,nature,source_url,dossier_id,suggested_dossier_id,qualification_reason,published_at,created_at,change_type,change_summary").eq("organization_id",d.organization_id).order("created_at",{ascending:true}).range(offset,offset+PAGE_SIZE-1);
    if(we)return json({error:`Lecture du corpus impossible : ${clip(we.message,180)}`},500);
    const items=(rows||[]) as WatchItem[];
    if(!items.length)break;
    scanned+=items.length;

    const pending=items.filter(item=>String(existingMap.get(item.id)?.engine||"")!==engine&&!String(item.qualification_reason||"").startsWith("Ignoré manuellement"));
    if(pending.length){
      const ids=pending.map(i=>i.id);
      const{data:contents,error:ce}=await admin.rpc("get_watch_content_excerpts",{p_organization_id:d.organization_id,p_watch_item_ids:ids,p_max_chars:SOURCE_EXCERPT_CHARS});
      if(ce)return json({error:`Lecture des contenus impossible : ${clip(ce.message,180)}`},500);
      const cm=new Map((contents||[]).map((r:any)=>[String(r.watch_item_id),String(r.source_text||"")]));
      const pageWrites:PendingWrite[]=[];

      for(const item of pending){
        if(item.organization_id!==d.organization_id)continue;
        processed++;
        const score=scoreItem(item,cm.get(item.id)||"",d);
        const reason=[score.reason,delta(item)].filter(Boolean).join(". ");
        const now=new Date().toISOString();
        const status=score.score>=AUTO_THRESHOLD?"linked":score.score>=REVIEW_THRESHOLD?"suggested":"rejected";
        const payload={watch_item_id:item.id,dossier_id:d.id,organization_id:d.organization_id,score:Number(score.score.toFixed(3)),status,reason:clip(`${RULE_PREFIX}${status}. ${reason}. Signaux : ${score.matches.join(", ")}`,1000),engine,updated_at:now};
        pageWrites.push({item,score,status,reason,payload});
        if(status!=="rejected"){
          relevant++;
          if(status==="linked")linked++;else suggested++;
          results.push({id:item.id,title:item.title,score:score.score,status,reason,change_type:item.change_type,change_summary:item.change_summary});
        }
      }

      if(pageWrites.length){
        const{error:upsertError}=await admin.from("watch_item_dossier_links").upsert(pageWrites.map(w=>w.payload),{onConflict:"watch_item_id,dossier_id"});
        if(upsertError)return json({error:`Écriture du corpus impossible : ${clip(upsertError.message,180)}`},500);

        const updateTasks=pageWrites.filter(w=>w.status!=="rejected").map(w=>async()=>{
          const now=String(w.payload.updated_at||new Date().toISOString());
          const confidence=Number(w.payload.score)||0;
          const qreason=String(w.payload.reason||"");
          if(w.status==="linked"&&!w.item.dossier_id){
            const{error:updateError}=await admin.from("watch_items").update({dossier_id:d.id,qualification_confidence:confidence,qualification_reason:qreason,qualified_at:now}).eq("id",w.item.id).eq("organization_id",d.organization_id).is("dossier_id",null);
            if(updateError)throw updateError;
          }else if(w.status==="suggested"&&!w.item.dossier_id&&!w.item.suggested_dossier_id){
            const{error:updateError}=await admin.from("watch_items").update({suggested_dossier_id:d.id,qualification_confidence:confidence,qualification_reason:qreason,qualified_at:now}).eq("id",w.item.id).eq("organization_id",d.organization_id).is("dossier_id",null).is("suggested_dossier_id",null);
            if(updateError)throw updateError;
          }
        });
        try{await batches(updateTasks)}catch(error:any){return json({error:`Qualification du corpus impossible : ${clip(error?.message||error,180)}`},500)}
      }
    }

    if(items.length<PAGE_SIZE)break;
    offset+=PAGE_SIZE;
  }

  const missingTitles=results.filter(r=>!r.title).map(r=>r.id);
  if(missingTitles.length){
    const{data:titleRows}=await admin.from("watch_items").select("id,title,change_type,change_summary").eq("organization_id",d.organization_id).in("id",missingTitles.slice(0,250));
    const tm=new Map((titleRows||[]).map((r:any)=>[String(r.id),r]));
    for(const r of results){if(r.title)continue;const row=tm.get(r.id);if(row){r.title=String(row.title||"");r.change_type=row.change_type;r.change_summary=row.change_summary}}
  }

  results.sort((a,b)=>b.score-a.score);
  return json({
    ok:true,engine,dossier_id:d.id,profile_strength:profileStrength(d),scanned,processed,reused,relevant,linked,suggested,
    auto_link_threshold:AUTO_THRESHOLD,review_threshold:REVIEW_THRESHOLD,results:results.slice(0,250),
    message:`${scanned} texte(s) vérifiés · ${processed} recalculé(s) · ${reused} résultat(s) réutilisé(s) · ${linked} rattaché(s) · ${suggested} à valider.`
  });
});
