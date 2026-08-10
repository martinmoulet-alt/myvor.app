import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

type PendingItem={id:string;user_id:string;title:string;nature:string;source_url:string;suggested_dossier_id:string;qualification_confidence:number|string;qualification_reason:string;published_at?:string|null};
type Dossier={id:string;title:string;objective:string;context?:string};
type Setting={user_id:string;auto_link_threshold:number|string};
type AiResult={relevant:boolean;urgency:"faible"|"moyen"|"fort"|"absolument urgent";reason:string};

const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const RULE_PREFIX="Règles dossier v11 —";
const MAX_ITEMS=8;
const VALID_URGENCIES=new Set(["faible","moyen","fort","absolument urgent"]);
const CRON_SECRET_SHA256="91370f1f47c9a4a1e099fe367b4c0988420faf23eb49067f797801bfb69932c8";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max).trim();}
function getAdminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function safeEqual(a:string,b:string){const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;return(payload?.output||[]).flatMap((item:any)=>item?.content||[]).map((part:any)=>part?.text||"").join("");}
async function fetchJson(url:string,init:RequestInit={},timeoutMs=18000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{...init,signal:controller.signal});const raw=await response.text();let payload:any={};try{payload=raw?JSON.parse(raw):{};}catch{payload={raw};}if(!response.ok)throw new Error(`HTTP ${response.status}: ${clip(payload?.error?.message||payload?.error||payload?.raw||response.statusText,260)}`);return payload;}finally{clearTimeout(timer);}}
async function qualifyOne(apiKey:string,item:PendingItem,dossier:Dossier,sourceText:string):Promise<AiResult>{
  const prompt=[
    "Tu es le filtre de pertinence STRICT de la veille Myvor.",
    "Confirme ou rejette le dossier proposé pour ce texte institutionnel.",
    "relevant=true uniquement si le texte modifie, précise, applique, menace ou ouvre une opportunité concrète pour l'objectif précis du dossier.",
    "Un même public, un même secteur, les mots entreprise/PME/numérique/santé, une proximité thématique vague ou une référence incidente ne suffisent jamais.",
    "REGLE D'ANCRAGE: si le titre ou le contexte du dossier identifie une loi, un règlement, un article, une réforme, une date ou un régime nommé, relevant=true seulement si le texte source cite explicitement cet instrument (numéro, date, titre ou article) OU indique sans ambiguïté qu'il met en oeuvre/modifie une disposition précise décrite dans le dossier.",
    "Pour un dossier d'application d'une loi précise, une mesure qui affecte simplement le même type d'entreprises mais qui provient d'un autre régime juridique doit être rejetée.",
    "Si relevant=false, urgency doit être faible.",
    "Si relevant=true, urgency vaut faible, moyen, fort ou absolument urgent selon l'impact opérationnel et les échéances explicitement présentes.",
    "reason doit citer le lien juridique ou opérationnel exact; s'il n'existe pas, dire brièvement pourquoi le texte est hors périmètre.",
    "reason doit être une seule phrase factuelle et brève.",
    JSON.stringify({title:clip(item.title,600),nature:clip(item.nature,120),official_text:clip(sourceText,5000),dossier:{title:clip(dossier.title,300),objective:clip(dossier.objective,800),context:clip(dossier.context,1100)}})
  ].join("\n");
  const schema={type:"object",properties:{relevant:{type:"boolean"},urgency:{type:"string",enum:["faible","moyen","fort","absolument urgent"]},reason:{type:"string",maxLength:300}},required:["relevant","urgency","reason"],additionalProperties:false};
  const payload=await fetchJson("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("OPENAI_MODEL")||"gpt-5-mini",store:false,reasoning:{effort:"minimal"},input:prompt,max_output_tokens:700,text:{verbosity:"low",format:{type:"json_schema",name:"myvor_watch_qualification",strict:true,schema}}})},18000);
  if(payload?.status==="incomplete")throw new Error(`Réponse IA incomplète: ${clip(payload?.incomplete_details?.reason||"inconnue",120)}`);
  const raw=extractOutputText(payload);let parsed:any={};try{parsed=JSON.parse(raw||"{}");}catch{throw new Error(`JSON IA non parseable: ${clip(raw,100)}`);}
  if(typeof parsed?.relevant!=="boolean"||!VALID_URGENCIES.has(String(parsed?.urgency)))throw new Error("Réponse IA invalide");
  return{relevant:parsed.relevant,urgency:parsed.urgency,reason:clip(parsed.reason,300)};
}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);
  const supplied=req.headers.get("x-myvor-cron-secret")||"",suppliedHash=supplied?await sha256(supplied):"";
  if(!suppliedHash||!safeEqual(CRON_SECRET_SHA256,suppliedHash))return json({error:"Non autorisé"},401);
  const url=Deno.env.get("SUPABASE_URL")||"",adminKey=getAdminKey(),apiKey=Deno.env.get("OPENAI_API_KEY")||"";if(!url||!adminKey||!apiKey)return json({error:"Configuration serveur incomplète"},503);
  const supabase=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:pending,error:pendingError}=await supabase.from("watch_items").select("id,user_id,title,nature,source_url,suggested_dossier_id,qualification_confidence,qualification_reason,published_at").not("suggested_dossier_id","is",null).like("qualification_reason",`${RULE_PREFIX}%Validation IA en attente.%`).order("published_at",{ascending:false,nullsFirst:false}).limit(MAX_ITEMS);
  if(pendingError)return json({error:`Lecture file IA impossible: ${clip(pendingError.message,180)}`},500);
  const items=(pending||[]) as PendingItem[];if(!items.length)return json({ok:true,processed:0,linked:0,review:0,rejected:0,failed:0});
  const dossierIds=[...new Set(items.map(item=>item.suggested_dossier_id).filter(Boolean))],userIds=[...new Set(items.map(item=>item.user_id))],itemIds=items.map(item=>item.id);
  const[{data:dossiers,error:dossierError},{data:settings,error:settingError},{data:contents,error:contentError}]=await Promise.all([
    supabase.from("dossiers").select("id,title,objective,context").in("id",dossierIds),
    supabase.from("veille_settings").select("user_id,auto_link_threshold").in("user_id",userIds),
    supabase.from("watch_item_content").select("watch_item_id,source_text").in("watch_item_id",itemIds)
  ]);
  if(dossierError||settingError||contentError)return json({error:"Chargement du contexte IA impossible"},500);
  const dossierById=new Map((dossiers||[]).map((d:any)=>[String(d.id),d as Dossier])),settingByUser=new Map((settings||[]).map((s:any)=>[String(s.user_id),s as Setting])),contentByItem=new Map((contents||[]).map((c:any)=>[String(c.watch_item_id),String(c.source_text||"")]));
  let linked=0,review=0,rejected=0,failed=0;
  for(let start=0;start<items.length;start+=4){
    const group=items.slice(start,start+4);
    const settled=await Promise.allSettled(group.map(async item=>{const dossier=dossierById.get(item.suggested_dossier_id);if(!dossier)throw new Error("Dossier candidat introuvable");const sourceText=contentByItem.get(item.id)||item.title;const result=await qualifyOne(apiKey,item,dossier,sourceText);return{item,result};}));
    for(const outcome of settled){
      if(outcome.status!=="fulfilled"){failed++;continue;}
      const{item,result}=outcome.value,confidence=Number(item.qualification_confidence)||0,baseReason=String(item.qualification_reason||"").replace(/\s*Validation IA en attente\.\s*$/," ").trim();
      if(!result.relevant){const{error}=await supabase.from("watch_items").update({dossier_id:null,suggested_dossier_id:null,urgency:"faible",qualification_confidence:Math.min(confidence,.49),qualification_reason:clip(`${baseReason} Filtre IA : rejeté — ${result.reason}`,760),qualified_at:new Date().toISOString()}).eq("id",item.id);if(error){failed++;continue;}rejected++;continue;}
      const threshold=Math.max(.75,Math.min(1,Number(settingByUser.get(item.user_id)?.auto_link_threshold)||.95)),shouldLink=confidence>=threshold;
      const{error}=await supabase.from("watch_items").update({dossier_id:shouldLink?item.suggested_dossier_id:null,suggested_dossier_id:shouldLink?null:item.suggested_dossier_id,urgency:result.urgency,qualification_reason:clip(`${baseReason} Filtre IA : pertinent — ${result.reason}`,760),qualified_at:new Date().toISOString()}).eq("id",item.id);if(error){failed++;continue;}
      if(shouldLink){linked++;if(result.urgency==="fort"||result.urgency==="absolument urgent"){const type=item.nature.toLowerCase().includes("amendement")?"amendement":"analyse",title=type==="amendement"?`Préparer l’amendement — ${item.title}`:`Analyser l’impact — ${item.title}`;const{data:duplicate}=await supabase.from("actions").select("id").eq("user_id",item.user_id).eq("dossier_id",item.suggested_dossier_id).eq("type",type).eq("title",title).neq("status","termine").limit(1).maybeSingle();if(!duplicate)await supabase.from("actions").insert({user_id:item.user_id,dossier_id:item.suggested_dossier_id,type,title,description:`Action créée automatiquement par la veille Myvor. ${clip(result.reason,360)}`,actor_name:null,priority:result.urgency,status:"a_faire",due_date:null});}}else review++;
    }
  }
  return json({ok:true,processed:items.length,linked,review,rejected,failed,pending_retry:failed});
});
