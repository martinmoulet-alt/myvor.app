import { NextResponse } from "next/server";

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};

function cleanApiKey(raw:string){return raw.replace(/^OPENAI_API_KEY\s*=\s*/i,"").replace(/^Bearer\s+/i,"").replace(/["'`]/g,"").replace(/\s+/g,"").trim();}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}

export async function POST(request:Request){
  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  if(!apiKey.startsWith("sk-"))return NextResponse.json({error:"La clé OpenAI n’est pas configurée correctement."},{status:503});
  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,20):[];
  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

  const prompt=[
    "Tu es le moteur de cartographie d’influence de Myvor, plateforme d’affaires publiques.",
    "À partir du dossier client et des textes suivis, identifie au maximum 12 acteurs institutionnels, politiques, administratifs ou sectoriels réellement pertinents.",
    "La position d’un acteur n’est jamais absolue : évalue-la uniquement par rapport à l’objectif précis du client.",
    "Attribue une orbite : 1 = décision directe, 2 = influence forte, 3 = influence indirecte.",
    "La proximité de la décision est entièrement représentée par l’orbite : orbite 1 la plus proche, orbite 3 la plus éloignée.",
    "Attribue une position parmi favorable, inconnue, reserve, opposition.",
    "influence doit être un entier de 1 à 5.",
    "Ne fabrique pas de personne nominative incertaine. Préfère une fonction ou une institution lorsqu’un nom ne peut pas être établi à partir du corpus.",
    "Réponds uniquement en JSON valide selon cette structure exacte :",
    JSON.stringify({actors:[{id:"actor-1",name:"string",role:"string",orbit:1,position:"favorable | inconnue | reserve | opposition",influence:5,why:"string",window:"string",action:"string"}]}),
    "Dossier :",JSON.stringify(dossier),
    "Textes suivis :",JSON.stringify(items),
  ].join("\n");

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:prompt,text:{format:{type:"json_object"}}})});
    if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw)?.error?.message||raw;}catch{}return NextResponse.json({error:`OpenAI a refusé la requête (${response.status}) : ${message.slice(0,260)}`},{status:502});}
    const payload=await response.json();
    const parsed=JSON.parse(extractOutputText(payload)||"{}");
    const actors=(Array.isArray(parsed?.actors)?parsed.actors:[]).slice(0,12).map((a:any,index:number)=>({
      id:String(a.id||`actor-${index+1}`),name:String(a.name||"Acteur"),role:String(a.role||""),orbit:[1,2,3].includes(Number(a.orbit))?Number(a.orbit):3,
      position:["favorable","inconnue","reserve","opposition"].includes(a.position)?a.position:"inconnue",
      influence:Math.max(1,Math.min(5,Math.round(Number(a.influence)||3))),why:String(a.why||""),window:String(a.window||"À préciser"),action:String(a.action||"Approfondir la position et préparer une prise de contact."),
    }));
    return NextResponse.json({actors});
  }catch(error:any){return NextResponse.json({error:error?.message||"La génération du radar a échoué."},{status:500});}
}
