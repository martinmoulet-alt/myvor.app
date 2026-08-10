export type VeilleCandidate={
  id:string;
  title:string;
  nature?:string|null;
  source_name?:string|null;
  published_at?:string|null;
  created_at?:string|null;
  dossier_id?:string|null;
};

export type VeilleCandidateDossier={
  title:string;
  objective?:string|null;
  context?:string|null;
  watch_keywords?:string[];
  watch_priority_phrases?:string[];
};

const STOP=new Set(["avec","dans","pour","sans","sous","entre","vers","chez","plus","moins","ainsi","comme","cette","texte","reforme","projet","proposition","objectif","client","dossier","action","impact","enjeu","enjeux","suivi","veille","mesure","mesures","nouveau","nouvelle","relatif","relative","concernant","article","decret","arrete","ordonnance","code","application","portant","journal","officiel","france","francais","aout","juillet","juin","mai","avril","mars","fevrier","janvier","septembre","octobre","novembre","decembre","entreprise","entreprises","professionnel","professionnels","public","publique","publication","actualite","communique"]);

function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function strongWords(value:string){return [...new Set(normalize(value).split(/\s+/).filter(word=>word.length>=4&&!STOP.has(word)&&!/^\d+$/.test(word)))];}
function list(value:unknown){return Array.isArray(value)?value.map(item=>String(item||"").trim()).filter(Boolean):[];}
function containsPhrase(haystack:string,phrase:string){const needle=normalize(phrase);return !!needle&&` ${haystack} `.includes(` ${needle} `);}
function isDiscriminatingPhrase(phrase:string){const normalized=normalize(phrase);const words=strongWords(phrase);return !!normalized&&words.length>=1&&(normalized.split(/\s+/).length>=2||words.length>=2||/\d/.test(normalized));}
function timeOf(item:VeilleCandidate){const preferred=item.published_at?Date.parse(item.published_at):NaN;if(Number.isFinite(preferred))return preferred;const fallback=item.created_at?Date.parse(item.created_at):NaN;return Number.isFinite(fallback)?fallback:0;}

export function selectVeilleCandidates(items:VeilleCandidate[],dossier:VeilleCandidateDossier,limit=40){
  const safeLimit=Math.max(1,Math.min(120,Math.trunc(limit)||40));
  const phrases=[...new Set([...list(dossier.watch_priority_phrases),...list(dossier.watch_keywords)].filter(isDiscriminatingPhrase))];
  const dossierWords=[...new Set(strongWords(`${dossier.title} ${dossier.objective||""} ${dossier.context||""} ${list(dossier.watch_keywords).join(" ")} ${list(dossier.watch_priority_phrases).join(" ")}`))];
  const ranked=items.map(item=>{
    const title=normalize(`${item.title} ${item.nature||""}`);
    const source=normalize(item.source_name||"");
    const itemWords=new Set(strongWords(title));
    let score=0;
    for(const phrase of phrases)if(containsPhrase(title,phrase))score+=18;
    for(const word of dossierWords)if(itemWords.has(word))score+=4;
    if(dossierWords.some(word=>source.includes(word)))score+=1;
    return{item,score,time:timeOf(item)};
  }).sort((a,b)=>(Number(b.score>0)-Number(a.score>0))||(b.score-a.score)||(b.time-a.time));
  return ranked.slice(0,safeLimit).map(entry=>entry.item);
}
