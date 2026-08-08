import {createHash,randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {extractText,getDocumentProxy} from "unpdf";
import {
  assessImpactCoverage,
  IMPACT_EVIDENCE_VERSION,
  IMPACT_HISTORY_VERSION,
  IMPACT_PROMPT_VERSION,
  IMPACT_SCORING_VERSION,
  qualityLabel,
  scoreImpactDeterministically,
  SCORE_KEYS,
  type ScoreKey,
  validateImpactPayload,
} from "@/lib/impactAudit";
import {
  balanceAllocations,
  buildDossierEvidence,
  buildOfficialEvidence,
  evidenceLocation,
  findStructuredEvidence,
  htmlToSegments,
  pdfPagesToSegments,
  segmentsToText,
  selectRelevantSegments,
  textToSegments,
  type EvidenceCandidate,
  type SourceFormat,
  type SourceSegment,
  type StructuredEvidence,
} from "@/lib/impactSource";

export const runtime="nodejs";

type Dossier={
  id:string;client:string;title:string;objective:string;context?:string;
  sector?:string|null;activity?:string|null;strategic_issues?:string[];
  risks_to_avoid?:string[];opportunities?:string[];client_position?:string|null;
  key_actors?:string[];watch_topics?:string[];watch_subtopics?:string[];
  reference_texts?:string[];key_deadlines?:string[];internal_notes?:string|null;
};
type WatchItem={id:string;title:string;nature:string;urgency?:string;source_url?:string};
type ImpactDepth="express"|"standard"|"deep";
type SourceTraceStatus="fetched"|"unavailable"|"unsupported"|"not_requested"|"missing_url";
type SourceExtraction={
  url:string;resolved_url:string;segments:SourceSegment[];selected_segments:SourceSegment[];
  content:string;status:"fetched"|"unavailable"|"unsupported";format?:SourceFormat;
  fetched_at:string;content_hash:string;
};
type DepthConfig={label:string;maxItems:number;maxUrls:number;corpusChars:number;timeoutMs:number;instruction:string};
type Profile={fields:string[];text:string;evidence:{label:string;text:string}[]};
type SourceTrace={url:string;resolved_url?:string;status:SourceTraceStatus;read_chars:number;format?:SourceFormat;fetched_at?:string;content_hash?:string};
type PreparedImpact={
  depth:ImpactDepth;
  dossier:Dossier;
  items:WatchItem[];
  raw_item_ids:string[];
  omitted_ids:string[];
  include_internal_notes:boolean;
  profile:Profile;
  official_candidates:EvidenceCandidate[];
  dossier_candidates:EvidenceCandidate[];
  traces:SourceTrace[];
  source_snapshots:any[];
  source_text:string;
  invoke_body:Record<string,unknown>;
  official_sources_requested:number;
  official_sources_fetched:number;
  corpus_budget_chars:number;
  corpus_used_chars:number;
  selection:{requested_ids:string[];analyzed_ids:string[];omitted_ids:string[];max_items:number;max_urls:number};
};

class ImpactError extends Error{constructor(message:string,public status=500){super(message);}}
const MAX_PDF_BYTES=15*1024*1024;
const MAX_HTML_BYTES=2_500_000;
const OFFICIAL_HOSTS=["assemblee-nationale.fr","senat.fr","legifrance.gouv.fr","vie-publique.fr","gouvernement.fr","economie.gouv.fr","ecologie.gouv.fr","conseil-constitutionnel.fr","conseil-etat.fr","courdecassation.fr","ccomptes.fr","cnil.fr","arcep.fr","cre.fr","amf-france.org","autoritedelaconcurrence.fr","eur-lex.europa.eu"];
const depthConfig:Record<ImpactDepth,DepthConfig>={
  express:{label:"Express",maxItems:24,maxUrls:2,corpusChars:14000,timeoutMs:42000,instruction:"NOTE EXPRESS. Traite jusqu’à 24 évolutions de veille en synthèse, puis va à l'essentiel. Maximum 3 risques, 2 opportunités, 2 échéances et 3 recommandations prioritaires."},
  standard:{label:"Standard",maxItems:24,maxUrls:4,corpusChars:30000,timeoutMs:50000,instruction:"NOTE STANDARD. Traite transversalement jusqu’à 24 évolutions de veille et produis une analyse complète, concise et opérationnelle pour le suivi quotidien du dossier."},
  deep:{label:"Approfondie",maxItems:24,maxUrls:6,corpusChars:39000,timeoutMs:58000,instruction:"NOTE APPROFONDIE. Traite transversalement jusqu’à 24 évolutions de veille, croise les sources, distingue faits, incertitudes et recommandations, et justifie séparément les six critères. Maximum 5 dispositions, 5 risques, 4 opportunités, 4 échéances et 6 recommandations."},
};

function asText(value:unknown){return typeof value==="string"?value.trim():"";}
function compactText(value:unknown,max=900){return asText(value).replace(/\s+/g," ").slice(0,max).trim();}
function compactList(value:unknown,maxItems=12,maxChars=260){return Array.isArray(value)?value.map(item=>compactText(item,maxChars)).filter(Boolean).slice(0,maxItems):[];}
function sha256(value:string){return createHash("sha256").update(value,"utf8").digest("hex");}
function urgencyRank(value:unknown){const urgency=asText(value).toLowerCase();if(urgency==="absolument urgent")return 4;if(urgency==="fort")return 3;if(urgency==="moyen")return 2;if(urgency==="faible")return 1;return 0;}
function isOfficialUrl(rawUrl:string){try{const url=new URL(rawUrl);const host=url.hostname.toLowerCase();return url.protocol==="https:"&&OFFICIAL_HOSTS.some(base=>host===base||host.endsWith(`.${base}`));}catch{return false;}}
function isPdfResponse(contentType:string,url:string){if(contentType.includes("application/pdf"))return true;try{return new URL(url).pathname.toLowerCase().endsWith(".pdf");}catch{return false;}}
function supabaseConfig(){const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";if(!url||!anonKey)throw new ImpactError("La connexion Supabase de Myvor n’est pas configurée.",503);return{url,anonKey};}
async function verifySession(authorization:string){if(!authorization.toLowerCase().startsWith("bearer "))throw new ImpactError("Session Myvor requise.",401);const{url,anonKey}=supabaseConfig();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:authorization},signal:controller.signal,cache:"no-store"});if(!response.ok)throw new ImpactError("Session Myvor invalide ou expirée.",401);}catch(error){if(error instanceof ImpactError)throw error;throw new ImpactError("Impossible de vérifier la session Myvor.",503);}finally{clearTimeout(timer);}}

