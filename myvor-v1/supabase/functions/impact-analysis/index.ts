const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};

type ImpactDepth="express"|"standard"|"deep";

const ENGINE_VERSION="myvor-impact-stable-v25";
const PROMPT_VERSION="impact-prompt-v10-stable";
const SCORE_KEYS=["juridique","economique_operationnel","urgence","probabilite","politique_reputation","capacite_action"] as const;
const CONFIG:Record<ImpactDepth,{maxOutputTokens:number;timeoutMs:number;maxCorpus:number}>={
  express:{maxOutputTokens:1800,timeoutMs:30000,maxCorpus:26000},
  standard:{maxOutputTokens:3500,timeoutMs:40000,maxCorpus:40000},
  deep:{maxOutputTokens:6000,timeoutMs:45000,maxCorpus:50000},
};

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
function clampNumber(value:unknown,min:number,max:number){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):0;}
function cleanApiKey(raw:string){const match=String(raw||"").normalize("NFKC").match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}
function parseJson(raw:unknown){const text=String(raw??"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();if(!text)return null;try{return JSON.parse(text);}catch{}const start=text.indexOf("{");const end=text.lastIndexOf("}");if(start>=0&&end>start){try{return JSON.parse(text.slice(start,end+1));}catch{}}return null;}

function normalizeImpact(raw:any,depth:ImpactDepth){
  const deep=depth==="deep";
  const detail={
    juridique:clampNumber(raw?.score_detail?.juridique,0,20),
    economique_operationnel:clampNumber(raw?.score_detail?.economique_operationnel,0,20),
    urgence:clampNumber(raw?.score_detail?.urgence,0,15),
    probabilite:clampNumber(raw?.score_detail?.probabilite,0,15),
    politique_reputation:clampNumber(raw?.score_detail?.politique_reputation,0,15),
    capacite_action:clampNumber(raw?.score_detail?.capacite_action,0,15),
  };
  const total=Object.values(detail).reduce((sum,value)=>sum+value,0);
  const limits=depth==="express"?{disp:3,risks:3,opps:2,deadlines:2,recs:3,confirm:5}:deep?{disp:5,risks:5,opps:4,deadlines:4,recs:6,confirm:10}:{disp:6,risks:5,opps:4,deadlines:4,recs:6,confirm:8};
  const justMax=deep?1600:700;
  return{
    synthese:clip(raw?.synthese,deep?4300:1800),
    score:total||clampNumber(raw?.score,0,100),
    justification_score:clip(raw?.justification_score,deep?2400:1300),
    score_detail:detail,
    score_justifications:{
      juridique:clip(raw?.score_justifications?.juridique,justMax),
      economique_operationnel:clip(raw?.score_justifications?.economique_operationnel,justMax),
      urgence:clip(raw?.score_justifications?.urgence,justMax),
      probabilite:clip(raw?.score_justifications?.probabilite,justMax),
      politique_reputation:clip(raw?.score_justifications?.politique_reputation,justMax),
      capacite_action:clip(raw?.score_justifications?.capacite_action,justMax),
    },
    dispositions_concernees:Array.isArray(raw?.dispositions_concernees)?raw.dispositions_concernees.slice(0,limits.disp).map((item:any)=>({disposition:clip(item?.disposition,900),impact_client:clip(item?.impact_client,deep?1500:850),niveau:clip(item?.niveau,100)||"moyen"})).filter((item:any)=>item.disposition||item.impact_client):[],
    risques:Array.isArray(raw?.risques)?raw.risques.slice(0,limits.risks).map((item:any)=>({titre:clip(item?.titre,260),description:clip(item?.description,deep?1500:700),niveau:clip(item?.niveau,100)||"moyen"})).filter((item:any)=>item.titre||item.description):[],
    opportunites:Array.isArray(raw?.opportunites)?raw.opportunites.slice(0,limits.opps).map((item:any)=>({titre:clip(item?.titre,260),description:clip(item?.description,deep?1300:700)})).filter((item:any)=>item.titre||item.description):[],
    echeances:Array.isArray(raw?.echeances)?raw.echeances.slice(0,limits.deadlines).map((item:any)=>({date:clip(item?.date,180),evenement:clip(item?.evenement,deep?850:450),importance:clip(item?.importance,deep?1000:450)})).filter((item:any)=>item.date||item.evenement):[],
    recommandations:Array.isArray(raw?.recommandations)?raw.recommandations.slice(0,limits.recs).map((item:any)=>({action:clip(item?.action,deep?1200:600),raison:clip(item?.raison,deep?1500:750),priorite:clip(item?.priorite,120)})).filter((item:any)=>item.action):[],
    informations_a_confirmer:Array.isArray(raw?.informations_a_confirmer)?raw.informations_a_confirmer.slice(0,limits.confirm).map((item:any)=>clip(item,deep?850:500)).filter(Boolean):[],
  };
}

async function requireAuthenticatedQuota(req:Request){
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const supabaseUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!supabaseUrl||!anonKey)return json({error:"La sécurité Supabase de Myvor n’est pas configurée."},503);
  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{method:"GET",headers:{apikey:anonKey,Authorization:authorization}});
    if(!userResponse.ok)return json({error:"Session Myvor invalide ou expirée."},401);
    const user=await userResponse.json().catch(()=>null);
    if(!user?.id)return json({error:"Session Myvor invalide ou expirée."},401);
    const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:"impact"})});
    if(!quotaResponse.ok)return json({error:"Impossible de vérifier le quota IA Myvor."},503);
    const allowed=await quotaResponse.json().catch(()=>false);
    if(allowed!==true)return json({error:"Trop de Notes d’impact générées en peu de temps. Réessaie dans quelques minutes."},429);
    return null;
  }catch{return json({error:"Impossible de vérifier la session Myvor."},503);}
}

