import { NextResponse } from "next/server";

export const maxDuration=45;

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

function clip(value:unknown,max:number){
  return String(value??"").slice(0,max);
}

function cleanSourceTitle(value:unknown){
  let text=String(value??"").normalize("NFKC").replace(/\s+/g," ").trim();
  text=text.replace(/\b([\p{L}À-ÿ'-]+)(?:\s+\1\b)+/giu,"$1");
  text=text.replace(/\s+n[°º]\s*[^0-9\s].*$/iu,"").trim();
  text=text.replace(/[\u0000-\u001F\u007F]/g,"").trim();
  return text||"Source institutionnelle";
}

function stripLeadingSubject(content:unknown){
  return String(content??"")
    .replace(/^\s*Objet\s*:\s*[^\n]*(?:\n+|$)/iu,"")
    .trim();
}

function compactImpact(value:any){
  const note=value?.note||value||null;
  if(!note)return null;
  return {
    executive_summary:clip(note.executive_summary,1600),
    score:note.score??null,
    level:clip(note.level,80),
    rationale:clip(note.rationale,1000),
    risks:Array.isArray(note.risks)?note.risks.slice(0,5).map((x:any)=>clip(x,450)):[],
    opportunities:Array.isArray(note.opportunities)?note.opportunities.slice(0,5).map((x:any)=>clip(x,450)):[],
    deadlines:Array.isArray(note.deadlines)?note.deadlines.slice(0,5).map((x:any)=>clip(x,350)):[],
    recommendations:Array.isArray(note.recommendations)?note.recommendations.slice(0,6).map((x:any)=>clip(x,500)):[],
    dispositions_concernees:Array.isArray(note.dispositions_concernees)?note.dispositions_concernees.slice(0,6).map((item:any)=>({
      disposition:clip(item?.disposition,500),
      impact_client:clip(item?.impact_client,700),
      niveau:clip(item?.niveau,80),
    })):[],
  };
}

function compactRadar(value:any){
  const actors=Array.isArray(value?.actors)?value.actors:Array.isArray(value)?value:[];
  if(!actors.length)return null;
  return actors.slice(0,8).map((actor:any)=>({
    name:clip(actor.name,180),
    role:clip(actor.role,240),
    orbit:actor.orbit??null,
    position:clip(actor.position,80),
    influence:actor.influence??null,
    why:clip(actor.why,550),
    window:clip(actor.window,350),
    action:clip(actor.action,450),
    certainty:clip(actor.certainty,80),
  }));
}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,8):[];
  const format=String(body?.format||"note-client");
  const audience=String(body?.audience||"Client").slice(0,120);
  const tone=String(body?.tone||"professionnel et direct").slice(0,120);
  const instruction=String(body?.instruction||"").slice(0,1000);
  const impact=compactImpact(body?.impact);
  const radar=compactRadar(body?.radar);
  const now=new Date();
  const currentDateIso=now.toISOString().slice(0,10);
  const currentDateFr=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(now);

  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  if(!apiKey)return NextResponse.json({error:"La clé OpenAI n’est pas configurée correctement dans Netlify."},{status:503});

  const cleanedItems=items.map(item=>({
    title:cleanSourceTitle(item.title),
    nature:clip(item.nature,100),
    urgency:clip(item.urgency,80),
    source_url:clip(item.source_url,700),
  }));

  const formatRules:Record<string,string>={
    "note-client":"Rédige une note client prête à envoyer : objet, synthèse exécutive, situation institutionnelle, conséquences concrètes pour le client, risques/opportunités, acteurs utiles, fenêtres d’action, recommandations hiérarchisées, prochaines étapes et, si nécessaire, une courte section 'Points à confirmer'.",
    "argumentaire":"Rédige un argumentaire de rendez-vous prêt à l’emploi : objectif, message central, arguments étayés, objections/réponses, acteurs à convaincre, demandes précises, résultat recherché et éléments à confirmer si nécessaire.",
    "email":"Rédige un e-mail prêt à envoyer : objet, ouverture, message essentiel, implications, demande précise et appel à l’action. Reste concis et distingue clairement les éléments non confirmés.",
    "rendez-vous":"Rédige une fiche de préparation de rendez-vous : contexte, objectif, interlocuteurs, messages clés, arguments, questions, vigilances, fenêtre d’action, résultat recherché et points à confirmer.",
  };

  const prompt=[
    "Tu es le Note Builder de Myvor, outil professionnel d’affaires publiques.",
    "Transforme les analyses existantes en un document directement exploitable par un consultant.",
    `DATE DE GÉNÉRATION : ${currentDateFr} (${currentDateIso}).`,
    "RÈGLE TEMPORELLE ABSOLUE : toute date antérieure à la date de génération est une échéance passée. Ne la présente jamais comme une action future, une fenêtre d'action encore ouverte ou une échéance à venir. Si une recommandation dépend d'une date passée, indique qu'elle est dépassée et recommande de vérifier l'état actuel de la procédure avant toute action.",
    "RÈGLE DE FIABILITÉ : la Note d’impact et le Radar d’influence sont des analyses Myvor dérivées, pas des sources primaires. Les dates, procédures, noms d'acteurs, positions, compétences institutionnelles, dispositions précises ou chiffres provenant uniquement de ces analyses doivent être formulés comme 'à confirmer', 'selon l'analyse disponible' ou équivalent, sauf lorsqu'ils sont explicitement établis par les éléments de veille fournis.",
    "Les titres et URL de veille servent de références. N'infère jamais le contenu intégral d'un texte à partir de son seul titre ou de son URL.",
    formatRules[format]||formatRules["note-client"],
    `Public visé : ${audience}. Ton : ${tone}.`,
    instruction?`Instruction utilisateur : ${instruction}`:"",
    "Priorité de travail : dossier et objectif > éléments de veille > Note d’impact > Radar d’influence. Les analyses dérivées servent à orienter la rédaction mais ne doivent pas transformer une hypothèse en fait établi.",
    "N’invente aucun fait, date, chiffre, disposition ou position. Toute incertitude doit être explicitement signalée.",
    "Les recommandations peuvent être déduites du contexte, mais doivent être présentées comme recommandations.",
    "Évite les conseils génériques lorsqu’une action précise et encore temporellement valide ressort des données.",
    "Ne répète pas 'Objet :' dans le champ content : l'objet doit apparaître uniquement dans le champ subject.",
    "Pour une note client, vise environ 550 à 750 mots afin de rester opérationnel et rapide.",
    "Réponds uniquement en JSON valide avec exactement cette structure :",
    JSON.stringify({title:"string",subject:"string",content:"string",key_points:["string"]}),
    "DOSSIER :",JSON.stringify({client:clip(dossier.client,300),title:clip(dossier.title,300),objective:clip(dossier.objective,1200),context:clip(dossier.context,1600)}),
    "ÉLÉMENTS DE VEILLE :",JSON.stringify(cleanedItems),
    "NOTE D'IMPACT MYVOR (ANALYSE DÉRIVÉE) :",JSON.stringify(impact),
    "RADAR D'INFLUENCE MYVOR (ANALYSE DÉRIVÉE) :",JSON.stringify(radar),
  ].filter(Boolean).join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),44000);

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gpt-4.1-mini",
        input:prompt,
        max_output_tokens:1700,
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

    const cleanedContent=stripLeadingSubject(document?.content);
    if(!cleanedContent)return NextResponse.json({error:"La réponse IA est incomplète. Réessaie."},{status:502});

    return NextResponse.json({
      document:{
        title:String(document.title||`Document — ${dossier.title}`),
        subject:String(document.subject||""),
        content:cleanedContent,
        key_points:Array.isArray(document.key_points)?document.key_points.map(String).slice(0,10):[],
        sources:cleanedItems.slice(0,10).map(item=>({title:item.title,url:item.source_url||""})),
      },
      engine:"openai",
      context_used:{impact:!!impact,radar:!!radar,watch_items:items.length,generation_date:currentDateIso},
    });
  }catch(error:any){
    if(error?.name==="AbortError")return NextResponse.json({error:"La génération IA a dépassé le temps disponible. Réessaie : aucun document générique n’a été substitué."},{status:504});
    return NextResponse.json({error:`Erreur du Note Builder : ${error?.message||"inconnue"}`},{status:500});
  }finally{
    clearTimeout(timer);
  }
}