function strategicSections(dossier:Dossier,includeInternalNotes:boolean){return[
  {key:"client_position",label:"Position du client",values:[compactText(dossier.client_position,1000)].filter(Boolean)},
  {key:"strategic_issues",label:"Enjeux stratégiques",values:compactList(dossier.strategic_issues)},
  {key:"risks_to_avoid",label:"Risques à éviter",values:compactList(dossier.risks_to_avoid)},
  {key:"opportunities",label:"Opportunités recherchées",values:compactList(dossier.opportunities)},
  {key:"key_deadlines",label:"Échéances clés",values:compactList(dossier.key_deadlines,12,220)},
  {key:"key_actors",label:"Acteurs clés",values:compactList(dossier.key_actors,18,180)},
  {key:"sector",label:"Secteur",values:[compactText(dossier.sector,350)].filter(Boolean)},
  {key:"activity",label:"Activité",values:[compactText(dossier.activity,700)].filter(Boolean)},
  {key:"watch_topics",label:"Thèmes de veille",values:compactList(dossier.watch_topics,16,180)},
  {key:"watch_subtopics",label:"Sous-thèmes de veille",values:compactList(dossier.watch_subtopics,20,180)},
  {key:"reference_texts",label:"Textes de référence",values:compactList(dossier.reference_texts,16,260)},
  {key:"internal_notes",label:"Notes internes",values:includeInternalNotes?[compactText(dossier.internal_notes,1400)].filter(Boolean):[]},
].filter(section=>section.values.length);}
function buildStrategicProfile(dossier:Dossier,includeInternalNotes:boolean):Profile{const sections=strategicSections(dossier,includeInternalNotes);return{fields:sections.map(section=>section.key),text:sections.map(section=>`${section.label} : ${section.values.join(" ; ")}`).join("\n").slice(0,7500),evidence:sections.flatMap(section=>section.values.map(text=>({label:section.label,text})))};}
function queryForSource(dossier:Dossier,item:WatchItem,profile:string){return[dossier.objective,dossier.title,item.title,item.nature,profile].filter(Boolean).join(" ").slice(0,9000);}

