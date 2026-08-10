import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
type Mode="express"|"standard"|"deep";
type Key="juridique"|"reglementaire"|"operationnel"|"reputationnel"|"fenetre_action"|"risque_inaction";
const ENGINE="myvor-urgency-score-v1";
const PROMPT_VERSION="urgency-score-prompt-v1";
const MAX:Record<Key,number>={juridique:15,reglementaire:15,operationnel:20,reputationnel:15,fenetre_action:20,risque_inaction:15};
const KEYS=Object.keys(MAX) as Key[];
const CFG:Record<Mode,{timeout:number;tokens:number;items:number}>={express:{timeout:17000,tokens:1300,items:6},standard:{timeout:36000,tokens:2800,items:12},deep:{timeout:65000,tokens:5000,items:24}};
const criterion=(max:number)=>({type:"object",additionalProperties:false,properties:{score:{type:"number",minimum:0,maximum:max},justification:{type:"string"},evidence:{type:"array",items:{type:"string"}}},required:["score","justification","evidence"]});
const SCHEMA={type:"object",additionalProperties:false,properties:{summary:{type:"string"},criteria:{type:"object",additionalProperties:false,properties:{juridique:criterion(15),reglementaire:criterion(15),operationnel:criterion(20),reputationnel:criterion(15),fenetre_action:criterion(20),risque_inaction:criterion(15)},required:[...KEYS]},workstreams:{type:"array",items:{type:"string"}},next_actions:{type:"array",items:{type:"string"}},uncertainties:{type:"array",items:{type:"string"}}},required:["summary","criteria","workstreams","next_actions","uncertainties"]};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").slice(0,max).trim();}
function clamp(value:unknown,max:number){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,Math.round(n))):0;}
function out(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;return(payload?.output||[]).flatMap((item:any)=>item?.content||[]).map((item:any)=>item?.text||"").join("");}

