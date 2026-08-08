import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Source = { name:string; url:string; defaultNature:string };
type FeedItem = { title:string; nature:string; source_url:string; source_name:string; published_at?:string; excerpt?:string };
type SourceResult = { name:string; items:FeedItem[]; error?:string };

const SOURCES: Source[] = [
  { name:"Assemblée nationale", url:"http://www2.assemblee-nationale.fr/feeds/detail/documents-parlementaires", defaultNature:"Texte parlementaire" },
  { name:"Sénat — Textes", url:"https://www.senat.fr/rss/textes.rss", defaultNature:"Texte parlementaire" },
  { name:"Sénat — Rapports", url:"https://www.senat.fr/rss/rapports.rss", defaultNature:"Rapport" },
  { name:"Économie — Actualités", url:"https://www.economie.gouv.fr/rss/toutesactualites", defaultNature:"Communiqué institutionnel" },
  { name:"Transition écologique — Actualités", url:"https://www.ecologie.gouv.fr/rss-actualites.xml", defaultNature:"Communiqué institutionnel" },
  { name:"Transition écologique — Presse", url:"https://www.ecologie.gouv.fr/rss-presse.xml", defaultNature:"Communiqué institutionnel" },
  { name:"Direction générale du Trésor", url:"https://www.tresor.economie.gouv.fr/Flux/Atom/Articles/Home", defaultNature:"Communiqué institutionnel" },
  { name:"Conseil d’État — Avis", url:"https://conseil-etat.fr/outils/flux-rss/avis-rss", defaultNature:"Avis consultatif" },
  { name:"Conseil d’État — Jurisprudence", url:"https://conseil-etat.fr/outils/flux-rss/analyses-de-jurisprudence-rss", defaultNature:"Décision / jurisprudence" },
  { name:"Cour des comptes — Publications", url:"https://www.ccomptes.fr/rss/publications", defaultNature:"Rapport" },
];

const WINDOWS_1252_BYTES:Record<number,number>={
  0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
  0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,
  0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,
  0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f,
};

const GENERIC_NAV_TITLES=[
  "accueil","particuliers","professionnels","entreprises","associations","vie associative","être informé","etre informe",
  "accéder à la rubrique","acceder a la rubrique","actualités et communiqués","actualites et communiques","actualités","actualites",
  "communiqués","communiques","agenda et événements","agenda et evenements","agenda","événements","evenements",
  "les publications","publications","les prises de parole","prises de parole","le post, la newsletter mensuelle","newsletter",
  "quels sont mes droits ?","quels sont mes droits","achats et publicité","achats et publicite","banque/assurance","banque assurance",
  "les pratiques numériques des français","les pratiques numeriques des francais","auditions devant le parlement","les auditions devant le parlement"
];

const MONTHS:Record<string,number>={janvier:0,"février":1,fevrier:1,mars:2,avril:3,mai:4,juin:5,juillet:6,"août":7,aout:7,septembre:8,octobre:9,novembre:10,"décembre":11,decembre:11};

