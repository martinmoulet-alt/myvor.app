import { NextResponse } from "next/server";

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};

function cleanApiKey(raw:string){const normalized=String(raw||"").normalize("NFKC");const match=normalized.match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}

export async function POST(request:Request){
  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  if(!apiKey)return NextResponse.json({error:"La clé OpenAI n’est pas configurée correctement dans Netlify."},{status:503});
  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,25):[];
  const format=String(body?.format||"note-client");
  const audience=String(body?.audience||"Client");
  const tone=String(body?.tone||"professionnel et direct");
  const instruction=String(body?.instruction||"").slice(0,1000);
  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

  const formatRules:Record<string,string>={
    "note-client":"Rédige une note client structurée avec objet, synthèse exécutive, situation, implications, recommandations et prochaines étapes.",
    "argumentaire":"Rédige un argumentaire de rendez-vous avec message central, 5 arguments, objections probables et réponses, puis conclusion attendue.",
    "email":"Rédige un e-mail prêt à envoyer, avec objet, formule d’ouverture, corps concis et appel à l’action.",
    "rendez-vous":"Rédige une fiche de préparation de rendez-vous avec objectif, profil de l’interlocuteur, messages clés, questions à poser, points de vigilance et résultat recherché.",
  };

  const prompt=[
    "Tu es le Note Builder de Myvor, plateforme d’affaires publiques.",
    "Produis un document directement exploitable, en français, sans jargon inutile et sans inventer de faits.",
    formatRules[format]||formatRules["note-client"],
    `Public visé : ${audience}.`,
    `Ton attendu : ${tone}.`,
    instruction?`Instruction complémentaire : ${instruction}.`:"",
    "Appuie-toi uniquement sur le dossier et les textes fournis. Signale clairement toute incertitude.",
    "Réponds uniquement en JSON valide selon cette structure exacte :",
    JSON.stringify({title:"string",subject:"string",content:"string",key_points:["string"],sources:[{title:"string",url:"string"}]}),
    "Dossier :",JSON.stringify(dossier),
    "Textes :",JSON.stringify(items),
  ].filter(Boolean).join("\n");

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:prompt,text:{format:{type:"json_object"}}})});
    if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw)?.error?.message||raw;}catch{}return NextResponse.json({error:`OpenAI a refusé la requête (${response.status}) : ${String(message).slice(0,260)}`},{status:502});}
    const payload=await response.json();
    let document:any={};
    try{document=JSON.parse(extractOutputText(payload)||"{}");}catch{return NextResponse.json({error:"La réponse IA du Note Builder n’était pas exploitable. Réessaie."},{status:502});}
    return NextResponse.json({document:{title:String(document.title||"Document Myvor"),subject:String(document.subject||""),content:String(document.content||""),key_points:Array.isArray(document.key_points)?document.key_points.map(String).slice(0,10):[],sources:Array.isArray(document.sources)?document.sources.slice(0,15):[]}});
  }catch(error:any){return NextResponse.json({error:`Erreur du Note Builder : ${error?.message||"inconnue"}`},{status:500});}
}