async function fetchOfficialSource(rawUrl:string,query:string):Promise<SourceExtraction>{
  const fetched_at=new Date().toISOString();
  if(!rawUrl||!isOfficialUrl(rawUrl))return{url:rawUrl,resolved_url:rawUrl,segments:[],selected_segments:[],content:"",status:"unsupported",fetched_at,content_hash:""};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(rawUrl,{headers:{"User-Agent":"Myvor/1.0 institutional-impact-analysis",Accept:"application/pdf,text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"},redirect:"follow",signal:controller.signal,cache:"no-store"});
    if(!response.ok)return{url:rawUrl,resolved_url:response.url||rawUrl,segments:[],selected_segments:[],content:"",status:"unavailable",fetched_at,content_hash:""};
    const resolved_url=response.url||rawUrl;if(!isOfficialUrl(resolved_url))return{url:rawUrl,resolved_url,segments:[],selected_segments:[],content:"",status:"unsupported",fetched_at,content_hash:""};
    const contentType=(response.headers.get("content-type")||"").toLowerCase();let segments:SourceSegment[]=[];let format:SourceFormat|undefined;
    if(isPdfResponse(contentType,resolved_url)){
      format="pdf";const announcedSize=Number(response.headers.get("content-length")||0);if(Number.isFinite(announcedSize)&&announcedSize>MAX_PDF_BYTES){await response.body?.cancel().catch(()=>undefined);return{url:rawUrl,resolved_url,segments:[],selected_segments:[],content:"",status:"unsupported",format,fetched_at,content_hash:""};}
      const buffer=await response.arrayBuffer();if(buffer.byteLength>MAX_PDF_BYTES)return{url:rawUrl,resolved_url,segments:[],selected_segments:[],content:"",status:"unsupported",format,fetched_at,content_hash:""};
      const pdf=await getDocumentProxy(new Uint8Array(buffer));const result=await extractText(pdf,{mergePages:false});const pages=Array.isArray(result.text)?result.text.map((page:unknown)=>String(page||"")):[String(result.text||"")];segments=pdfPagesToSegments(pages);
    }else if(contentType.includes("text/html")){format="html";segments=htmlToSegments((await response.text()).slice(0,MAX_HTML_BYTES));}
    else if(contentType.includes("text/plain")){format="text";segments=textToSegments((await response.text()).slice(0,MAX_HTML_BYTES));}
    else return{url:rawUrl,resolved_url,segments:[],selected_segments:[],content:"",status:"unsupported",fetched_at,content_hash:""};
    const selected_segments=selectRelevantSegments(segments,query,60000);const content=segmentsToText(selected_segments);return{url:rawUrl,resolved_url,segments,selected_segments,content,status:content?"fetched":"unavailable",format,fetched_at,content_hash:content?sha256(content):""};
  }catch{return{url:rawUrl,resolved_url:rawUrl,segments:[],selected_segments:[],content:"",status:"unavailable",fetched_at,content_hash:""};}
  finally{clearTimeout(timer);}
}
function allocateCorpus(extractions:SourceExtraction[],queries:Map<string,string>,totalChars:number){const allocations=balanceAllocations(extractions.map(source=>source.status==="fetched"?source.content.length:0),totalChars);return extractions.map((source,index)=>{if(source.status!=="fetched")return source;const selected_segments=selectRelevantSegments(source.segments,queries.get(source.url)||"",allocations[index]);const content=segmentsToText(selected_segments);return{...source,selected_segments,content,content_hash:sha256(content)};});}
function sourceTrace(item:WatchItem,byUrl:Map<string,SourceExtraction>):SourceTrace{const url=item.source_url||"";if(!url)return{url:"",status:"missing_url",read_chars:0};const source=byUrl.get(url);if(!source)return{url,status:"not_requested",read_chars:0};return{url,resolved_url:source.resolved_url,status:source.status,read_chars:source.content.length,format:source.format,fetched_at:source.fetched_at,content_hash:source.content_hash};}
function evidenceLabel(evidence?:StructuredEvidence|null){const location=evidenceLocation(evidence);return location?`${evidence?.source_title} — ${location}`:evidence?.source_title||"";}
function evidenceStats(note:any){const scoreValues=Object.values(note?.score_evidence||{});const dispositions=Array.isArray(note?.dispositions_concernees)?note.dispositions_concernees:[];return{score_verified:scoreValues.filter(Boolean).length,score_total:SCORE_KEYS.length,dispositions_verified:dispositions.filter((item:any)=>item?.evidence).length,dispositions_total:dispositions.length};}
async function readJson(response:Response){const raw=await response.text();try{return raw?JSON.parse(raw):null;}catch{return{error:`Réponse non JSON de impact-analysis (${response.status}).`,details:raw.slice(0,500)};}}