async function requireQuota(req:Request){
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!url||!anon)return json({error:"Configuration Supabase incomplète."},503);
  try{
    const user=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:authorization}});if(!user.ok)return json({error:"Session Myvor invalide ou expirée."},401);
    const quota=await fetch(`${url}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:anon,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:"impact"})});
    if(!quota.ok)return json({error:"Impossible de vérifier le quota IA Myvor."},503);
    if(await quota.json().catch(()=>false)!==true)return json({error:"Trop de Scores d’urgence générés en peu de temps. Réessaie dans quelques minutes."},429);
    return null;
  }catch{return json({error:"Impossible de vérifier la session Myvor."},503);}
}

function prompt(mode:Mode,dossier:any,items:any[]){
  const detail=mode==="express"?"EXPRESS : une à deux phrases par justification, zéro remplissage, 3 actions maximum.":mode==="standard"?"STANDARD : 2 à 4 phrases par justification et 3 à 6 pistes de travail concrètes.":"APPROFONDI : démontre chaque chiffre, explique pourquoi la note n'est ni plus haute ni plus basse, détaille preuves, limites et incertitudes.";
  const dossierText=[`Client : ${clip(dossier?.client,300)}`,`Dossier : ${clip(dossier?.title,500)}`,`Objectif client : ${clip(dossier?.objective,1800)}`,`Contexte : ${clip(dossier?.context,2500)}`,`Secteur : ${clip(dossier?.sector,500)}`,`Activité : ${clip(dossier?.activity,900)}`,`Enjeux : ${(Array.isArray(dossier?.strategic_issues)?dossier.strategic_issues:[]).map((v:any)=>clip(v,300)).join(" ; ")}`,`Risques à éviter : ${(Array.isArray(dossier?.risks_to_avoid)?dossier.risks_to_avoid:[]).map((v:any)=>clip(v,300)).join(" ; ")}`,`Opportunités : ${(Array.isArray(dossier?.opportunities)?dossier.opportunities:[]).map((v:any)=>clip(v,300)).join(" ; ")}`,`Position client : ${clip(dossier?.client_position,1000)}`,`Échéances : ${(Array.isArray(dossier?.key_deadlines)?dossier.key_deadlines:[]).map((v:any)=>clip(v,250)).join(" ; ")}`].filter(line=>!line.endsWith(": ")).join("\n");
  const watchText=items.map((item,index)=>`VEILLE ${index+1}\nTitre : ${clip(item?.title,500)}\nNature : ${clip(item?.nature,180)}\nUrgence de veille : ${clip(item?.urgency,100)}\nSource : ${clip(item?.source_name,240)}\nDate : ${clip(item?.published_at||item?.created_at,100)}\nRaison de rattachement : ${clip(item?.qualification_reason,700)}\nURL : ${clip(item?.source_url,1000)}`).join("\n\n");
  return `Tu es le moteur Score d'urgence de Myvor. Ta seule question est : une action est-elle nécessaire maintenant pour atteindre l'objectif du client, et pourquoi ?\n\n${detail}\n\nBARÈME FIXE SUR 100 : juridique 0-15 ; reglementaire 0-15 ; operationnel 0-20 ; reputationnel 0-15 ; fenetre_action 0-20 ; risque_inaction 0-15.\n\nRÈGLES ABSOLUES :\n- Le score mesure l'urgence d'agir par rapport à l'objectif client, jamais l'importance générale du sujet.\n- Justifie chaque note uniquement avec le dossier et les éléments de veille transmis.\n- N'invente aucun fait, texte, date, sanction, position d'acteur ou conséquence certaine.\n- Si l'information est insuffisante, baisse la certitude et inscris précisément ce qui manque dans uncertainties.\n- fenetre_action : un score élevé signifie que la marge utile pour agir est courte ou décisive.\n- risque_inaction : un score élevé signifie que ne rien faire crée une perte, une exposition ou une dégradation significative.\n- Ne construis ni cartographie d'acteurs ni stratégie de lobbying : cela appartient au Radar et à la War Zone.\n- workstreams et next_actions restent des pistes internes de préparation.\n- evidence reprend uniquement des titres ou faits présents dans les données.\n- Respecte exactement le schéma JSON.\n\nDOSSIER\n${dossierText}\n\nVEILLE RATTACHÉE\n${watchText}`;
}

function normalize(raw:any,mode:Mode){
  const criteria={} as Record<Key,any>;
  for(const key of KEYS){const value=raw?.criteria?.[key]||{};criteria[key]={score:clamp(value.score,MAX[key]),max:MAX[key],justification:clip(value.justification,mode==="deep"?2200:mode==="standard"?1200:650),evidence:(Array.isArray(value.evidence)?value.evidence:[]).slice(0,mode==="deep"?8:4).map((v:any)=>clip(v,500)).filter(Boolean)};}
  const score=KEYS.reduce((sum,key)=>sum+criteria[key].score,0);
  const level=score>=85?"critique":score>=70?"urgent":score>=50?"action_necessaire":score>=25?"a_surveiller":"faible";
  const decision=score>=70?"AGIR_MAINTENANT":score>=50?"AGIR":score>=25?"SURVEILLER_ET_PREPARER":"NE_PAS_AGIR_IMMEDIATEMENT";
  return{score,level,decision,action_needed:score>=50,summary:clip(raw?.summary,mode==="deep"?2600:mode==="standard"?1500:850),criteria,workstreams:(Array.isArray(raw?.workstreams)?raw.workstreams:[]).slice(0,mode==="express"?0:mode==="standard"?6:8).map((v:any)=>clip(v,900)).filter(Boolean),next_actions:(Array.isArray(raw?.next_actions)?raw.next_actions:[]).slice(0,mode==="express"?3:mode==="standard"?5:7).map((v:any)=>clip(v,900)).filter(Boolean),uncertainties:(Array.isArray(raw?.uncertainties)?raw.uncertainties:[]).slice(0,mode==="express"?3:mode==="standard"?6:10).map((v:any)=>clip(v,900)).filter(Boolean),sources:[],mode};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const authError=await requireQuota(req);if(authError)return authError;
  const body=await req.json().catch(()=>null);const mode:Mode=["express","standard","deep"].includes(String(body?.mode))?body.mode:"standard";const dossier=body?.dossier||null;const items=Array.isArray(body?.items)?body.items.slice(0,CFG[mode].items):[];
  if(!dossier?.objective||!items.length)return json({error:"Dossier et veille rattachée sont obligatoires."},400);
  const apiKey=clip(Deno.env.get("OPENAI_API_KEY")||"",400);if(!apiKey.startsWith("sk-"))return json({error:"OPENAI_API_KEY n'est pas configurée dans Supabase."},503);
  const model=clip(Deno.env.get("OPENAI_URGENCY_MODEL")||"gpt-5-mini",120);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),CFG[mode].timeout);const started=Date.now();
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","X-Client-Request-Id":crypto.randomUUID()},body:JSON.stringify({model,input:prompt(mode,dossier,items),max_output_tokens:CFG[mode].tokens,text:{verbosity:mode==="deep"?"medium":"low",format:{type:"json_schema",name:"myvor_urgency_score",schema:SCHEMA,strict:true}},store:false}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();let message="";try{message=clip(JSON.parse(raw)?.error?.message,260);}catch{}return json({error:message||`Le service IA a renvoyé une erreur (${response.status}).`},response.status===429?429:502);}
    const payload=await response.json();if(payload?.status==="incomplete")return json({error:"Le moteur IA n'a pas terminé le Score d'urgence dans le temps disponible."},504);
    let parsed:any=null;try{parsed=JSON.parse(out(payload));}catch{return json({error:"Le moteur IA a renvoyé un Score d'urgence inexploitable."},502);}
    const result=normalize(parsed,mode);const execution_ms=Date.now()-started;return json({result:{...result,engine:ENGINE,model,execution_ms},engine:ENGINE,model,prompt_version:PROMPT_VERSION,execution_ms});
  }catch(error:any){if(error?.name==="AbortError")return json({error:mode==="express"?"Le Score Express n'a pas été calculé dans la fenêtre cible.":mode==="standard"?"Le Score Standard n'a pas été calculé dans la fenêtre cible.":"Le Score approfondi a dépassé le temps disponible."},504);return json({error:`Erreur moteur Score d'urgence : ${clip(error?.message||"inconnue",220)}`},502);}finally{clearTimeout(timer);}
});
