import {NextResponse} from "next/server";

export const runtime="nodejs";
export const maxDuration=20;

const MAX_CONTEXT_ITEMS=24;
const MAX_ACTORS=6;

type Dossier={id:string;client:string;title:string;objective:string;context?:string;key_actors?:string[];key_deadlines?:string[]};
type WatchItem={id:string;title:string;nature:string;source_url?:string;source_name?:string|null;urgency?:string;created_at?:string;published_at?:string|null};
type ActorSeed={name:string;role:string;institution?:string;certainty:"confirme"|"a_confirmer";source?:WatchItem|null;baseInfluence?:number;origin:"dossier"|"source"};

function text(value:unknown){return typeof value==="string"?value.trim():"";}
function urgency(value:unknown){const key=text(value).toLowerCase();return key==="absolument urgent"?4:key==="fort"?3:key==="moyen"?2:1;}
function normalized(value:unknown){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function hostname(url:string){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}}

async function requireSessionAndQuota(request:Request){
  const authorization=request.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return {ok:false,status:401,error:"Session Myvor requise."};
  const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
  if(!url||!key)return {ok:false,status:503,error:"La sécurité Supabase de Myvor n’est pas configurée."};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2500);
  try{
    const user=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:authorization},signal:controller.signal,cache:"no-store"});
    if(!user.ok)return {ok:false,status:401,error:"Session Myvor invalide ou expirée."};
    const quota=await fetch(`${url}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:key,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:"radar"}),signal:controller.signal,cache:"no-store"});
    if(!quota.ok)return {ok:false,status:503,error:"Impossible de vérifier le quota du Radar."};
    const allowed=await quota.json().catch(()=>false);
    if(allowed!==true)return {ok:false,status:429,error:"Trop de générations Radar en peu de temps. Réessaie dans quelques minutes."};
    return {ok:true,status:200,error:""};
  }catch{return {ok:false,status:503,error:"Impossible de vérifier la session Myvor."};}
  finally{clearTimeout(timer);}
}

function institutionFromSource(item:WatchItem):ActorSeed|null{
  const host=hostname(text(item.source_url));if(!host)return null;
  const matches:Array<[string,string,string,number]>=[
    ["assemblee-nationale.fr","Assemblée nationale","Institution parlementaire",5],
    ["senat.fr","Sénat","Institution parlementaire",5],
    ["gouvernement.fr","Gouvernement","Exécutif",5],
    ["economie.gouv.fr","Ministère de l’Économie","Ministère",5],
    ["ecologie.gouv.fr","Ministère de la Transition écologique","Ministère",5],
    ["interieur.gouv.fr","Ministère de l’Intérieur","Ministère",5],
    ["travail-emploi.gouv.fr","Ministère du Travail","Ministère",5],
    ["sante.gouv.fr","Ministère de la Santé","Ministère",5],
    ["agriculture.gouv.fr","Ministère de l’Agriculture","Ministère",5],
    ["diplomatie.gouv.fr","Ministère de l’Europe et des Affaires étrangères","Ministère",5],
    ["conseil-etat.fr","Conseil d’État","Institution",4],
    ["conseil-constitutionnel.fr","Conseil constitutionnel","Institution",4],
    ["ccomptes.fr","Cour des comptes","Institution",4],
    ["eur-lex.europa.eu","Institutions de l’Union européenne","Institution européenne",4],
  ];
  const match=matches.find(([domain])=>host===domain||host.endsWith(`.${domain}`));
  return match?{name:match[1],role:match[2],institution:match[1],certainty:"confirme",source:item,baseInfluence:match[3],origin:"source"}:null;
}

function buildSeeds(dossier:Dossier,items:WatchItem[]){
  const seeds:ActorSeed[]=[];const seen=new Set<string>();const clientKey=normalized(dossier.client);
  const push=(seed:ActorSeed)=>{const key=normalized(seed.name);if(!key||key===clientKey||seen.has(key))return;seen.add(key);seeds.push(seed);};
  (Array.isArray(dossier.key_actors)?dossier.key_actors:[]).map(text).filter(Boolean).forEach((name,index)=>push({name,role:"Acteur clé suivi dans le dossier",institution:"",certainty:"a_confirmer",source:items[index%Math.max(1,items.length)]||null,baseInfluence:index<2?5:index<4?4:3,origin:"dossier"}));
  items.forEach(item=>{const seed=institutionFromSource(item);if(seed)push(seed);});
  return seeds.slice(0,MAX_ACTORS);
}

function signalsFor(seed:ActorSeed,items:WatchItem[]){
  const actorKey=normalized(seed.name);
  return items.filter(item=>seed.origin==="source"?institutionFromSource(item)?.name===seed.name:actorKey.length>3&&normalized(item.title).includes(actorKey)).slice(0,3).map(item=>({title:item.title,nature:item.nature,date:text(item.published_at)||text(item.created_at),url:text(item.source_url),source_name:text(item.source_name),urgency:text(item.urgency)||"faible"}));
}
function scoreFor(seed:ActorSeed,signals:ReturnType<typeof signalsFor>,items:WatchItem[]){
  const base=Math.max(1,Math.min(5,seed.baseInfluence||3));const institutional=({1:10,2:16,3:23,4:29,5:35} as Record<number,number>)[base]||23;
  const relevance=Math.min(30,(seed.origin==="dossier"?24:22)+Math.min(6,signals.length*2));
  const pool=signals.length?signals.map(signal=>urgency(signal.urgency)):items.slice(0,3).map(item=>urgency(item.urgency));const max=pool.length?Math.max(...pool):1;
  const timing=({1:8,2:12,3:16,4:20} as Record<number,number>)[max]||8;const accessibility=seed.origin==="dossier"?9:7;
  return {total:Math.max(0,Math.min(100,institutional+relevance+timing+accessibility)),institutional,relevance,timing,accessibility};
}
function actionWindow(deadline:string){return deadline&&deadline!=="À déterminer"?`La prochaine fenêtre d’action est liée à l’échéance « ${deadline} ». Son calendrier précis doit être confirmé avant d’engager une démarche institutionnelle.`:"La prochaine fenêtre d’action n’est pas encore suffisamment documentée ; le calendrier institutionnel du dossier doit être confirmé avant d’engager une démarche.";}

export async function POST(request:Request){
  try{
    const access=await requireSessionAndQuota(request);if(!access.ok)return NextResponse.json({error:access.error},{status:access.status});
    const body=await request.json().catch(()=>null);const dossier=(body?.dossier||null) as Dossier|null;const incoming=(Array.isArray(body?.items)?body.items:[]) as WatchItem[];
    if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
    const items=[...incoming].sort((a,b)=>urgency(b.urgency)-urgency(a.urgency)||(Date.parse(b.published_at||b.created_at||"")||0)-(Date.parse(a.published_at||a.created_at||"")||0)).filter(item=>Boolean(text(item.source_url))).slice(0,MAX_CONTEXT_ITEMS);
    const deadline=Array.isArray(dossier.key_deadlines)&&dossier.key_deadlines.length?text(dossier.key_deadlines[0]):"À déterminer";
    const actors=buildSeeds(dossier,items).map((seed,index)=>{
      const source=seed.source||null;const signals=signalsFor(seed,items);const score=scoreFor(seed,signals,items);const sourceCount=seed.origin==="source"?Math.max(1,signals.length):signals.length;
      return {id:`${seed.origin}-${index+1}`,name:seed.name,role:seed.role,institution:seed.institution||"",orbit:(index<2?1:index<4?2:3) as 1|2|3,position:"inconnue",position_reason:"Aucune position explicite n’est documentée dans les données actuellement rattachées au dossier.",influence:Math.max(1,Math.min(5,Math.ceil(score.total/20))),influence_score:score.total,score_breakdown:{institutional_power:score.institutional,dossier_relevance:score.relevance,timing:score.timing,accessibility:score.accessibility},why:seed.origin==="source"?`Cette institution est directement reliée à ${sourceCount} source${sourceCount>1?"s":""} officielle${sourceCount>1?"s":""} du dossier, ce qui justifie de vérifier son rôle exact dans la décision suivie.`:signals.length?`Cet acteur figure dans la fiche stratégique et apparaît dans ${signals.length} évolution${signals.length>1?"s":""} liée${signals.length>1?"s":""} au dossier, ce qui justifie de consolider sa capacité d’influence.`:"Cet acteur figure dans la fiche stratégique du dossier, mais les sources disponibles ne permettent pas encore de qualifier précisément son rôle ni sa position.",window:actionWindow(deadline),action:seed.origin==="source"?"Identifier les décideurs ou relais compétents au sein de cette institution, vérifier leur rôle et leur position à partir de sources publiques, puis préparer une démarche liée à la prochaine échéance confirmée.":"Vérifier la fonction actuelle de cet acteur et documenter sa position à partir de sources publiques avant de définir une démarche adaptée à l’objectif du dossier.",certainty:seed.certainty,signals,source_count:sourceCount,evidence:{source_index:source?Math.max(1,items.findIndex(item=>item.id===source.id)+1):0,source_title:source?.title||"Fiche stratégique du dossier",source_url:source?.source_url||"",excerpt:seed.origin==="source"?`Cette institution a été identifiée à partir de la source officielle « ${source?.title||"source liée"} ».`:"Cet acteur provient de la fiche stratégique du dossier et doit être consolidé par une source publique.",confidence:seed.certainty==="confirme"?0.95:source?0.7:0.55,verified:seed.origin==="source"&&Boolean(source?.source_url)},contact_verified:false};
    });
    const groundedActors=actors.filter(actor=>actor.evidence.verified).length;const status=actors.length?(groundedActors===actors.length?"grounded":"review_required"):"insufficient_context";
    return NextResponse.json({actors,engine:"myvor-radar-stable-v6",model:"deterministic",quality:{status,client_excluded:true,generic_unsubstantiated_filtered:true,structured_output:true,grounded_actors:groundedActors,total_actors:actors.length,grounding_rate:actors.length?groundedActors/actors.length:0,official_contact_lookup:false,verified_contact_pages:0,fallback_used:!Array.isArray(dossier.key_actors)||!dossier.key_actors.map(text).filter(Boolean).length,complete_sentence_style:true},grounding:{official_sources_requested:items.length,official_sources_fetched:groundedActors,max_official_sources:MAX_CONTEXT_ITEMS,statuses:items.map(item=>({url:item.source_url,resolved_url:item.source_url,status:"linked",read_chars:0}))}});
  }catch(error:any){return NextResponse.json({error:error?.message||"Erreur interne du Radar."},{status:500});}
}