async function prepareImpact(body:any):Promise<PreparedImpact>{
  const dossier:Dossier|null=body?.dossier||null;const requestedDepth=asText(body?.depth) as ImpactDepth;const depth:ImpactDepth=requestedDepth in depthConfig?requestedDepth:"standard";const config=depthConfig[depth];const includeInternalNotes=body?.include_internal_notes!==false;const rawItems:WatchItem[]=Array.isArray(body?.items)?body.items:[];
  if(!dossier)throw new ImpactError("Sélectionne un dossier client.",400);if(!rawItems.length)throw new ImpactError("Aucun élément de veille n’est rattaché à ce dossier.",400);
  const ranked=rawItems.map((item,index)=>({item,index})).sort((a,b)=>urgencyRank(b.item.urgency)-urgencyRank(a.item.urgency)||a.index-b.index);const items=ranked.slice(0,config.maxItems).map(entry=>entry.item);const omitted=ranked.slice(config.maxItems).map(entry=>entry.item.id);const profile=buildStrategicProfile(dossier,includeInternalNotes);
  const uniqueUrls=[...new Set(items.map(item=>item.source_url||"").filter(Boolean))].slice(0,config.maxUrls);const queries=new Map<string,string>();for(const item of items){if(item.source_url&&!queries.has(item.source_url))queries.set(item.source_url,queryForSource(dossier,item,profile.text));}
  const fetched=await Promise.all(uniqueUrls.map(url=>fetchOfficialSource(url,queries.get(url)||dossier.objective)));const extractions=allocateCorpus(fetched,queries,config.corpusChars);const byUrl=new Map(extractions.map(source=>[source.url,source]));const traces=items.map(item=>sourceTrace(item,byUrl));const fetchedCount=traces.filter(trace=>trace.status==="fetched").length;
  const generalContext=compactText(dossier.context,2500);const strategicContext=[generalContext,profile.text?`Profil stratégique du dossier :\n${profile.text}`:""].filter(Boolean).join("\n\n").slice(0,3000);
  const sourceText=[`TYPE DE NOTE DEMANDÉE : ${config.label.toUpperCase()}`,`INSTRUCTION DE PROFONDEUR : ${config.instruction}`,"La mémoire client personnalise l’analyse mais ne prouve aucun fait institutionnel.","MÉMOIRE STRATÉGIQUE MYVOR",generalContext?`Contexte général : ${generalContext}`:"Contexte général : non renseigné.",profile.text||"Fiche stratégique : aucun champ renseigné.","CORPUS INSTITUTIONNEL OFFICIEL",...items.map((item,index)=>{const source=item.source_url?byUrl.get(item.source_url):undefined;return[`SOURCE ${index+1}`,`Titre : ${item.title}`,`Nature : ${item.nature||"Non précisée"}`,item.source_url?`URL : ${source?.resolved_url||item.source_url}`:"",source?.status==="fetched"?source.content:`CONTENU OFFICIEL NON LU (${source?.status||(item.source_url?"non demandé":"aucune URL")}). Ne pas inventer.`].filter(Boolean).join("\n");})].join("\n\n====================\n\n");
  const firstUrl=items.find(item=>item.source_url)?.source_url||"";const invokeBody={depth,client:dossier.client,contexte:strategicContext,objectif:dossier.objective,titre:items.length===1?items[0].title:`${dossier.title} — ${items.length} textes analysés`,lien_officiel:firstUrl,texte:sourceText,dossier_title:dossier.title,item_ids:items.map(item=>item.id),sources:items.map(item=>({title:item.title,url:item.source_url||""})),prompt_version:IMPACT_PROMPT_VERSION};
  const officialCandidates:EvidenceCandidate[]=items.flatMap((item,index)=>{const source=item.source_url?byUrl.get(item.source_url):undefined;if(!source||source.status!=="fetched")return[];return buildOfficialEvidence({index:index+1,title:item.title,url:source.resolved_url||item.source_url||"",fetched_at:source.fetched_at,segments:source.selected_segments});});
  const dossierCandidates=buildDossierEvidence("Mémoire dossier",[{label:"Contexte général",text:compactText(dossier.context,1600)},...profile.evidence].filter(item=>item.text));
  const sourceSnapshots=items.map((item,index)=>{const source=item.source_url?byUrl.get(item.source_url):undefined;return{source_index:index+1,item_id:item.id,title:item.title,url:item.source_url||"",resolved_url:source?.resolved_url||item.source_url||"",status:source?.status||(item.source_url?"not_requested":"missing_url"),format:source?.format||null,fetched_at:source?.fetched_at||null,content_hash:source?.content_hash||"",content_used:source?.content||"",read_chars:source?.content.length||0};});
  return{depth,dossier,items,raw_item_ids:rawItems.map(item=>item.id),omitted_ids:omitted,include_internal_notes:includeInternalNotes,profile,official_candidates:officialCandidates,dossier_candidates:dossierCandidates,traces,source_snapshots:sourceSnapshots,source_text:sourceText,invoke_body:invokeBody,official_sources_requested:uniqueUrls.length,official_sources_fetched:fetchedCount,corpus_budget_chars:config.corpusChars,corpus_used_chars:extractions.reduce((sum,source)=>sum+source.content.length,0),selection:{requested_ids:rawItems.map(item=>item.id),analyzed_ids:items.map(item=>item.id),omitted_ids:omitted,max_items:config.maxItems,max_urls:config.maxUrls}};
}

