import { createClient } from "npm:@supabase/supabase-js@2";

type SourceItem={title:string;nature:string;source_url:string;source_name?:string;published_at?:string};
type Dossier={id:string;user_id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;user_id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string};
type Qualification={watch_id:string;dossier_id:string|null;confidence:number;urgency:"faible"|"moyen"|"fort"|"absolument urgent";reason:string};

type Setting={user_id:string;enabled:boolean;auto_link_threshold:number|string;review_threshold:number|string};

const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const VALID_URGENCIES=new Set(["faible","moyen","fort","absolument urgent"]);

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max).trim();}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}
function getAdminKey(){
  const modern=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
function safeEqual(a:string,b:string){const aa=new TextEncoder().encode(a);const bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;}
function canonicalUrl(value:string){try{const url=new URL(value);url.hash="";for(const key of [...url.searchParams.keys()]){if(/^utm_/i.test(key)||["fbclid","gclid"].includes(key))url.searchParams.delete(key);}return url.toString();}catch{return value.trim();}}

async function fetchJson(url:string,init:RequestInit={},timeoutMs=15000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{...init,signal:controller.signal});const text=await response.text();let payload:any={};try{payload=text?JSON.parse(text):{};}catch{payload={raw:text};}if(!response.ok)throw new Error(`HTTP ${response.status}: ${clip(payload?.error||payload?.raw||response.statusText,240)}`);return payload;}finally{clearTimeout(timer);}}

