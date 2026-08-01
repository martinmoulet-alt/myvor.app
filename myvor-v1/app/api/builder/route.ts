import { NextResponse } from "next/server";

export const maxDuration=20;

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};

function cleanApiKey(raw:string){
  const normalized=String(raw||"").normalize("NFKC");
  const match=normalized.match(/sk-[A-Za-z0-9_-]+/);
  return match?.[0]||"";
}

function extractOutputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];
  return chunks.map((chunk:any)=>chunk?.text||"").join("");
}

function compactImpact(value:any){
  const note=value?.note||value||null;
  if(!note)return null;
  return {
    title:note.title||"",
    executive_summary:note.executive_summary||"",
    score:note.score??null,
    level:note.level||"",
    rationale:note.rationale||"",
    risks:Array.isArray(note.risks)?note.risks.slice(0,8):[],
    opportunities:Array.isArray(note.opportunities)?note.opportunities.slice(0,8):[],
    deadlines:Array.isArray(note.deadlines)?note.deadlines.slice(0,8):[],
    recommendations:Array.isArray(note.recommendations)?note.recommendations.slice(0,8):[],
    dispositions_concernees:Array.isArray(note.dispositions_concernees)?note.dispositions_concernees.slice(0,10):[],
    informations_a_confirmer:Array.isArray(note.informations_a_confirmer)?note.informations_a_confirmer.slice(0,8):[],
  };
}

function compactRadar(value:any){
  const actors=Array.isArray(value?.actors)?value.actors:Array.isArray(value)?value:[];
  if(!actors.length)return null;
  return actors.slice(0,12).map((actor:any)=>({
    name:actor.name||"",
    role:actor.role||"",
    orbit:actor.orbit??null,
    position:actor.position||"",
    influence:actor.influence??null,
    why:actor.why||"",
    window:actor.window||"",
    action:actor.action||"",
    certainty:actor.certainty||"",
    evidence:actor.evidence||"",
  }));
}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,12):[];
  const format=String(body?.format||"note-client");
  const audience=String(body?.audience||"Client").slice(0,120);
  const tone=String(body?.tone||"professionnel et direct").slice(0,120);
  const instruction=String(body?.instruction||"").slice(0,1200);
  const impact=compactImpact(body?.impact);
  const radar=compactRadar(body?.radar);

  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  if(!apiKey)return NextResponse.json({error:"La clé OpenAI n’est pas configurée correctement dans Netlify."},{status:503});

  const formatRules:Record<string,string>={
    "note-client":"Rédige une note client prête à envoyer : objet, synthèse exécutive, situation institutionnelle, dispositions ou évolutions importantes, conséquences concrètes pour le client, risques, opportunités, acteurs et fenêtres d’action utiles, recommandations opérationnelles hiérarchisées et prochaines étapes.",
    "argumentaire":"Rédige un argumentaire de rendez-vous prêt à l’emploi : objectif, message central, arguments étayés, éléments de preuve disponibles, objections probables et réponses, acteurs à convaincre, demandes précises et résultat recherché.",
    "email":"Rédige un e-mail prêt à envoyer : objet, ouverture, message essentiel, implications pour le destinataire, demande ou recommandation précise et appel à l’action. Reste concis.",
    "rendez-vous":"Rédige une fiche de préparation de rendez-vous : contexte, objectif, profil et position des interlocuteurs disponibles, messages clés, arguments, questions à poser, points de vigilance, fenêtre d’action et résultat recherché.",
  };

  const prompt=[
    "Tu es le Note Builder de Myvor, un outil professionnel d’affaires publiques.",
    "Ta mission est de transformer les analyses déjà produites dans Myvor en un document réellement exploitable par un consultant, pas en une simple liste de données.",
    formatRules[format]||formatRules["note-client"],
    `Public visé : ${audience}.`,
    `Ton attendu : ${tone}.`,
    instruction?`Instruction complémentaire de l’utilisateur : ${instruction}`:"",
    "Hiérarchie de travail : 1) objectif et contexte du dossier, 2) Note d’impact lorsqu’elle existe, 3) Radar d’influence lorsqu’il existe, 4) éléments de veille liés.",
    "Ne crée aucun fait, date, chiffre, position d’acteur ou disposition qui ne figure pas dans les données fournies. Si une information reste incertaine, formule-la explicitement comme telle.",
    "Les recommandations stratégiques peuvent être déduites des éléments fournis, mais elles doivent être clairement formulées comme recommandations et non comme faits établis.",
    "Évite les formulations génériques du type 'suivre le dossier' ou 'mettre à jour le radar' lorsqu’une action plus précise peut être tirée du contexte.",
    "N’évoque pas les noms internes des modules Myvor dans le document final, sauf si c’est nécessaire à la compréhension du lecteur.",
    "Pour une note client, vise environ 700 à 1000 mots si le contexte est suffisamment riche. Pour les autres formats, adapte la longueur à l’usage.",
    "Réponds uniquement en JSON valide avec exactement cette structure :",
    JSON.stringify({title:"string",subject:"string",content:"string",key_points:["string"]}),
    "DOSSIER :",
    JSON.stringify({client:dossier.client,title:dossier.title,objective:dossier.objective,context:dossier.context||""}),
    "NOTE D'IMPACT DISPONIBLE :",
    JSON.stringify(impact),
    "RADAR D'INFLUENCE DISPONIBLE :",
    JSON.stringify(radar),
    "ÉLÉMENTS DE VEILLE LIÉS :",
    JSON.stringify(items.map(item=>({title:item.title,nature:item.nature,urgency:item.urgency||"",source_url:item.source_url||""}))),
  ].filter(Boolean).join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),17000);

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_BUILDER_MODEL||"gpt-4.1-mini",
        input:prompt,
        max_output_tokens:2200,
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

    if(!String(document?.content||"").trim())return NextResponse.json({error:"La réponse IA est incomplète. Réessaie."},{status:502});

    return NextResponse.json({
      document:{
        title:String(document.title||`Document — ${dossier.title}`),
        subject:String(document.subject||""),
        content:String(document.content||""),
        key_points:Array.isArray(document.key_points)?document.key_points.map(String).slice(0,10):[],
        sources:items.slice(0,10).map(item=>({title:item.title,url:item.source_url||""})),
      },
      engine:"openai",
      context_used:{impact:!!impact,radar:!!radar,watch_items:items.length},
    });
  }catch(error:any){
    if(error?.name==="AbortError")return NextResponse.json({error:"La génération IA a dépassé le temps disponible. Réessaie : aucun document générique n’a été substitué."},{status:504});
    return NextResponse.json({error:`Erreur du Note Builder : ${error?.message||"inconnue"}`},{status:500});
  }finally{
    clearTimeout(timer);
  }
}
