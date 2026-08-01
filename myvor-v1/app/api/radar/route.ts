import { NextResponse } from "next/server";

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";influence:number;why:string;window:string;action:string;certainty:"confirme"|"probable"|"a_confirmer";evidence:string};
type SourceExtraction={url:string;content:string;status:"fetched"|"unavailable"|"unsupported"};

const OFFICIAL_HOSTS=[
  "assemblee-nationale.fr","www.assemblee-nationale.fr",
  "senat.fr","www.senat.fr",
  "legifrance.gouv.fr","www.legifrance.gouv.fr",
  "vie-publique.fr","www.vie-publique.fr",
  "gouvernement.fr","www.gouvernement.fr",
  "conseil-constitutionnel.fr","www.conseil-constitutionnel.fr",
  "conseil-etat.fr","www.conseil-etat.fr",
  "courdecassation.fr","www.courdecassation.fr",
  "cnil.fr","www.cnil.fr",
  "arcep.fr","www.arcep.fr",
  "eur-lex.europa.eu",
];

function asText(value:unknown){return typeof value==="string"?value.trim():"";}
function decodeHtml(value:string){return value.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">");}
function htmlToText(html:string){return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<!--([\s\S]*?)-->/g," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<\/li>/gi,"\n").replace(/<\/h[1-6]>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim());}
function isOfficialUrl(rawUrl:string){try{const url=new URL(rawUrl);return url.protocol==="https:"&&OFFICIAL_HOSTS.includes(url.hostname.toLowerCase());}catch{return false;}}
function extractOutputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  return (payload?.output||[]).flatMap((item:any)=>item?.content||[]).filter((part:any)=>part?.type==="output_text").map((part:any)=>part?.text||"").join("").trim();
}
function comparable(value:unknown){
  return asText(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

async function fetchOfficialSource(rawUrl:string,maxChars=16000):Promise<SourceExtraction>{
  if(!rawUrl||!isOfficialUrl(rawUrl))return{url:rawUrl,content:"",status:"unsupported"};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch(rawUrl,{headers:{"User-Agent":"Myvor/1.0 influence-radar","Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"},redirect:"follow",signal:controller.signal,cache:"no-store"});
    if(!response.ok)return{url:rawUrl,content:"",status:"unavailable"};
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("text/html")&&!contentType.includes("text/plain"))return{url:rawUrl,content:"",status:"unsupported"};
    const raw=await response.text();
    const text=contentType.includes("text/html")?htmlToText(raw):raw.trim();
    return{url:rawUrl,content:text.slice(0,maxChars),status:text?"fetched":"unavailable"};
  }catch{return{url:rawUrl,content:"",status:"unavailable"};}
  finally{clearTimeout(timer);}
}

function normalizeActor(actor:any,index:number):Actor{
  const orbit=[1,2,3].includes(Number(actor?.orbit))?Number(actor.orbit) as 1|2|3:3;
  const position=["favorable","inconnue","reserve","opposition"].includes(actor?.position)?actor.position:"inconnue";
  const certainty=["confirme","probable","a_confirmer"].includes(actor?.certainty)?actor.certainty:"a_confirmer";
  return{
    id:asText(actor?.id)||`actor-${index+1}`,
    name:asText(actor?.name)||"Acteur à confirmer",
    role:asText(actor?.role)||"information à confirmer",
    orbit,
    position,
    influence:Math.max(1,Math.min(5,Math.round(Number(actor?.influence)||1))),
    why:asText(actor?.why)||"information à confirmer",
    window:asText(actor?.window)||"information à confirmer",
    action:asText(actor?.action)||"Vérifier le rôle et la position de cet acteur avant toute prise de contact.",
    certainty,
    evidence:asText(actor?.evidence)||"information à confirmer",
  };
}

function isClientActor(actor:Actor,client:string){
  const clientKey=comparable(client);
  const actorKey=comparable(actor.name);
  if(!clientKey||!actorKey)return false;
  if(actorKey===clientKey)return true;
  if(clientKey.length>=14&&actorKey.includes(clientKey))return true;
  if(actorKey.length>=14&&clientKey.includes(actorKey))return true;
  return false;
}

