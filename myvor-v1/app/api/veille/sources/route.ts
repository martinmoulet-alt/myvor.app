import { NextResponse } from "next/server";

type Source = { name:string; url:string; defaultNature:string };
type FeedItem = { title:string; nature:string; source_url:string; source_name:string; published_at?:string };

const SOURCES: Source[] = [
  { name:"Assemblée nationale", url:"http://www2.assemblee-nationale.fr/feeds/detail/documents-parlementaires", defaultNature:"Publication parlementaire" },
  { name:"Sénat — Textes", url:"https://www.senat.fr/rss/textes.rss", defaultNature:"Texte parlementaire" },
  { name:"Sénat — Rapports", url:"https://www.senat.fr/rss/rapports.rss", defaultNature:"Rapport" },
  { name:"Économie — Actualités", url:"https://www.economie.gouv.fr/rss/toutesactualites", defaultNature:"Communiqué institutionnel" },
  { name:"Transition écologique — Actualités", url:"https://www.ecologie.gouv.fr/rss-actualites.xml", defaultNature:"Communiqué institutionnel" },
  { name:"Transition écologique — Presse", url:"https://www.ecologie.gouv.fr/rss-presse.xml", defaultNature:"Communiqué institutionnel" },
  { name:"Direction générale du Trésor", url:"https://www.tresor.economie.gouv.fr/Flux/Atom/Articles/Home", defaultNature:"Publication institutionnelle" },
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

function corruptionScore(value:string){
  return (value.match(/Ã|Â|â€|â€™|â€œ|â€|â€“|â€”|â€¦|ðŸ|�/g)||[]).length;
}

function repairMojibake(value:string){
  if(!/[ÃÂâð�]/.test(value)) return value;
  try{
    const bytes:number[]=[];
    for(const char of value){
      const code=char.codePointAt(0)!;
      if(code<=0xff) bytes.push(code);
      else if(WINDOWS_1252_BYTES[code]!==undefined) bytes.push(WINDOWS_1252_BYTES[code]);
      else return value;
    }
    const repaired=new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(bytes));
    return corruptionScore(repaired)<corruptionScore(value)?repaired:value;
  }catch{return value;}
}

function decodeEntities(value:string){
  const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",laquo:"«",raquo:"»",ndash:"–",mdash:"—",hellip:"…",eacute:"é",egrave:"è",ecirc:"ê",agrave:"à",ccedil:"ç",ocirc:"ô",ugrave:"ù",rsquo:"’",lsquo:"‘",ldquo:"“",rdquo:"”"};
  return value
    .replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,raw:string)=>{
      const code=raw.toLowerCase().startsWith("x")?parseInt(raw.slice(1),16):parseInt(raw,10);
      if(!Number.isFinite(code)||code<0||code>0x10ffff) return _;
      try{return String.fromCodePoint(code);}catch{return _;}
    })
    .replace(/&([a-z][a-z0-9]+);/gi,(whole,name:string)=>named[name.toLowerCase()]??whole);
}

function decodeHtml(value:string){
  let text=value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1");
  for(let i=0;i<2;i++) text=decodeEntities(text);
  text=repairMojibake(text);
  for(let i=0;i<2;i++) text=decodeEntities(text);
  return text.replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
}

async function responseText(response:Response){
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1]?.toLowerCase() || "utf-8";
  let text = "";
  try { text = new TextDecoder(charset as any).decode(bytes); }
  catch { text = new TextDecoder("utf-8").decode(bytes); }
  const latin = new TextDecoder("windows-1252").decode(bytes);
  const repairedUtf8=repairMojibake(text);
  const candidates=[text,repairedUtf8,latin];
  candidates.sort((a,b)=>corruptionScore(a)-corruptionScore(b));
  return candidates[0];
}