async function qualifyBatch(apiKey:string,items:WatchItem[],dossiers:Dossier[]):Promise<Qualification[]>{
  if(!apiKey||!items.length||!dossiers.length)return [];
  const prompt=[
    "Tu es le moteur de veille institutionnelle de Myvor.",
    "Pour chaque publication, choisis au maximum un dossier réellement concerné par rapport à l'objectif concret du client.",
    "Si aucun lien crédible n'existe, dossier_id doit être null.",
    "confidence est entre 0 et 1.",
    "urgency doit être exactement: faible, moyen, fort, absolument urgent.",
    "absolument urgent = réaction immédiate justifiée par une échéance proche, un amendement décisif, une mesure réglementaire majeure, un risque de blocage ou une opportunité immédiate.",
    "Ne déduis pas des faits absents du titre/nature. La raison doit expliquer le lien métier sans inventer le contenu intégral du texte.",
    "JSON uniquement: {\"qualifications\":[{\"watch_id\":\"...\",\"dossier_id\":\"... ou null\",\"confidence\":0.9,\"urgency\":\"fort\",\"reason\":\"...\"}]}",
    "PUBLICATIONS:",JSON.stringify(items.map(i=>({watch_id:i.id,title:clip(i.title,500),nature:clip(i.nature,120)}))),
    "DOSSIERS:",JSON.stringify(dossiers.map(d=>({dossier_id:d.id,client:clip(d.client,180),dossier:clip(d.title,300),objectif:clip(d.objective,1000),contexte:clip(d.context,1000)}))),
  ].join("\n");
  const payload=await fetchJson("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("OPENAI_MODEL")||"gpt-5-mini",input:prompt,max_output_tokens:2200,text:{format:{type:"json_object"}}})},20000);
  let parsed:any={};try{parsed=JSON.parse(extractOutputText(payload)||"{}");}catch{throw new Error("Réponse IA non exploitable");}
  return Array.isArray(parsed?.qualifications)?parsed.qualifications:[];
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);

  const expectedSecret=Deno.env.get("MYVOR_CRON_SECRET")||"";
  const suppliedSecret=req.headers.get("x-myvor-cron-secret")||"";
  if(!expectedSecret||!suppliedSecret||!safeEqual(expectedSecret,suppliedSecret))return json({error:"Non autorisé"},401);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const adminKey=getAdminKey();
  if(!supabaseUrl||!adminKey)return json({error:"Configuration Supabase serveur incomplète"},500);

  const supabase=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const openAIKey=Deno.env.get("OPENAI_API_KEY")||"";
  const sourceEndpoint=Deno.env.get("MYVOR_SOURCES_URL")||"https://myvor.app/api/veille/sources";

  let sourcePayload:any;
  try{sourcePayload=await fetchJson(sourceEndpoint,{headers:{Accept:"application/json","User-Agent":"Myvor-Supabase-Veille/1.0"}},18000);}catch(error:any){return json({ok:false,error:`Collecte impossible: ${clip(error?.message,260)}`},502);}

  const sources:SourceItem[]=(Array.isArray(sourcePayload?.items)?sourcePayload.items:[])
    .map((item:any)=>({title:clip(item?.title,800),nature:clip(item?.nature||"Publication institutionnelle",140),source_url:canonicalUrl(clip(item?.source_url,1200)),source_name:clip(item?.source_name,180)||undefined,published_at:clip(item?.published_at,100)||undefined}))
    .filter(item=>item.title&&item.source_url.startsWith("http"))
    .filter((item,index,array)=>array.findIndex(x=>x.source_url===item.source_url)===index)
    .slice(0,160);

  const {data:settings,error:settingsError}=await supabase.from("veille_settings").select("user_id,enabled,auto_link_threshold,review_threshold").eq("enabled",true);
  if(settingsError)return json({ok:false,error:"Impossible de charger les réglages de veille"},500);

  const summaries:any[]=[];
  for(const rawSetting of (settings||[]) as Setting[]){
    const setting=rawSetting;
    const userId=setting.user_id;
    const tenMinutesAgo=new Date(Date.now()-10*60*1000).toISOString();
    const {data:activeRun}=await supabase.from("veille_runs").select("id").eq("user_id",userId).eq("status","running").gte("started_at",tenMinutesAgo).limit(1).maybeSingle();
    if(activeRun){summaries.push({user_id:userId,status:"skipped",reason:"already_running"});continue;}

    const {data:run,error:runError}=await supabase.from("veille_runs").insert({user_id:userId,status:"running",sources_count:Array.isArray(sourcePayload?.active_sources)?sourcePayload.active_sources.length:0,fetched_count:sources.length,engine:openAIKey?"openai":"none"}).select("id").single();
    if(runError){summaries.push({user_id:userId,status:"error",message:"run_log_failed"});continue;}
    const runId=run.id as string;

    try{
      const [{data:dossiers,error:dossiersError},{data:existing,error:existingError}]=await Promise.all([
        supabase.from("dossiers").select("id,user_id,client,title,objective,context").eq("user_id",userId),
        supabase.from("watch_items").select("source_url").eq("user_id",userId),
      ]);
      if(dossiersError||existingError)throw new Error("Lecture du portefeuille impossible");

      const existingUrls=new Set((existing||[]).map((x:any)=>canonicalUrl(String(x.source_url||""))).filter(Boolean));
      const fresh=sources.filter(item=>!existingUrls.has(item.source_url)).slice(0,60);
      let inserted:WatchItem[]=[];
      if(fresh.length){
        const rows=fresh.map(item=>({user_id:userId,dossier_id:null,title:item.title,nature:item.nature,source_url:item.source_url,source_name:item.source_name||null,published_at:item.published_at||null,urgency:"moyen"}));
        const {data,error}=await supabase.from("watch_items").insert(rows).select("id,user_id,title,nature,source_url,dossier_id,urgency");
        if(error)throw new Error(`Insertion veille impossible: ${clip(error.message,180)}`);
        inserted=(data||[]) as WatchItem[];
      }

      const allDossiers=(dossiers||[]) as Dossier[];
      const allowedDossiers=new Set(allDossiers.map(d=>d.id));
      const allowedWatch=new Set(inserted.map(i=>i.id));
      const qualifications:Qualification[]=[];
      let qualificationError="";
      if(inserted.length&&allDossiers.length&&openAIKey){
        try{for(let start=0;start<inserted.length;start+=20){const batch=inserted.slice(start,start+20);const result=await qualifyBatch(openAIKey,batch,allDossiers);qualifications.push(...result);}}catch(error:any){qualificationError=clip(error?.message||"Qualification IA impossible",260);}
      }

      const autoThreshold=Math.max(0.5,Math.min(1,Number(setting.auto_link_threshold)||0.9));
      const reviewThreshold=Math.max(0.3,Math.min(autoThreshold,Number(setting.review_threshold)||0.55));
      let autoLinked=0;let review=0;let actionsCreated=0;

      for(const q of qualifications){
        if(!allowedWatch.has(q.watch_id))continue;
        const confidence=Math.max(0,Math.min(1,Number(q.confidence)||0));
        const validDossier=q.dossier_id&&allowedDossiers.has(q.dossier_id)?q.dossier_id:null;
        const urgency=VALID_URGENCIES.has(String(q.urgency))?String(q.urgency):"moyen";
        let dossierId:string|null=null;let suggestedId:string|null=null;
        if(validDossier&&confidence>=autoThreshold){dossierId=validDossier;autoLinked++;}
        else if(validDossier&&confidence>=reviewThreshold){suggestedId=validDossier;review++;}

        const {error:updateError}=await supabase.from("watch_items").update({dossier_id:dossierId,suggested_dossier_id:suggestedId,urgency,qualification_confidence:confidence,qualification_reason:clip(q.reason,500),qualified_at:new Date().toISOString()}).eq("id",q.watch_id).eq("user_id",userId);
        if(updateError)throw new Error(`Mise à jour qualification impossible: ${clip(updateError.message,180)}`);

        if(dossierId&&(urgency==="fort"||urgency==="absolument urgent")){
          const item=inserted.find(i=>i.id===q.watch_id);if(!item)continue;
          const isAmendment=item.nature.toLowerCase().includes("amendement");
          const type=isAmendment?"amendement":"analyse";
          const title=isAmendment?`Préparer l’amendement — ${item.title}`:`Analyser l’impact — ${item.title}`;
          const {data:duplicate,error:duplicateError}=await supabase.from("actions").select("id").eq("user_id",userId).eq("dossier_id",dossierId).eq("type",type).eq("title",title).neq("status","termine").limit(1).maybeSingle();
          if(duplicateError)throw new Error(`Contrôle des actions impossible: ${clip(duplicateError.message,180)}`);
          if(!duplicate){
            const {error:actionError}=await supabase.from("actions").insert({user_id:userId,dossier_id:dossierId,type,title,description:`Action créée automatiquement par la veille Myvor. ${clip(q.reason,420)}`,actor_name:null,priority:urgency,status:"a_faire",due_date:null});
            if(actionError)throw new Error(`Création d’action impossible: ${clip(actionError.message,180)}`);
            actionsCreated++;
          }
        }
      }

      const status=qualificationError?"partial":"success";
      const message=qualificationError?`${inserted.length} nouveaux textes enregistrés. Qualification partielle: ${qualificationError}`:`${inserted.length} nouveaux textes · ${autoLinked} auto-rattachés · ${review} à valider · ${actionsCreated} action(s) créée(s).`;
      await supabase.from("veille_runs").update({status,finished_at:new Date().toISOString(),new_count:inserted.length,auto_linked_count:autoLinked,review_count:review,actions_created_count:actionsCreated,engine:openAIKey?"openai":"none",message}).eq("id",runId);
      await supabase.from("veille_settings").update({last_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",userId);
      summaries.push({user_id:userId,status,new_items:inserted.length,auto_linked:autoLinked,review,actions_created:actionsCreated});
    }catch(error:any){
      const message=clip(error?.message||"Erreur inconnue",500);
      await supabase.from("veille_runs").update({status:"error",finished_at:new Date().toISOString(),message}).eq("id",runId);
      summaries.push({user_id:userId,status:"error",message});
    }
  }

  return json({ok:true,synced_at:new Date().toISOString(),sources:sources.length,users:summaries});
});