function isUnsubstantiatedGenericActor(actor:Actor){
  if(actor.certainty==="confirme")return false;
  const key=comparable(actor.name);
  const genericPatterns=[
    /^presidence de la republique$/,
    /^president de la republique$/,
    /^premier ministre$/,
    /^matignon$/,
    /^gouvernement$/,
    /^assemblee nationale$/,
    /^senat$/,
    /^groupes parlementaires?$/,
    /^partis politiques?$/,
    /^medias?$/,
    /^opinion publique$/,
    /^organisations professionnelles?$/,
    /^organisations professionnelles concernees$/,
    /^associations?$/,
    /^syndicats?$/,
  ];
  return genericPatterns.some(pattern=>pattern.test(key));
}

function keepRelevantActors(actors:Actor[],client:string){
  const seen=new Set<string>();
  return actors.filter(actor=>{
    if(isClientActor(actor,client))return false;
    if(isUnsubstantiatedGenericActor(actor))return false;
    const key=comparable(actor.name);
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,8);
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>null);
    const dossier:Dossier|null=body?.dossier||null;
    const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,8):[];
    if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
    if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

    const apiKey=asText(process.env.OPENAI_API_KEY);
    if(!apiKey)return NextResponse.json({error:"OPENAI_API_KEY n’est pas configurée sur Myvor."},{status:503});

    const uniqueUrls=[...new Set(items.map(item=>item.source_url||"").filter(Boolean))].slice(0,2);
    const extractions=await Promise.all(uniqueUrls.map(url=>fetchOfficialSource(url)));
    const extractionByUrl=new Map(extractions.map(source=>[source.url,source]));

    const sourceText=items.map((item,index)=>{
      const extraction=item.source_url?extractionByUrl.get(item.source_url):undefined;
      return [
        `SOURCE ${index+1}`,
        `Titre : ${item.title}`,
        `Nature : ${item.nature}`,
        item.source_url?`URL officielle : ${item.source_url}`:"",
        extraction?.status==="fetched"?`CONTENU OFFICIEL RÉCUPÉRÉ :\n${extraction.content}`:`CONTENU OFFICIEL : non récupéré automatiquement (${extraction?.status||"aucune URL"}). Ne pas inventer son contenu.`,
      ].filter(Boolean).join("\n");
    }).join("\n\n====================\n\n");

    const prompt=`Tu es MYVOR, analyste senior français en affaires publiques et stratégie institutionnelle.

Produis un RADAR D'INFLUENCE professionnel pour le dossier suivant.

CLIENT : ${dossier.client}
DOSSIER : ${dossier.title}
CONTEXTE : ${dossier.context||"Non renseigné"}
OBJECTIF CLIENT : ${dossier.objective}

SOURCES :
${sourceText}

RÈGLE N°1 — LE CLIENT N'EST JAMAIS UN ACTEUR DU RADAR :
- N'inclus jamais le client lui-même : ${dossier.client}.
- N'inclus pas ses équipes internes, ses représentants ou sa propre fédération comme cible d'influence.
- Le radar sert à cartographier les acteurs EXTERNES sur lesquels le client peut devoir agir ou qu'il doit surveiller.

RÈGLE N°2 — PAS D'ACTEURS GÉNÉRIQUES NON ÉTAYÉS :
- N'ajoute jamais la Présidence de la République, le Premier ministre, le Gouvernement, l'Assemblée nationale, le Sénat, des groupes parlementaires, des médias, l'opinion publique ou des organisations professionnelles génériques uniquement parce qu'ils pourraient théoriquement compter.
- Un acteur de ce type ne peut apparaître que si les sources disponibles établissent un rôle concret et spécifique dans CE dossier.
- Privilégie les acteurs directement reliés au processus : rapporteur ou fonction de rapporteur, commission réellement compétente, ministère ou direction réellement compétente, administration chargée du texte, groupe ou organisation explicitement impliqué.

RÈGLES ABSOLUES :
- Identifie uniquement des acteurs réellement pertinents pour CE dossier.
- La position est toujours évaluée par rapport à l'objectif du client, jamais de manière absolue.
- N'invente jamais une personne, une fonction, une commission, une position, un vote, une déclaration, une date ou une compétence.
- Si le nom d'une personne n'est pas vérifiable, utilise sa fonction institutionnelle.
- Si une position n'est pas établie, utilise \"inconnue\".
- Si une date ou une fenêtre d'action n'est pas établie, écris \"information à confirmer\".
- Ne remplis jamais artificiellement le radar : 3 acteurs bien étayés valent mieux que 8 acteurs génériques.
- Maximum 8 acteurs.

ORBITE :
1 = décision directe : acteur capable de rédiger, arbitrer, modifier, rapporter, décider ou bloquer directement.
2 = influence forte : acteur pouvant fortement influencer le décideur, le vote, l'arbitrage ou la rédaction.
3 = influence indirecte : acteur influençant le débat, l'écosystème, une coalition ou la perception institutionnelle.

INFLUENCE : 1 à 5, où 5 = influence décisive.

POSITION :
- favorable
- inconnue
- reserve
- opposition

CERTITUDE :
- confirme : identité/fonction ET rôle dans ce dossier directement établis par les sources disponibles.
- probable : acteur institutionnel logiquement pertinent au vu du processus, mais certaines informations restent à vérifier.
- a_confirmer : informations insuffisantes.

EXIGENCE SUR LA PREUVE :
- evidence doit expliquer précisément pourquoi l'acteur est retenu dans CE dossier.
- Une formule vague comme \"acteur important\" ou \"peut influencer\" n'est pas une preuve suffisante.
- Si le lien au dossier n'est pas démontrable, n'inclus pas l'acteur.

Pour chaque acteur, fournis :
- id
- name
- role
- orbit
- position
- influence
- why : pourquoi il compte concrètement pour l'objectif client
- window : quand agir, sinon \"information à confirmer\"
- action : action recommandée concrète
- certainty
- evidence : élément précis sur lequel repose l'identification

Réponds UNIQUEMENT avec un JSON valide, sans markdown, sous cette forme :
{"actors":[{"id":"actor-1","name":"","role":"","orbit":1,"position":"inconnue","influence":1,"why":"","window":"information à confirmer","action":"","certainty":"a_confirmer","evidence":""}]}`;

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),28000);
    try{
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({model:"gpt-4.1-mini",input:prompt,max_output_tokens:1800}),
        signal:controller.signal,
      });

      const raw=await response.text();
      let payload:any=null;
      try{payload=raw?JSON.parse(raw):null;}catch{return NextResponse.json({error:`OpenAI a retourné une réponse invalide (${response.status}).`},{status:502});}
      if(!response.ok)return NextResponse.json({error:payload?.error?.message||`Le moteur Radar a échoué (${response.status}).`},{status:502});

      const outputText=extractOutputText(payload).replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
      if(!outputText)return NextResponse.json({error:"Le moteur Radar n’a retourné aucune analyse exploitable."},{status:502});

      let parsed:any=null;
      try{parsed=JSON.parse(outputText);}catch{return NextResponse.json({error:"Le moteur Radar a retourné un JSON invalide."},{status:502});}

      const normalized=(Array.isArray(parsed?.actors)?parsed.actors:[]).slice(0,10).map(normalizeActor);
      const actors=keepRelevantActors(normalized,dossier.client);
      if(!actors.length)return NextResponse.json({error:"Aucun acteur externe suffisamment étayé n’a pu être identifié à partir des sources disponibles."},{status:422});

      return NextResponse.json({
        actors,
        engine:"openai-radar-direct",
        quality:{client_excluded:true,generic_unsubstantiated_filtered:true},
        grounding:{official_sources_requested:uniqueUrls.length,official_sources_fetched:extractions.filter(source=>source.status==="fetched").length,statuses:extractions.map(source=>({url:source.url,status:source.status}))},
      });
    }catch(error:any){
      if(error?.name==="AbortError")return NextResponse.json({error:"Le Radar d’influence a dépassé le temps de réponse disponible."},{status:504});
      return NextResponse.json({error:error?.message||"Impossible de joindre le moteur Radar."},{status:502});
    }finally{clearTimeout(timer);}
  }catch(error:any){
    return NextResponse.json({error:error?.message||"Erreur interne pendant la génération du Radar d’influence."},{status:500});
  }
}
