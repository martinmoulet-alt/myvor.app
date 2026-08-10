import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};
const MAX_WATCH_ITEMS=24;
const MAX_TOTAL_SOURCE_CHARS=60000;
const MAX_SOURCE_CHARS=7000;

const DOCUMENT_SCHEMA={
  type:"object",
  additionalProperties:false,
  properties:{
    title:{type:"string"},
    subject:{type:"string"},
    content:{type:"string"},
    key_points:{type:"array",maxItems:6,items:{type:"string"}},
  },
  required:["title","subject","content","key_points"],
};

type EditAction="reformulate"|"shorten"|"strengthen"|"diplomatic";
type SourceItem={id:string;title:string;nature:string;source_url:string;source_name:string;urgency:string;published_at:string;source_text:string};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max).trim();}
function cleanApiKey(raw:string){const match=String(raw||"").normalize("NFKC").match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function outputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text.trim();return(payload?.output||[]).flatMap((item:any)=>item?.content||[]).map((part:any)=>part?.text||"").join("").trim();}
function getAdminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function cleanSourceTitle(value:unknown){return clip(value,500).replace(/\s+/g," ").trim()||"Source institutionnelle";}
function compact(value:unknown,max=12000){if(value==null)return null;try{return JSON.parse(JSON.stringify(value).slice(0,max));}catch{return clip(value,max)||null;}}

async function authenticate(req:Request,feature:string){
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return{error:json({error:"Session Myvor requise."},401)};
  const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!url||!anonKey)return{error:json({error:"La sécurité Supabase de Myvor n’est pas configurée."},503)};
  const client=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError||!user)return{error:json({error:"Session Myvor invalide ou expirée."},401)};
  const {data:allowed,error:quotaError}=await client.rpc("consume_ai_quota",{p_feature:feature});
  if(quotaError)return{error:json({error:"Impossible de vérifier le quota IA Myvor."},503)};
  if(allowed!==true)return{error:json({error:"Trop de générations IA en peu de temps. Réessaie dans quelques minutes."},429)};
  return{client,url,userId:user.id};
}

async function loadContext(client:any,url:string,body:any){
  const dossierId=clip(body?.dossier?.id,80);
  if(!dossierId)return{error:"Sélectionne un dossier client."};
  const {data:dossier,error:dossierError}=await client.from("dossiers").select("id,client,title,objective,context,sector,activity,risks_to_avoid,opportunities,client_position,key_actors,key_deadlines,internal_notes").eq("id",dossierId).maybeSingle();
  if(dossierError||!dossier)return{error:"Le dossier n’est plus accessible dans ce workspace."};

  const requestedIds=[...new Set((Array.isArray(body?.items)?body.items:[]).map((item:any)=>clip(item?.id,80)).filter((id:string)=>/^[0-9a-f-]{36}$/i.test(id)))].slice(0,MAX_WATCH_ITEMS) as string[];
  if(!requestedIds.length)return{error:"Aucun texte du corpus applicable n’est disponible pour ce dossier."};

  const {data:watchRows,error:watchError}=await client.from("watch_items").select("id,title,nature,source_url,source_name,urgency,published_at,created_at").in("id",requestedIds);
  if(watchError)return{error:"Impossible de charger les textes du corpus applicable."};
  const byId=new Map((watchRows||[]).map((row:any)=>[String(row.id),row]));
  const ordered=requestedIds.map(id=>byId.get(id)).filter(Boolean);
  if(!ordered.length)return{error:"Aucun texte accessible n’a été retrouvé pour ce dossier."};

  const adminKey=getAdminKey();
  const sourceMap=new Map<string,string>();
  if(adminKey){
    const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:contents}=await admin.from("watch_item_content").select("watch_item_id,source_text").in("watch_item_id",ordered.map((row:any)=>row.id));
    for(const row of contents||[])sourceMap.set(String(row.watch_item_id),String(row.source_text||""));
  }

  let remaining=MAX_TOTAL_SOURCE_CHARS;
  const items:SourceItem[]=ordered.map((row:any)=>{
    const raw=sourceMap.get(String(row.id))||"";
    const take=Math.max(0,Math.min(MAX_SOURCE_CHARS,remaining));
    const sourceText=clip(raw,take);
    remaining=Math.max(0,remaining-sourceText.length);
    return{
      id:String(row.id),title:cleanSourceTitle(row.title),nature:clip(row.nature,140),source_url:clip(row.source_url,900),source_name:clip(row.source_name,220),urgency:clip(row.urgency,80),published_at:clip(row.published_at||row.created_at,80),source_text:sourceText,
    };
  });
  return{dossier,items};
}