function validatePrepared(value:any):asserts value is PreparedImpact{if(!value||typeof value!=="object"||!value.dossier||!Array.isArray(value.items)||!value.invoke_body||typeof value.source_text!=="string")throw new ImpactError("Préparation de Note invalide.",400);if(value.source_text.length>120000||value.items.length>24||!Array.isArray(value.official_candidates)||value.official_candidates.length>5000)throw new ImpactError("Préparation de Note trop volumineuse ou invalide.",413);}

function mapImpactToNote(impact:any,prepared:PreparedImpact){
  const validation=validateImpactPayload(impact);if(!validation.valid)throw new ImpactError(`Réponse IA incomplète : ${validation.errors.join(" ")}`,502);
  const{depth,dossier,items,profile,official_candidates,dossier_candidates}=prepared;
  let risks=Array.isArray(impact.risques)?impact.risques.map((risk:any)=>[asText(risk?.titre),asText(risk?.description)].filter(Boolean).join(" — ")).filter(Boolean):[];
  let opportunities=Array.isArray(impact.opportunites)?impact.opportunites.map((opportunity:any)=>[asText(opportunity?.titre),asText(opportunity?.description)].filter(Boolean).join(" — ")).filter(Boolean):[];
  let deadlines=Array.isArray(impact.echeances)?impact.echeances.map((deadline:any)=>[asText(deadline?.date),asText(deadline?.evenement),asText(deadline?.importance)].filter(Boolean).join(" — ")).filter(Boolean):[];
  let recommendations=Array.isArray(impact.recommandations)?impact.recommandations.map((recommendation:any)=>[asText(recommendation?.action),asText(recommendation?.raison)].filter(Boolean).join(" — ")).filter(Boolean):[];
  const limits=depth==="express"?{risks:3,opps:2,deadlines:2,recs:3,disp:3}:depth==="deep"?{risks:5,opps:4,deadlines:4,recs:6,disp:5}:{risks:5,opps:4,deadlines:4,recs:6,disp:6};risks=risks.slice(0,limits.risks);opportunities=opportunities.slice(0,limits.opps);deadlines=deadlines.slice(0,limits.deadlines);recommendations=recommendations.slice(0,limits.recs);
  const scoreJustifications=impact.score_justifications||{};const score_evidence:Partial<Record<ScoreKey,StructuredEvidence|null>>={};
  for(const key of SCORE_KEYS){const claim=asText(scoreJustifications[key])||asText(impact.justification_score);const official=findStructuredEvidence(claim,official_candidates,.34);const dossierEvidence=["economique_operationnel","politique_reputation","capacite_action"].includes(key)?findStructuredEvidence(claim,dossier_candidates,.38):null;score_evidence[key]=key==="capacite_action"&&dossierEvidence?dossierEvidence:official&&dossierEvidence?(official.confidence>=dossierEvidence.confidence?official:dossierEvidence):(official||dossierEvidence);}
  const dispositions=Array.isArray(impact.dispositions_concernees)?impact.dispositions_concernees.slice(0,limits.disp).map((item:any)=>{const disposition=asText(item?.disposition),impact_client=asText(item?.impact_client);return{disposition,impact_client,niveau:asText(item?.niveau)||"moyen",evidence:findStructuredEvidence(`${disposition} ${impact_client}`,official_candidates,.32)};}).filter((item:any)=>item.disposition||item.impact_client):[];
  const preliminaryStats={score_verified:Object.values(score_evidence).filter(Boolean).length,dispositions_verified:dispositions.filter((item:any)=>item.evidence).length};
  const deterministic=scoreImpactDeterministically({proposed:impact.score_detail,officialSourcesFetched:prepared.official_sources_fetched,officialSourcesRequested:prepared.official_sources_requested,evidenceByScore:score_evidence,dispositionsTotal:dispositions.length,dispositionsVerified:preliminaryStats.dispositions_verified,dossierProfileFields:profile.fields,corpusText:prepared.source_text,deadlines,watchUrgencies:items.map(item=>item.urgency||""),recommendations});
  const coverage=assessImpactCoverage({officialSourcesFetched:prepared.official_sources_fetched,officialSourcesRequested:prepared.official_sources_requested,scoreVerified:preliminaryStats.score_verified,dispositionsVerified:preliminaryStats.dispositions_verified,dispositionsTotal:dispositions.length});
  return{title:`Note d’impact ${depthConfig[depth].label.toLowerCase()} — ${dossier.title}`,executive_summary:asText(impact.synthese),score:deterministic.score,score_proposed:Object.values(impact.score_detail||{}).reduce((sum:number,value:any)=>sum+(Number(value)||0),0),impact_level:deterministic.impact_level,urgency_level:deterministic.urgency_level,level:deterministic.impact_level,rationale:asText(impact.justification_score),risks,opportunities,deadlines,recommendations,sources_used:items.map((item,index)=>({title:item.title,...prepared.traces[index]})),score_detail:deterministic.detail,score_detail_proposed:impact.score_detail,score_adjustments:deterministic.adjustments,score_justifications:scoreJustifications,score_evidence,dispositions_concernees:dispositions,informations_a_confirmer:Array.isArray(impact.informations_a_confirmer)?impact.informations_a_confirmer:[],quality:{...coverage,status:coverage.status,label:qualityLabel(coverage.status)},section_kinds:{risks:"inference",opportunities:"inference",deadlines:"fact_or_estimate",recommendations:"recommendation"},depth,evidence_labels:Object.fromEntries(SCORE_KEYS.map(key=>[key,evidenceLabel(score_evidence[key])]))};
}

