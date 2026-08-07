const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};

type Dossier={id:string;client:string;title:string;objective:string;context?:string};
type WatchItem={id:string;title:string;nature:string;source_url?:string;urgency?:string};

const MONTH_INDEX:Record<string,number>={janvier:1,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,septembre:9,octobre:10,novembre:11,decembre:12};
const MAX_WATCH_ITEMS=24;

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
function sanitizeGeneratedContent(value:unknown,now:Date){return removePastTemporalSentences(stripLeadingSubject(value),now).replace(/\n\s*(Fenêtres? d[’']action|Prochaines étapes|Calendrier(?: institutionnel| législatif)?)\s*:\s*(?=\n|$)/giu,"").replace(/\s+(?=\d+\.\s)/g,"\n\n").replace(/\n{3,}/g,"\n\n").trim();}

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
  const contentLength=Number(req.headers.get("content-length")||0);
  if(Number.isFinite(contentLength)&&contentLength>180000)return json({error:"Requête trop volumineuse."},413);

  const body=await req.json().catch(()=>null);
  const mode=String(body?.mode||"generate");
  const authError=await requireAuthenticatedQuota(req,mode==="edit"?"note-builder-edit":"note-builder");
  if(authError)return authError;

  const apiKey=cleanApiKey(Deno.env.get("OPENAI_API_KEY")||"");
  if(!apiKey)return json({error:"Le secret OPENAI_API_KEY n’est pas configuré dans Supabase."},503);

  if(mode==="edit"){
    const selected=clip(body?.selected_text,4500).trim();
    const action=String(body?.action||"reformulate");
    const surrounding=clip(body?.surrounding_text,6000);
    const actionRules:Record<string,string>={
      reformulate:"Reformule ce passage pour le rendre plus clair, fluide, précis et professionnel, sans modifier le fond.",
      shorten:"Raccourcis ce passage d’environ 30 à 40 %, conserve toutes les informations indispensables et supprime les répétitions.",
      strengthen:"Renforce l’argumentation : rends le raisonnement plus structuré, plus convaincant et plus orienté décision, sans inventer de fait.",
      diplomatic:"Rends ce passage plus diplomatique, institutionnel et nuancé, tout en conservant le message et l’objectif.",
    };
    if(!selected)return json({error:"Sélectionne d’abord un passage dans la note."},400);
    const prompt=[
      "Tu es l’assistant d’édition du Note Builder Myvor, spécialisé en affaires publiques.",
      actionRules[action]||actionRules.reformulate,
      "Ne crée aucun fait, chiffre, date, acteur ou source qui n’existe pas dans le passage.",
      "Conserve le sens, les noms propres et les réserves de fiabilité.",
      "Réponds uniquement avec le passage réécrit, sans commentaire ni guillemets.",
      "CONTEXTE DU DOCUMENT :",surrounding,
      "PASSAGE À MODIFIER :",selected,
    ].join("\n");
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4.1-mini",input:prompt,max_output_tokens:900,store:false}),signal:controller.signal});
      if(!response.ok){const raw=await response.text();return json({error:`OpenAI a refusé la requête (${response.status}) : ${raw.slice(0,220)}`},502);}
      const text=extractOutputText(await response.json()).trim();if(!text)return json({error:"La réécriture n’a renvoyé aucun texte."},502);
      return json({text,engine:"supabase-note-builder-edit"});
    }catch(error:any){if(error?.name==="AbortError")return json({error:"La réécriture a dépassé 30 secondes."},504);return json({error:`Erreur d’édition : ${error?.message||"inconnue"}`},500);}finally{clearTimeout(timer);}
  }

  const dossier:Dossier|null=body?.dossier||null;
  const items:WatchItem[]=Array.isArray(body?.items)?body.items.slice(0,MAX_WATCH_ITEMS):[];
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
  if(!items.length)return json({error:"Aucune évolution n’est disponible pour ce dossier."},400);

  const cleanedItems=items.map(item=>({title:cleanSourceTitle(item.title),nature:clip(item.nature,100),urgency:clip(item.urgency,80),source_url:clip(item.source_url,700)}));
  const formatRules:Record<string,string>={
    "note-client":"NOTE STRATÉGIQUE. Structure attendue : 1) synthèse exécutive très courte ; 2) enjeu institutionnel ; 3) implications concrètes pour le client ; 4) risques et opportunités ; 5) acteurs à mobiliser ; 6) recommandations hiérarchisées avec verbes d’action. Écriture dense, décisionnelle, sans remplissage. Vise 650 à 850 mots.",
    "synthese":"NOTE DE SYNTHÈSE. Structure attendue : 1) objet et périmètre ; 2) faits et signaux essentiels ; 3) points de convergence/divergence entre sources ; 4) implications ; 5) points de vigilance. Style neutre, factuel et condensé. Pas de recommandation sauf si explicitement demandée. Vise 400 à 600 mots.",
    "email":"E-MAIL CLIENT. Structure attendue : objet court ; ouverture en une phrase ; message clé immédiatement visible ; 2 à 4 paragraphes courts sur les implications ; demande ou prochaine action explicite ; formule de clôture sobre. Vise 180 à 300 mots et évite les titres de section.",
    "rendez-vous":"BRIEF RENDEZ-VOUS. Structure attendue : objectif du rendez-vous ; interlocuteur(s) ; contexte utile ; 3 messages à faire passer ; arguments/preuves ; questions à poser ; objections possibles et réponses ; résultat recherché ; points à confirmer. Format très scannable. Vise 450 à 650 mots.",
    "argumentaire":"ARGUMENTAIRE. Structure attendue : thèse centrale ; 3 à 5 arguments numérotés ; pour chaque argument : preuve disponible, bénéfice client/intérêt général et réponse à l’objection probable ; demandes précises ; éléments non confirmés. Ton convaincant sans exagération. Vise 500 à 750 mots.",
    "elements-langage":"ÉLÉMENTS DE LANGAGE. Produit des formulations courtes, orales et réutilisables : message principal ; 5 à 8 messages secondaires ; 3 réponses à objections ; 3 phrases de conclusion ou d’appel à l’action. Chaque élément doit pouvoir être prononcé tel quel. Pas de paragraphes longs. Vise 250 à 450 mots.",
  };

  const prompt=[
    "Tu es le Note Builder de Myvor, outil professionnel d’affaires publiques.",
    "Transforme les analyses existantes en un document directement exploitable par un consultant. Le résultat doit ressembler à un livrable métier, jamais à une réponse générique d’assistant IA.",
    `DATE DE GÉNÉRATION : ${currentDateFr} (${currentDateIso}).`,
    `Tu dois traiter transversalement l’ensemble des ${cleanedItems.length} évolutions de veille fournies. Ne réduis pas l’analyse à la première source et fais ressortir convergences, divergences et signaux cumulés lorsqu’ils existent.`,
    "IMPORTANT : les données temporelles antérieures à aujourd’hui ont été retirées du contexte. N’essaie pas de reconstruire ou de deviner un ancien calendrier. Si aucun calendrier actuel fiable n’est fourni, indique seulement qu’une vérification du calendrier institutionnel actuel est requise.",
    "RÈGLE DE FIABILITÉ : la Note d’impact et le Radar d’influence sont des analyses Myvor dérivées, pas des sources primaires. Les dates, procédures, noms d'acteurs, positions, compétences institutionnelles, dispositions précises ou chiffres provenant uniquement de ces analyses doivent être formulés comme à confirmer, sauf lorsqu'ils sont explicitement établis par les éléments de veille fournis.",
    "Les titres et URL de veille servent de références. N'infère jamais le contenu intégral d'un texte à partir de son seul titre ou de son URL.",
    formatRules[format]||formatRules["note-client"],
    `Public visé : ${audience}. Ton : ${tone}.`,
    instruction?`Instruction utilisateur : ${instruction}`:"",
    "Priorité de travail : dossier et objectif > éléments de veille > Note d’impact > Radar d’influence.",
    "N’invente aucun fait, date, chiffre, disposition ou position. Toute incertitude doit être explicitement signalée.",
    "Les recommandations peuvent être déduites du contexte, mais doivent être présentées comme recommandations.",
    "Évite les banalités, les introductions longues, les répétitions et les phrases de type 'il convient de noter'.",
    "Ne répète pas Objet dans le champ content : l'objet doit apparaître uniquement dans le champ subject.",
    "Dans le champ content, chaque grande partie numérotée (1., 2., 3., etc.) doit commencer après une ligne vide. Ne colle jamais deux parties numérotées dans le même paragraphe.",
    "Les key_points doivent être 3 à 6 points réellement décisionnels, pas un résumé phrase par phrase.",
    "Réponds uniquement en JSON valide avec exactement cette structure :",
    JSON.stringify({title:"string",subject:"string",content:"string",key_points:["string"]}),
    "DOSSIER :",JSON.stringify({client:clip(dossier.client,300),title:clip(dossier.title,300),objective:clip(dossier.objective,1200),context:removePastTemporalSentences(clip(dossier.context,1600),now)}),
    "ÉLÉMENTS DE VEILLE :",JSON.stringify(cleanedItems),
    "NOTE D'IMPACT MYVOR :",JSON.stringify(impact),
    "RADAR D'INFLUENCE MYVOR :",JSON.stringify(radar),
  ].filter(Boolean).join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4.1-mini",input:prompt,max_output_tokens:2100,text:{format:{type:"json_object"}},store:false}),signal:controller.signal});
    if(!response.ok){const raw=await response.text();let message=raw;try{message=JSON.parse(raw)?.error?.message||raw;}catch{}return json({error:`OpenAI a refusé la requête (${response.status}) : ${String(message).slice(0,260)}`},502);}
    const payload=await response.json();
    let document:any={};
    try{document=JSON.parse(extractOutputText(payload)||"{}");}catch{return json({error:"La réponse IA du Note Builder n’était pas exploitable. Réessaie."},502);}
    const cleanedContent=sanitizeGeneratedContent(document?.content,now);
    if(!cleanedContent)return json({error:"La réponse IA est incomplète. Réessaie."},502);
    const cleanedKeyPoints=Array.isArray(document.key_points)?document.key_points.map((item:any)=>removePastTemporalSentences(String(item),now)).filter(Boolean).slice(0,6):[];
    return json({document:{title:String(document.title||`Document — ${dossier.title}`),subject:String(document.subject||""),content:cleanedContent,key_points:cleanedKeyPoints,sources:cleanedItems.map(item=>({title:item.title,url:item.source_url||""}))},engine:"supabase-note-builder-authenticated-v2",context_used:{impact:!!impact,radar:!!radar,watch_items:items.length,generation_date:currentDateIso,past_dates_filtered:true}});
  }catch(error:any){if(error?.name==="AbortError")return json({error:"La génération IA a dépassé 90 secondes. Réessaie."},504);return json({error:`Erreur du Note Builder : ${error?.message||"inconnue"}`},500);}
  finally{clearTimeout(timer);}
});