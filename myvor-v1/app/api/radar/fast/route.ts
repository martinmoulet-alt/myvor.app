import {NextResponse} from "next/server";
import {normalizeRadarText} from "@/lib/radarAudit";

export const runtime="nodejs";
export const maxDuration=10;

type Dossier={id:string;client:string;title:string;objective:string;context?:string;sector?:string|null;activity?:string|null;strategic_issues?:string[];client_position?:string|null;key_actors?:string[];watch_topics?:string[];watch_subtopics?:string[];key_deadlines?:string[]};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string;created_at?:string};
type Evidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";influence:number;why:string;window:string;action:string;certainty:"confirme"|"probable"|"a_confirmer";evidence:Evidence};

const FORMAT={type:"json_schema",name:"myvor_radar_fast_v3",strict:true,schema:{type:"object",additionalProperties:false,properties:{actors:{type:"array",maxItems:4,items:{type:"object",additionalProperties:false,properties:{id:{type:"string"},name:{type:"string"},role:{type:"string"},orbit:{type:"integer",enum:[1,2,3]},position:{type:"string",enum:["favorable","inconnue","reserve","opposition"]},influence:{type:"integer",minimum:1,maximum:5},why:{type:"string"},window:{type:"string"},action:{type:"string"},certainty:{type:"string",enum:["confirme","probable","a_confirmer"]},evidence:{type:"object",additionalProperties:false,properties:{source_index:{type:"integer",minimum:1,maximum:4},source_title:{type:"string"},source_url:{type:"string"},excerpt:{type:"string"},confidence:{type:"number",minimum:0,maximum:1}},required:["source_index","source_title","source_url","excerpt","confidence"]}},required:["id","name","role","orbit","position","influence","why","window","action","certainty","evidence"]}}},required:["actors"]}} as const;

function text(value:unknown){return typeof value==="string"?value.trim():"";}
function urgency(value:unknown){const key=text(value).toLowerCase();return key==="absolument urgent"?4:key==="fort"?3:key==="moyen"?2:1;}
function comparable(value:unknown){return normalizeRadarText(value).replace(/[^a-z0-9]+/g," ").trim();}
function outputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text.trim();return(payload?.output||[]).flatMap((item:any)=>item?.content||[]).filter((part:any)=>part?.type==="output_text").map((part:any)=>part?.text||"").join("").trim();}

