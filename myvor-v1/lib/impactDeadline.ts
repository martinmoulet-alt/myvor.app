export type ParsedImpactDeadline={raw:string;due_date:string|null};

const MONTHS:Record<string,number>={
  janvier:1,fevrier:2,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,août:8,septembre:9,octobre:10,novembre:11,decembre:12,décembre:12,
};

function isoDate(year:number,month:number,day:number){
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return `${year.toString().padStart(4,"0")}-${month.toString().padStart(2,"0")}-${day.toString().padStart(2,"0")}`;
}

export function parseExplicitImpactDate(value:string){
  const text=String(value||"").replace(/\s+/g," ").trim();
  if(!text)return null;

  let match=text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if(match)return isoDate(Number(match[1]),Number(match[2]),Number(match[3]));

  match=text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
  if(match)return isoDate(Number(match[3]),Number(match[2]),Number(match[1]));

  match=text.toLowerCase().match(/\b(\d{1,2})(?:er)?\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(20\d{2})\b/);
  if(match){
    const month=MONTHS[match[2]];
    return month?isoDate(Number(match[3]),month,Number(match[1])):null;
  }

  return null;
}

export function normalizeImpactDeadlines(items?:string[]):ParsedImpactDeadline[]{
  if(!Array.isArray(items))return[];
  return items.map(raw=>({raw:String(raw||"").trim(),due_date:parseExplicitImpactDate(String(raw||""))})).filter(item=>item.raw);
}

export function nextActionableDeadline(items:ParsedImpactDeadline[],today=new Date()){
  const todayIso=`${today.getFullYear().toString().padStart(4,"0")}-${(today.getMonth()+1).toString().padStart(2,"0")}-${today.getDate().toString().padStart(2,"0")}`;
  return items.filter(item=>item.due_date&&item.due_date>=todayIso).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))[0]||null;
}

export function formatImpactDate(value:string){
  const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:value;
}