function first(block:string,tags:string[]){
  for(const tag of tags){
    const match=block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,"i"));
    if(match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function linkFrom(block:string){
  const simple=first(block,["link"]);
  if(simple.startsWith("http")) return simple;
  const href=block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  return href?decodeHtml(href):"";
}

function inferNature(title:string,fallback:string){
  const t=title.toLowerCase();
  if(t.startsWith("loi ")||t.startsWith("loi n°")) return "Loi";
  if(t.includes("ordonnance")) return "Ordonnance";
  if(t.includes("amendement")) return "Amendement";
  if(t.includes("proposition de loi")) return "Proposition de loi";
  if(t.includes("projet de loi")) return "Projet de loi";
  if(t.startsWith("avis ")||t.startsWith("avis relatif")||t.startsWith("avis sur")) return "Avis consultatif";
  if(t.startsWith("décret")||t.includes(" décret ")) return "Décret";
  if(t.startsWith("arrêté")||t.includes(" arrêté ")) return "Arrêté";
  if(t.startsWith("décision")||t.includes(" décision ")||t.includes(" qpc ")) return "Décision / jurisprudence";
  if(t.includes("rapport")||t.includes("enquête")||t.includes("évaluation")||t.includes("evaluation")) return "Rapport";
  if(t.includes("question")) return "Question parlementaire";
  if(t.includes("résolution")) return "Résolution";
  if(t.includes("consultation")) return "Consultation publique";
  if(t.includes("sanction")) return "Décision de régulation";
  if(t.includes("règlement")||t.includes("reglement")) return "Règlement européen";
  if(t.includes("directive")) return "Directive européenne";
  if(t.includes("communiqué")||t.includes("communique")) return "Communiqué institutionnel";
  return fallback;
}

function parseFeed(xml:string,source:Source):FeedItem[]{
  const rss=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  const atom=[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m=>m[1]);
  const blocks=rss.length?rss:atom;
  return blocks.map(block=>{
    const title=first(block,["title"]);
    return { title, nature:inferNature(title,source.defaultNature), source_url:linkFrom(block), source_name:source.name, published_at:first(block,["pubDate","published","updated","dc:date"]) };
  }).filter(x=>x.title&&x.source_url.startsWith("http"));
}

async function fetchFeed(source:Source){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(source.url,{headers:{"User-Agent":"Mozilla/5.0 Myvor/1.0","Accept":"application/rss+xml,application/atom+xml,application/xml,text/xml,*/*"},next:{revalidate:300},signal:controller.signal});
    if(!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
    return parseFeed(await responseText(response),source).slice(0,12);
  }finally{clearTimeout(timer);}
}

async function fetchHtmlListing(input:{name:string;url:string;base:string;pathPattern:RegExp;defaultNature:string;limit?:number}):Promise<FeedItem[]>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(input.url,{headers:{"User-Agent":"Mozilla/5.0 Myvor/1.0","Accept":"text/html,*/*","Accept-Language":"fr-FR,fr;q=0.9"},next:{revalidate:600},signal:controller.signal});
    if(!response.ok)throw new Error(`${input.name}: HTTP ${response.status}`);
    const html=await responseText(response);const items:FeedItem[]=[];
    const regex=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for(const match of html.matchAll(regex)){
      const href=decodeHtml(match[1]); if(!input.pathPattern.test(href))continue;
      const title=decodeHtml(match[2]); if(title.length<12)continue;
      const source_url=href.startsWith("http")?href:`${input.base}${href.startsWith("/")?"":"/"}${href}`;
      items.push({title,nature:inferNature(title,input.defaultNature),source_url,source_name:input.name});
    }
    return items.filter((x,i,a)=>a.findIndex(y=>y.source_url===x.source_url)===i).slice(0,input.limit||12);
  }finally{clearTimeout(timer);}
}

