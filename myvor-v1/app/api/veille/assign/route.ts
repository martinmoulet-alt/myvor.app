import { NextResponse } from "next/server";

type WatchItem = { id:string; title:string; nature?:string };
type Dossier = { id:string; title:string; objective?:string };
type Assignment = { watch_id:string; dossier_id:string|null; confidence:number };

function extractOutputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];
  return chunks.map((chunk:any)=>chunk?.text||"").join("");
}

function keyFingerprint(apiKey:string){
  const trimmed=apiKey.trim();
  return trimmed.length>=4?trimmed.slice(-4):"????";
}

function friendlyOpenAIError(status:number, raw:string, fingerprint:string){
  let message=raw;
  try{message=JSON.parse(raw)?.error?.message||raw;}catch{}
  const lower=message.toLowerCase();
  if(status===401||lower.includes("api key"))return `Clé OpenAI refusée. Netlify utilise une clé finissant par …${fingerprint}. Vérifie qu’elle correspond à la dernière clé créée.`;
  if(status===429||lower.includes("quota")||lower.includes("billing"))return `Clé reconnue (…${fingerprint}), mais quota OpenAI indisponible. Vérifie la facturation ou les crédits API.`;
  if(lower.includes("model")&&lower.includes("access"))return `Clé reconnue (…${fingerprint}), mais le modèle OpenAI configuré n’est pas accessible.`;
  return `OpenAI a refusé la requête (${status}, clé …${fingerprint}) : ${message.slice(0,260)}`;
}

export async function POST(request:Request){
  const apiKey=(process.env.OPENAI_API_KEY||"").trim();
  if(!apiKey)return NextResponse.json({error:"IA non configurée : OPENAI_API_KEY est absente dans Netlify."},{status:503});
  const fingerprint=keyFingerprint(apiKey);

  const body=await request.json().catch(()=>null);
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,40):[];
  const dossiers:Dossier[]=Array.isArray(body?.dossiers)?body.dossiers.slice(0,30):[];
  if(!items.length||!dossiers.length)return NextResponse.json({assignments:[]});

  const allowedDossierIds=new Set(dossiers.map(d=>d.id));
  const allowedWatchIds=new Set(items.map(i=>i.id));

  const prompt=[
    "Tu es le moteur de rattachement automatique de Myvor, une plateforme d'affaires publiques.",
    "Associe chaque élément de veille au dossier client le plus pertinent uniquement si le lien thématique et stratégique est suffisamment clair.",
    "Base-toi sur le titre et la nature du texte, puis sur le titre et l'objectif du dossier.",
    "N'invente jamais de lien. Si aucun dossier n'est suffisamment pertinent, utilise dossier_id null.",
    "La confiance doit être comprise entre 0 et 1. Réserve 0.78 ou plus aux rattachements réellement solides.",
    "Réponds uniquement avec un objet JSON de cette forme exacte : {\"assignments\":[{\"watch_id\":\"...\",\"dossier_id\":\"...\" ou null,\"confidence\":0.0}]}",
    "Éléments de veille:",JSON.stringify(items),
    "Dossiers:",JSON.stringify(dossiers.map(d=>({id:d.id,title:d.title,objective:d.objective||""}))),
  ].join("\n");

  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:process.env.OPENAI_MODEL||"gpt-5-mini",
      input:prompt,
      text:{format:{type:"json_object"}},
    }),
  });

  if(!response.ok){
    const raw=await response.text();
    return NextResponse.json({error:friendlyOpenAIError(response.status,raw,fingerprint)},{status:502});
  }

  const payload=await response.json();
  const text=extractOutputText(payload);
  let parsed:{assignments?:Assignment[]}={};
  try{parsed=JSON.parse(text||"{}");}
  catch{return NextResponse.json({error:`La réponse IA n’était pas exploitable (clé …${fingerprint}). Réessaie.`},{status:502});}

  const assignments=(parsed.assignments||[])
    .filter(a=>allowedWatchIds.has(a.watch_id))
    .map(a=>({
      watch_id:a.watch_id,
      dossier_id:a.dossier_id&&allowedDossierIds.has(a.dossier_id)?a.dossier_id:null,
      confidence:Math.max(0,Math.min(1,Number(a.confidence)||0)),
    }));

  return NextResponse.json({assignments});
}
