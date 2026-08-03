const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};

type ImpactDepth="express"|"standard"|"deep";
type AttemptResult={ok:boolean;impact?:any;message?:string;status?:number;retryable?:boolean;model:string;execution_ms:number;output_chars?:number};

const PROMPT_VERSION="impact-prompt-v4";
const ENGINE_VERSION="myvor-impact-authenticated-v4";
const OUTPUT_TOKEN_BUDGETS:Record<ImpactDepth,number>={express:1800,standard:4000,deep:6000};
const ATTEMPT_TIMEOUTS:Record<ImpactDepth,[number,number]>={express:[32000,18000],standard:[48000,27000],deep:[68000,37000]};
const SCORE_KEYS=["juridique","economique_operationnel","urgence","probabilite","politique_reputation","capacite_action"] as const;

const IMPACT_SCHEMA={
  type:"object",
  additionalProperties:false,
  properties:{
    synthese:{type:"string"},
    score:{type:"number"},
    justification_score:{type:"string"},
    score_detail:{type:"object",additionalProperties:false,properties:{juridique:{type:"number"},economique_operationnel:{type:"number"},urgence:{type:"number"},probabilite:{type:"number"},politique_reputation:{type:"number"},capacite_action:{type:"number"}},required:[...SCORE_KEYS]},
    score_justifications:{type:"object",additionalProperties:false,properties:{juridique:{type:"string"},economique_operationnel:{type:"string"},urgence:{type:"string"},probabilite:{type:"string"},politique_reputation:{type:"string"},capacite_action:{type:"string"}},required:[...SCORE_KEYS]},
    dispositions_concernees:{type:"array",items:{type:"object",additionalProperties:false,properties:{disposition:{type:"string"},impact_client:{type:"string"},niveau:{type:"string"}},required:["disposition","impact_client","niveau"]}},
    risques:{type:"array",items:{type:"object",additionalProperties:false,properties:{titre:{type:"string"},description:{type:"string"},niveau:{type:"string"}},required:["titre","description","niveau"]}},
    opportunites:{type:"array",items:{type:"object",additionalProperties:false,properties:{titre:{type:"string"},description:{type:"string"}},required:["titre","description"]}},
    echeances:{type:"array",items:{type:"object",additionalProperties:false,properties:{date:{type:"string"},evenement:{type:"string"},importance:{type:"string"}},required:["date","evenement","importance"]}},
    recommandations:{type:"array",items:{type:"object",additionalProperties:false,properties:{action:{type:"string"},raison:{type:"string"},priorite:{type:"string"}},required:["action","raison","priorite"]}},
    informations_a_confirmer:{type:"array",items:{type:"string"}},
  },
  required:["synthese","score","justification_score","score_detail","score_justifications","dispositions_concernees","risques","opportunites","echeances","recommandations","informations_a_confirmer"],
};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g,"").slice(0,max).trim();}
function cleanApiKey(raw:string){const match=String(raw||"").normalize("NFKC").match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
function clampNumber(value:unknown,min:number,max:number){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,Math.round(number))):0;}
function cleanArray(value:any,maxItems:number,maxChars:number){return Array.isArray(value)?value.slice(0,maxItems).map((item:any)=>typeof item==="string"?clip(item,maxChars):item).filter(Boolean):[];}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}
function extractRefusal(payload:any){const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.refusal||"").filter(Boolean).join(" ");}
function parseJson(raw:unknown){const text=String(raw??"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();if(!text)return null;try{return JSON.parse(text);}catch{}const start=text.indexOf("{");const end=text.lastIndexOf("}");if(start>=0&&end>start){try{return JSON.parse(text.slice(start,end+1));}catch{}}return null;}
function validateRawImpact(raw:any){if(!raw||typeof raw!=="object")return"Objet d’impact absent.";if(clip(raw.synthese,5000).length<30)return"Synthèse trop courte.";if(!raw.score_detail||!raw.score_justifications)return"Score détaillé ou justifications absents.";for(const key of SCORE_KEYS){if(!Number.isFinite(Number(raw.score_detail?.[key])))return`Sous-score ${key} absent.`;if(clip(raw.score_justifications?.[key],1200).length<12)return`Justification ${key} trop courte.`;}return"";}

function normalizeImpact(raw:any,depth:ImpactDepth){
  const detail={juridique:clampNumber(raw?.score_detail?.juridique,0,20),economique_operationnel:clampNumber(raw?.score_detail?.economique_operationnel,0,20),urgence:clampNumber(raw?.score_detail?.urgence,0,15),probabilite:clampNumber(raw?.score_detail?.probabilite,0,15),politique_reputation:clampNumber(raw?.score_detail?.politique_reputation,0,15),capacite_action:clampNumber(raw?.score_detail?.capacite_action,0,15)};
  const detailTotal=Object.values(detail).reduce((sum,value)=>sum+value,0);const score=detailTotal>0?detailTotal:clampNumber(raw?.score,0,100);
  const limits=depth==="express"?{disp:3,risks:3,opps:2,deadlines:2,recs:3,confirm:5}:depth==="deep"?{disp:5,risks:5,opps:4,deadlines:4,recs:6,confirm:10}:{disp:6,risks:5,opps:4,deadlines:4,recs:6,confirm:8};
  const dispositions=Array.isArray(raw?.dispositions_concernees)?raw.dispositions_concernees.slice(0,limits.disp).map((item:any)=>({disposition:clip(item?.disposition,650),impact_client:clip(item?.impact_client,850),niveau:clip(item?.niveau,80)||"moyen"})).filter((item:any)=>item.disposition||item.impact_client):[];
  const risks=Array.isArray(raw?.risques)?raw.risques.slice(0,limits.risks).map((item:any)=>({titre:clip(item?.titre,220),description:clip(item?.description,700),niveau:clip(item?.niveau,80)||"moyen"})).filter((item:any)=>item.titre||item.description):[];
  const opportunities=Array.isArray(raw?.opportunites)?raw.opportunites.slice(0,limits.opps).map((item:any)=>({titre:clip(item?.titre,220),description:clip(item?.description,700)})).filter((item:any)=>item.titre||item.description):[];
  const deadlines=Array.isArray(raw?.echeances)?raw.echeances.slice(0,limits.deadlines).map((item:any)=>({date:clip(item?.date,160),evenement:clip(item?.evenement,420),importance:clip(item?.importance,420)})).filter((item:any)=>item.date||item.evenement):[];
  const recommendations=Array.isArray(raw?.recommandations)?raw.recommandations.slice(0,limits.recs).map((item:any)=>({action:clip(item?.action,520),raison:clip(item?.raison,650),priorite:clip(item?.priorite,80)})).filter((item:any)=>item.action):[];
  const justifications={juridique:clip(raw?.score_justifications?.juridique,700),economique_operationnel:clip(raw?.score_justifications?.economique_operationnel,700),urgence:clip(raw?.score_justifications?.urgence,700),probabilite:clip(raw?.score_justifications?.probabilite,700),politique_reputation:clip(raw?.score_justifications?.politique_reputation,700),capacite_action:clip(raw?.score_justifications?.capacite_action,700)};
  return{synthese:clip(raw?.synthese,depth==="deep"?2400:1700),score,justification_score:clip(raw?.justification_score,1300),score_detail:detail,score_justifications:justifications,dispositions_concernees:dispositions,risques:risks,opportunites:opportunities,echeances:deadlines,recommandations:recommendations,informations_a_confirmer:cleanArray(raw?.informations_a_confirmer,limits.confirm,500).map((item:any)=>clip(item,500))};
}

async function requireAuthenticatedQuota(req:Request){
  const authorization=req.headers.get("authorization")||"";if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const supabaseUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";if(!supabaseUrl||!anonKey)return json({error:"La sécurité Supabase de Myvor n’est pas configurée."},503);
  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{method:"GET",headers:{apikey:anonKey,Authorization:authorization}});if(!userResponse.ok)return json({error:"Session Myvor invalide ou expirée."},401);const user=await userResponse.json().catch(()=>null);if(!user?.id)return json({error:"Session Myvor invalide ou expirée."},401);
    const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:"impact"})});if(!quotaResponse.ok)return json({error:"Impossible de vérifier le quota IA Myvor."},503);const allowed=await quotaResponse.json().catch(()=>false);if(allowed!==true)return json({error:"Trop de Notes d’impact générées en peu de temps. Réessaie dans quelques minutes."},429);return null;
  }catch{return json({error:"Impossible de vérifier la session Myvor."},503);}
}

