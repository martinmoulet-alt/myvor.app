import { NextResponse } from "next/server";
import { evidenceExcerptIsGrounded,normalizeRadarText,verifyOfficialContactValues } from "@/lib/radarAudit";

type Dossier={
  id:string;client:string;title:string;objective:string;context?:string;
  sector?:string|null;activity?:string|null;strategic_issues?:string[];risks_to_avoid?:string[];
  opportunities?:string[];client_position?:string|null;key_actors?:string[];watch_topics?:string[];
  watch_subtopics?:string[];reference_texts?:string[];key_deadlines?:string[];
};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string;created_at?:string};
type ActorEvidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type Actor={
  id:string;name:string;role:string;orbit:1|2|3;
  position:"favorable"|"inconnue"|"reserve"|"opposition";
  influence:number;why:string;window:string;action:string;
  certainty:"confirme"|"probable"|"a_confirmer";
  evidence:ActorEvidence;
  contact_email?:string;contact_phone?:string;contact_url?:string;contact_verified?:boolean;
};
type SourceExtraction={url:string;resolved_url?:string;content:string;status:"fetched"|"unavailable"|"unsupported";read_chars:number};

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
  "economie.gouv.fr","www.economie.gouv.fr",
  "ecologie.gouv.fr","www.ecologie.gouv.fr",
  "tresor.economie.gouv.fr",
  "eur-lex.europa.eu",
  "europarl.europa.eu","www.europarl.europa.eu",
];

const RADAR_FORMAT={
  type:"json_schema",
  name:"myvor_radar_v2",
  strict:true,
  schema:{
    type:"object",
    additionalProperties:false,
    properties:{
      actors:{
        type:"array",
        maxItems:8,
        items:{
          type:"object",
          additionalProperties:false,
          properties:{
            id:{type:"string"},
            name:{type:"string"},
            role:{type:"string"},
            orbit:{type:"integer",enum:[1,2,3]},
            position:{type:"string",enum:["favorable","inconnue","reserve","opposition"]},
            influence:{type:"integer",minimum:1,maximum:5},
            why:{type:"string"},
            window:{type:"string"},
            action:{type:"string"},
            certainty:{type:"string",enum:["confirme","probable","a_confirmer"]},
            evidence:{
              type:"object",
              additionalProperties:false,
              properties:{
                source_index:{type:"integer",minimum:0,maximum:8},
                source_title:{type:"string"},
                source_url:{type:"string"},
                excerpt:{type:"string"},
                confidence:{type:"number",minimum:0,maximum:1},
              },
              required:["source_index","source_title","source_url","excerpt","confidence"],
            },
          },
          required:["id","name","role","orbit","position","influence","why","window","action","certainty","evidence"],
        },
      },
    },
    required:["actors"],
  },
} as const;

const CONTACT_FORMAT={
  type:"json_schema",
  name:"myvor_radar_contacts_v2",
  strict:true,
  schema:{
    type:"object",
    additionalProperties:false,
    properties:{
      contacts:{
        type:"array",
        maxItems:4,
        items:{
          type:"object",
          additionalProperties:false,
          properties:{id:{type:"string"},email:{type:"string"},phone:{type:"string"},url:{type:"string"}},
          required:["id","email","phone","url"],
        },
      },
    },
    required:["contacts"],
  },
} as const;