async function editPassage(apiKey:string,body:any){
  const selected=clip(body?.selected_text,4500);
  const surrounding=clip(body?.surrounding_text,7000);
  const action=String(body?.action||"reformulate") as EditAction;
  if(!selected)return json({error:"Sélectionne d’abord un passage dans la note."},400);
  const rules:Record<EditAction,string>={
    reformulate:"Reformule ce passage pour le rendre plus clair, fluide, précis et professionnel sans modifier le fond.",
    shorten:"Raccourcis ce passage d’environ 30 à 40 %, conserve les informations indispensables et supprime les répétitions.",
    strengthen:"Renforce l’argumentation et rends le raisonnement plus convaincant et orienté décision sans inventer de fait.",
    diplomatic:"Rends ce passage plus diplomatique, institutionnel et nuancé tout en conservant son message.",
  };
  const input=["Tu es l’assistant d’édition du Note Builder Myvor.",rules[action]||rules.reformulate,"N’invente aucun fait, chiffre, date, acteur ou source.","Réponds uniquement avec le passage réécrit.","CONTEXTE :",surrounding,"PASSAGE :",selected].join("\n");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:clip(Deno.env.get("OPENAI_NOTE_BUILDER_MODEL")||"gpt-4.1-mini",120),input,max_output_tokens:900,store:false}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();console.error("note-builder edit OpenAI",response.status,raw.slice(0,500));return json({error:`La réécriture IA est indisponible (${response.status}).`},502);}
    const text=outputText(await response.json());if(!text)return json({error:"La réécriture n’a renvoyé aucun texte."},502);
    return json({text,engine:"supabase-note-builder-edit-v4"});
  }catch(error:any){if(error?.name==="AbortError")return json({error:"La réécriture a dépassé le délai prévu."},504);console.error("note-builder edit error",error);return json({error:"Réécriture impossible pour le moment."},500);}finally{clearTimeout(timer);}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const length=Number(req.headers.get("content-length")||0);if(Number.isFinite(length)&&length>200000)return json({error:"Requête trop volumineuse."},413);
  const body=await req.json().catch(()=>null);
  const mode=String(body?.mode||"generate");
  const auth=await authenticate(req,mode==="edit"?"note-builder-edit":"note-builder");
  if(auth.error)return auth.error;
  const apiKey=cleanApiKey(Deno.env.get("OPENAI_API_KEY")||"");
  if(!apiKey)return json({error:"Le moteur IA du Note Builder n’est pas configuré."},503);
  if(mode==="edit")return editPassage(apiKey,body);

  const loaded=await loadContext(auth.client,auth.url,body);
  if(loaded.error)return json({error:loaded.error},400);
  const dossier:any=loaded.dossier;
  const items:SourceItem[]=loaded.items||[];
  const format=String(body?.format||"note-client");
  const audience=clip(body?.audience||"Client",120);
  const tone=clip(body?.tone||"professionnel et direct",120);
  const instruction=clip(body?.instruction,1200);
  const impact=compact(body?.impact,14000);
  const radar=compact(body?.radar,14000);
  const currentDate=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date());

  const formatRules:Record<string,string>={
    "note-client":"NOTE STRATÉGIQUE : synthèse exécutive, enjeu institutionnel, implications concrètes pour le client, risques/opportunités, acteurs à mobiliser, recommandations hiérarchisées. 650 à 850 mots.",
    "synthese":"NOTE DE SYNTHÈSE : objet/périmètre, faits et signaux essentiels, convergences/divergences entre sources, implications et points de vigilance. 400 à 600 mots.",
    "email":"E-MAIL CLIENT : objet court, message clé immédiat, 2 à 4 paragraphes courts, implications et prochaine action explicite. 180 à 300 mots.",
    "rendez-vous":"BRIEF RENDEZ-VOUS : objectif, contexte, messages à faire passer, arguments, questions, objections/réponses et résultat recherché. 450 à 650 mots.",
    "argumentaire":"ARGUMENTAIRE : thèse centrale, 3 à 5 arguments étayés, objections et réponses, demandes précises. 500 à 750 mots.",
    "elements-langage":"ÉLÉMENTS DE LANGAGE : message principal, 5 à 8 messages secondaires, réponses aux objections et phrases de conclusion réutilisables oralement. 250 à 450 mots.",
  };

  const sourceInput=items.map((item,index)=>({index:index+1,title:item.title,nature:item.nature,source:item.source_name,date:item.published_at,urgency:item.urgency,url:item.source_url,source_text:item.source_text||null}));
  const prompt=[
    "MYVOR — NOTE BUILDER PROFESSIONNEL D’AFFAIRES PUBLIQUES.",
    `Date de génération : ${currentDate}.`,
    "Transforme le dossier et son corpus applicable en un livrable immédiatement exploitable par un consultant.",
    "Le corpus applicable peut contenir des textes anciens et nouveaux. Utilise les textes anciens comme cadre de référence et les plus récents pour identifier ce qui change. Ne crée pas de section rétrospective ou d’historique pour elle-même.",
    "Les extraits source_text sont la preuve primaire. Les titres et URL seuls ne suffisent pas à affirmer une disposition précise.",
    "N’invente aucun fait, chiffre, date, disposition, acteur ou position. Si une information n’est pas établie par le corpus, ne l’affirme pas.",
    "Rédige des phrases complètes, concrètes et décisionnelles. Chaque recommandation précise l’action, son objet et son résultat attendu.",
    "Évite les banalités, répétitions, formulations télégraphiques et commentaires techniques sur le fonctionnement de l’IA.",
    formatRules[format]||formatRules["note-client"],
    `Public visé : ${audience}. Ton : ${tone}.`,
    instruction?`Instruction utilisateur : ${instruction}`:"",
    "Réponds uniquement selon le schéma JSON demandé.",
    "DOSSIER :",JSON.stringify(dossier),
    "CORPUS APPLICABLE :",JSON.stringify(sourceInput),
    "SCORE / ANALYSE MYVOR DÉRIVÉE :",JSON.stringify(impact),
    "RADAR MYVOR DÉRIVÉ :",JSON.stringify(radar),
  ].filter(Boolean).join("\n");

  const model=clip(Deno.env.get("OPENAI_NOTE_BUILDER_MODEL")||"gpt-4.1-mini",120);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt,max_output_tokens:2600,store:false,text:{format:{type:"json_schema",name:"myvor_note_builder_v4",strict:true,schema:DOCUMENT_SCHEMA}}}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();console.error("note-builder OpenAI",response.status,raw.slice(0,700));let detail="";try{detail=JSON.parse(raw)?.error?.message||"";}catch{}return json({error:`Le moteur du Note Builder est indisponible (${response.status})${detail?` : ${clip(detail,220)}`:"."}`},502);}
    const raw=outputText(await response.json());let document:any=null;try{document=JSON.parse(raw);}catch{console.error("note-builder parse",raw.slice(0,700));return json({error:"Le Note Builder a reçu une réponse non exploitable. Réessaie."},502);}
    const content=clip(document?.content,30000);if(!content)return json({error:"Le Note Builder n’a renvoyé aucun contenu exploitable."},502);
    const keyPoints=Array.isArray(document?.key_points)?document.key_points.map((v:any)=>clip(v,900)).filter(Boolean).slice(0,6):[];
    return json({document:{title:clip(document?.title,500)||`Document — ${dossier.title}`,subject:clip(document?.subject,500),content,key_points:keyPoints,sources:items.map(item=>({title:item.title,url:item.source_url}))},engine:"supabase-note-builder-grounded-v4",model,context_used:{watch_items:items.length,source_text_items:items.filter(item=>item.source_text).length,impact:!!impact,radar:!!radar,corpus_applicable:true}});
  }catch(error:any){if(error?.name==="AbortError")return json({error:"La génération du Note Builder a dépassé 90 secondes. Réessaie."},504);console.error("note-builder runtime",error);return json({error:"Erreur du Note Builder. Réessaie dans quelques instants."},500);}finally{clearTimeout(timer);}
});