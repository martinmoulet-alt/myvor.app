import { NextResponse } from "next/server";

type WatchItem={id:string;title:string;nature?:string};
type Dossier={id:string;title:string;objective?:string;context?:string;client?:string};
type Assignment={watch_id:string;dossier_id:string|null;confidence:number;reason:string};

const STOP_WORDS=new Set([
  "a","au","aux","avec","ce","ces","dans","de","des","du","elle","en","et","eux","il","je","la","le","les","leur","lui","ma","mais","me","meme","mes","moi","mon","ne","nos","notre","nous","on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu","un","une","vos","votre","vous","d","l","y",
  "texte","obtenir","modification","favorable","reforme","projet","proposition","objectif","client","dossier","action","impact","enjeu","enjeux","suivi","veille","mesure","mesures","nouveau","nouvelle"
]);

function normalize(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function stem(word:string){
  return word.replace(/(issements?|issements?|ements?|ations?|itions?|iques?|istes?|ismes?|teurs?|trices?|eurs?|euses?|ites?|ives?|ifs?|aux|ales?|elles?|ments?|es|s)$/,"$1"===word?word:"") || word;
}

function keywords(value:string){
  const out:string[]=[];
  for(const raw of normalize(value).split(/\s+/)){
    if(raw.length<4||STOP_WORDS.has(raw)||/^\d+$/.test(raw)) continue;
    const candidate=stem(raw);
    if(candidate.length>=4&&!STOP_WORDS.has(candidate)) out.push(candidate);
  }
  return [...new Set(out)];
}

function matchKeyword(itemWords:Set<string>,word:string){
  if(itemWords.has(word)) return 1;
  if(word.length<5) return 0;
  for(const itemWord of itemWords){
    if(itemWord.length>=5&&(itemWord.startsWith(word)||word.startsWith(itemWord))) return 0.8;
  }
  return 0;
}

function keywordScore(item:WatchItem,dossier:Dossier){
  const itemWords=new Set(keywords(`${item.title} ${item.nature||""}`));
  const dossierWords=keywords(`${dossier.title} ${dossier.objective||""} ${dossier.context||""}`);
  if(!itemWords.size||!dossierWords.length)return{score:0,matches:[] as string[]};

  let points=0;
  const matches:string[]=[];
  for(const word of dossierWords){
    const value=matchKeyword(itemWords,word);
    if(value>0){points+=value;matches.push(word);}
  }

  const uniqueMatches=[...new Set(matches)];
  const strong=uniqueMatches.length;
  let score=0;
  if(strong>=4) score=0.98;
  else if(strong===3) score=0.94;
  else if(strong===2) score=0.82;
  else if(strong===1) score=0.62;

  if(points>=3.5) score=Math.max(score,0.96);
  return{score,matches:uniqueMatches.slice(0,6)};
}

function keywordAssignments(items:WatchItem[],dossiers:Dossier[]):Assignment[]{
  return items.map(item=>{
    const ranked=dossiers.map(dossier=>({dossier,...keywordScore(item,dossier)})).sort((a,b)=>b.score-a.score);
    const best=ranked[0];
    const second=ranked[1];
    if(!best||best.score<0.55){
      return{watch_id:item.id,dossier_id:null,confidence:0,reason:"Aucun mot-clé suffisamment pertinent détecté."};
    }

    const margin=best.score-(second?.score||0);
    let confidence=best.score;
    if(second&&second.score>=0.55&&margin<0.12) confidence=Math.min(confidence,0.88);

    return{
      watch_id:item.id,
      dossier_id:best.dossier.id,
      confidence:Number(confidence.toFixed(2)),
      reason:`Mots-clés détectés : ${best.matches.join(", ")}.`
    };
  });
}

export async function POST(request:Request){
  const body=await request.json().catch(()=>null);
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,60):[];
  const dossiers:Dossier[]=Array.isArray(body?.dossiers)?body.dossiers.slice(0,40):[];
  if(!items.length||!dossiers.length)return NextResponse.json({assignments:[],engine:"myvor-keywords"});

  const allowedDossierIds=new Set(dossiers.map(d=>d.id));
  const allowedWatchIds=new Set(items.map(i=>i.id));
  const assignments=keywordAssignments(items,dossiers)
    .filter(a=>allowedWatchIds.has(a.watch_id))
    .map(a=>({
      ...a,
      dossier_id:a.dossier_id&&allowedDossierIds.has(a.dossier_id)?a.dossier_id:null,
      confidence:Math.max(0,Math.min(1,a.confidence)),
      reason:a.reason.slice(0,220)
    }));

  return NextResponse.json({assignments,engine:"myvor-keywords"});
}