function asText(value:unknown){return typeof value==="string"?value.trim():"";}
function asStringArray(value:unknown){return Array.isArray(value)?value.map(asText).filter(Boolean):[];}
function decodeHtml(value:string){return value.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">");}
function htmlToText(html:string){return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<!--([\s\S]*?)-->/g," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<\/li>/gi,"\n").replace(/<\/h[1-6]>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim());}
function isOfficialUrl(rawUrl:string){try{const url=new URL(rawUrl);return url.protocol==="https:"&&OFFICIAL_HOSTS.includes(url.hostname.toLowerCase());}catch{return false;}}
function isOfficialContactUrl(rawUrl:string){
  try{
    const url=new URL(rawUrl);const host=url.hostname.toLowerCase();
    return url.protocol==="https:"&&(OFFICIAL_HOSTS.includes(host)||host.endsWith(".gouv.fr")||host==="gouv.fr"||host.endsWith(".europa.eu")||host==="europa.eu");
  }catch{return false;}
}
function validEmail(value:unknown){const text=asText(value);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)?text:"";}
function validPhone(value:unknown){const text=asText(value).replace(/[^+0-9(). -]/g,"").trim();return text.replace(/\D/g,"").length>=8?text:"";}
function extractOutputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text.trim();
  return (payload?.output||[]).flatMap((item:any)=>item?.content||[]).filter((part:any)=>part?.type==="output_text").map((part:any)=>part?.text||"").join("").trim();
}
function comparable(value:unknown){return normalizeRadarText(value).replace(/[^a-z0-9]+/g," ").trim();}
function urgencyRank(value:unknown){const key=asText(value).toLowerCase();return key==="absolument urgent"?4:key==="fort"?3:key==="moyen"?2:1;}

async function fetchTextSource(rawUrl:string,maxChars:number,allowed:(url:string)=>boolean):Promise<SourceExtraction>{
  if(!rawUrl||!allowed(rawUrl))return{url:rawUrl,content:"",status:"unsupported",read_chars:0};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4500);
  try{
    const response=await fetch(rawUrl,{headers:{"User-Agent":"Myvor/2.0 influence-radar","Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.4"},redirect:"follow",signal:controller.signal,cache:"no-store"});
    if(!response.ok)return{url:rawUrl,resolved_url:response.url||rawUrl,content:"",status:"unavailable",read_chars:0};
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("text/html")&&!contentType.includes("text/plain"))return{url:rawUrl,resolved_url:response.url||rawUrl,content:"",status:"unsupported",read_chars:0};
    const raw=await response.text();
    const text=(contentType.includes("text/html")?htmlToText(raw):raw.trim()).slice(0,maxChars);
    return{url:rawUrl,resolved_url:response.url||rawUrl,content:text,status:text?"fetched":"unavailable",read_chars:text.length};
  }catch{return{url:rawUrl,content:"",status:"unavailable",read_chars:0};}
  finally{clearTimeout(timer);}
}
function fetchOfficialSource(rawUrl:string,maxChars=10000){return fetchTextSource(rawUrl,maxChars,isOfficialUrl);}
function fetchOfficialContactPage(rawUrl:string,maxChars=22000){return fetchTextSource(rawUrl,maxChars,isOfficialContactUrl);}

function dossierProfileText(dossier:Dossier){
  const rows=[
    ["Secteur",asText(dossier.sector)],
    ["Activité",asText(dossier.activity)],
    ["Enjeux stratégiques",asStringArray(dossier.strategic_issues).join(" ; ")],
    ["Risques à éviter",asStringArray(dossier.risks_to_avoid).join(" ; ")],
    ["Opportunités",asStringArray(dossier.opportunities).join(" ; ")],
    ["Position client",asText(dossier.client_position)],
    ["Acteurs déjà suivis",asStringArray(dossier.key_actors).join(" ; ")],
    ["Thèmes de veille",[...asStringArray(dossier.watch_topics),...asStringArray(dossier.watch_subtopics)].join(" ; ")],
    ["Textes de référence",asStringArray(dossier.reference_texts).join(" ; ")],
    ["Échéances dossier",asStringArray(dossier.key_deadlines).join(" ; ")],
  ].filter(([,value])=>value);
  return rows.length?rows.map(([label,value])=>`${label} : ${value}`).join("\n"):"Aucune mémoire stratégique structurée supplémentaire.";
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
    evidence:{
      source_index:Math.max(0,Math.min(8,Math.round(Number(actor?.evidence?.source_index)||0))),
      source_title:asText(actor?.evidence?.source_title),
      source_url:asText(actor?.evidence?.source_url),
      excerpt:asText(actor?.evidence?.excerpt).slice(0,320),
      confidence:Math.max(0,Math.min(1,Number(actor?.evidence?.confidence)||0)),
      verified:false,
    },
  };
}

