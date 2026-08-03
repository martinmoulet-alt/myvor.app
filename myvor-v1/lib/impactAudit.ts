import {parseExplicitImpactDate} from "./impactDeadline";

export type ScoreKey="juridique"|"economique_operationnel"|"urgence"|"probabilite"|"politique_reputation"|"capacite_action";
export type ScoreDetail=Record<ScoreKey,number>;
export type ScoreJustifications=Record<ScoreKey,string>;
export type ImpactQualityStatus="insufficient_sources"|"draft"|"review_required"|"validated";
export type ImpactLevel="faible"|"moyen"|"fort"|"critique";
export type UrgencyLevel="faible"|"a_surveille"|"urgente"|"immediate";

export const SCORE_MAX:ScoreDetail={juridique:20,economique_operationnel:20,urgence:15,probabilite:15,politique_reputation:15,capacite_action:15};
export const SCORE_KEYS=Object.keys(SCORE_MAX) as ScoreKey[];
export const IMPACT_PROMPT_VERSION="impact-prompt-v3";
export const IMPACT_SCORING_VERSION="impact-score-v1";
export const IMPACT_EVIDENCE_VERSION="impact-evidence-v2";
export const IMPACT_HISTORY_VERSION="impact-history-v1";

export type ImpactValidationResult={valid:boolean;errors:string[]};
function isRecord(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value);}
function cleanText(value:unknown){return typeof value==="string"?value.trim():"";}
function clamp(value:unknown,max:number){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,Math.round(n))):0;}

export function validateImpactPayload(raw:unknown):ImpactValidationResult{
  const errors:string[]=[];
  if(!isRecord(raw))return{valid:false,errors:["Réponse d’impact absente ou invalide."]};
  if(cleanText(raw.synthese).length<30)errors.push("La synthèse exécutive est absente ou trop courte.");
  if(!isRecord(raw.score_detail))errors.push("La décomposition du score est absente.");
  if(!isRecord(raw.score_justifications))errors.push("Les justifications du score sont absentes.");
  for(const key of SCORE_KEYS){
    const value=isRecord(raw.score_detail)?raw.score_detail[key]:undefined;
    if(!Number.isFinite(Number(value)))errors.push(`Le sous-score ${key} est absent.`);
    const justification=isRecord(raw.score_justifications)?cleanText(raw.score_justifications[key]):"";
    if(justification.length<12)errors.push(`La justification ${key} est absente ou trop courte.`);
  }
  return{valid:errors.length===0,errors};
}

export function normalizeProposedScores(value:unknown):ScoreDetail{
  const raw=isRecord(value)?value:{};
  return{juridique:clamp(raw.juridique,20),economique_operationnel:clamp(raw.economique_operationnel,20),urgence:clamp(raw.urgence,15),probabilite:clamp(raw.probabilite,15),politique_reputation:clamp(raw.politique_reputation,15),capacite_action:clamp(raw.capacite_action,15)};
}
export function impactLevel(score:number):ImpactLevel{if(score>=80)return"critique";if(score>=60)return"fort";if(score>=35)return"moyen";return"faible";}
export function daysUntil(dateIso:string,now=new Date()):number|null{const match=String(dateIso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;const target=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());return Math.ceil((target-today)/86400000);}
export function nearestFutureDeadline(deadlines:string[],now=new Date()):{iso:string;days:number}|null{return(Array.isArray(deadlines)?deadlines:[]).map(raw=>parseExplicitImpactDate(String(raw||""))).filter((iso):iso is string=>!!iso).map(iso=>({iso,days:daysUntil(iso,now)})).filter((item):item is {iso:string;days:number}=>item.days!==null&&item.days>=0).sort((a,b)=>a.days-b.days)[0]||null;}
function containsAny(text:string,needles:string[]){const normalized=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();return needles.some(needle=>normalized.includes(needle));}

