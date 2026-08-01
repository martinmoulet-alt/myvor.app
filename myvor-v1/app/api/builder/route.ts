import { NextResponse } from "next/server";

export const maxDuration = 30;

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};

function cleanApiKey(raw:string){const normalized=String(raw||"").normalize("NFKC");const match=normalized.match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}

export async function POST(request:Request){
  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  if(!apiKey)return NextResponse.json({error:"La clé OpenAI n’est pas configurée correctement dans Netlify."},{status:503});

  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,10):[];
  const format=String(body?.format||"note-client");
  const audience=String(body?.audience||"Client").slice(0,120);
  const tone=String(body?.tone||"professionnel et direct").slice(0,120);
  const instruction=String(body?.instruction||"").slice(0,600);

  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

  const formatRules:Record<string,string>={
    "note-client":"Note client : objet, synthèse, impacts, recommandations, prochaines étapes.",
    "argumentaire":"Argumentaire : message central, 5 arguments, objections/réponses, résultat recherché.",
    "email":"E-mail prêt à envoyer : objet, ouverture, message concis, appel à l’action.",
    "rendez-vous":"Fiche rendez-vous : objectif, messages clés, questions, vigilances, résultat recherché.",
  };

  const prompt=[
    "Tu es le Note Builder de Myvor. Rédige en français un document directement exploitable.",
    formatRules[format]||formatRules["note-client"],
    `Public : ${audience}. Ton : ${tone}.`,
    instruction?`Consigne : ${instruction}`:"",
    "N’invente aucun fait. Signale brièvement les incertitudes. Reste synthétique : 700 mots maximum.",
    "Réponds uniquement en JSON valide :",
    JSON.stringify({title:"string",subject:"string",content:"string",key_points:["string"],sources:[{title:"string",url:"string"}]}),
    "Dossier :",JSON.stringify({client:dossier.client,title:dossier.title,objective:dossier.objective,context:dossier.context||""}),
    "Textes :",JSON.stringify(items.map(item=>({title:item.title,nature:item.nature,urgency:item.urgency,source_url:item.source_url}))),
  ].filter(Boolean).join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),24000);

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_BUILDER_MODEL||"gpt-4.1-mini",
        input:prompt,
        max_output_tokens:1400,
        text:{format:{type:"json_object"}},
      }),
      signal:controller.signal,
    });

    if(!response.ok){
      const raw=await response.text();
      let message=raw;
      try{message=JSON.parse(raw)?.error?.message||raw;}catch{}
      return NextResponse.json({error:`OpenAI a refusé la requête (${response.status}) : ${String(message).slice(0,260)}`},{status:502});
    }

    const payload=await response.json();
    let document:any={};
    try{document=JSON.parse(extractOutputText(payload)||"{}");}
    catch{return NextResponse.json({error:"La réponse IA du Note Builder n’était pas exploitable. Réessaie."},{status:502});}

    return NextResponse.json({document:{
      title:String(document.title||"Document Myvor"),
      subject:String(document.subject||""),
      content:String(document.content||""),
      key_points:Array.isArray(document.key_points)?document.key_points.map(String).slice(0,8):[],
      sources:Array.isArray(document.sources)?document.sources.slice(0,10):[],
    }});
  }catch(error:any){
    if(error?.name==="AbortError")return NextResponse.json({error:"La génération a pris trop de temps. Réessaie avec une consigne plus courte."},{status:504});
    return NextResponse.json({error:`Erreur du Note Builder : ${error?.message||"inconnue"}`},{status:500});
  }finally{
    clearTimeout(timer);
  }
}