function actorMentionedInSource(actor:Actor,content:string){
  const source=normalizeRadarText(content);
  const candidates=[actor.name,actor.role].map(normalizeRadarText).filter(value=>value.length>=8&&value!=="information a confirmer");
  return candidates.some(value=>source.includes(value));
}

function groundActor(actor:Actor,items:WatchItem[],extractionByUrl:Map<string,SourceExtraction>):Actor{
  const index=actor.evidence.source_index;
  const item=index>=1&&index<=items.length?items[index-1]:null;
  const sourceUrl=asText(item?.source_url);
  const extraction=sourceUrl?extractionByUrl.get(sourceUrl):undefined;
  const excerptVerified=!!extraction&&extraction.status==="fetched"&&evidenceExcerptIsGrounded(extraction.content,actor.evidence.excerpt);
  const actorVerified=!!extraction&&extraction.status==="fetched"&&actorMentionedInSource(actor,extraction.content);
  const verified=excerptVerified&&actorVerified;
  const evidence:ActorEvidence={
    source_index:item?index:0,
    source_title:item?.title||actor.evidence.source_title||"Source non identifiée",
    source_url:sourceUrl||actor.evidence.source_url||"",
    excerpt:actor.evidence.excerpt,
    confidence:verified?actor.evidence.confidence:Math.min(actor.evidence.confidence,.35),
    verified,
  };
  if(verified)return{...actor,evidence};
  return{
    ...actor,
    position:"inconnue",
    certainty:"a_confirmer",
    evidence,
    action:actor.action&&actor.action!=="information à confirmer"?`${actor.action} — après vérification manuelle du rôle et de la position.`:"Vérifier le rôle et la position de cet acteur avant toute prise de contact.",
  };
}