function finalizeImpact(prepared:PreparedImpact,payload:any,executionMode:string){
  if(!payload?.impact)throw new ImpactError("La fonction impact-analysis n’a pas retourné une Note exploitable.",502);
  const note=mapImpactToNote(payload.impact,prepared);const analysisId=randomUUID();const generatedAt=new Date().toISOString();const stats=evidenceStats(note);
  const audit={analysis_id:analysisId,generated_at:generatedAt,prompt_version:payload?.prompt_version||IMPACT_PROMPT_VERSION,engine_version:payload?.engine||"supabase-impact-analysis-unknown",model:payload?.model||"unknown",scoring_version:IMPACT_SCORING_VERSION,evidence_version:IMPACT_EVIDENCE_VERSION,history_version:IMPACT_HISTORY_VERSION,include_internal_notes:prepared.include_internal_notes,dossier_snapshot:{id:prepared.dossier.id,client:prepared.dossier.client,title:prepared.dossier.title,objective:prepared.dossier.objective,context:prepared.dossier.context||"",strategic_profile_fields:prepared.profile.fields,strategic_profile_text:prepared.profile.text},selection:prepared.selection,source_snapshots:prepared.source_snapshots,corpus_hash:sha256(prepared.source_text),corpus_snapshot:prepared.source_text,ai_execution_ms:payload?.execution_ms||null,ai_latency_budget_ms:payload?.latency_budget_ms||null};
  const grounding={official_sources_requested:prepared.official_sources_requested,official_sources_fetched:prepared.official_sources_fetched,statuses:prepared.traces,strategic_profile_used:prepared.profile.fields.length>0,strategic_profile_fields:prepared.profile.fields,execution_mode:executionMode,corpus_budget_chars:prepared.corpus_budget_chars,corpus_used_chars:prepared.corpus_used_chars,evidence:stats,quality:note.quality,selection:prepared.selection};
  return{note,engine:payload?.engine||"supabase-impact-analysis",model:payload?.model||"unknown",depth:prepared.depth,grounding,audit,selection:prepared.selection};
}