export type DeterministicScoreInput={proposed:unknown;officialSourcesFetched:number;officialSourcesRequested:number;evidenceByScore?:Partial<Record<ScoreKey,unknown>>;dispositionsTotal:number;dispositionsVerified:number;dossierProfileFields?:string[];corpusText?:string;deadlines?:string[];watchUrgencies?:string[];recommendations?:string[];now?:Date};
export type ScoreAdjustment={key:ScoreKey;proposed:number;final:number;cap:number;reason:string};
export type DeterministicScoreResult={detail:ScoreDetail;score:number;impact_level:ImpactLevel;urgency_level:UrgencyLevel;nearest_deadline:{iso:string;days:number}|null;adjustments:ScoreAdjustment[]};
export function urgencyLevel(urgencyScore:number,nearest:{days:number}|null):UrgencyLevel{if((nearest&&nearest.days<=7)||urgencyScore>=13)return"immediate";if((nearest&&nearest.days<=30)||urgencyScore>=10)return"urgente";if(urgencyScore>=6)return"a_surveille";return"faible";}

export function scoreImpactDeterministically(input:DeterministicScoreInput):DeterministicScoreResult{
  const proposed=normalizeProposedScores(input.proposed);const evidence=input.evidenceByScore||{};const profile=new Set(Array.isArray(input.dossierProfileFields)?input.dossierProfileFields:[]);const corpus=String(input.corpusText||"");const deadlines=Array.isArray(input.deadlines)?input.deadlines:[];const nearest=nearestFutureDeadline(deadlines,input.now||new Date());const urgencies=(input.watchUrgencies||[]).map(value=>String(value||"").toLowerCase());const fetched=Math.max(0,Number(input.officialSourcesFetched)||0);const adjustments:ScoreAdjustment[]=[];
  const legalEvidence=!!evidence.juridique;const legalCap=fetched===0?0:legalEvidence?20:input.dispositionsVerified>0?12:8;
  const economicProfile=["sector","activity","strategic_issues","risks_to_avoid","opportunities","client_position"].some(key=>profile.has(key));const economicEvidence=!!evidence.economique_operationnel;const economicCap=economicProfile&&economicEvidence?20:economicProfile||economicEvidence?14:6;
  let urgencyCap=3;if(fetched===0)urgencyCap=3;else if(nearest){if(nearest.days<=14)urgencyCap=15;else if(nearest.days<=45)urgencyCap=13;else if(nearest.days<=90)urgencyCap=11;else if(nearest.days<=180)urgencyCap=9;else urgencyCap=8;}else if(urgencies.includes("absolument urgent"))urgencyCap=9;else if(urgencies.includes("fort"))urgencyCap=7;else if(urgencies.includes("moyen"))urgencyCap=5;
  let probabilityCap=6;if(fetched===0)probabilityCap=3;else if(containsAny(corpus,["adopte definitivement","promulgue","journal officiel","entre en vigueur"]))probabilityCap=15;else if(containsAny(corpus,["accord provisoire","trilogue","texte adopte","adopte par"]))probabilityCap=14;else if(containsAny(corpus,["seance publique","commission mixte paritaire","vote solennel","vote final"]))probabilityCap=12;else if(containsAny(corpus,["examen en commission","amendement","commission des lois","commission des affaires"]))probabilityCap=10;else if(containsAny(corpus,["proposition de loi","projet de loi","consultation publique","avis du conseil"]))probabilityCap=8;
  const politicalProfile=["client_position","risks_to_avoid","key_actors","strategic_issues"].some(key=>profile.has(key));const politicalEvidence=!!evidence.politique_reputation;const politicalCap=politicalProfile&&politicalEvidence?15:politicalProfile||politicalEvidence?11:6;
  const actionSignals=[profile.has("client_position"),profile.has("key_actors"),profile.has("key_deadlines"),profile.has("opportunities"),(input.recommendations||[]).length>0].filter(Boolean).length;const actionCap=actionSignals>=4?15:actionSignals===3?12:actionSignals===2?9:actionSignals===1?6:3;
  const caps:Record<ScoreKey,{cap:number;reason:string}>={juridique:{cap:legalCap,reason:fetched===0?"Aucune source officielle lue.":legalEvidence?"Preuve juridique structurée retrouvée.":input.dispositionsVerified>0?"Disposition vérifiée mais justification juridique non directement étayée.":"Aucune preuve juridique suffisamment précise."},economique_operationnel:{cap:economicCap,reason:economicProfile&&economicEvidence?"Contexte client et preuve disponibles.":economicProfile||economicEvidence?"Une seule couche de preuve disponible.":"Contexte économique et preuve insuffisants."},urgence:{cap:urgencyCap,reason:nearest?`Échéance explicite dans ${nearest.days} jour(s).`:"Aucune échéance calendaire explicite exploitable."},probabilite:{cap:probabilityCap,reason:fetched===0?"Aucune source officielle lue.":`Stade institutionnel détecté dans le corpus, plafond ${probabilityCap}/15.`},politique_reputation:{cap:politicalCap,reason:politicalProfile&&politicalEvidence?"Contexte politique client et preuve disponibles.":politicalProfile||politicalEvidence?"Une seule couche de preuve disponible.":"Contexte politique et preuve insuffisants."},capacite_action:{cap:actionCap,reason:`${actionSignals} signal(aux) opérationnel(s) exploitable(s) dans le dossier.`}};
  const detail={} as ScoreDetail;for(const key of SCORE_KEYS){const cap=Math.min(SCORE_MAX[key],caps[key].cap);const final=Math.min(proposed[key],cap);detail[key]=final;if(final!==proposed[key])adjustments.push({key,proposed:proposed[key],final,cap,reason:caps[key].reason});}const score=SCORE_KEYS.reduce((sum,key)=>sum+detail[key],0);return{detail,score,impact_level:impactLevel(score),urgency_level:urgencyLevel(detail.urgence,nearest),nearest_deadline:nearest,adjustments};
}