function isClientActor(actor:Actor,client:string){
  const clientKey=comparable(client);const actorKey=comparable(actor.name);
  if(!clientKey||!actorKey)return false;
  if(actorKey===clientKey)return true;
  if(clientKey.length>=14&&actorKey.includes(clientKey))return true;
  if(actorKey.length>=14&&clientKey.includes(actorKey))return true;
  return false;
}
function isUnsubstantiatedGenericActor(actor:Actor){
  if(actor.evidence.verified&&actor.certainty==="confirme")return false;
  const key=comparable(actor.name);
  const genericPatterns=[/^presidence de la republique$/,/^president de la republique$/,/^premier ministre$/,/^matignon$/,/^gouvernement$/,/^assemblee nationale$/,/^senat$/,/^groupes parlementaires?$/,/^partis politiques?$/,/^medias?$/,/^opinion publique$/,/^organisations professionnelles?$/,/^organisations professionnelles concernees$/,/^associations?$/,/^syndicats?$/];
  return genericPatterns.some(pattern=>pattern.test(key));
}
function keepRelevantActors(actors:Actor[],client:string){
  const seen=new Set<string>();
  return actors.filter(actor=>{if(isClientActor(actor,client)||isUnsubstantiatedGenericActor(actor))return false;const key=comparable(actor.name);if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
}

async function enrichContacts(apiKey:string,model:string,actors:Actor[]):Promise<Actor[]>{
  const targets=actors.filter(actor=>actor.evidence.verified&&(actor.influence>=4||actor.orbit===1)&&actor.certainty!=="a_confirmer").slice(0,4);
  if(!targets.length)return actors;
  const prompt=`Recherche des coordonnées professionnelles publiques pour ces acteurs institutionnels :\n\n${targets.map(a=>`${a.id} | ${a.name} | ${a.role}`).join("\n")}\n\nRègles : utilise uniquement une page institutionnelle officielle ; ne déduis jamais un e-mail ; n'invente jamais de téléphone ; si aucun contact direct n'est publié, retourne seulement l'URL officielle ; sinon laisse les champs vides. Retourne le JSON demandé par le schéma.`;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt,tools:[{type:"web_search"}],text:{format:CONTACT_FORMAT},max_output_tokens:1200,store:false}),signal:controller.signal});
    if(!response.ok)return actors;
    const payload=await response.json();const output=extractOutputText(payload);if(!output)return actors;
    let parsed:any=null;try{parsed=JSON.parse(output);}catch{return actors;}
    const contacts=Array.isArray(parsed?.contacts)?parsed.contacts:[];
    const verifiedContacts=new Map<string,{email:string;phone:string;url:string}>();
    await Promise.all(contacts.map(async(contact:any)=>{
      const id=asText(contact?.id);const url=asText(contact?.url);
      if(!id||!targets.some(actor=>actor.id===id)||!url||!isOfficialContactUrl(url))return;
      const page=await fetchOfficialContactPage(url);
      if(page.status!=="fetched")return;
      const candidateEmail=validEmail(contact?.email);const candidatePhone=validPhone(contact?.phone);
      const verified=verifyOfficialContactValues(page.content,candidateEmail,candidatePhone);
      verifiedContacts.set(id,{email:validEmail(verified.email),phone:validPhone(verified.phone),url:page.resolved_url||url});
    }));
    return actors.map(actor=>{
      const contact=verifiedContacts.get(actor.id);if(!contact)return actor;
      return{...actor,contact_email:contact.email||undefined,contact_phone:contact.phone||undefined,contact_url:contact.url,contact_verified:true};
    });
  }catch{return actors;}finally{clearTimeout(timer);}
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
    const model=asText(process.env.OPENAI_RADAR_MODEL)||"gpt-4.1-mini";

    const prioritizedItems=[...items].sort((a,b)=>urgencyRank(b.urgency)-urgencyRank(a.urgency)||new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime());
    const uniqueUrls=[...new Set(prioritizedItems.map(item=>item.source_url||"").filter(Boolean))].slice(0,5);
    const extractions=await Promise.all(uniqueUrls.map(url=>fetchOfficialSource(url)));
    const extractionByUrl=new Map(extractions.map(source=>[source.url,source]));
    const sourceText=items.map((item,index)=>{
      const extraction=item.source_url?extractionByUrl.get(item.source_url):undefined;
      return[
        `SOURCE ${index+1}`,
        `Titre : ${item.title}`,
        `Nature : ${item.nature}`,
        `Urgence veille : ${item.urgency||"non renseignée"}`,
        item.source_url?`URL officielle : ${item.source_url}`:"",
        extraction?.status==="fetched"?`CONTENU OFFICIEL RÉCUPÉRÉ :\n${extraction.content}`:`CONTENU OFFICIEL : non récupéré automatiquement (${extraction?.status||"aucune URL"}). Ne pas inventer son contenu.`,
      ].filter(Boolean).join("\n");
    }).join("\n\n====================\n\n");

    const prompt=`Tu es MYVOR, analyste senior français en affaires publiques et stratégie institutionnelle.\n\nProduis un RADAR D'INFLUENCE professionnel, prudent et vérifiable pour ce dossier.\n\nCLIENT : ${dossier.client}\nDOSSIER : ${dossier.title}\nCONTEXTE : ${dossier.context||"Non renseigné"}\nOBJECTIF CLIENT : ${dossier.objective}\n\nMÉMOIRE STRATÉGIQUE DU DOSSIER (contexte uniquement, jamais preuve d'une position institutionnelle) :\n${dossierProfileText(dossier)}\n\nSOURCES OFFICIELLES :\n${sourceText}\n\nRÈGLES ABSOLUES :\n1. Le client n'est jamais un acteur du Radar.\n2. Aucun acteur générique non étayé.\n3. N'invente jamais une personne, fonction, position, vote, déclaration, date, compétence ou relation.\n4. La position est évaluée uniquement par rapport à l'objectif du client. Si elle n'est pas explicitement établie, utilise \"inconnue\".\n5. Chaque acteur doit citer UNE source numérotée et un extrait COURT, EXACT et copié du contenu officiel fourni (18 à 280 caractères). N'utilise jamais une paraphrase comme preuve.\n6. L'extrait doit étayer au minimum la pertinence/rôle de l'acteur et, lorsqu'une position est attribuée, cette position.\n7. Si aucune preuve exacte n'est disponible, source_index=0, excerpt vide, certainty=\"a_confirmer\" et position=\"inconnue\".\n8. La mémoire stratégique du dossier aide à prioriser les acteurs mais ne peut jamais servir de preuve institutionnelle.\n9. Maximum 8 acteurs.\n\nORBITE : 1 décision directe ; 2 influence forte ; 3 influence indirecte.\nINFLUENCE : 1 à 5.\nPOSITION : favorable | inconnue | reserve | opposition.\nCERTITUDE : confirme | probable | a_confirmer.\n\nRetourne uniquement le JSON conforme au schéma fourni.`;

    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),22000);
    try{
      const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt,text:{format:RADAR_FORMAT},max_output_tokens:2400,store:false}),signal:controller.signal});
      const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null;}catch{return NextResponse.json({error:`OpenAI a retourné une réponse invalide (${response.status}).`},{status:502});}
      if(!response.ok)return NextResponse.json({error:payload?.error?.message||`Le moteur Radar a échoué (${response.status}).`},{status:502});
      const outputText=extractOutputText(payload);
      if(!outputText)return NextResponse.json({error:"Le moteur Radar n’a retourné aucune analyse exploitable."},{status:502});
      let parsed:any=null;try{parsed=JSON.parse(outputText);}catch{return NextResponse.json({error:"Le moteur Radar a retourné un JSON invalide malgré le schéma structuré."},{status:502});}
      const normalized:Actor[]=(Array.isArray(parsed?.actors)?parsed.actors:[]).slice(0,8).map((actor:any,index:number)=>normalizeActor(actor,index));
      const grounded:Actor[]=normalized.map((actor:Actor)=>groundActor(actor,items,extractionByUrl));
      const relevantActors=keepRelevantActors(grounded,dossier.client);
      if(!relevantActors.length)return NextResponse.json({error:"Aucun acteur externe suffisamment pertinent n’a pu être identifié à partir des sources disponibles."},{status:422});
      const actors=await enrichContacts(apiKey,model,relevantActors);
      const groundedActors=actors.filter(actor=>actor.evidence.verified).length;
      const verifiedContacts=actors.filter(actor=>actor.contact_verified).length;
      const fetchedSources=extractions.filter(source=>source.status==="fetched").length;
      const qualityStatus=fetchedSources===0||groundedActors===0?"insufficient_sources":groundedActors===actors.length?"grounded":"review_required";
      return NextResponse.json({
        actors,
        engine:"openai-radar-grounded-v2",
        model,
        quality:{
          status:qualityStatus,
          client_excluded:true,
          generic_unsubstantiated_filtered:true,
          structured_output:true,
          grounded_actors:groundedActors,
          total_actors:actors.length,
          grounding_rate:actors.length?groundedActors/actors.length:0,
          official_contact_lookup:true,
          verified_contact_pages:verifiedContacts,
        },
        grounding:{
          official_sources_requested:uniqueUrls.length,
          official_sources_fetched:fetchedSources,
          max_official_sources:5,
          statuses:extractions.map(source=>({url:source.url,resolved_url:source.resolved_url||source.url,status:source.status,read_chars:source.read_chars})),
        },
      });
    }catch(error:any){
      if(error?.name==="AbortError")return NextResponse.json({error:"Le Radar d’influence a dépassé le temps de réponse disponible."},{status:504});
      return NextResponse.json({error:error?.message||"Impossible de joindre le moteur Radar."},{status:502});
    }finally{clearTimeout(timer);}
  }catch(error:any){return NextResponse.json({error:error?.message||"Erreur interne pendant la génération du Radar d’influence."},{status:500});}
}