function buildPrompt(depth:ImpactDepth,client:string,objectif:string,contexte:string,titre:string,lienOfficiel:string,texte:string){
  const depthRule=depth==="express"
    ?"NOTE EXPRESS. Va directement aux changements, risques, échéances et actions prioritaires."
    :depth==="deep"
      ?"NOTE APPROFONDIE. Produis une véritable analyse stratégique de second niveau, nettement plus riche qu’une note Standard. Croise toutes les sources disponibles. Distingue les faits établis, les conséquences probables, les incertitudes et les recommandations Myvor. Explique les mécanismes d’impact sur l’activité et l’objectif du client. Développe les dispositions concernées, les risques, les opportunités, les échéances et les recommandations en phrases complètes. Chaque recommandation doit préciser une action concrète, son objectif, son horizon et son résultat attendu. Justifie séparément les six critères du score. Ne transforme pas la Note d’impact en War Zone : aucun lobbying, aucune cible d’influence et aucun message à adresser à un acteur. N’invente aucune information absente du corpus."
      :"NOTE STANDARD. Produis une analyse complète, concise et opérationnelle.";
  return[
    "Tu es le moteur de Note d’impact de Myvor, spécialisé en affaires publiques françaises et européennes.",
    depthRule,
    "Tous les champs explicatifs doivent être rédigés en phrases complètes, concrètes et autonomes.",
    "Tu analyses uniquement le corpus fourni. N’invente aucun fait, calendrier, position, disposition ou chiffre absent des sources.",
    "Si une information utile n’est pas vérifiable, place-la dans informations_a_confirmer.",
    "Le score mesure l’impact sur l’objectif précis du client, pas l’importance générale du texte.",
    "Barème sur 100 : juridique 0-20 ; économique/opérationnel 0-20 ; urgence institutionnelle 0-15 ; probabilité d’évolution/adoption 0-15 ; politique/réputation 0-15 ; capacité d’action du client 0-15.",
    "Respecte exactement le schéma JSON imposé par l’API.",
    "CLIENT :",client,
    "OBJECTIF CLIENT :",objectif,
    "CONTEXTE DOSSIER :",contexte||"Non renseigné.",
    "TITRE / CORPUS :",titre,
    lienOfficiel?`SOURCE OFFICIELLE PRINCIPALE : ${lienOfficiel}`:"",
    "CORPUS ANALYSÉ :",texte,
  ].filter(Boolean).join("\n\n");
}