export type CoverageInput={officialSourcesFetched:number;officialSourcesRequested:number;scoreVerified:number;scoreTotal?:number;dispositionsVerified:number;dispositionsTotal:number};
export type CoverageResult={status:Exclude<ImpactQualityStatus,"validated">;can_validate:boolean;source_coverage:number;score_evidence_coverage:number;disposition_coverage:number;overall_coverage:number;reasons:string[]};
function ratio(value:number,total:number,emptyValue=0){if(total<=0)return emptyValue;return Math.max(0,Math.min(1,value/total));}
export function assessImpactCoverage(input:CoverageInput):CoverageResult{const scoreTotal=input.scoreTotal||6;const source=ratio(input.officialSourcesFetched,input.officialSourcesRequested,0);const score=ratio(input.scoreVerified,scoreTotal,0);const dispositions=ratio(input.dispositionsVerified,input.dispositionsTotal,1);const overall=Math.round((source*.45+score*.4+dispositions*.15)*100)/100;const reasons:string[]=[];let status:CoverageResult["status"]="review_required";if(input.officialSourcesFetched<=0){status="insufficient_sources";reasons.push("Aucune source officielle n’a été effectivement lue.");}else if(input.scoreVerified<4||overall<.55){status="draft";if(input.scoreVerified<4)reasons.push("Moins de quatre sous-scores disposent d’une preuve exploitable.");if(overall<.55)reasons.push("La couverture globale est inférieure au seuil de 55 %.");}else reasons.push("Couverture suffisante pour une revue humaine.");return{status,can_validate:status==="review_required",source_coverage:source,score_evidence_coverage:score,disposition_coverage:dispositions,overall_coverage:overall,reasons};}
export function requireAccessToken(session:unknown):string{const token=isRecord(session)&&typeof session.access_token==="string"?session.access_token.trim():"";if(!token)throw new Error("Session Myvor absente ou expirée. Reconnecte-toi puis réessaie.");return token;}
export function qualityLabel(status:ImpactQualityStatus){if(status==="validated")return"Note validée et partageable";if(status==="review_required")return"Brouillon analysé — validation humaine requise";if(status==="draft")return"Brouillon insuffisamment étayé";return"Analyse insuffisamment sourcée";}
