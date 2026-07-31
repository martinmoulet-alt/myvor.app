import { NextResponse } from "next/server";

type Source = { name:string; url:string; defaultNature:string };
type FeedItem = { title:string; nature:string; source_url:string; source_name:string; published_at?:string };

const SOURCES: Source[] = [
  { name:"Assemblée nationale", url:"http://www2.assemblee-nationale.fr/feeds/detail/documents-parlementaires", defaultNature:"Publication parlementaire" },
  { name:"Sénat — Textes", url:"https://www.senat.fr/rss/textes.rss", defaultNature:"Texte parlementaire" },
  { name:"Sénat — Rapports", url:"https://www.senat.fr/rss/rapports.rss", defaultNature:"Rapport" },
];

function decodeHtml(value:string){
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g," ")
    .replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
}

async function responseText(response:Response){
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  let charset = contentType.match(/charset=([^;\s]+)/i)?.[1]?.toLowerCase() || "utf-8";
  let text = "";
  try { text = new TextDecoder(charset as any).decode(bytes); }
  catch { text = new TextDecoder("utf-8").decode(bytes); }
  if (text.includes("�")) {
    const latin = new TextDecoder("windows-1252").decode(bytes);
    if ((latin.match(/�/g)||[]).length < (text.match(/�/g)||[]).length) text = latin;
  }
  return text;
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
  if(t.startsWith("décret")||t.includes(" décret ")) return "Décret";
  if(t.startsWith("arrêté")||t.includes(" arrêté ")) return "Arrêté";
  if(t.startsWith("décision")||t.includes(" décision ")) return "Décision / jurisprudence";
  if(t.includes("rapport")) return "Rapport";
  if(t.includes("question")) return "Question parlementaire";
  if(t.includes("résolution")) return "Résolution";
  return fallback;
}

function parseFeed(xml:string,source:Source):FeedItem[]{
  const rss=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  const atom=[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m=>m[1]);
  const blocks=rss.length?rss:atom;
  return blocks.map(block=>{
    const title=first(block,["title"]);
    return { title, nature:inferNature(title,source.defaultNature), source_url:linkFrom(block), source_name:source.name, published_at:first(block,["pubDate","published","updated"]) };
  }).filter(x=>x.title&&x.source_url.startsWith("http"));
}

async function fetchFeed(source:Source){
  const response=await fetch(source.url,{headers:{"User-Agent":"Mozilla/5.0 Myvor/1.0","Accept":"application/rss+xml,application/xml,text/xml,*/*"},next:{revalidate:300}});
  if(!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  return parseFeed(await responseText(response),source).slice(0,12);
}

async function fetchLegifranceJorf():Promise<FeedItem[]>{
  const response=await fetch("https://www.legifrance.gouv.fr/jorf/jo",{
    redirect:"follow",
    headers:{
      "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":"fr-FR,fr;q=0.9,en;q=0.5",
    },
    next:{revalidate:300},
  });
  if(!response.ok) throw new Error(`Légifrance — JORF: HTTP ${response.status}`);
  const html=await responseText(response);
  const issueDate=decodeHtml(html.match(/Journal officiel de la République française[^<]*du\s+([^<]+)/i)?.[1]||"");
  const items:FeedItem[]=[];
  const regex=/<a\b[^>]*href=["']([^"']*\/jorf\/id\/JORFTEXT[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(regex)){
    const title=decodeHtml(match[2]);
    if(!title) continue;
    const nature=inferNature(title,"Texte réglementaire");
    if(!["Loi","Ordonnance","Décret","Arrêté","Décision / jurisprudence","Rapport"].includes(nature)) continue;
    const href=match[1];
    const source_url=href.startsWith("http")?href:`https://www.legifrance.gouv.fr${href.startsWith("/")?"":"/"}${href}`;
    items.push({title,nature,source_url,source_name:"Légifrance — Journal officiel",published_at:issueDate});
  }
  return items.filter((x,i,a)=>a.findIndex(y=>y.source_url===x.source_url)===i).slice(0,20);
}

export async function GET(){
  const feedSettled=await Promise.allSettled(SOURCES.map(fetchFeed));
  const legifrance=await Promise.allSettled([fetchLegifranceJorf()]);
  const items=[
    ...legifrance.flatMap(r=>r.status==="fulfilled"?r.value:[]),
    ...feedSettled.flatMap(r=>r.status==="fulfilled"?r.value:[]),
  ].filter((x,i,a)=>a.findIndex(y=>y.source_url===x.source_url)===i).slice(0,45);

  const active_sources=[
    ...feedSettled.map((r,i)=>r.status==="fulfilled"?SOURCES[i].name:null).filter(Boolean),
    ...(legifrance[0]?.status==="fulfilled"?["Légifrance — Journal officiel"]:[]),
  ];
  const unavailable_sources=[
    ...feedSettled.map((r,i)=>r.status==="rejected"?SOURCES[i].name:null).filter(Boolean),
    ...(legifrance[0]?.status==="rejected"?["Légifrance — Journal officiel"]:[]),
  ];
  const unavailable_details=[
    ...feedSettled.map((r,i)=>r.status==="rejected"?`${SOURCES[i].name}: ${String(r.reason?.message||r.reason)}`:null).filter(Boolean),
    ...(legifrance[0]?.status==="rejected"?[`Légifrance — Journal officiel: ${String((legifrance[0] as PromiseRejectedResult).reason?.message||(legifrance[0] as PromiseRejectedResult).reason)}`]:[]),
  ];

  return NextResponse.json({synced_at:new Date().toISOString(),active_sources,unavailable_sources,unavailable_details,items});
}
