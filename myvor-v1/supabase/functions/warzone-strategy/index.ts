import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const MAX_ACTORS=4;
const MAX_WATCH=8;

type Dossier={id:string;client:string;title:string;objective:string;context?:string;key_deadlines?:string[]};
type Actor={id:string;name:string;role:string;institution?:string;orbit:1|2|3;position?:string;influence:number;influence_score?:number;why?:string;window?:string;action?:string;certainty?:string};
type WatchItem={id:string;title:string;nature:string;urgency?:string;source_url?:string;source_name?:string|null;created_at?:string;published_at?:string|null};

const TARGET_SCHEMA={type:"object",additionalProperties:false,properties:{actor_id:{type:"string"},name:{type:"string"},role:{type:"string"},institution:{type:"string"},priority:{type:"integer",minimum:1,maximum:4},why_this_target:{type:"string"},institutional_goal:{type:"string"},precise_subject:{type:"string"},recommended_channel:{type:"string"},recommended_format:{type:"string"},factual_angles:{type:"array",minItems:1,maxItems:4,items:{type:"string"}},evidence_indexes:{type:"array",maxItems:4,items:{type:"integer",minimum:1,maximum:8}},timing:{type:"string"},success_signal:{type:"string"},fallback:{type:"string"},do_not_assume:{type:"string"}},required:["actor_id","name","role","institution","priority","why_this_target","institutional_goal","precise_subject","recommended_channel","recommended_format","factual_angles","evidence_indexes","timing","success_signal","fallback","do_not_assume"]};
const STEP_SCHEMA={type:"object",additionalProperties:false,properties:{order:{type:"integer",minimum:1,maximum:5},title:{type:"string"},target_actor_id:{type:"string"},target_name:{type:"string"},objective:{type:"string"},why_now:{type:"string"},means:{type:"array",minItems:1,maxItems:4,items:{type:"string"}},deliverable:{type:"string"},message_frame:{type:"string"},evidence_indexes:{type:"array",maxItems:4,items:{type:"integer",minimum:1,maximum:8}},timing:{type:"string"},dependency:{type:"string"},success_signal:{type:"string"},fallback:{type:"string"},risk:{type:"string"}},required:["order","title","target_actor_id","target_name","objective","why_now","means","deliverable","message_frame","evidence_indexes","timing","dependency","success_signal","fallback","risk"]};
const OUTPUT_SCHEMA={type:"object",additionalProperties:false,properties:{strategy:{type:"object",additionalProperties:false,properties:{diagnosis:{type:"object",additionalProperties:false,properties:{objective:{type:"string"},decision_point:{type:"string"},current_constraint:{type:"string"},opportunity_window:{type:"string"},recommended_path:{type:"string"}},required:["objective","decision_point","current_constraint","opportunity_window","recommended_path"]},targets:{type:"array",minItems:1,maxItems:4,items:TARGET_SCHEMA},sequence:{type:"array",minItems:3,maxItems:5,items:STEP_SCHEMA},evidence_gaps:{type:"array",maxItems:6,items:{type:"string"}},stop_rules:{type:"array",minItems:1,maxItems:5,items:{type:"string"}},review_trigger:{type:"string"}},required:["diagnosis","targets","sequence","evidence_gaps","stop_rules","review_trigger"]}},required:["strategy"]};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function text(value:unknown,max=1200){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g,"").replace(/\s+/g," ").slice(0,max).trim();}
function cleanApiKey(raw:string){return String(raw||"").normalize("NFKC").match(/sk-[A-Za-z0-9_-]+/)?.[0]||"";}
function outputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text.trim();return(payload?.output||[]).flatMap((item:any)=>item?.content||[]).filter((part:any)=>part?.type==="output_text").map((part:any)=>part?.text||"").join("").trim();}

