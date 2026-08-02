import { NextResponse } from "next/server";

type WatchItem={id:string;title:string;nature?:string;source_url?:string;excerpt?:string};
type Dossier={id:string;title:string;objective?:string;context?:string;client?:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type Assignment={watch_id:string;dossier_id:string|null;confidence:number;reason:string};
type ScoreResult={score:number;matches:string[];priorityMatches:string[];blockedBy:string|null;explicitKeywords:boolean;leadMatches:string[];leadPriorityMatches:string[]};

const STOP_WORDS=new Set(["a","au","aux","avec","ce","ces","dans","de","des","du","elle","en","et","eux","il","je","la","le","les","leur","lui","ma","mais","me","meme","mes","moi","mon","ne","nos","notre","nous","on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu","un","une","vos","votre","vous","d","l","y","texte","obtenir","modification","favorable","reforme","projet","proposition","objectif","client","dossier","action","impact","enjeu","enjeux","suivi","veille","mesure","mesures","nouveau","nouvelle","relatif","relative","concernant"]);
const OFFICIAL_HOSTS=["assemblee-nationale.fr","senat.fr","legifrance.gouv.fr","vie-publique.fr","economie.gouv.fr","ecologie.gouv.fr","tresor.economie.gouv.fr","conseil-etat.fr","conseil-constitutionnel.fr","qpc360.conseil-constitutionnel.fr","ccomptes.fr","cnil.fr","arcep.fr","eur-lex.europa.eu"];
const MAX_READABLE_TEXT=200_000;
const GENERIC_NAV_TITLES=["accueil","particuliers","professionnels","entreprises","associations","vie associative","être informé","etre informe","accéder à la rubrique","acceder a la rubrique","actualités et communiqués","actualites et communiques","actualités","actualites","communiqués","communiques","agenda et événements","agenda et evenements","agenda","événements","evenements","les publications","publications","les prises de parole","prises de parole","le post la newsletter mensuelle","newsletter","quels sont mes droits","achats et publicité","achats et publicite","banque assurance","les pratiques numériques des français","les pratiques numeriques des francais","auditions devant le parlement","les auditions devant le parlement"];

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isGenericNavigationTitle(value:string){const t=normalize(value);return !t||GENERIC_NAV_TITLES.some(entry=>t===normalize(entry));}
function stemWord(word:string){const stripped=word.replace(/(issements?|ements?|ations?|itions?|iques?|istes?|ismes?|teurs?|trices?|eurs?|euses?|ites?|ives?|ifs?|aux|ales?|elles?|ments?|es|s)$/i,"");return stripped.length>=4?stripped:word;}
function keywords(value:string){const out:string[]=[];for(const raw of normalize(value).split(/\s+/)){if(raw.length<4||STOP_WORDS.has(raw)||/^\d+$/.test(raw))continue;const candidate=stemWord(raw);if(candidate.length>=4&&!STOP_WORDS.has(candidate))out.push(candidate);}return [...new Set(out)];}
function cleanedList(value:unknown){return Array.isArray(value)?value.map(v=>String(v||"").trim()).filter(Boolean):[];}
function containsPhrase(normalizedText:string,phrase:string){const needle=normalize(phrase);return !!needle&&` ${normalizedText} `.includes(` ${needle} `);}
function matchKeyword(itemWords:Set<string>,word:string){if(itemWords.has(word))return 1;if(word.length<5)return 0;for(const itemWord of itemWords){if(itemWord.length>=5&&(itemWord.startsWith(word)||word.startsWith(itemWord)))return 0.8;}return 0;}
function decodeEntities(value:string){const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",laquo:"«",raquo:"»",ndash:"–",mdash:"—",hellip:"…",eacute:"é",egrave:"è",ecirc:"ê",agrave:"à",ccedil:"ç",ocirc:"ô",ugrave:"ù",rsquo:"’",lsquo:"‘",ldquo:"“",rdquo:"”"};return value.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,raw:string)=>{const code=raw.toLowerCase().startsWith("x")?parseInt(raw.slice(1),16):parseInt(raw,10);try{return Number.isFinite(code)?String.fromCodePoint(code):_;}catch{return _;}}).replace(/&([a-z][a-z0-9]+);/gi,(whole,name:string)=>named[name.toLowerCase()]??whole);}
function stripNoise(value:string){return value.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<svg\b[\s\S]*?<\/svg>/gi," ").replace(/<nav\b[\s\S]*?<\/nav>/gi," ").replace(/<footer\b[\s\S]*?<\/footer>/gi," ").replace(/<header\b[\s\S]*?<\/header>/gi," ").replace(/<aside\b[\s\S]*?<\/aside>/gi," ").replace(/<form\b[\s\S]*?<\/form>/gi," ");}
function cleanHtml(value:string){return decodeEntities(stripNoise(value)).replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/(?:p|div|section|article|li|h[1-6]|tr)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim();}
function isOfficialUrl(value:string){try{const host=new URL(value).hostname.toLowerCase().replace(/^www\./,"");return OFFICIAL_HOSTS.some(allowed=>host===allowed||host.endsWith(`.${allowed}`));}catch{return false;}}
function metaDescription(html:string){const patterns=[/<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i,/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*>/i];for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return cleanHtml(match[1]);}return "";}
function readableBody(html:string){const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];if(main)return cleanHtml(main).slice(0,MAX_READABLE_TEXT);const articles=[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(match=>match[1]);if(articles.length)return cleanHtml(articles.join("\n")).slice(0,MAX_READABLE_TEXT);const body=html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||html;return cleanHtml(body).slice(0,MAX_READABLE_TEXT);}
async function fetchOfficialText(url:string){if(!url||!isOfficialUrl(url))return {full:"",lead:""};const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);try{const response=await fetch(url,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 Myvor/4.1","Accept":"text/html,application/xhtml+xml,*/*","Accept-Language":"fr-FR,fr;q=0.9"},signal:controller.signal,cache:"no-store"});if(!response.ok)return {full:"",lead:""};const contentType=response.headers.get("content-type")||"";if(!/text\/html|application\/xhtml\+xml/i.test(contentType))return {full:"",lead:""};const html=await response.text();const meta=metaDescription(html);const body=readableBody(html);const full=[meta,body].filter(Boolean).join("\n").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim().slice(0,MAX_READABLE_TEXT);const lead=[meta,body.slice(0,1800)].filter(Boolean).join(" ").slice(0,2400);return {full,lead};}catch{return {full:"",lead:""};}finally{clearTimeout(timer);}}
async function enrichItems(items:WatchItem[]){return Promise.all(items.map(async item=>{const existing=String(item.excerpt||"").trim();const fetched=await fetchOfficialText(String(item.source_url||""));return{...item,excerpt:[fetched.full,existing].filter(Boolean).join("\n").slice(0,MAX_READABLE_TEXT),_fullTextChars:fetched.full.length,_lead:fetched.lead||existing.slice(0,1800)};}));}

function keywordScore(item:WatchItem,dossier:Dossier):ScoreResult{
  const normalizedItem=normalize(`${item.title} ${item.nature||""} ${item.excerpt||""}`);
  const normalizedLead=normalize(`${item.title} ${item.nature||""} ${(item as any)._lead||""}`);
  const itemWords=new Set(keywords(normalizedItem));
  const leadWords=new Set(keywords(normalizedLead));
  const excluded=cleanedList(dossier.watch_excluded_keywords);
  const blockedBy=excluded.find(term=>containsPhrase(normalizedItem,term))||null;
  const explicitKeywords=cleanedList(dossier.watch_keywords);
  if(blockedBy)return{score:0,matches:[],priorityMatches:[],blockedBy,explicitKeywords:explicitKeywords.length>0,leadMatches:[],leadPriorityMatches:[]};
  const priorityPhrases=cleanedList(dossier.watch_priority_phrases);
  const priorityMatches=priorityPhrases.filter(phrase=>containsPhrase(normalizedItem,phrase));
  const leadPriorityMatches=priorityPhrases.filter(phrase=>containsPhrase(normalizedLead,phrase));
  const hasExplicitKeywords=explicitKeywords.length>0;
  const dossierWords=hasExplicitKeywords?[...new Set(explicitKeywords.flatMap(value=>keywords(value)))]:keywords(`${dossier.title} ${dossier.objective||""} ${dossier.context||""}`);
  let points=0;const matches:string[]=[];const leadMatches:string[]=[];
  for(const word of dossierWords){const value=matchKeyword(itemWords,word);if(value>0){points+=value;matches.push(word);}if(matchKeyword(leadWords,word)>0)leadMatches.push(word);}
  const uniqueMatches=[...new Set(matches)];
  const uniqueLeadMatches=[...new Set(leadMatches)];
  let score=0;
  if(priorityMatches.length>=2)score=0.99;else if(priorityMatches.length===1)score=0.97;else if(hasExplicitKeywords&&uniqueMatches.length>=4)score=0.99;else if(hasExplicitKeywords&&uniqueMatches.length===3)score=0.96;else if(hasExplicitKeywords&&uniqueMatches.length===2)score=0.92;else if(hasExplicitKeywords&&uniqueMatches.length===1)score=0.66;else if(uniqueMatches.length>=4)score=0.98;else if(uniqueMatches.length===3)score=0.94;else if(uniqueMatches.length===2)score=0.82;else if(uniqueMatches.length===1)score=0.62;
  if(points>=3.5)score=Math.max(score,hasExplicitKeywords?0.97:0.96);
  const hasLeadSignal=uniqueLeadMatches.length>0||leadPriorityMatches.length>0;
  if(score>=0.75&&!hasLeadSignal)score=0.74;
  return{score,matches:uniqueMatches.slice(0,8),priorityMatches:priorityMatches.slice(0,4),blockedBy:null,explicitKeywords:hasExplicitKeywords,leadMatches:uniqueLeadMatches.slice(0,6),leadPriorityMatches:leadPriorityMatches.slice(0,3)};
}

function keywordAssignments(items:WatchItem[],dossiers:Dossier[]):Assignment[]{return items.map(item=>{
  if(isGenericNavigationTitle(item.title))return{watch_id:item.id,dossier_id:null,confidence:0,reason:"Page générique de navigation détectée : aucun rattachement automatique."};
  const ranked=dossiers.map(dossier=>({dossier,...keywordScore(item,dossier)})).sort((a,b)=>b.score-a.score);const best=ranked[0];const second=ranked[1];if(!best||best.score<0.55){const blocked=ranked.find(result=>result.blockedBy);return{watch_id:item.id,dossier_id:null,confidence:0,reason:blocked?`Exclusion détectée : ${blocked.blockedBy}.`:"Aucun mot-clé suffisamment pertinent détecté dans le texte officiel complet."};}let confidence=best.score;if(second&&second.score>=0.55&&(best.score-second.score)<0.12)confidence=Math.min(confidence,0.88);const details=[best.priorityMatches.length?`Expression prioritaire : ${best.priorityMatches.join(", ")}.`:"",best.matches.length?`${best.explicitKeywords?"Mots-clés explicites":"Mots-clés détectés"} : ${best.matches.join(", ")}.`:"",best.leadMatches.length||best.leadPriorityMatches.length?`Signal de tête confirmé.`:`Signal absent du titre/résumé : validation manuelle requise.`].filter(Boolean).join(" ");return{watch_id:item.id,dossier_id:best.dossier.id,confidence:Number(confidence.toFixed(2)),reason:`${details||`Correspondance avec ${best.dossier.title}.`} Analyse du texte officiel complet.`};});}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const rawItems:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,24):[];
  const dossiers:Dossier[]=Array.isArray(body?.dossiers)?body.dossiers.slice(0,50):[];
  if(!rawItems.length||!dossiers.length)return NextResponse.json({assignments:[],engine:"myvor-relevance-guard-v5",enriched:0,full_text_chars:0});
  const items=await enrichItems(rawItems);
  const allowedDossierIds=new Set(dossiers.map(d=>d.id));
  const allowedWatchIds=new Set(items.map(i=>i.id));
  const assignments=keywordAssignments(items,dossiers).filter(a=>allowedWatchIds.has(a.watch_id)).map(a=>({...a,dossier_id:a.dossier_id&&allowedDossierIds.has(a.dossier_id)?a.dossier_id:null,confidence:Math.max(0,Math.min(1,a.confidence)),reason:a.reason.slice(0,320)}));
  const enriched=items.filter(i=>Number((i as any)._fullTextChars)>0).length;
  const fullTextChars=items.reduce((sum,i)=>sum+Number((i as any)._fullTextChars||0),0);
  return NextResponse.json({assignments,engine:"myvor-relevance-guard-v5",enriched,full_text_chars:fullTextChars});
}
