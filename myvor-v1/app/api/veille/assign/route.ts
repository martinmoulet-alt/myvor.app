import {NextResponse} from "next/server";

type WatchItem={id:string;title:string;nature?:string;source_url?:string;excerpt?:string};
type Dossier={id:string;title:string;objective?:string;context?:string;client?:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type Assignment={watch_id:string;dossier_id:string|null;confidence:number;reason:string};
type ScoreResult={score:number;matches:string[];priorityMatches:string[];phraseMatches:string[];blockedBy:string|null;anchors:string[]};

const MIN_ACTIONABLE_CONFIDENCE=.90;
const MAX_READABLE_TEXT=200_000;
const STOP_WORDS=new Set(["a","au","aux","avec","ce","ces","dans","de","des","du","elle","en","et","eux","il","je","la","le","les","leur","lui","ma","mais","me","meme","mes","moi","mon","ne","nos","notre","nous","on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu","un","une","vos","votre","vous","d","l","y","texte","obtenir","modification","favorable","reforme","projet","proposition","objectif","client","dossier","action","impact","enjeu","enjeux","suivi","veille","mesure","mesures","nouveau","nouvelle","relatif","relative","concernant"]);
const WEAK_ANCHORS=new Set(["article","commerci","profession","entrepri","consomma","service","information","droit","regle","modal","public","activit"]);
const OFFICIAL_HOSTS=["assemblee-nationale.fr","senat.fr","legifrance.gouv.fr","vie-publique.fr","economie.gouv.fr","ecologie.gouv.fr","tresor.economie.gouv.fr","conseil-etat.fr","conseil-constitutionnel.fr","qpc360.conseil-constitutionnel.fr","ccomptes.fr","cnil.fr","arcep.fr","cre.fr","amf-france.org","autoritedelaconcurrence.fr","eur-lex.europa.eu"];
const GENERIC_NAV_TITLES=["accueil","particuliers","professionnels","entreprises","associations","vie associative","être informé","etre informe","accéder à la rubrique","acceder a la rubrique","actualités et communiqués","actualites et communiques","actualités","actualites","communiqués","communiques","agenda et événements","agenda et evenements","agenda","événements","evenements","les publications","publications","les prises de parole","prises de parole","le post la newsletter mensuelle","newsletter","quels sont mes droits","achats et publicité","achats et publicite","banque assurance","les pratiques numériques des français","les pratiques numeriques des francais","auditions devant le parlement","les auditions devant le parlement"];

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function stemWord(word:string){const stripped=word.replace(/(issements?|ements?|ations?|itions?|iques?|istes?|ismes?|teurs?|trices?|eurs?|euses?|ites?|ives?|ifs?|aux|ales?|elles?|ments?|es|s)$/i,"");return stripped.length>=4?stripped:word;}
function keywords(value:string){const out:string[]=[];for(const raw of normalize(value).split(/\s+/)){if(raw.length<4||STOP_WORDS.has(raw)||/^\d+$/.test(raw))continue;const candidate=stemWord(raw);if(candidate.length>=4&&!STOP_WORDS.has(candidate))out.push(candidate);}return [...new Set(out)];}
function cleanedList(value:unknown){return Array.isArray(value)?value.map(v=>String(v||"").trim()).filter(Boolean):[];}
function containsPhrase(normalizedText:string,phrase:string){const needle=normalize(phrase);return !!needle&&` ${normalizedText} `.includes(` ${needle} `);}
function matchKeyword(itemWords:Set<string>,word:string){if(itemWords.has(word))return true;if(word.length<5)return false;for(const itemWord of itemWords)if(itemWord.length>=5&&(itemWord.startsWith(word)||word.startsWith(itemWord)))return true;return false;}
function isGenericNavigationTitle(value:string){const title=normalize(value);return !title||GENERIC_NAV_TITLES.some(entry=>title===normalize(entry));}
function decodeEntities(value:string){const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",laquo:"«",raquo:"»",ndash:"–",mdash:"—",hellip:"…",eacute:"é",egrave:"è",ecirc:"ê",agrave:"à",ccedil:"ç",ocirc:"ô",ugrave:"ù",rsquo:"’",lsquo:"‘",ldquo:"“",rdquo:"”"};return value.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,raw:string)=>{const code=raw.toLowerCase().startsWith("x")?parseInt(raw.slice(1),16):parseInt(raw,10);try{return Number.isFinite(code)?String.fromCodePoint(code):_;}catch{return _;}}).replace(/&([a-z][a-z0-9]+);/gi,(whole,name:string)=>named[name.toLowerCase()]??whole);}
function stripNoise(value:string){return value.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi," ").replace(/<svg\b[\s\S]*?<\/svg>/gi," ").replace(/<nav\b[\s\S]*?<\/nav>/gi," ").replace(/<footer\b[\s\S]*?<\/footer>/gi," ").replace(/<header\b[\s\S]*?<\/header>/gi," ").replace(/<aside\b[\s\S]*?<\/aside>/gi," ").replace(/<form\b[\s\S]*?<\/form>/gi," ");}
function cleanHtml(value:string){return decodeEntities(stripNoise(value)).replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/(?:p|div|section|article|li|h[1-6]|tr)>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim();}
function isOfficialUrl(value:string){try{const host=new URL(value).hostname.toLowerCase().replace(/^www\./,"");return OFFICIAL_HOSTS.some(allowed=>host===allowed||host.endsWith(`.${allowed}`));}catch{return false;}}
function metaDescription(html:string){for(const pattern of [/<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i,/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*>/i]){const match=html.match(pattern);if(match?.[1])return cleanHtml(match[1]);}return "";}
function readableBody(html:string){const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];if(main)return cleanHtml(main).slice(0,MAX_READABLE_TEXT);const articles=[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(match=>match[1]);if(articles.length)return cleanHtml(articles.join("\n")).slice(0,MAX_READABLE_TEXT);return cleanHtml(html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||html).slice(0,MAX_READABLE_TEXT);}
async function fetchOfficialText(url:string){if(!url||!isOfficialUrl(url))return{full:"",lead:""};const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);try{const response=await fetch(url,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 Myvor/6.0","Accept":"text/html,application/xhtml+xml,*/*","Accept-Language":"fr-FR,fr;q=0.9"},signal:controller.signal,cache:"no-store"});if(!response.ok||!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type")||""))return{full:"",lead:""};const html=await response.text();const meta=metaDescription(html);const body=readableBody(html);return{full:[meta,body].filter(Boolean).join("\n").slice(0,MAX_READABLE_TEXT),lead:[meta,body.slice(0,1800)].filter(Boolean).join(" ").slice(0,2400)};}catch{return{full:"",lead:""};}finally{clearTimeout(timer);}}
async function enrichItems(items:WatchItem[]){return Promise.all(items.map(async item=>{const existing=String(item.excerpt||"").trim();const fetched=await fetchOfficialText(String(item.source_url||""));return{...item,excerpt:[fetched.full,existing].filter(Boolean).join("\n").slice(0,MAX_READABLE_TEXT),_fullTextChars:fetched.full.length,_lead:fetched.lead||existing.slice(0,1800)};}));}

function keywordScore(item:WatchItem,dossier:Dossier):ScoreResult{
  const normalizedFull=normalize(`${item.title} ${item.nature||""} ${item.excerpt||""}`);
  const normalizedLead=normalize(`${item.title} ${item.nature||""} ${(item as any)._lead||""}`);
  const normalizedTitle=normalize(`${item.title} ${item.nature||""}`);
  const fullWords=new Set(keywords(normalizedFull));
  const leadWords=new Set(keywords(normalizedLead));
  const titleWords=new Set(keywords(normalizedTitle));
  const excluded=cleanedList(dossier.watch_excluded_keywords);
  const blockedBy=excluded.find(term=>containsPhrase(normalizedFull,term))||null;
  if(blockedBy)return{score:0,matches:[],priorityMatches:[],phraseMatches:[],blockedBy,anchors:[]};

  const explicitKeywords=cleanedList(dossier.watch_keywords);
  const priorityPhrases=cleanedList(dossier.watch_priority_phrases);
  const priorityMatches=priorityPhrases.filter(phrase=>containsPhrase(normalizedLead,phrase));
  const phraseMatches=explicitKeywords.filter(phrase=>containsPhrase(normalizedLead,phrase));
  const bodyPriorityMatches=priorityPhrases.filter(phrase=>containsPhrase(normalizedFull,phrase));
  const bodyPhraseMatches=explicitKeywords.filter(phrase=>containsPhrase(normalizedFull,phrase));
  const anchors=[...new Set(keywords(`${dossier.title} ${priorityPhrases.join(" ")}`).filter(word=>!WEAK_ANCHORS.has(word)))];
  const titleAnchors=anchors.filter(word=>matchKeyword(titleWords,word));
  const leadAnchors=anchors.filter(word=>matchKeyword(leadWords,word));
  const explicitWords=[...new Set(explicitKeywords.flatMap(value=>keywords(value)).filter(word=>!WEAK_ANCHORS.has(word)))];
  const matches=explicitWords.filter(word=>matchKeyword(fullWords,word));

  let score=0;
  if(priorityMatches.length>=1)score=.99;
  else if(phraseMatches.length>=2)score=.98;
  else if(phraseMatches.length===1)score=.96;
  else if(titleAnchors.length>=2)score=.95;
  else if(titleAnchors.length===1&&leadAnchors.length>=2)score=.92;
  else if(titleAnchors.length===1)score=.76;
  else if(leadAnchors.length>=3)score=.90;
  else if(bodyPriorityMatches.length>=1)score=.84;
  else if(bodyPhraseMatches.length>=1)score=.80;
  else if(matches.length>=3)score=.74;
  else if(matches.length>=2)score=.68;
  else score=0;

  return{score,matches:matches.slice(0,8),priorityMatches:priorityMatches.slice(0,4),phraseMatches:phraseMatches.slice(0,4),blockedBy:null,anchors:[...new Set([...titleAnchors,...leadAnchors])].slice(0,8)};
}

function keywordAssignments(items:WatchItem[],dossiers:Dossier[]):Assignment[]{return items.map(item=>{
  if(isGenericNavigationTitle(item.title))return{watch_id:item.id,dossier_id:null,confidence:0,reason:"Page générique de navigation détectée : aucun rattachement."};
  const ranked=dossiers.map(dossier=>({dossier,...keywordScore(item,dossier)})).sort((a,b)=>b.score-a.score);
  const best=ranked[0];const second=ranked[1];
  if(!best||best.score<MIN_ACTIONABLE_CONFIDENCE){const blocked=ranked.find(result=>result.blockedBy);return{watch_id:item.id,dossier_id:null,confidence:Number((best?.score||0).toFixed(2)),reason:blocked?`Exclusion détectée : ${blocked.blockedBy}.`:`Pertinence insuffisamment discriminante (< ${Math.round(MIN_ACTIONABLE_CONFIDENCE*100)} %).`};}
  let confidence=best.score;if(second&&second.score>=MIN_ACTIONABLE_CONFIDENCE&&(best.score-second.score)<.08)confidence=Math.min(confidence,.89);
  if(confidence<MIN_ACTIONABLE_CONFIDENCE)return{watch_id:item.id,dossier_id:null,confidence:Number(confidence.toFixed(2)),reason:"Plusieurs dossiers sont trop proches : aucun rattachement proposé."};
  const evidence=[best.priorityMatches.length?`Expression prioritaire : ${best.priorityMatches.join(", ")}.`:"",best.phraseMatches.length?`Expression de veille : ${best.phraseMatches.join(", ")}.`:"",best.anchors.length?`Ancrages discriminants : ${best.anchors.join(", ")}.`:""].filter(Boolean).join(" ");
  return{watch_id:item.id,dossier_id:best.dossier.id,confidence:Number(confidence.toFixed(2)),reason:`${evidence||`Correspondance forte avec ${best.dossier.title}.`} Signal confirmé dans le titre ou le résumé.`};
});}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const rawItems:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,40):[];
  const dossiers:Dossier[]=Array.isArray(body?.dossiers)?body.dossiers.slice(0,50):[];
  if(!rawItems.length||!dossiers.length)return NextResponse.json({assignments:[],engine:"myvor-relevance-precision-v6",enriched:0,full_text_chars:0,threshold:MIN_ACTIONABLE_CONFIDENCE});
  const items=await enrichItems(rawItems);
  const allowedDossierIds=new Set(dossiers.map(d=>d.id));
  const allowedWatchIds=new Set(items.map(i=>i.id));
  const assignments=keywordAssignments(items,dossiers).filter(a=>allowedWatchIds.has(a.watch_id)).map(a=>({...a,dossier_id:a.dossier_id&&allowedDossierIds.has(a.dossier_id)?a.dossier_id:null,confidence:Math.max(0,Math.min(1,a.confidence)),reason:a.reason.slice(0,360)}));
  const enriched=items.filter(i=>Number((i as any)._fullTextChars)>0).length;
  const fullTextChars=items.reduce((sum,i)=>sum+Number((i as any)._fullTextChars||0),0);
  return NextResponse.json({assignments,engine:"myvor-relevance-precision-v6",enriched,full_text_chars:fullTextChars,threshold:MIN_ACTIONABLE_CONFIDENCE});
}
