import { NextResponse } from "next/server";

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";influence:number;why:string;window:string;action:string;certainty:"confirme"|"probable"|"a_confirmer";evidence:string};
type SourceExtraction={url:string;content:string;status:"fetched"|"unavailable"|"unsupported"};

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
  "eur-lex.europa.eu",
];

function asText(value:unknown){return typeof value==="string"?value.trim():"";}
function decodeHtml(value:string){return value.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">");}
function htmlToText(html:string){return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<!--([\s\S]*?)-->/g," ").replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<\/li>/gi,"\n").replace(/<\/h[1-6]>/gi,"\n").replace(/<[^>]+>/g," ").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim());}
function isOfficialUrl(rawUrl:string){try{const url=new URL(rawUrl);return url.protocol==="https:"&&OFFICIAL_HOSTS.includes(url.hostname.toLowerCase());}catch{return false;}}

async function fetchOfficialSource(rawUrl:string,maxChars=18000):Promise<SourceExtraction>{
  if(!rawUrl||!isOfficialUrl(rawUrl))return{url:rawUrl,content:"",status:"unsupported"};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(rawUrl,{headers:{"User-Agent":"Myvor/1.0 influence-radar","Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5"},redirect:"follow",signal:controller.signal,cache:"no-store"});
    if(!response.ok)return{url:rawUrl,content:"",status:"unavailable"};
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("text/html")&&!contentType.includes("text/plain"))return{url:rawUrl,content:"",status:"unsupported"};
    const raw=await response.text();
    const text=contentType.includes("text/html")?htmlToText(raw):raw.trim();
    return{url:rawUrl,content:text.slice(0,maxChars),status:text?"fetched":"unavailable"};
  }catch{return{url:rawUrl,content:"",status:"unavailable"};}
  finally{clearTimeout(timer);}
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
    action:asText(actor?.action)||"Vérifier l'acteur et sa capacité d'influence avant toute prise de contact.",
    certainty,
    evidence:asText(actor?.evidence)||"information à confirmer",
  };
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>null);
    const dossier:Dossier|null=body?.dossier||null;
    const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,8):[];
    if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
    if(!items.length)return NextResponse.json({error:"Aucun texte n’est rattaché à ce dossier."},{status:400});

    const supabaseUrl=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
    const supabaseAnonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
    if(!supabaseUrl||!supabaseAnonKey)return NextResponse.json({error:"La connexion Supabase de Myvor n’est pas configurée."},{status:503});

    const uniqueUrls=[...new Set(items.map(item=>item.source_url||"").filter(Boolean))].slice(0,3);
    const extractions=await Promise.all(uniqueUrls.map(url=>fetchOfficialSource(url)));
    const extractionByUrl=new Map(extractions.map(source=>[source.url,source]));

    const sourceText=items.map((item,index)=>{
      const extraction=item.source_url?extractionByUrl.get(item.source_url):undefined;
      return [
        `SOURCE ${index+1}`,
        `Titre : ${item.title}`,
        `Nature : ${item.nature}`,
        item.source_url?`URL officielle : ${item.source_url}`:"",
        extraction?.status==="fetched"?`CONTENU OFFICIEL RÉCUPÉRÉ :\n${extraction.content}`:`CONTENU OFFICIEL : non récupéré automatiquement (${extraction?.status||"aucune URL"}). Ne pas inventer son contenu.`,
      ].filter(Boolean).join("\n");
    }).join("\n\n====================\n\n");

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(`${supabaseUrl}/functions/v1/influence-radar`,{
        method:"POST",
        headers:{Authorization:`Bearer ${supabaseAnonKey}`,apikey:supabaseAnonKey,"Content-Type":"application/json"},
        body:JSON.stringify({
          client:dossier.client,
          dossier:dossier.title,
          contexte:dossier.context||"",
          objectif:dossier.objective,
          texte:sourceText,
          sources:items.map(item=>({title:item.title,url:item.source_url||""})),
        }),
        signal:controller.signal,
      });
      const raw=await response.text();
      let payload:any=null;
      try{payload=raw?JSON.parse(raw):null;}catch{return NextResponse.json({error:`influence-radar a retourné une réponse invalide (${response.status}).`},{status:502});}
      if(!response.ok)return NextResponse.json({error:payload?.error||`La fonction influence-radar a échoué (${response.status}).`},{status:response.status>=400&&response.status<600?response.status:502});
      const actors=(Array.isArray(payload?.actors)?payload.actors:[]).slice(0,10).map(normalizeActor);
      if(!actors.length)return NextResponse.json({error:"Aucun acteur suffisamment étayé n’a pu être identifié à partir des sources disponibles."},{status:422});
      return NextResponse.json({
        actors,
        engine:"supabase-influence-radar",
        grounding:{official_sources_requested:uniqueUrls.length,official_sources_fetched:extractions.filter(source=>source.status==="fetched").length,statuses:extractions.map(source=>({url:source.url,status:source.status}))},
      });
    }catch(error:any){
      if(error?.name==="AbortError")return NextResponse.json({error:"Le Radar d’influence a dépassé le temps de réponse disponible."},{status:504});
      return NextResponse.json({error:error?.message||"Impossible de joindre la fonction influence-radar."},{status:502});
    }finally{clearTimeout(timer);}
  }catch(error:any){
    return NextResponse.json({error:error?.message||"Erreur interne pendant la génération du Radar d’influence."},{status:500});
  }
}