function buildPrompt(depth:ImpactDepth,client:string,objectif:string,contexte:string,titre:string,lienOfficiel:string,texte:string){
  const depthRule=depth==="express"?"Analyse express : priorise les signaux décisionnels et les actions immédiates.":depth==="deep"?"Analyse approfondie : croise les sources, justifie chaque critère et explicite les incertitudes. Reste dense et évite les répétitions.":"Analyse standard complète, concise et opérationnelle.";
  return[
    "Tu es le moteur de Note d’impact de Myvor, spécialisé en affaires publiques françaises et européennes.",depthRule,
    "Tu analyses UNIQUEMENT le corpus fourni. N’invente aucun fait, calendrier, position, disposition ou chiffre absent des sources.",
    "Si une information utile n’est pas vérifiable, place-la dans informations_a_confirmer.",
    "Le score mesure l’impact sur l’objectif précis du client, pas l’importance générale du texte.",
    "Barème proposé sur 100 : juridique 0-20 ; économique/opérationnel 0-20 ; urgence institutionnelle 0-15 ; probabilité d’évolution/adoption 0-15 ; politique/réputation 0-15 ; capacité d’action du client 0-15.",
    "Chaque sous-score doit être justifié séparément par au moins une phrase complète. La synthèse doit contenir au moins trois phrases utiles.",
    "Myvor appliquera ensuite sa grille déterministe et pourra plafonner les scores insuffisamment étayés.",
    "Pour chaque échéance, donne une date calendaire explicite avec année uniquement si elle figure réellement dans le corpus.",
    "Respecte exactement le schéma JSON imposé par l’API.",
    "CLIENT :",client,"OBJECTIF CLIENT :",objectif,"CONTEXTE DOSSIER :",contexte||"Non renseigné.","TITRE / CORPUS :",titre,lienOfficiel?`SOURCE OFFICIELLE PRINCIPALE : ${lienOfficiel}`:"","CORPUS ANALYSÉ :",texte,
  ].filter(Boolean).join("\n\n");
}

