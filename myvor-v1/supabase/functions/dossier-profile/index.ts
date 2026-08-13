import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};

type Dossier={client:string;title:string;objective:string;context?:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type WatchItem={title:string;nature?:string;urgency?:string;source_url?:string};

const PROFILE_SCHEMA={type:"object",additionalProperties:false,properties:{sector:{type:"string"},activity:{type:"string"},strategic_issues:{type:"array",items:{type:"string"}},risks_to_avoid:{type:"array",items:{type:"string"}},opportunities:{type:"array",items:{type:"string"}},client_position:{type:"string"},key_actors:{type:"array",items:{type:"string"}},watch_topics:{type:"array",items:{type:"string"}},watch_subtopics:{type:"array",items:{type:"string"}},reference_texts:{type:"array",items:{type:"string"}},key_deadlines:{type:"array",items:{type:"string"}},internal_notes:{type:"string"}},required:["sector","activity","strategic_issues","risks_to_avoid","opportunities","client_position","key_actors","watch_topics","watch_subtopics","reference_texts","key_deadlines","internal_notes"]};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").slice(0,max).trim();}
function cleanList(value:any,max=12){return Array.isArray(value)?value.map((x:any)=>clip(x,260)).filter(Boolean).slice(0,max):[];}
function cleanActors(value:any){const blocked=/^(juridique|marketing|data|rh|communication|conformité|conformite)$/i;return cleanList(value,10).map(item=>item.replace(/\s*,\s*/g," et ").replace(/\s+/g," ").trim()).filter(item=>item&&!blocked.test(item)&&!/^services internes?/i.test(item)).slice(0,8);}
function outputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;return(payload?.output||[]).flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||"").join("");}
function parseJsonObject(raw:unknown){let text=String(raw??"").trim();if(!text)return null;text=text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed;}catch{}const first=text.indexOf("{"),last=text.lastIndexOf("}");if(first>=0&&last>first){try{const parsed=JSON.parse(text.slice(first,last+1));if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))return parsed;}catch{}}return null;}

async function requireAuthenticatedQuota(req:Request){
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const supabaseUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!supabaseUrl||!anonKey)return json({error:"La sécurité Supabase de Myvor n’est pas configurée."},503);
  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:authorization}});
    if(!userResponse.ok)return json({error:"Session Myvor invalide ou expirée."},401);
    const user=await userResponse.json().catch(()=>null);
    if(!user?.id)return json({error:"Session Myvor invalide ou expirée."},401);
    const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:"dossier-profile"})});
    if(!quotaResponse.ok)return json({error:"Impossible de vérifier le quota IA Myvor."},503);
    const allowed=await quotaResponse.json().catch(()=>false);
    if(allowed!==true)return json({error:"Trop de générations IA en peu de temps. Réessaie dans quelques minutes."},429);
    return null;
  }catch{return json({error:"Impossible de vérifier la session Myvor."},503);}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const authError=await requireAuthenticatedQuota(req);if(authError)return authError;

  const body=await req.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,20):[];
  if(!dossier?.title||!dossier?.objective)return json({error:"Le dossier doit avoir au moins un titre et un objectif."},400);

  const apiKey=(Deno.env.get("OPENAI_API_KEY")||"").trim();
  if(!apiKey)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans Supabase."},503);

  const instructions=[
    "Tu es Myvor, assistant expert en affaires publiques françaises et européennes.",
    "Pré-remplis la fiche stratégique du dossier client uniquement à partir des informations fournies.",
    "Ne présente jamais comme certain un élément qui n'est pas établi par le dossier ou les titres de veille.",
    "Tu peux proposer des catégories métier raisonnables, mais formule-les de manière générique et exploitable.",
    "N'invente aucun nom de personne, aucune échéance précise, aucun texte juridique précis ni aucune position politique non fournie.",
    "Pour key_actors, retourne uniquement des institutions, autorités, organisations ou catégories d'acteurs EXTERNES utiles à une stratégie d'affaires publiques.",
    "Chaque élément de key_actors doit désigner UNE seule cible identifiable.",
    "N'inclus jamais les services internes du client dans key_actors.",
    "Les textes de référence et échéances restent vides si aucun élément fiable n'est fourni.",
    "Tous les champs du format de sortie doivent être présents. Utilise une chaîne vide ou une liste vide si l'information manque.",
    "Maximum 5 éléments par liste et une phrase courte par élément. Réponds en français."
  ].join("\n");

  const input=JSON.stringify({
    dossier:{client:clip(dossier.client,300),title:clip(dossier.title,300),objective:clip(dossier.objective,1500),context:clip(dossier.context,2500),watch_keywords:cleanList(dossier.watch_keywords,30),watch_priority_phrases:cleanList(dossier.watch_priority_phrases,20),watch_excluded_keywords:cleanList(dossier.watch_excluded_keywords,20)},
    textes_deja_lies:items.map(item=>({title:clip(item.title,500),nature:clip(item.nature,120),urgency:clip(item.urgency,80),source_url:clip(item.source_url,700)}))
  });

  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000);
  try{
    const model=Deno.env.get("OPENAI_DOSSIER_MODEL")||"gpt-5-mini";
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,instructions,input,reasoning:{effort:"low"},max_output_tokens:2600,text:{verbosity:"low",format:{type:"json_schema",name:"myvor_dossier_profile",strict:true,schema:PROFILE_SCHEMA}}})});
    const raw=await response.text();let payload:any={};try{payload=raw?JSON.parse(raw):{};}catch{return json({error:"Réponse OpenAI illisible."},502);}
    if(!response.ok)return json({error:`OpenAI ${response.status}: ${clip(payload?.error?.message||raw,300)}`},502);
    if(payload?.status==="incomplete")return json({error:`Réponse OpenAI incomplète : ${clip(payload?.incomplete_details?.reason||"inconnue",160)}`},502);
    const profile=parseJsonObject(outputText(payload));
    if(!profile)return json({error:"La réponse OpenAI structurée n’était pas exploitable."},502);
    return json({profile:{sector:clip(profile.sector,180),activity:clip(profile.activity,700),strategic_issues:cleanList(profile.strategic_issues),risks_to_avoid:cleanList(profile.risks_to_avoid),opportunities:cleanList(profile.opportunities),client_position:clip(profile.client_position,1200),key_actors:cleanActors(profile.key_actors),watch_topics:cleanList(profile.watch_topics),watch_subtopics:cleanList(profile.watch_subtopics),reference_texts:cleanList(profile.reference_texts),key_deadlines:cleanList(profile.key_deadlines),internal_notes:clip(profile.internal_notes,1600)},engine:"myvor-dossier-profile-ai-v7"});
  }catch(error:any){if(error?.name==="AbortError")return json({error:"La génération a dépassé 35 secondes. Réessaie."},504);return json({error:`Erreur de génération : ${clip(error?.message||"inconnue",260)}`},500);}finally{clearTimeout(timer);}
});