import { NextResponse } from "next/server";

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;urgency?:string;source_url?:string};

function cleanApiKey(raw:string){const normalized=String(raw||"").normalize("NFKC");const match=normalized.match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}
function urgencyWeight(value?:string){return value==="absolument urgent"?100:value==="fort"?78:value==="moyen"?50:25;}
function fallbackNote(dossier:Dossier,items:WatchItem[]){
  const score=Math.round(items.reduce((sum,item)=>sum+urgencyWeight(item.urgency),0)/Math.max(1,items.length));
  const level=score>=90?"absolument urgent":score>=70?"fort":score>=40?"moyen":"faible";
  const main=items.slice(0,5);
  return {
    title:`Note d’impact — ${dossier.title}`,
    executive_summary:`${main.length} évolution(s) institutionnelle(s) sont actuellement rattachées au dossier. Le niveau d’impact estimé est ${level} au regard de l’objectif client : ${dossier.objective}`,
    score,level,
    rationale:"Score de secours Myvor calculé à partir des niveaux d’urgence des textes rattachés. À confirmer par l’analyse IA dès qu’elle est disponible.",
    risks:main.filter(i=>["fort","absolument urgent"].includes(i.urgency||"")).map(i=>`${i.nature} : ${i.title}`).slice(0,4),
    opportunities:main.filter(i=>!["fort","absolument urgent"].includes(i.urgency||"")).map(i=>`Suivre l’évolution de ${i.title}`).slice(0,3),
    deadlines:[],
    recommendations:["Qualifier les textes les plus urgents.","Mettre à jour le Radar d’influence.","Préparer les prochaines prises de contact et éléments de langage."],
    sources_used:main.map(i=>({title:i.title,url:i.source_url||""})),
  };
}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,8):[];
  if(!dossier)return NextResponse.json({error:"Sélectionne un dossier client."},{status:400});
  if(!items.length)return NextResponse.json({error:"Aucun élément de veille n’est rattaché à ce dossier."},{status:400});
  const fallback=fallbackNote(dossier,items);
  const apiKey=cleanApiKey(process.env.OPENAI_API_KEY||"");
  if(!apiKey)return NextResponse.json({note:fallback,engine:"local",warning:"Clé OpenAI indisponible : note calculée localement."});

  const prompt=["Tu es l’analyste senior de Myvor.","Produis une Note d’impact concise et opérationnelle en JSON.","Évalue l’impact sur l’objectif précis du client. Faible=vert, moyen=orange, fort=rouge, absolument urgent=bordeaux.","Structure: title, executive_summary, score(0-100), level, rationale, risks[], opportunities[], deadlines[], recommendations[], sources_used[{title,url}].",`Client: ${dossier.client}`,`Dossier: ${dossier.title}`,`Objectif: ${dossier.objective}`,`Textes: ${items.map(i=>`${i.nature} | ${i.urgency||"moyen"} | ${i.title}`).join(" || ")}`].join("\n");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:prompt,max_output_tokens:1000,text:{format:{type:"json_object"}}}),signal:controller.signal});
    clearTimeout(timer);
    if(!response.ok)return NextResponse.json({note:fallback,engine:"local",warning:`OpenAI indisponible (${response.status}) : note locale générée.`});
    const payload=await response.json();let note:any={};try{note=JSON.parse(extractOutputText(payload)||"{}");}catch{return NextResponse.json({note:fallback,engine:"local",warning:"Réponse IA invalide : note locale générée."});}
    if(!note?.title)return NextResponse.json({note:fallback,engine:"local",warning:"Réponse IA incomplète : note locale générée."});
    return NextResponse.json({note,engine:"openai"});
  }catch(error:any){clearTimeout(timer);return NextResponse.json({note:fallback,engine:"local",warning:error?.name==="AbortError"?"OpenAI trop lent : note locale générée immédiatement.":"Erreur OpenAI : note locale générée."});}
}