async function runOpenAiAttempt(args:{apiKey:string;model:string;prompt:string;depth:ImpactDepth;timeoutMs:number;compact?:boolean}):Promise<AttemptResult>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),args.timeoutMs);const startedAt=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${args.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:args.model,input:args.compact?`${args.prompt}\n\nDEUXIÈME TENTATIVE : réponds plus compactement, sans répétitions, tout en remplissant tous les champs requis.`:args.prompt,max_output_tokens:OUTPUT_TOKEN_BUDGETS[args.depth],text:{format:{type:"json_schema",name:"myvor_impact_note",schema:IMPACT_SCHEMA,strict:true}},store:false}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw)?.error?.message||raw;}catch{}const retryable=response.status===429||response.status>=500;return{ok:false,message:`OpenAI ${response.status} : ${String(message).slice(0,300)}`,status:response.status,retryable,model:args.model,execution_ms:Date.now()-startedAt};}
    const payload=await response.json();
    if(payload?.status==="incomplete"){const reason=String(payload?.incomplete_details?.reason||"inconnue");return{ok:false,message:`Réponse OpenAI incomplète (${reason}).`,status:502,retryable:true,model:args.model,execution_ms:Date.now()-startedAt};}
    if(payload?.status==="failed")return{ok:false,message:`OpenAI n’a pas terminé la génération : ${String(payload?.error?.message||"échec").slice(0,300)}`,status:502,retryable:true,model:args.model,execution_ms:Date.now()-startedAt};
    const refusal=extractRefusal(payload);if(refusal)return{ok:false,message:`OpenAI a refusé cette génération : ${refusal.slice(0,300)}`,status:502,retryable:false,model:args.model,execution_ms:Date.now()-startedAt};
    const outputText=extractOutputText(payload);const parsed=parseJson(outputText);if(!parsed)return{ok:false,message:`Sortie JSON inexploitable (${outputText.length} caractères).`,status:502,retryable:true,model:args.model,execution_ms:Date.now()-startedAt};
    const validationError=validateRawImpact(parsed);if(validationError)return{ok:false,message:`Réponse structurée incomplète : ${validationError}`,status:502,retryable:true,model:args.model,execution_ms:Date.now()-startedAt};
    return{ok:true,impact:normalizeImpact(parsed,args.depth),model:args.model,execution_ms:Date.now()-startedAt,output_chars:outputText.length};
  }catch(error:any){const aborted=error?.name==="AbortError";return{ok:false,message:aborted?`Tentative OpenAI interrompue après ${Math.round(args.timeoutMs/1000)} s.`:`Erreur OpenAI : ${error?.message||"inconnue"}`,status:aborted?504:502,retryable:true,model:args.model,execution_ms:Date.now()-startedAt};}
  finally{clearTimeout(timer);}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const authError=await requireAuthenticatedQuota(req);if(authError)return authError;
  const body=await req.json().catch(()=>null);const depth:ImpactDepth=["express","standard","deep"].includes(String(body?.depth))?body.depth:"standard";
  const client=clip(body?.client,300),contexte=clip(body?.contexte,3200),objectif=clip(body?.objectif,1800),titre=clip(body?.titre,600),lienOfficiel=clip(body?.lien_officiel,900),texte=clip(body?.texte,depth==="express"?30000:depth==="deep"?50000:44000);
  if(!client||!objectif||!titre||!texte)return json({error:"Client, objectif, titre et corpus sont obligatoires."},400);
  const apiKey=cleanApiKey(Deno.env.get("OPENAI_API_KEY")||"");if(!apiKey)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans Supabase."},503);
  const primaryModel=Deno.env.get("OPENAI_IMPACT_MODEL")||"gpt-4.1-mini";const fallbackModel=Deno.env.get("OPENAI_IMPACT_FALLBACK_MODEL")||primaryModel;const prompt=buildPrompt(depth,client,objectif,contexte,titre,lienOfficiel,texte);const startedAt=Date.now();const attempts:any[]=[];
  const first=await runOpenAiAttempt({apiKey,model:primaryModel,prompt,depth,timeoutMs:ATTEMPT_TIMEOUTS[depth][0]});attempts.push({model:first.model,ok:first.ok,status:first.ok?200:first.status,execution_ms:first.execution_ms,...(!first.ok?{error:first.message}:{})});
  if(first.ok)return json({impact:first.impact!,engine:ENGINE_VERSION,model:first.model,prompt_version:PROMPT_VERSION,depth,execution_ms:Date.now()-startedAt,latency_budget_ms:ATTEMPT_TIMEOUTS[depth].reduce((a,b)=>a+b,0),output_token_budget:OUTPUT_TOKEN_BUDGETS[depth],attempt_count:1,fallback_model_used:false,attempts});
  if(!first.retryable)return json({error:first.message,engine:ENGINE_VERSION,prompt_version:PROMPT_VERSION,attempts},first.status||502);
  await sleep(650);
  const second=await runOpenAiAttempt({apiKey,model:fallbackModel,prompt,depth,timeoutMs:ATTEMPT_TIMEOUTS[depth][1],compact:true});attempts.push({model:second.model,ok:second.ok,status:second.ok?200:second.status,execution_ms:second.execution_ms,...(!second.ok?{error:second.message}:{})});
  if(second.ok)return json({impact:second.impact!,engine:ENGINE_VERSION,model:second.model,prompt_version:PROMPT_VERSION,depth,execution_ms:Date.now()-startedAt,latency_budget_ms:ATTEMPT_TIMEOUTS[depth].reduce((a,b)=>a+b,0),output_token_budget:OUTPUT_TOKEN_BUDGETS[depth],attempt_count:2,fallback_model_used:true,attempts});
  return json({error:`Les deux tentatives d’analyse IA ont échoué. ${second.message}`,engine:ENGINE_VERSION,prompt_version:PROMPT_VERSION,attempts},second.status===504?504:502);
});