function normalizeTitle(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[’']/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isGenericNavigationTitle(value:string){const t=normalizeTitle(value);if(!t)return true;return GENERIC_NAV_TITLES.some(entry=>t===normalizeTitle(entry));}
function corruptionScore(value:string){return (value.match(/Ã|Â|â€|â€™|â€œ|â€|â€“|â€”|â€¦|ðŸ|�/g)||[]).length;}
function repairMojibake(value:string){if(!/[ÃÂâð�]/.test(value))return value;try{const bytes:number[]=[];for(const char of value){const code=char.codePointAt(0)!;if(code<=0xff)bytes.push(code);else if(WINDOWS_1252_BYTES[code]!==undefined)bytes.push(WINDOWS_1252_BYTES[code]);else return value;}const repaired=new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(bytes));return corruptionScore(repaired)<corruptionScore(value)?repaired:value;}catch{return value;}}
function decodeEntities(value:string){const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",laquo:"«",raquo:"»",ndash:"–",mdash:"—",hellip:"…",eacute:"é",egrave:"è",ecirc:"ê",agrave:"à",ccedil:"ç",ocirc:"ô",ugrave:"ù",rsquo:"’",lsquo:"‘",ldquo:"“",rdquo:"”"};return value.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,raw:string)=>{const code=raw.toLowerCase().startsWith("x")?parseInt(raw.slice(1),16):parseInt(raw,10);if(!Number.isFinite(code)||code<0||code>0x10ffff)return _;try{return String.fromCodePoint(code);}catch{return _;}}).replace(/&([a-z][a-z0-9]+);/gi,(whole,name:string)=>named[name.toLowerCase()]??whole);}
function decodeHtml(value:string){let text=value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1");for(let i=0;i<2;i++)text=decodeEntities(text);text=repairMojibake(text);for(let i=0;i<2;i++)text=decodeEntities(text);return text.replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();}
function cleanExcerpt(value:string,title=""){let text=decodeHtml(value);if(title){const normalizedTitle=title.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");text=text.replace(new RegExp(normalizedTitle,"ig")," ");}return text.replace(/\s+/g," ").trim().slice(0,2200);}
function excerptAround(html:string,index:number,title:string){const start=Math.max(0,index-700);const end=Math.min(html.length,index+2200);return cleanExcerpt(html.slice(start,end),title);}
function normalizePublishedAt(value:string){const text=decodeHtml(String(value||"")).trim();if(!text)return undefined;const direct=Date.parse(text);if(Number.isFinite(direct))return new Date(direct).toISOString();const m=text.toLowerCase().match(/(\d{1,2})\s+([a-zéûôîàèùç]+)\s+(20\d{2})/i);if(!m)return undefined;const month=MONTHS[m[2]];if(month===undefined)return undefined;return new Date(Date.UTC(Number(m[3]),month,Number(m[1]),6,0,0)).toISOString();}
function dateAround(html:string,index:number){const snippet=decodeHtml(html.slice(Math.max(0,index-700),Math.min(html.length,index+900)));const iso=snippet.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);if(iso)return normalizePublishedAt(`${iso[1]}-${iso[2]}-${iso[3]}`);const slash=snippet.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);if(slash)return new Date(Date.UTC(Number(slash[3]),Number(slash[2])-1,Number(slash[1]),6)).toISOString();const french=snippet.match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20\d{2})\b/i);return french?normalizePublishedAt(french[0]):undefined;}
function publishedTime(item:FeedItem){const time=item.published_at?Date.parse(item.published_at):0;return Number.isFinite(time)?time:0;}
function newestFirst(items:FeedItem[]){return [...items].sort((a,b)=>publishedTime(b)-publishedTime(a));}
function dedupeItems(items:FeedItem[]){const seen=new Set<string>();return items.filter(item=>{if(!item.source_url||seen.has(item.source_url))return false;seen.add(item.source_url);return true;});}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}