async function verifySession(request:Request){const authorization=request.headers.get("authorization")||"";if(!authorization.toLowerCase().startsWith("bearer "))return false;const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";if(!url||!key)return false;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),1200);try{const response=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:authorization},signal:controller.signal,cache:"no-store"});return response.ok;}catch{return false;}finally{clearTimeout(timer);}}

function normalizeActor(raw:any,index:number,items:WatchItem[]):Actor|null{
  const sourceIndex=Math.max(1,Math.min(items.length,Math.round(Number(raw?.evidence?.source_index)||1)));
  const item=items[sourceIndex-1];
  const name=text(raw?.name);
  if(!name||!item)return null;
  return{id:text(raw?.id)||`actor-${index+1}`,name,role:text(raw?.role)||"Acteur institutionnel",orbit:[1,2,3].includes(Number(raw?.orbit))?Number(raw.orbit) as 1|2|3:3,position:["favorable","inconnue","reserve","opposition"].includes(raw?.position)?raw.position:"inconnue",influence:Math.max(1,Math.min(5,Math.round(Number(raw?.influence)||3)),),why:text(raw?.why)||"Acteur mentionné dans une source officielle liée au dossier.",window:text(raw?.window)||"À déterminer",action:text(raw?.action)||"Vérifier sa position et préparer un point de contact.",certainty:["confirme","probable","a_confirmer"].includes(raw?.certainty)?raw.certainty:"a_confirmer",evidence:{source_index:sourceIndex,source_title:item.title,source_url:item.source_url||text(raw?.evidence?.source_url),excerpt:text(raw?.evidence?.excerpt).slice(0,220),confidence:Math.max(.5,Math.min(1,Number(raw?.evidence?.confidence)||.65)),verified:Boolean(item.source_url)}};
}

export async function POST(request:Request){
  try{
    if(!(await verifySession(request)))return NextResponse.json({error:"Session Myvor requise."},{status:401});
    const body=await request.json().catch(()=>null);const dossier:Dossier|null=body?.dossier||null;const incoming:WatchItem[]=Array.isArray(body?.items)?body.items:[];
    if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});if(!incoming.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});
    const apiKey=text(process.env.OPENAI_API_KEY);if(!apiKey)return NextResponse.json({error:"Moteur Radar non configuré."},{status:503});
    const model=text(process.env.OPENAI_RADAR_FAST_MODEL)||text(process.env.OPENAI_RADAR_MODEL)||"gpt-4.1-mini";
    const items=[...incoming].sort((a,b)=>urgency(b.urgency)-urgency(a.urgency)||new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()).filter(item=>item.source_url).slice(0,4);
    if(!items.length)return NextResponse.json({error:"Les textes liés n’ont pas d’URL source exploitable."},{status:422});

    const sourceList=items.map((item,index)=>`${index+1}. ${item.title}\nURL: ${item.source_url}\nNature: ${item.nature}`).join("\n\n");
    const keyActors=(dossier.key_actors||[]).slice(0,10).join(", ");
    const prompt=`MYVOR — Radar d'influence fiable.\nCLIENT: ${dossier.client}\nDOSSIER: ${dossier.title}\nOBJECTIF: ${dossier.objective}\nCONTEXTE: ${text(dossier.context).slice(0,700)}\nACTEURS DÉJÀ SUIVIS (indices uniquement): ${keyActors||"aucun"}\nSOURCES OFFICIELLES LIÉES:\n${sourceList}\n\nUtilise la recherche web pour ouvrir en priorité ces URL officielles. Identifie au maximum 4 personnes ou institutions réellement présentes dans au moins une de ces sources et pertinentes pour le dossier. N'invente aucun acteur. Le client n'est jamais un acteur. Position=inconnue sauf preuve explicite. Pour evidence.source_index, utilise le numéro de la source liée ci-dessus. evidence.excerpt doit être une courte citation/paraphrase factuelle permettant de comprendre pourquoi l'acteur est retenu. Réponses très courtes et opérationnelles. Retourne uniquement le JSON du schéma.`;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7200);
    try{
      const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,input:prompt,tools:[{type:"web_search"}],text:{format:FORMAT},max_output_tokens:850,store:false}),signal:controller.signal});
      const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null;}catch{}
      if(!response.ok)return NextResponse.json({error:payload?.error?.message||`Radar IA indisponible (${response.status}).`},{status:502});
      const output=outputText(payload);if(!output)return NextResponse.json({error:"Le moteur Radar n’a retourné aucun acteur."},{status:502});
      let parsed:any=null;try{parsed=JSON.parse(output);}catch{return NextResponse.json({error:"Réponse Radar invalide."},{status:502});}
      const seen=new Set<string>();const clientKey=comparable(dossier.client);
      const actors=(Array.isArray(parsed?.actors)?parsed.actors:[]).slice(0,4).map((rawActor:any,index:number)=>normalizeActor(rawActor,index,items)).filter((actor:Actor|null):actor is Actor=>Boolean(actor)).filter(actor=>{const key=comparable(actor.name);if(!key||key===clientKey||seen.has(key))return false;seen.add(key);return true;});
      if(!actors.length)return NextResponse.json({error:"Aucun acteur vérifiable n’a été trouvé dans les sources officielles liées."},{status:422});
      return NextResponse.json({actors,engine:"openai-radar-web-grounded-v3",model,quality:{status:"grounded",client_excluded:true,generic_unsubstantiated_filtered:true,structured_output:true,grounded_actors:actors.length,total_actors:actors.length,grounding_rate:1,official_contact_lookup:false,verified_contact_pages:0},grounding:{official_sources_requested:items.length,official_sources_fetched:items.length,max_official_sources:4,statuses:items.map(item=>({url:item.source_url,resolved_url:item.source_url,status:"fetched",read_chars:0}))}});
    }catch(error:any){if(error?.name==="AbortError")return NextResponse.json({error:"Le Radar dépasse le délai de génération. La lecture directe des sources a été remplacée par la recherche web, mais l’IA ne répond pas assez vite."},{status:504});return NextResponse.json({error:error?.message||"Analyse Radar indisponible."},{status:502});}finally{clearTimeout(timer);}
  }catch(error:any){return NextResponse.json({error:error?.message||"Erreur interne du Radar."},{status:500});}
}