async function requireAuthenticatedQuota(req:Request){
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const supabaseUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!supabaseUrl||!anonKey)return json({error:"La sécurité Supabase de Myvor n’est pas configurée."},503);
  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:authorization}});
    if(!userResponse.ok)return json({error:"Session Myvor invalide ou expirée."},401);
    const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:"warzone-strategy"})});
    if(!quotaResponse.ok)return json({error:"Impossible de vérifier le quota IA de la War Zone."},503);
    const allowed=await quotaResponse.json().catch(()=>false);
    if(allowed!==true)return json({error:"Trop de recalculs War Zone en peu de temps. Réessaie dans quelques minutes."},429);
    return null;
  }catch{return json({error:"Impossible de vérifier la session Myvor."},503);}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const authError=await requireAuthenticatedQuota(req);if(authError)return authError;

  const body=await req.json().catch(()=>null);
  const dossier=(body?.dossier||null) as Dossier|null;
  const actors=(Array.isArray(body?.actors)?body.actors:[]).slice(0,MAX_ACTORS) as Actor[];
  const watch=(Array.isArray(body?.watch)?body.watch:[]).slice(0,MAX_WATCH) as WatchItem[];
  if(!dossier||!actors.length)return json({error:"La War Zone a besoin d’un dossier et d’acteurs Radar qualifiés."},400);

  const apiKey=cleanApiKey(Deno.env.get("OPENAI_API_KEY")||"");
  if(!apiKey)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans Supabase."},503);

  const actorInput=actors.map(actor=>({id:text(actor.id,100),name:text(actor.name,180),role:text(actor.role,260),institution:text(actor.institution,260),orbit:actor.orbit,position:text(actor.position,80)||"inconnue",influence_score:Number(actor.influence_score)||Math.max(20,Math.min(100,Number(actor.influence||1)*20)),why:text(actor.why,600),window:text(actor.window,320),action:text(actor.action,500),certainty:text(actor.certainty,80)}));
  const watchInput=watch.map((item,index)=>({index:index+1,id:text(item.id,100),title:text(item.title,360),nature:text(item.nature,120),urgency:text(item.urgency,70),date:text(item.published_at||item.created_at,80),source:text(item.source_name,160),url:text(item.source_url,500)}));
  const deadlines=(dossier.key_deadlines||[]).slice(0,5).map(value=>text(value,200));

  const prompt=[
    "MYVOR — WAR ZONE : stratégie opérationnelle d’affaires publiques.",
    "Construis exclusivement à partir du dossier, des acteurs Radar qualifiés et de la veille fournie.",
    "RÈGLE DE RÉDACTION OBLIGATOIRE : tous les champs explicatifs doivent être rédigés en phrases complètes, concrètes et directement exécutables. Une phrase doit préciser qui agit ou qui est concerné, ce qui doit être fait ou obtenu, sur quel sujet, pourquoi et quel résultat est attendu lorsque les données le permettent.",
    "N’utilise jamais de fragments comme 'prendre contact', 'brief cabinet', 'fenêtre favorable', 'sécuriser le texte', 'à surveiller' ou 'risque politique' sans les transformer en phrases qui expliquent précisément l’action, l’objet, le moment et le résultat recherché.",
    "Les seuls champs qui peuvent rester courts sont les identifiants, noms, institutions, priorités et titres. diagnosis, why_this_target, institutional_goal, precise_subject, recommended_channel, recommended_format, factual_angles, timing, success_signal, fallback, do_not_assume, objective, why_now, means, deliverable, message_frame, dependency, risk, evidence_gaps, stop_rules et review_trigger doivent être des phrases complètes.",
    "Pour recommended_channel et recommended_format, formule une recommandation explicite, par exemple 'Privilégier un rendez-vous de travail avec le cabinet afin de clarifier...' plutôt qu'un simple libellé comme 'rendez-vous cabinet'.",
    "Pour chaque cible, précise QUI, QUOI, POURQUOI, COMMENT, QUAND, les preuves, le signal de réussite et le fallback, en reliant chaque élément à l’objectif du dossier.",
    "Pour chaque mouvement de la séquence, indique une action concrète, un livrable identifiable, une dépendance vérifiable, un critère de réussite observable et une solution de repli précise.",
    "Ne présume jamais une position politique ou une préférence personnelle. Si une donnée manque, ajoute-la à evidence_gaps sous forme de phrase précisant ce qui doit être vérifié et pourquoi.",
    "Aucune manipulation, pression indue, tromperie, astroturfing, donnée privée, vulnérabilité personnelle ou microciblage politique individuel.",
    "La séquence contient 3 à 5 mouvements avec livrable, dépendance, critère de réussite et solution de repli.",
    `CLIENT: ${text(dossier.client,220)}`,
    `DOSSIER: ${text(dossier.title,360)}`,
    `OBJECTIF: ${text(dossier.objective,1400)}`,
    `CONTEXTE: ${text(dossier.context,2400)||"Non renseigné"}`,
    `ÉCHÉANCES: ${JSON.stringify(deadlines)}`,
    `ACTEURS RADAR: ${JSON.stringify(actorInput)}`,
    `VEILLE LIÉE: ${JSON.stringify(watchInput)}`,
  ].join("\n");

  const model=text(Deno.env.get("OPENAI_WARZONE_MODEL")||Deno.env.get("OPENAI_RADAR_ENRICH_MODEL")||"gpt-4.1-mini",120);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),40000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt,max_output_tokens:3000,store:false,text:{format:{type:"json_schema",name:"myvor_warzone_strategy_v4",strict:true,schema:OUTPUT_SCHEMA}}}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw)?.error?.message||raw;}catch{}return json({error:`War Zone indisponible (${response.status}) : ${String(message).slice(0,300)}`},502);}
    const payload=await response.json();let parsed:any=null;try{parsed=JSON.parse(outputText(payload));}catch{}
    if(!parsed?.strategy)return json({error:"Le moteur n’a pas retourné de stratégie exploitable."},502);
    return json({strategy:parsed.strategy,engine:"supabase-warzone-strategy-v4",model,watch_items_used:watch.length,actors_used:actors.length,complete_sentence_style:true});
  }catch(error:any){if(error?.name==="AbortError")return json({error:"La génération détaillée a dépassé le délai prévu."},504);return json({error:error?.message||"Génération War Zone impossible."},500);}finally{clearTimeout(timer);}
});