async function callOpenAI(args:{apiKey:string;model:string;prompt:string;depth:ImpactDepth}){
  const config=CONFIG[args.depth];
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),config.timeoutMs);
  const startedAt=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${args.apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:args.model,input:args.prompt,max_output_tokens:config.maxOutputTokens,text:{format:{type:"json_schema",name:"myvor_impact_note",schema:IMPACT_SCHEMA,strict:true}},store:false}),
      signal:controller.signal,
    });
    if(!response.ok){
      const raw=await response.text();
      let message=raw;
      try{message=JSON.parse(raw)?.error?.message||raw;}catch{}
      console.error("[impact-analysis] openai_error",JSON.stringify({status:response.status,execution_ms:Date.now()-startedAt,error:String(message).slice(0,900)}));
      return{ok:false,status:response.status,error:`OpenAI ${response.status} : ${String(message).slice(0,300)}`,executionMs:Date.now()-startedAt};
    }
    const payload=await response.json();
    if(payload?.status==="incomplete")return{ok:false,status:502,error:`Réponse OpenAI incomplète (${String(payload?.incomplete_details?.reason||"raison inconnue")}).`,executionMs:Date.now()-startedAt};
    if(payload?.status==="failed")return{ok:false,status:502,error:`OpenAI n’a pas terminé la génération : ${String(payload?.error?.message||"échec").slice(0,300)}`,executionMs:Date.now()-startedAt};
    const outputText=extractOutputText(payload);
    const parsed=parseJson(outputText);
    if(!parsed){console.error("[impact-analysis] invalid_json",JSON.stringify({execution_ms:Date.now()-startedAt,output_chars:outputText.length}));return{ok:false,status:502,error:"La réponse IA n’est pas un JSON exploitable.",executionMs:Date.now()-startedAt};}
    return{ok:true,impact:normalizeImpact(parsed,args.depth),executionMs:Date.now()-startedAt,outputChars:outputText.length};
  }catch(error:any){
    const timeout=error?.name==="AbortError";
    console.error("[impact-analysis] exception",JSON.stringify({timeout,execution_ms:Date.now()-startedAt,error:String(error?.message||error).slice(0,500)}));
    return{ok:false,status:timeout?504:502,error:timeout?`OpenAI n’a pas répondu en moins de ${Math.round(config.timeoutMs/1000)} secondes.`:`Erreur OpenAI : ${error?.message||"inconnue"}`,executionMs:Date.now()-startedAt};
  }finally{clearTimeout(timer);}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const authError=await requireAuthenticatedQuota(req);if(authError)return authError;
  const body=await req.json().catch(()=>null);
  const depth:ImpactDepth=["express","standard","deep"].includes(String(body?.depth))?body.depth:"standard";
  const config=CONFIG[depth];
  const client=clip(body?.client,300),objectif=clip(body?.objectif,1800),contexte=clip(body?.contexte,depth==="deep"?6500:3200),titre=clip(body?.titre,600),lienOfficiel=clip(body?.lien_officiel,900),texte=clip(body?.texte,config.maxCorpus);
  if(!client||!objectif||!titre||!texte)return json({error:"Client, objectif, titre et corpus sont obligatoires."},400);
  const apiKey=cleanApiKey(Deno.env.get("OPENAI_API_KEY")||"");
  if(!apiKey)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans Supabase."},503);
  const model=Deno.env.get("OPENAI_IMPACT_MODEL")||"gpt-4.1-mini";
  const prompt=buildPrompt(depth,client,objectif,contexte,titre,lienOfficiel,texte);
  const result=await callOpenAI({apiKey,model,prompt,depth});
  if(!result.ok)return json({error:result.error,engine:ENGINE_VERSION,prompt_version:PROMPT_VERSION,execution_ms:result.executionMs},result.status===429?429:result.status===504?504:502);
  return json({impact:result.impact,engine:ENGINE_VERSION,model,prompt_version:PROMPT_VERSION,depth,execution_ms:result.executionMs,output_token_budget:config.maxOutputTokens,attempt_count:1,output_chars:result.outputChars||0});
});
