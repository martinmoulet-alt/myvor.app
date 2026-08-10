import {createClient} from "npm:@supabase/supabase-js@2";

type Dossier={id:string;user_id:string;title:string;objective:string;context?:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type WatchItem={id:string;user_id:string;title:string;nature:string;source_url:string;dossier_id:string|null;suggested_dossier_id?:string|null;qualification_reason?:string|null;published_at?:string|null};
type Setting={user_id:string;enabled:boolean;auto_link_threshold:number|string;review_threshold:number|string};
type Score={score:number;matches:string[];priorityMatches:string[];explicitMatches:string[];blockedBy:string|null};

const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const RULE_PREFIX="Règles dossier v11 —";
const OLD_RULE_PREFIXES=["Règles dossier v10 —","Règles dossier v9 —","Règles dossier v8 —","Règles dossier v7 —","Règles dossier v6 —"];
const PROCESS_LIMIT=80;
const STOP_WORDS=new Set(["avec","dans","pour","sans","sous","entre","vers","chez","plus","moins","ainsi","comme","cette","celui","celle","ceux","elles","leurs","notre","votre","nous","vous","tout","tous","toute","toutes","texte","obtenir","modification","favorable","reforme","projet","proposition","objectif","client","dossier","action","impact","enjeu","enjeux","suivi","veille","mesure","mesures","nouveau","nouvelle","relatif","relative","concernant","article","articles","application","applicable","regle","regles","aide","autorisation","transmission","donnee","donnees","collecte","relation"]);
const GENERIC_NAV_TITLES=["accueil","particuliers","professionnels","entreprises","associations","vie associative","être informé","etre informe","accéder à la rubrique","acceder a la rubrique","actualités et communiqués","actualites et communiques","actualités","actualites","communiqués","communiques","agenda et événements","agenda et evenements","agenda","événements","evenements","les publications","publications","les prises de parole","prises de parole","newsletter","quels sont mes droits","achats et publicité","achats et publicite","banque assurance","les pratiques numériques des français","les pratiques numeriques des francais","auditions devant le parlement","les auditions devant le parlement"];

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max).trim();}
function getAdminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function safeEqual(a:string,b:string){const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;}
function normalize(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function isGenericNavigationTitle(value:string){const title=normalize(value);return !title||GENERIC_NAV_TITLES.some(entry=>title===normalize(entry));}
function stemWord(word:string){const stripped=word.replace(/(issements?|ements?|ations?|itions?|iques?|istes?|ismes?|teurs?|trices?|eurs?|euses?|ites?|ives?|ifs?|aux|ales?|elles?|ments?|es|s)$/i,"");return stripped.length>=4?stripped:word;}
function keywords(value:string){const out:string[]=[];for(const raw of normalize(value).split(/\s+/)){if(raw.length<4||STOP_WORDS.has(raw)||/^\d+$/.test(raw))continue;const word=stemWord(raw);if(word.length>=4&&!STOP_WORDS.has(word))out.push(word);}return[...new Set(out)];}
function cleanedList(value:unknown){return Array.isArray(value)?value.map(v=>String(v||"").trim()).filter(Boolean):[];}
function containsPhrase(normalizedText:string,phrase:string){const needle=normalize(phrase);return !!needle&&` ${normalizedText} `.includes(` ${needle} `);}
function keywordHit(itemWords:Set<string>,word:string){if(itemWords.has(word))return 1;if(word.length<6)return 0;for(const itemWord of itemWords)if(itemWord.length>=6&&(itemWord.startsWith(word)||word.startsWith(itemWord)))return .7;return 0;}
function scoreItem(text:string,dossier:Dossier):Score{const normalizedText=normalize(text),itemWords=new Set(keywords(normalizedText));const excluded=cleanedList(dossier.watch_excluded_keywords),watchKeywords=cleanedList(dossier.watch_keywords),priority=cleanedList(dossier.watch_priority_phrases);const blockedBy=excluded.find(term=>containsPhrase(normalizedText,term))||null;if(blockedBy)return{score:0,matches:[],priorityMatches:[],explicitMatches:[],blockedBy};const priorityMatches=priority.filter(term=>containsPhrase(normalizedText,term));const explicitMatches=watchKeywords.filter(term=>containsPhrase(normalizedText,term));if(!watchKeywords.length&&!priorityMatches.length)return{score:0,matches:[],priorityMatches:[],explicitMatches:[],blockedBy:null};const multi=explicitMatches.filter(term=>normalize(term).split(/\s+/).length>=2),single=explicitMatches.filter(term=>normalize(term).split(/\s+/).length===1);const words=[...new Set(watchKeywords.flatMap(value=>keywords(value)))],wordHits=words.filter(word=>keywordHit(itemWords,word)>0);let score=0;if(priorityMatches.length)score=.99;else if(explicitMatches.length>=2)score=.97;else if(multi.length===1)score=.94;else if(single.length>=2)score=.86;else if(single.length===1)score=.62;else if(wordHits.length>=3)score=.76;else if(wordHits.length===2)score=.68;else if(wordHits.length===1)score=.52;return{score,matches:[...new Set([...explicitMatches,...wordHits])].slice(0,8),priorityMatches:priorityMatches.slice(0,4),explicitMatches:explicitMatches.slice(0,6),blockedBy:null};}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);
  const expected=Deno.env.get("MYVOR_CRON_SECRET")||"",supplied=req.headers.get("x-myvor-cron-secret")||"";
  if(!expected||!supplied||!safeEqual(expected,supplied))return json({error:"Non autorisé"},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",adminKey=getAdminKey();if(!supabaseUrl||!adminKey)return json({error:"Configuration Supabase serveur incomplète"},500);
  const supabase=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:settings,error:settingsError}=await supabase.from("veille_settings").select("user_id,enabled,auto_link_threshold,review_threshold").eq("enabled",true);if(settingsError)return json({ok:false,error:"Impossible de charger les réglages de veille"},500);
  const summaries:any[]=[];
  for(const setting of(settings||[]) as Setting[]){
    const userId=setting.user_id,tenMinutesAgo=new Date(Date.now()-10*60*1000).toISOString();
    const{data:activeRun}=await supabase.from("veille_runs").select("id").eq("user_id",userId).eq("status","running").gte("started_at",tenMinutesAgo).limit(1).maybeSingle();
    if(activeRun){summaries.push({status:"skipped",reason:"already_running"});continue;}
    const engine="catalog-dossier-relevance-v11-deterministic";
    const{data:run,error:runError}=await supabase.from("veille_runs").insert({user_id:userId,status:"running",sources_count:1,fetched_count:0,engine}).select("id").single();if(runError){summaries.push({status:"error",message:"run_log_failed"});continue;}
    const runId=run.id as string;
    try{
      const[{data:dossiers,error:dossierError},{data:items,error:itemError}]=await Promise.all([
        supabase.from("dossiers").select("id,user_id,title,objective,context,watch_keywords,watch_priority_phrases,watch_excluded_keywords").eq("user_id",userId),
        supabase.from("watch_items").select("id,user_id,title,nature,source_url,dossier_id,suggested_dossier_id,qualification_reason,published_at").eq("user_id",userId)
      ]);
      if(dossierError||itemError)throw new Error("Lecture du portefeuille impossible");
      const allItems=(items||[]) as WatchItem[],allDossiers=(dossiers||[]) as Dossier[];
      const processItems=allItems.filter(item=>!item.dossier_id&&(!item.qualification_reason||(!String(item.qualification_reason).startsWith(RULE_PREFIX)&&!OLD_RULE_PREFIXES.some(prefix=>String(item.qualification_reason).startsWith(prefix))))).sort((a,b)=>(Date.parse(String(b.published_at||""))||0)-(Date.parse(String(a.published_at||""))||0)).slice(0,PROCESS_LIMIT);
      const ids=processItems.map(item=>item.id);let contentRows:any[]=[];
      if(ids.length){const{data,error}=await supabase.from("watch_item_content").select("watch_item_id,source_text,source_text_chars").in("watch_item_id",ids);if(error)throw new Error(`Lecture contenu source impossible: ${clip(error.message,180)}`);contentRows=data||[];}
      const contentById=new Map(contentRows.map((row:any)=>[String(row.watch_item_id),row]));
      const reviewThreshold=Math.max(.60,Math.min(1,Number(setting.review_threshold)||.60));
      let candidates=0,rejected=0,withContent=0,totalChars=0;
      for(const item of processItems){
        const cached:any=contentById.get(item.id),sourceText=String(cached?.source_text||"");if(sourceText){withContent++;totalChars+=Number(cached?.source_text_chars)||sourceText.length;}
        if(isGenericNavigationTitle(item.title)){await supabase.from("watch_items").update({dossier_id:null,suggested_dossier_id:null,qualification_confidence:0,qualification_reason:`${RULE_PREFIX} Page générique détectée : aucun rattachement.`,qualified_at:new Date().toISOString(),urgency:"faible"}).eq("id",item.id).eq("user_id",userId);rejected++;continue;}
        const searchable=`${item.title} ${item.nature} ${sourceText}`;
        const ranked=allDossiers.map(d=>({d,...scoreItem(searchable,d)})).sort((a,b)=>b.score-a.score),best=ranked[0],second=ranked[1];
        if(!best||best.score<reviewThreshold){const blocked=ranked.find(x=>x.blockedBy);const reason=blocked?`${RULE_PREFIX} Exclusion détectée : ${blocked.blockedBy}.`:`${RULE_PREFIX} Aucun mot-clé de veille explicite suffisamment discriminant.`;await supabase.from("watch_items").update({dossier_id:null,suggested_dossier_id:null,qualification_confidence:0,qualification_reason:reason,qualified_at:new Date().toISOString(),urgency:"faible"}).eq("id",item.id).eq("user_id",userId);rejected++;continue;}
        let confidence=best.score;if(second&&second.score>=reviewThreshold&&(best.score-second.score)<.12)confidence=Math.min(confidence,.84);
        const signals=[best.priorityMatches.length?`Expression prioritaire : ${best.priorityMatches.join(", ")}.`:"",best.explicitMatches.length?`Mots-clés exacts : ${best.explicitMatches.join(", ")}.`:"",!best.explicitMatches.length&&best.matches.length?`Signaux lexicaux explicites : ${best.matches.join(", ")}.`:""].filter(Boolean).join(" ");
        const reason=`${RULE_PREFIX} ${signals} Validation IA en attente.`;
        const{error:updateError}=await supabase.from("watch_items").update({dossier_id:null,suggested_dossier_id:best.d.id,qualification_confidence:Number(confidence.toFixed(2)),qualification_reason:clip(reason,650),qualified_at:new Date().toISOString(),urgency:"moyen"}).eq("id",item.id).eq("user_id",userId);if(updateError)throw new Error(`Mise à jour qualification impossible: ${clip(updateError.message,180)}`);candidates++;
      }
      const message=`${processItems.length} texte(s) scoré(s) · ${withContent} avec contenu source · ${totalChars} caractères · ${candidates} candidat(s) IA · ${rejected} écarté(s).`;
      await supabase.from("veille_runs").update({status:"success",finished_at:new Date().toISOString(),fetched_count:processItems.length,new_count:0,auto_linked_count:0,review_count:candidates,actions_created_count:0,engine,message}).eq("id",runId);
      await supabase.from("veille_settings").update({last_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("user_id",userId);
      summaries.push({status:"success",processed:processItems.length,with_content:withContent,candidates,rejected,engine});
    }catch(error:any){const message=clip(error?.message||"Erreur inconnue",500);await supabase.from("veille_runs").update({status:"error",finished_at:new Date().toISOString(),message}).eq("id",runId);summaries.push({status:"error",message});}
  }
  return json({ok:true,synced_at:new Date().toISOString(),source:"catalog",users:summaries});
});
