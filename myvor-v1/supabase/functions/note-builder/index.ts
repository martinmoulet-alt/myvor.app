const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};

const MONTH_INDEX:Record<string,number>={janvier:1,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,septembre:9,octobre:10,novembre:11,decembre:12};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});}
function cleanApiKey(raw:string){const normalized=String(raw||"").normalize("NFKC");const match=normalized.match(/sk-[A-Za-z0-9_-]+/);return match?.[0]||"";}
function extractOutputText(payload:any){if(typeof payload?.output_text==="string")return payload.output_text;const chunks=payload?.output?.flatMap((item:any)=>item?.content||[])||[];return chunks.map((chunk:any)=>chunk?.text||"").join("");}
function clip(value:unknown,max:number){return String(value??"").slice(0,max);}
function cleanSourceTitle(value:unknown){let text=String(value??"").normalize("NFKC").replace(/\s+/g," ").trim();text=text.replace(/\b([\p{L}À-ÿ'-]+)(?:\s+\1\b)+/giu,"$1");text=text.replace(/\s+n[°º]\s*[^0-9\s].*$/iu,"").trim();text=text.replace(/[\u0000-\u001F\u007F]/g,"").trim();return text||"Source institutionnelle";}
function stripLeadingSubject(content:unknown){return String(content??"").replace(/^\s*Objet\s*:\s*[^\n]*(?:\n+|$)/iu,"").trim();}
function normalizedFrench(value:unknown){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function hasPastTemporalReference(value:unknown,now:Date){const text=normalizedFrench(value);if(!text)return false;const currentYear=now.getUTCFullYear();const currentMonth=now.getUTCMonth()+1;const currentDay=now.getUTCDate();const pattern=/(?:(\d{1,2})\s+)?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/g;let match:RegExpExecArray|null;while((match=pattern.exec(text))!==null){const day=match[1]?Number(match[1]):1;const month=MONTH_INDEX[match[2]];const year=match[3]?Number(match[3]):currentYear;if(year<currentYear)return true;if(year===currentYear&&month<currentMonth)return true;if(year===currentYear&&month===currentMonth&&day<currentDay)return true;}return false;}
function removePastTemporalSentences(value:unknown,now:Date){const raw=String(value??"").trim();if(!raw)return "";const lines=raw.split(/\n+/).map(line=>line.split(/(?<=[.!?])\s+/).filter(sentence=>!hasPastTemporalReference(sentence,now)).join(" ").trim()).filter(Boolean);return lines.join("\n").replace(/\n{3,}/g,"\n\n").trim();}
function cleanDerivedList(value:any,maxItems:number,maxChars:number,now:Date){if(!Array.isArray(value))return [];return value.slice(0,maxItems).map((item:any)=>removePastTemporalSentences(clip(item,maxChars),now)).filter(Boolean);}
function compactImpact(value:any,now:Date){const note=value?.note||value||null;if(!note)return null;const dispositions=Array.isArray(note.dispositions_concernees)?note.dispositions_concernees.slice(0,6).map((item:any)=>({disposition:removePastTemporalSentences(clip(item?.disposition,500),now),impact_client:removePastTemporalSentences(clip(item?.impact_client,700),now),niveau:clip(item?.niveau,80)})).filter((item:any)=>item.disposition||item.impact_client):[];return{executive_summary:removePastTemporalSentences(clip(note.executive_summary,1600),now),score:note.score??null,level:clip(note.level,80),rationale:removePastTemporalSentences(clip(note.rationale,1000),now),risks:cleanDerivedList(note.risks,5,450,now),opportunities:cleanDerivedList(note.opportunities,5,450,now),deadlines:cleanDerivedList(note.deadlines,5,350,now),recommendations:cleanDerivedList(note.recommendations,6,500,now),dispositions_concernees:dispositions};}
function compactRadar(value:any,now:Date){const actors=Array.isArray(value?.actors)?value.actors:Array.isArray(value)?value:[];if(!actors.length)return null;return actors.slice(0,8).map((actor:any)=>({name:clip(actor.name,180),role:removePastTemporalSentences(clip(actor.role,240),now),orbit:actor.orbit??null,position:clip(actor.position,80),influence:actor.influence??null,why:removePastTemporalSentences(clip(actor.why,550),now),window:removePastTemporalSentences(clip(actor.window,350),now),action:removePastTemporalSentences(clip(actor.action,450),now),certainty:clip(actor.certainty,80)}));}
function sanitizeGeneratedContent(value:unknown,now:Date){return removePastTemporalSentences(stripLeadingSubject(value),now).replace(/\n\s*(Fenêtres? d[’']action|Prochaines étapes|Calendrier(?: institutionnel| législatif)?)\s*:\s*(?=\n|$)/giu,"").replace(/\n{3,}/g,"\n\n").trim();}

async function requireAuthenticatedQuota(req:Request,feature:string){
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const supabaseUrl=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!supabaseUrl||!anonKey)return json({error:"La sécurité Supabase de Myvor n’est pas configurée."},503);
  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{method:"GET",headers:{apikey:anonKey,Authorization:authorization}});
    if(!userResponse.ok)return json({error:"Session Myvor invalide ou expirée."},401);
    const user=await userResponse.json().catch(()=>null);
    if(!user?.id)return json({error:"Session Myvor invalide ou expirée."},401);
    const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{method:"POST",headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_feature:feature})});
    if(!quotaResponse.ok)return json({error:"Impossible de vérifier le quota IA Myvor."},503);
    const allowed=await quotaResponse.json().catch(()=>false);
    if(allowed!==true)return json({error:"Trop de générations IA en peu de temps. Réessaie dans quelques minutes."},429);
    return null;
  }catch{return json({error:"Impossible de vérifier la session Myvor."},503);}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);

  const authError=await requireAuthenticatedQuota(req,"note-builder");
  if(authError)return authError;

  const body=await req.json().catch(()=>null);
  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,8):[];
  const format=String(body?.format||"note-client");
  const audience=String(body?.audience||"Client").slice(0,120);
  const tone=String(body?.tone||"professionnel et direct").slice(0,120);
  const instruction=String(body?.instruction||"").slice(0,1000);
  const now=new Date();
  const impact=compactImpact(body?.impact,now);
  const radar=compactRadar(body?.radar,now);
  const currentDateIso=now.toISOString().slice(0,10);
  const currentDateFr=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(now);

  if(!dossier)return json({error:"Sélectionne un dossier client."},400);
  if(!items.length)return json({error:"Aucun texte n’est rattaché à ce dossier."},400);

  const apiKey=cleanApiKey(Deno.env.get("OPENAI_API_KEY")||"");
  if(!apiKey)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans Supabase."},503);

  const cleanedItems=items.map(item=>({title:cleanSourceTitle(item.title),nature:clip(item.nature,100),urgency:clip(item.urgency,80),source_url:clip(item.source_url,700)}));
  const formatRules:Record<string,string>={
    "note-client":"Rédige une note client prête à envoyer : objet, synthèse exécutive, situation institutionnelle, conséquences concrètes pour le client, risques/opportunités, acteurs utiles, recommandations hiérarchisées, prochaines étapes et, si nécessaire, une courte section 'Points à confirmer'.",
    "argumentaire":"Rédige un argumentaire de rendez-vous prêt à l’emploi : objectif, message central, arguments étayés, objections/réponses, acteurs à convaincre, demandes précises, résultat recherché et éléments à confirmer si nécessaire.",
    "email":"Rédige un e-mail prêt à envoyer : objet, ouverture, message essentiel, implications, demande précise et appel à l’action. Reste concis et distingue clairement les éléments non confirmés.",
    "rendez-vous":"Rédige une fiche de préparation de rendez-vous : contexte, objectif, interlocuteurs, messages clés, arguments, questions, vigilances, résultat recherché et points à confirmer.",
  };

  const prompt=[
    "Tu es le Note Builder de Myvor, outil professionnel d’affaires publiques.",
    "Transforme les analyses existantes en un document directement exploitable par un consultant.",
    `DATE DE GÉNÉRATION : ${currentDateFr} (${currentDateIso}).`,
    "IMPORTANT : les données temporelles antérieures à aujourd’hui ont été retirées du contexte. N’essaie pas de reconstruire ou de deviner un ancien calendrier. Si aucun calendrier actuel fiable n’est fourni, écris qu’il faut vérifier le calendrier institutionnel actuel dans les sources officielles.",
    "RÈGLE DE FIABILITÉ : la Note d’impact et le Radar d’influence sont des analyses Myvor dérivées, pas des sources primaires. Les dates, procédures, noms d'acteurs, positions, compétences institutionnelles, dispositions précises ou chiffres provenant uniquement de ces analyses doivent être formulés comme à confirmer, sauf lorsqu'ils sont explicitement établis par les éléments de veille fournis.",
    "Les titres et URL de veille servent de références. N'infère jamais le contenu intégral d'un texte à partir de son seul titre ou de son URL.",
    formatRules[format]||formatRules["note-client"],
    `Public visé : ${audience}. Ton : ${tone}.`,
    instruction?`Instruction utilisateur : ${instruction}`:"",
    "Priorité de travail : dossier et objectif > éléments de veille > Note d’impact > Radar d’influence.",
    "N’invente aucun fait, date, chiffre, disposition ou position. Toute incertitude doit être explicitement signalée.",
    "Les recommandations peuvent être déduites du contexte, mais doivent être présentées comme recommandations.",
    "Ne répète pas Objet dans le champ content : l'objet doit apparaître uniquement dans le champ subject.",
    format==="note-client"?"Vise environ 550 à 750 mots.":"Adapte la longueur à l'usage demandé.",
    "Réponds uniquement en JSON valide avec exactement cette structure :",
    JSON.stringify({title:"string",subject:"string",content:"string",key_points:["string"]}),
    "DOSSIER :",JSON.stringify({client:clip(dossier.client,300),title:clip(dossier.title,300),objective:clip(dossier.objective,1200),context:removePastTemporalSentences(clip(dossier.context,1600),now)}),
    "ÉLÉMENTS DE VEILLE :",JSON.stringify(cleanedItems),
    "NOTE D'IMPACT MYVOR :",JSON.stringify(impact),
    "RADAR D'INFLUENCE MYVOR :",JSON.stringify(radar),
  ].filter(Boolean).join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4.1-mini",input:prompt,max_output_tokens:1700,text:{format:{type:"json_object"}}}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw)?.error?.message||raw;}catch{}return json({error:`OpenAI a refusé la requête (${response.status}) : ${String(message).slice(0,260)}`},502);}
    const payload=await response.json();
    let document:any={};
    try{document=JSON.parse(extractOutputText(payload)||"{}");}catch{return json({error:"La réponse IA du Note Builder n’était pas exploitable. Réessaie."},502);}
    const cleanedContent=sanitizeGeneratedContent(document?.content,now);
    if(!cleanedContent)return json({error:"La réponse IA est incomplète. Réessaie."},502);
    const cleanedKeyPoints=Array.isArray(document.key_points)?document.key_points.map((item:any)=>removePastTemporalSentences(String(item),now)).filter(Boolean).slice(0,10):[];
    return json({document:{title:String(document.title||`Document — ${dossier.title}`),subject:String(document.subject||""),content:cleanedContent,key_points:cleanedKeyPoints,sources:cleanedItems.slice(0,10).map(item=>({title:item.title,url:item.source_url||""}))},engine:"supabase-note-builder-authenticated",context_used:{impact:!!impact,radar:!!radar,watch_items:items.length,generation_date:currentDateIso,past_dates_filtered:true}});
  }catch(error:any){if(error?.name==="AbortError")return json({error:"La génération IA a dépassé 45 secondes. Réessaie."},504);return json({error:`Erreur du Note Builder : ${error?.message||"inconnue"}`},500);}
  finally{clearTimeout(timer);}
});
