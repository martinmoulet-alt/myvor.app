import { NextResponse } from "next/server";

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";influence:number;why:string;window:string;action:string};

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
function normalizeActor(a:any,index:number):Actor{
  return {
    id:String(a?.id||`actor-${index+1}`),
    name:String(a?.name||"Acteur"),
    role:String(a?.role||""),
    orbit:[1,2,3].includes(Number(a?.orbit))?Number(a.orbit) as 1|2|3:3,
    position:["favorable","inconnue","reserve","opposition"].includes(a?.position)?a.position:"inconnue",
    influence:Math.max(1,Math.min(5,Math.round(Number(a?.influence)||3))),
    why:String(a?.why||""),
    window:String(a?.window||"À préciser"),
    action:String(a?.action||"Approfondir la position et préparer une prise de contact."),
  };
}
function localFallback(dossier:Dossier,items:WatchItem[]):Actor[]{
  const corpus=`${dossier.title} ${dossier.objective} ${items.map(i=>`${i.title} ${i.nature}`).join(" ")}`.toLowerCase();
  const actors:Actor[]=[];
  const add=(name:string,role:string,orbit:1|2|3,influence:number,why:string,action:string)=>actors.push({id:`local-${actors.length+1}`,name,role,orbit,position:"inconnue",influence,why,window:"À préciser selon le calendrier du texte",action});
  if(/loi|projet de loi|proposition de loi|amendement/.test(corpus)){
    add("Rapporteur du texte","Parlement",1,5,"Pilote l’examen du texte et peut influer directement sur sa rédaction.","Préparer une prise de contact et un argumentaire ciblé.");
    add("Commission compétente","Parlement",1,5,"Concentre l’expertise et les arbitrages avant la séance.","Identifier les membres clés et les amendements recevables.");
    add("Gouvernement / ministère chef de file","Exécutif",1,5,"Porte ou arbitre la position gouvernementale sur le texte.","Cibler le cabinet et l’administration compétente.");
    add("Groupes parlementaires","Parlement",2,4,"Structurent les positions de vote et les consignes politiques.","Cartographier les positions et prioriser les groupes charnières.");
  }
  if(/décret|arrêté|ordonnance|réglement/.test(corpus)){
    add("Ministère compétent","Exécutif",1,5,"Détient la maîtrise du texte réglementaire et de son calendrier.","Identifier le service rédacteur et préparer une contribution technique.");
    add("Direction d’administration centrale","Administration",1,4,"Rédige et sécurise techniquement le dispositif.","Préparer des arguments juridiques et opérationnels précis.");
  }
  if(/rapport|audition|mission|commission d.enquête/.test(corpus)){
    add("Présidence / rapporteurs de la mission","Parlement",1,4,"Peuvent orienter les conclusions et recommandations publiques.","Transmettre une note courte avec preuves et propositions concrètes.");
  }
  add("Cabinet du client / fédération sectorielle","Écosystème sectoriel",2,4,"Peut coordonner les arguments, données et relais du secteur.","Aligner les éléments de langage et la séquence de contacts.");
  add("Organisations professionnelles concernées","Parties prenantes",3,3,"Peuvent renforcer ou contester la position défendue dans le débat public.","Identifier les convergences et risques d’opposition.");
  return actors.slice(0,8);
}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,8):[];
  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  const fallback=localFallback(dossier,items);
  if(!apiKey)return NextResponse.json({actors:fallback,engine:"local",warning:"Clé OpenAI indisponible : radar local généré."});

  const prompt=[
    "Myvor - radar d'influence affaires publiques.",
    "Retourne seulement un JSON {actors:[...]}, maximum 8 acteurs vraiment pertinents.",
    "Chaque acteur: id,name,role,orbit(1|2|3),position(favorable|inconnue|reserve|opposition),influence(1-5),why,window,action.",
    "Position uniquement par rapport à l'objectif client. Si le nom d'une personne est incertain, utilise sa fonction/institution.",
    `Client: ${dossier.client}`,
    `Dossier: ${dossier.title}`,
    `Objectif: ${dossier.objective}`,
    `Textes: ${items.map(i=>`${i.nature}: ${i.title}`).join(" | ")}`,
  ].join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5-mini",
        input:prompt,
        max_output_tokens:900,
        text:{format:{type:"json_object"}},
      }),
      signal:controller.signal,
    });
    clearTimeout(timer);
    if(!response.ok)return NextResponse.json({actors:fallback,engine:"local",warning:`OpenAI indisponible (${response.status}) : radar local généré.`});
    const payload=await response.json();
    const text=extractOutputText(payload);
    let parsed:any={};
    try{parsed=JSON.parse(text||"{}");}catch{return NextResponse.json({actors:fallback,engine:"local",warning:"Réponse IA invalide : radar local généré."});}
    const actors=(Array.isArray(parsed?.actors)?parsed.actors:[]).slice(0,8).map(normalizeActor);
    if(!actors.length)return NextResponse.json({actors:fallback,engine:"local",warning:"Aucun acteur IA exploitable : radar local généré."});
    return NextResponse.json({actors,engine:"openai"});
  }catch(error:any){
    clearTimeout(timer);
    const warning=error?.name==="AbortError"?"OpenAI trop lent : radar local généré immédiatement.":"Erreur OpenAI : radar local généré.";
    return NextResponse.json({actors:fallback,engine:"local",warning});
  }
}