async function fetchLegifranceJorf():Promise<FeedItem[]>{
  const response=await fetch("https://www.legifrance.gouv.fr/jorf/jo",{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 Myvor/1.0","Accept":"text/html,application/xhtml+xml,*/*","Accept-Language":"fr-FR,fr;q=0.9"},next:{revalidate:300}});
  if(!response.ok) throw new Error(`Légifrance — JORF: HTTP ${response.status}`);
  const html=await responseText(response);
  const issueDate=decodeHtml(html.match(/Journal officiel de la République française[^<]*du\s+([^<]+)/i)?.[1]||"");
  const items:FeedItem[]=[];
  const regex=/<a\b[^>]*href=["']([^"']*\/jorf\/id\/JORFTEXT[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(regex)){
    const title=decodeHtml(match[2]); if(!title) continue;
    const nature=inferNature(title,"Texte réglementaire");
    if(!["Loi","Ordonnance","Décret","Arrêté","Décision / jurisprudence","Rapport"].includes(nature)) continue;
    const href=match[1];
    const source_url=href.startsWith("http")?href:`https://www.legifrance.gouv.fr${href.startsWith("/")?"":"/"}${href}`;
    items.push({title,nature,source_url,source_name:"Légifrance — Journal officiel",published_at:issueDate});
  }
  return items.filter((x,i,a)=>a.findIndex(y=>y.source_url===x.source_url)===i).slice(0,20);
}

async function fetchViePubliqueReports():Promise<FeedItem[]>{
  return fetchHtmlListing({name:"Vie-publique — Rapports",url:"https://www.vie-publique.fr/bibliotheque-rapports-publics",base:"https://www.vie-publique.fr",pathPattern:/\/rapport\//i,defaultNature:"Rapport",limit:15});
}

async function fetchConseilConstitutionnel():Promise<FeedItem[]>{
  return fetchHtmlListing({name:"Conseil constitutionnel",url:"https://qpc360.conseil-constitutionnel.fr/",base:"https://qpc360.conseil-constitutionnel.fr",pathPattern:/(decision|decisions|qpc)/i,defaultNature:"Décision / jurisprudence",limit:12});
}

async function fetchCnil():Promise<FeedItem[]>{
  return fetchHtmlListing({name:"CNIL",url:"https://www.cnil.fr/fr/actualite",base:"https://www.cnil.fr",pathPattern:/\/fr\//i,defaultNature:"Publication de régulateur",limit:15});
}

async function fetchArcep():Promise<FeedItem[]>{
  return fetchHtmlListing({name:"ARCEP",url:"https://www.arcep.fr/actualites.html",base:"https://www.arcep.fr",pathPattern:/(actualites|communiques|consultations|uploads)/i,defaultNature:"Publication de régulateur",limit:15});
}

async function fetchEurLex():Promise<FeedItem[]>{
  const response=await fetch("https://eur-lex.europa.eu/oj/direct-access.html?locale=fr",{headers:{"User-Agent":"Mozilla/5.0 Myvor/1.0","Accept":"text/html,*/*","Accept-Language":"fr-FR,fr;q=0.9"},next:{revalidate:600}});
  if(!response.ok)throw new Error(`EUR-Lex: HTTP ${response.status}`);
  const html=await responseText(response);const items:FeedItem[]=[];
  const regex=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(regex)){
    const href=decodeHtml(match[1]); const title=decodeHtml(match[2]);
    if(title.length<8)continue;
    if(!/(legal-content|oj\/daily-view|oj\/direct-access)/i.test(href))continue;
    if(!/(règlement|reglement|directive|décision|decision|journal officiel|législation|legislation)/i.test(title))continue;
    const source_url=href.startsWith("http")?href:`https://eur-lex.europa.eu${href.startsWith("/")?"":"/"}${href}`;
    items.push({title,nature:inferNature(title,"Acte de l’Union européenne"),source_url,source_name:"EUR-Lex"});
  }
  return items.filter((x,i,a)=>a.findIndex(y=>y.source_url===x.source_url)===i).slice(0,18);
}

export async function GET(){
  const feedSettled=await Promise.allSettled(SOURCES.map(fetchFeed));
  const extraNames=["Légifrance — Journal officiel","Vie-publique — Rapports","Conseil constitutionnel","CNIL","ARCEP","EUR-Lex"];
  const extras=await Promise.allSettled([fetchLegifranceJorf(),fetchViePubliqueReports(),fetchConseilConstitutionnel(),fetchCnil(),fetchArcep(),fetchEurLex()]);
  const items=[...extras.flatMap(r=>r.status==="fulfilled"?r.value:[]),...feedSettled.flatMap(r=>r.status==="fulfilled"?r.value:[])].filter((x,i,a)=>a.findIndex(y=>y.source_url===x.source_url)===i).slice(0,160);
  const active_sources=[...feedSettled.map((r,i)=>r.status==="fulfilled"?SOURCES[i].name:null).filter(Boolean),...extras.map((r,i)=>r.status==="fulfilled"?extraNames[i]:null).filter(Boolean)];
  const unavailable_sources=[...feedSettled.map((r,i)=>r.status==="rejected"?SOURCES[i].name:null).filter(Boolean),...extras.map((r,i)=>r.status==="rejected"?extraNames[i]:null).filter(Boolean)];
  const unavailable_details=[...feedSettled.map((r,i)=>r.status==="rejected"?`${SOURCES[i].name}: ${String(r.reason?.message||r.reason)}`:null).filter(Boolean),...extras.map((r,i)=>r.status==="rejected"?`${extraNames[i]}: ${String((r as PromiseRejectedResult).reason?.message||(r as PromiseRejectedResult).reason)}`:null).filter(Boolean)];
  return NextResponse.json({synced_at:new Date().toISOString(),active_sources,unavailable_sources,unavailable_details,items});
}