async function invokeImpact(prepared:PreparedImpact,authorization:string){const{url,anonKey}=supabaseConfig();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),depthConfig[prepared.depth].timeoutMs);try{const response=await fetch(`${url}/functions/v1/impact-analysis`,{method:"POST",headers:{Authorization:authorization,apikey:anonKey,"Content-Type":"application/json"},body:JSON.stringify(prepared.invoke_body),signal:controller.signal});const payload=await readJson(response);if(!response.ok)throw new ImpactError(payload?.error||`La fonction impact-analysis a échoué (${response.status}).`,response.status>=400&&response.status<600?response.status:502);return payload;}catch(error:any){if(error?.name==="AbortError")throw new ImpactError("L’analyse dépasse le temps de réponse disponible.",504);throw error;}finally{clearTimeout(timer);}}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>null);const authorization=request.headers.get("authorization")||"";await verifySession(authorization);
    if(body?.phase==="prepare"){const prepared=await prepareImpact(body);return NextResponse.json({prepared});}
    if(body?.phase==="finalize"){const prepared=body?.prepared;validatePrepared(prepared);const result=finalizeImpact(prepared,body?.payload,"split_supabase_direct");return NextResponse.json(result);}
    const prepared=await prepareImpact(body);if(prepared.depth==="deep")return NextResponse.json({error:"Le mode Approfondi utilise désormais le pipeline long Supabase."},{status:409});const payload=await invokeImpact(prepared,authorization);return NextResponse.json(finalizeImpact(prepared,payload,"synchronous_relevance_ranked"));
  }catch(error:any){const status=error instanceof ImpactError?error.status:500;return NextResponse.json({error:error?.message||"Erreur interne pendant la Note d’impact."},{status});}
}