async function responseText(response:Response){const bytes=new Uint8Array(await response.arrayBuffer());const contentType=response.headers.get("content-type")||"";const charset=contentType.match(/charset=([^;\s]+)/i)?.[1]?.toLowerCase()||"utf-8";let text="";try{text=new TextDecoder(charset as any).decode(bytes);}catch{text=new TextDecoder("utf-8").decode(bytes);}const latin=new TextDecoder("windows-1252").decode(bytes);const repairedUtf8=repairMojibake(text);const candidates=[text,repairedUtf8,latin];candidates.sort((a,b)=>corruptionScore(a)-corruptionScore(b));return candidates[0];}
async function fetchText(url:string,accept:string,timeoutMs=6500){let lastError:unknown;for(let attempt=0;attempt<3;attempt++){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 Myvor/1.2","Accept":accept,"Accept-Language":"fr-FR,fr;q=0.9"},redirect:"follow",cache:"no-store",signal:controller.signal});if(response.ok)return await responseText(response);const retryable=response.status===408||response.status===429||response.status>=500;if(!retryable)throw new Error(`HTTP ${response.status}`);lastError=new Error(`HTTP ${response.status}`);}catch(error){lastError=error;}finally{clearTimeout(timer);}if(attempt<2)await sleep(attempt===0?300:900);}throw lastError instanceof Error?lastError:new Error("Source institutionnelle indisponible");}
function first(block:string,tags:string[]){for(const tag of tags){const match=block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,"i"));if(match?.[1])return decodeHtml(match[1]);}return "";}
function linkFrom(block:string){const simple=first(block,["link"]);if(simple.startsWith("http"))return simple;const href=block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];return href?decodeHtml(href):"";}
function inferNature(title:string,fallback:string,context=""){
  const t=normalizeTitle(`${title} ${context}`);
  if(t.includes("proposition de loi"))return "Proposition de loi";
  if(t.includes("projet de loi"))return "Projet de loi";
  if(/\bamendement\b/.test(t))return "Amendement";
  if(/\bordonnance\b/.test(t))return "Ordonnance";
  if(/^loi\b/.test(t)||/\bloi n [0-9]/.test(t))return "Loi";
  if(/\bdecret\b/.test(t))return "Décret";
  if(/\barrete\b/.test(t))return "Arrêté";
  if(/\bproposition de resolution\b|\bresolution\b/.test(t))return "Résolution";
  if(/\bquestion ecrite\b|\bquestion orale\b|\bquestion au gouvernement\b|\bquestion parlementaire\b/.test(t))return "Question parlementaire";
  if(/\baudition\b|\bauditions\b/.test(t))return "Audition";
  if(/\brapport\b|\benquete\b|\bevaluation\b|\bmission d information\b/.test(t))return "Rapport";
  if(/\bdecision\b|\bqpc\b|\barret\b|\bjurisprudence\b/.test(t))return "Décision / jurisprudence";
  if(/^avis\b/.test(t)||/\bavis consultatif\b|\bavis relatif\b|\bavis sur\b/.test(t))return "Avis consultatif";
  if(/\bconsultation publique\b|\bconsultation\b/.test(t))return "Consultation publique";
  if(/\bsanction\b|\bmise en demeure\b|\bdeliberation\b/.test(t))return "Décision de régulation";
  if(/\breglement ue\b|\breglement europeen\b|\breglement [0-9]/.test(t))return "Règlement européen";
  if(/\bdirective ue\b|\bdirective europeenne\b|\bdirective [0-9]/.test(t))return "Directive européenne";
  if(/\bcommunique\b|\bcommunique de presse\b|\bpoint presse\b|\bpresse\b/.test(t))return "Communiqué institutionnel";
  return fallback;
}

function parseFeed(xml:string,source:Source):FeedItem[]{const rss=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);const atom=[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m=>m[1]);const blocks=rss.length?rss:atom;return blocks.map(block=>{const title=first(block,["title"]);const excerpt=first(block,["description","summary","content:encoded","content","subtitle"]);const source_url=linkFrom(block);const published=first(block,["pubDate","published","updated","dc:date"]);return{title,nature:inferNature(title,source.defaultNature,`${source.name} ${source_url}`),source_url,source_name:source.name,published_at:normalizePublishedAt(published),excerpt:excerpt.slice(0,2200)||undefined};}).filter(x=>x.title&&x.source_url.startsWith("http")&&!isGenericNavigationTitle(x.title));}
async function fetchFeed(source:Source){const xml=await fetchText(source.url,"application/rss+xml,application/atom+xml,application/xml,text/xml,*/*");return newestFirst(parseFeed(xml,source)).slice(0,60);}

async function fetchHtmlListing(input:{name:string;url:string;base:string;pathPattern:RegExp;defaultNature:string;limit?:number}):Promise<FeedItem[]>{const html=await fetchText(input.url,"text/html,*/*");const items:FeedItem[]=[];const regex=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;for(const match of html.matchAll(regex)){const href=decodeHtml(match[1]);if(!input.pathPattern.test(href))continue;const title=decodeHtml(match[2]);if(title.length<12||isGenericNavigationTitle(title))continue;const source_url=href.startsWith("http")?href:`${input.base}${href.startsWith("/")?"":"/"}${href}`;const excerpt=excerptAround(html,match.index||0,title);if(excerpt.length<60)continue;items.push({title,nature:inferNature(title,input.defaultNature,`${input.name} ${source_url}`),source_url,source_name:input.name,published_at:dateAround(html,match.index||0),excerpt:excerpt||undefined});}return newestFirst(dedupeItems(items)).slice(0,input.limit||12);}

function parseLegifranceIssue(html:string):FeedItem[]{const issueDate=decodeHtml(html.match(/Journal officiel de la République française[^<]*du\s+([^<]+)/i)?.[1]||"");const published_at=normalizePublishedAt(issueDate);const items:FeedItem[]=[];const regex=/<a\b[^>]*href=["']([^"']*\/jorf\/id\/JORFTEXT[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;for(const match of html.matchAll(regex)){const title=decodeHtml(match[2]);if(!title||isGenericNavigationTitle(title))continue;const nature=inferNature(title,"Texte réglementaire");if(!["Loi","Ordonnance","Décret","Arrêté","Décision / jurisprudence","Rapport"].includes(nature))continue;const href=match[1];const source_url=href.startsWith("http")?href:`https://www.legifrance.gouv.fr${href.startsWith("/")?"":"/"}${href}`;items.push({title,nature,source_url,source_name:"Légifrance — Journal officiel",published_at,excerpt:excerptAround(html,match.index||0,title)||undefined});}return dedupeItems(items).slice(0,45);}
async function fetchLegifranceJorf():Promise<FeedItem[]>{
  const currentHtml=await fetchText("https://www.legifrance.gouv.fr/jorf/jo","text/html,application/xhtml+xml,*/*",7500);
  const current=parseLegifranceIssue(currentHtml);
  const archiveHtml=await fetchText("https://www.legifrance.gouv.fr/jorf/jo/period/?datePubli=02%2F06%2F2004+%3E+31%2F12%2F2999","text/html,application/xhtml+xml,*/*",7500);
  const issueUrls:string[]=[];
  for(const match of archiveHtml.matchAll(/href=["']([^"']*\/jorf\/jo\/20\d{2}\/\d{2}\/\d{2}\/\d{4})["']/gi)){
    const href=decodeHtml(match[1]);const url=href.startsWith("http")?href:`https://www.legifrance.gouv.fr${href.startsWith("/")?"":"/"}${href}`;
    if(!issueUrls.includes(url))issueUrls.push(url);
    if(issueUrls.length>=16)break;
  }
  const historical:FeedItem[]=[];
  for(let start=0;start<issueUrls.length;start+=4){
    const batch=issueUrls.slice(start,start+4);
    const pages=await Promise.all(batch.map(url=>fetchText(url,"text/html,application/xhtml+xml,*/*",5000).then(parseLegifranceIssue).catch(()=>[] as FeedItem[])));
    historical.push(...pages.flat());
  }
  return newestFirst(dedupeItems([...current,...historical])).slice(0,520);
}
async function fetchDgccrf(){return fetchHtmlListing({name:"DGCCRF — Fiches pratiques",url:"https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques",base:"https://www.economie.gouv.fr",pathPattern:/\/dgccrf\/les-fiches-pratiques\/(?!?$)[a-z0-9-]+/i,defaultNature:"Fiche pratique / doctrine",limit:40});}
async function fetchViePubliqueReports(){return fetchHtmlListing({name:"Vie-publique — Rapports",url:"https://www.vie-publique.fr/bibliotheque-rapports-publics",base:"https://www.vie-publique.fr",pathPattern:/\/rapport\//i,defaultNature:"Rapport",limit:30});}
async function fetchConseilConstitutionnel(){return fetchHtmlListing({name:"Conseil constitutionnel",url:"https://qpc360.conseil-constitutionnel.fr/",base:"https://qpc360.conseil-constitutionnel.fr",pathPattern:/(decision|decisions|qpc)/i,defaultNature:"Décision / jurisprudence",limit:30});}
async function fetchCnil(){return fetchHtmlListing({name:"CNIL",url:"https://www.cnil.fr/fr/actualite",base:"https://www.cnil.fr",pathPattern:/\/fr\/(?!actualite\/?$)(?:[a-z0-9-]+)(?:\/|$)/i,defaultNature:"Communiqué institutionnel",limit:30});}
async function fetchArcep(){return fetchHtmlListing({name:"ARCEP",url:"https://www.arcep.fr/actualites.html",base:"https://www.arcep.fr",pathPattern:/(communiques-de-presse|actualites\/actualites-et-communiques|uploads\/tx_gspublication|consultations-publiques)/i,defaultNature:"Communiqué institutionnel",limit:30});}
async function fetchEurLex():Promise<FeedItem[]>{const html=await fetchText("https://eur-lex.europa.eu/oj/direct-access.html?locale=fr","text/html,*/*");const items:FeedItem[]=[];const regex=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;for(const match of html.matchAll(regex)){const href=decodeHtml(match[1]);const title=decodeHtml(match[2]);if(title.length<8||isGenericNavigationTitle(title))continue;if(!/(legal-content|oj\/daily-view|oj\/direct-access)/i.test(href))continue;if(!/(règlement|reglement|directive|décision|decision|journal officiel|législation|legislation)/i.test(title))continue;const source_url=href.startsWith("http")?href:`https://eur-lex.europa.eu${href.startsWith("/")?"":"/"}${href}`;items.push({title,nature:inferNature(title,"Acte de l’Union européenne",source_url),source_url,source_name:"EUR-Lex",published_at:dateAround(html,match.index||0),excerpt:excerptAround(html,match.index||0,title)||undefined});}return newestFirst(dedupeItems(items)).slice(0,40);}

async function collect(name:string,task:()=>Promise<FeedItem[]>):Promise<SourceResult>{try{return{name,items:await task()};}catch(error:any){return{name,items:[],error:String(error?.message||error||"erreur inconnue")};}}

export async function GET(){
  const tasks:Promise<SourceResult>[]=[
    ...SOURCES.map(source=>collect(source.name,()=>fetchFeed(source))),
    collect("Légifrance — Journal officiel",fetchLegifranceJorf),
    collect("DGCCRF — Fiches pratiques",fetchDgccrf),
    collect("Vie-publique — Rapports",fetchViePubliqueReports),
    collect("Conseil constitutionnel",fetchConseilConstitutionnel),
    collect("CNIL",fetchCnil),
    collect("ARCEP",fetchArcep),
    collect("EUR-Lex",fetchEurLex),
  ];
  const results=await Promise.all(tasks);
  const all=dedupeItems(results.flatMap(result=>result.items).filter(item=>!isGenericNavigationTitle(item.title)));
  const sourceHead=dedupeItems(results.flatMap(result=>newestFirst(result.items).slice(0,8)));
  const headUrls=new Set(sourceHead.map(item=>item.source_url));
  const remainder=newestFirst(all.filter(item=>!headUrls.has(item.source_url)));
  const items=[...newestFirst(sourceHead),...remainder].slice(0,400);
  const active_sources=results.filter(result=>!result.error).map(result=>result.name);
  const unavailable_sources=results.filter(result=>result.error).map(result=>result.name);
  const unavailable_details=results.filter(result=>result.error).map(result=>`${result.name}: ${result.error}`);
  const source_counts=Object.fromEntries(results.map(result=>[result.name,result.items.length]));
  const source_health=results.map(result=>({name:result.name,count:result.items.length,error:result.error||null,latest_published_at:newestFirst(result.items).find(item=>item.published_at)?.published_at||null}));
  return NextResponse.json({synced_at:new Date().toISOString(),active_sources,unavailable_sources,unavailable_details,source_counts,source_health,items},{headers:{"Cache-Control":"no-store, max-age=0"}});
}