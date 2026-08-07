"use client";

import { useEffect,useMemo,useRef,useState } from "react";
import { AlertTriangle,Building2,CalendarDays,FileText,RefreshCw,Search,Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import VeilleStatusMessage from "./VeilleStatusMessage";
import styles from "./VeilleCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string;source_name?:string|null;published_at?:string|null;suggested_dossier_id?:string|null;qualification_confidence?:number|null;qualification_reason?:string|null};
type Suggestion={watch_id:string;dossier_id:string|null;confidence:number;reason:string};

const AUTO_LINK_THRESHOLD=0.95;
const REVIEW_THRESHOLD=0.60;
const IGNORED_REASON="Ignoré manuellement";
const AUTO_SYNC_INTERVAL=15*60*1000;
const AUTO_SYNC_CHECK_INTERVAL=60*1000;
const LAST_AUTO_SYNC_KEY="myvor:veille:last-auto-sync";

function sourceLabel(url:string){try{const host=new URL(url).hostname.replace(/^www\./,"");if(host.includes("assemblee-nationale.fr"))return "Assemblée nationale";if(host.includes("senat.fr"))return "Sénat";if(host.includes("legifrance.gouv.fr"))return "Légifrance — Journal officiel";if(host.includes("vie-publique.fr"))return "Vie-publique";if(host.includes("economie.gouv.fr"))return "Ministère de l’Économie";if(host.includes("ecologie.gouv.fr"))return "Transition écologique";if(host.includes("tresor.economie.gouv.fr"))return "Direction générale du Trésor";if(host.includes("conseil-etat.fr"))return "Conseil d’État";if(host.includes("conseil-constitutionnel.fr"))return "Conseil constitutionnel";if(host.includes("ccomptes.fr"))return "Cour des comptes";if(host.includes("cnil.fr"))return "CNIL";if(host.includes("arcep.fr"))return "ARCEP";if(host.includes("cre.fr"))return "CRE";if(host.includes("amf-france.org"))return "AMF";if(host.includes("autoritedelaconcurrence.fr"))return "Autorité de la concurrence";if(host.includes("eur-lex.europa.eu"))return "EUR-Lex";return host;}catch{return "Source officielle";}}
function publicationDate(item:Watch){const value=item.published_at||item.created_at;const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString("fr-FR"):"";}
function publicationTime(item:Watch){const primary=item.published_at?Date.parse(item.published_at):NaN;if(Number.isFinite(primary))return primary;const fallback=Date.parse(item.created_at);return Number.isFinite(fallback)?fallback:0;}
function dateCutoff(range:string){const now=new Date();if(range==="today"){const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());return start.getTime();}const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0;return days?Date.now()-days*24*60*60*1000:0;}

export default function VeilleCorporate({items,dossiers,add,sync,syncing,syncMessage,link}:{items:Watch[];dossiers:Dossier[];add:()=>void;sync:()=>void;syncing:boolean;syncMessage:string;link:(watchId:string,dossierId:string|null)=>Promise<void>|void}){
  const [query,setQuery]=useState("");const [nature,setNature]=useState("all");const [urgency,setUrgency]=useState("all");const [dateRange,setDateRange]=useState("all");const [qualifying,setQualifying]=useState(false);const [qualificationMessage,setQualificationMessage]=useState("");const [qualificationTechnical,setQualificationTechnical]=useState("");const [suggestions,setSuggestions]=useState<Suggestion[]>([]);const [ignored,setIgnored]=useState<string[]>([]);const [focusId,setFocusId]=useState<string|null>(null);const autoSyncStarted=useRef(false);const autoQualificationBatch=useRef("");const syncingRef=useRef(syncing);const syncRef=useRef(sync);

  useEffect(()=>{syncingRef.current=syncing;},[syncing]);
  useEffect(()=>{syncRef.current=sync;},[sync]);
  useEffect(()=>{const target=sessionStorage.getItem("myvor:open-watch");if(!target)return;const item=items.find(entry=>entry.id===target);if(!item)return;sessionStorage.removeItem("myvor:open-watch");setQuery(item.title);setNature("all");setUrgency("all");setDateRange("all");setFocusId(item.id);setTimeout(()=>document.getElementById(`watch-${item.id}`)?.scrollIntoView({behavior:"smooth",block:"center"}),80);setTimeout(()=>setFocusId(null),2200);},[items]);
  useEffect(()=>{
    if(autoSyncStarted.current)return;
    autoSyncStarted.current=true;
    let disposed=false;
    let inFlight=false;
    const maybeSync=()=>{
      if(disposed||inFlight||syncingRef.current||document.visibilityState!=="visible")return;
      const last=Number(localStorage.getItem(LAST_AUTO_SYNC_KEY)||0);
      if(Number.isFinite(last)&&Date.now()-last<AUTO_SYNC_INTERVAL)return;
      inFlight=true;
      localStorage.setItem(LAST_AUTO_SYNC_KEY,String(Date.now()));
      try{syncRef.current();}finally{setTimeout(()=>{inFlight=false;},5000);}
    };
    const onVisibility=()=>{if(document.visibilityState==="visible")maybeSync();};
    const initial=window.setTimeout(maybeSync,250);
    const interval=window.setInterval(maybeSync,AUTO_SYNC_CHECK_INTERVAL);
    window.addEventListener("focus",maybeSync);
    window.addEventListener("online",maybeSync);
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{disposed=true;window.clearTimeout(initial);window.clearInterval(interval);window.removeEventListener("focus",maybeSync);window.removeEventListener("online",maybeSync);document.removeEventListener("visibilitychange",onVisibility);};
  },[]);

  const natures=useMemo(()=>Array.from(new Set(items.map(item=>item.nature))).sort(),[items]);
  const filtered=useMemo(()=>{const cutoff=dateCutoff(dateRange);return items.filter(item=>{const q=[item.title,item.nature].join(" ").toLowerCase().includes(query.toLowerCase());const dateOk=!cutoff||publicationTime(item)>=cutoff;return q&&dateOk&&(nature==="all"||item.nature===nature)&&(urgency==="all"||item.urgency===urgency);}).sort((a,b)=>publicationTime(b)-publicationTime(a));},[items,query,nature,urgency,dateRange]);
  const urgent=items.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
  const linked=items.filter(item=>item.dossier_id).length;
  const unlinkedItems=items.filter(item=>!item.dossier_id&&!String(item.qualification_reason||"").startsWith(IGNORED_REASON));
  const unlinked=unlinkedItems.length;
  const qualificationBatchKey=unlinkedItems.length?`${unlinkedItems.length}|${unlinkedItems.slice(0,8).map(item=>item.id).join("|")}|${unlinkedItems.slice(-8).map(item=>item.id).join("|")}`:"";
  const persistedSuggestions:Suggestion[]=items.filter(item=>!item.dossier_id&&item.suggested_dossier_id&&Number(item.qualification_confidence)>=REVIEW_THRESHOLD&&Number(item.qualification_confidence)<AUTO_LINK_THRESHOLD).map(item=>({watch_id:item.id,dossier_id:item.suggested_dossier_id||null,confidence:Number(item.qualification_confidence)||0,reason:item.qualification_reason||"Correspondance à valider."}));
  const combinedSuggestions=[...suggestions,...persistedSuggestions].filter((suggestion,index,array)=>array.findIndex(candidate=>candidate.watch_id===suggestion.watch_id)===index);
  const visibleSuggestions=combinedSuggestions.filter(s=>!ignored.includes(s.watch_id)&&!items.find(i=>i.id===s.watch_id)?.dossier_id&&s.dossier_id);

  useEffect(()=>{if(!qualificationBatchKey||!dossiers.length||qualifying)return;if(autoQualificationBatch.current===qualificationBatchKey)return;autoQualificationBatch.current=qualificationBatchKey;const timer=setTimeout(()=>{void qualify(true);},650);return()=>clearTimeout(timer);},[qualificationBatchKey,dossiers.length,qualifying]);

  async function persistReviewSuggestions(review:Suggestion[]){
    if(!supabase)return;
    const qualifiedAt=new Date().toISOString();
    for(const suggestion of review){
      const {error}=await supabase.from("watch_items").update({suggested_dossier_id:suggestion.dossier_id,qualification_confidence:suggestion.confidence,qualification_reason:suggestion.reason.slice(0,500),qualified_at:qualifiedAt}).eq("id",suggestion.watch_id);
      if(error)throw error;
    }
  }

  async function qualify(automatic=false){
    if(qualifying||!unlinkedItems.length||!dossiers.length)return;
    setQualifying(true);setQualificationMessage(automatic?`${unlinkedItems.length} publication(s) sont en cours d’analyse.`:"");setQualificationTechnical(automatic?"Lecture complète des sources officielles en cours.":"");setSuggestions([]);setIgnored([]);
    try{
      const dossierPayload=dossiers.map(d=>({id:d.id,title:d.title,objective:d.objective,context:d.context,watch_keywords:d.watch_keywords||[],watch_priority_phrases:d.watch_priority_phrases||[],watch_excluded_keywords:d.watch_excluded_keywords||[]}));
      const allResults:Suggestion[]=[];let engine="Myvor";let enriched=0;let fullTextChars=0;const batchSize=20;
      for(let start=0;start<unlinkedItems.length;start+=batchSize){
        const batch=unlinkedItems.slice(start,start+batchSize);
        setQualificationMessage(`${Math.min(start+batch.length,unlinkedItems.length)} publication(s) analysée(s) sur ${unlinkedItems.length}.`);
        setQualificationTechnical(`${automatic?"Automatisation":"Qualification"} · lecture intégrale des sources · lot ${Math.floor(start/batchSize)+1}.`);
        const response=await fetch("/api/veille/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:batch.map(i=>({id:i.id,title:i.title,nature:i.nature,source_url:i.source_url})),dossiers:dossierPayload})});
        const payload=await response.json();if(!response.ok)throw new Error(payload?.error||"Qualification impossible");engine=payload.engine||engine;enriched+=Number(payload.enriched)||0;fullTextChars+=Number(payload.full_text_chars)||0;if(Array.isArray(payload.assignments))allResults.push(...payload.assignments as Suggestion[]);
      }
      const automaticLinks=allResults.filter(s=>s.dossier_id&&Number(s.confidence)>=AUTO_LINK_THRESHOLD);let autoLinked=0;
      for(const s of automaticLinks){await link(s.watch_id,s.dossier_id);autoLinked++;}
      const review=allResults.filter(s=>s.dossier_id&&Number(s.confidence)>=REVIEW_THRESHOLD&&Number(s.confidence)<AUTO_LINK_THRESHOLD);
      await persistReviewSuggestions(review);
      setSuggestions(review);
      const noMatch=allResults.filter(s=>!s.dossier_id||Number(s.confidence)<REVIEW_THRESHOLD).length;
      const readLabel=fullTextChars>=1_000_000?`${(fullTextChars/1_000_000).toFixed(1)} M caractères lus`:fullTextChars>=1_000?`${Math.round(fullTextChars/1_000)} k caractères lus`:`${fullTextChars} caractères lus`;
      setQualificationMessage(`${autoLinked} publication(s) rattachée(s) automatiquement, ${review.length} à valider et ${noMatch} sans correspondance suffisante.`);
      setQualificationTechnical(`${allResults.length} publication(s) analysée(s) · ${enriched} texte(s) officiel(s) lu(s) · ${readLabel} · seuil automatique 95 % · moteur ${engine}.`);
    }catch(error:any){setQualificationMessage("L’analyse n’a pas pu être terminée. Les publications existantes restent disponibles.");setQualificationTechnical(error?.message||"Erreur inconnue");}finally{setQualifying(false);}
  }

  async function manualLink(watchId:string,dossierId:string|null){
    if(!supabase){await link(watchId,dossierId);return;}
    const {error}=await supabase.from("watch_items").update({suggested_dossier_id:null,qualification_confidence:null,qualification_reason:dossierId?"Rattachement manuel.":null,qualified_at:dossierId?new Date().toISOString():null}).eq("id",watchId);
    if(error){setQualificationMessage("Le rattachement n’a pas pu être enregistré.");setQualificationTechnical(error.message);return;}
    setSuggestions(current=>current.filter(x=>x.watch_id!==watchId));
    setIgnored(current=>current.filter(id=>id!==watchId));
    await link(watchId,dossierId);
  }

  async function acceptSuggestion(s:Suggestion){if(!s.dossier_id)return;await manualLink(s.watch_id,s.dossier_id);}
  async function ignoreSuggestion(watchId:string){
    if(!supabase)return;
    const {error}=await supabase.from("watch_items").update({suggested_dossier_id:null,qualification_confidence:null,qualification_reason:`${IGNORED_REASON}.`,qualified_at:new Date().toISOString()}).eq("id",watchId);
    if(error){setQualificationMessage("La suggestion n’a pas pu être ignorée.");setQualificationTechnical(error.message);return;}
    setSuggestions(current=>current.filter(x=>x.watch_id!==watchId));
    setIgnored(current=>[...new Set([...current,watchId])]);
  }

  return <div className={styles.page}>
    <style jsx global>{`.myvor-watch-focus{outline:3px solid #f3bd3e;outline-offset:3px;box-shadow:0 0 0 8px rgba(243,189,62,.12)!important}`}</style>
    <div className={styles.head}><div><div className={styles.kicker}>Sources institutionnelles</div><h1>Veille</h1><p>Centralisez les publications officielles et rattachez-les à vos dossiers clients.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={sync} disabled={syncing}><RefreshCw size={16}/> {syncing?"Synchronisation…":"Synchroniser maintenant"}</button><button className={styles.primary} onClick={add}>+ Ajouter un texte</button></div></div>
    <div className={styles.kpis}><div className={styles.kpi}><span>Total surveillé</span><strong>{items.length}</strong><small><FileText size={15}/> Publications suivies</small></div><div className={styles.kpi}><span>Rattachés</span><strong>{linked}</strong><small><Building2 size={15}/> Liés à un dossier</small></div><div className={styles.kpi}><span>À qualifier</span><strong>{unlinked}</strong><small><Search size={15}/> Non rattachés</small></div><div className={styles.kpi}><span>Priorités fortes</span><strong>{urgent}</strong><small><AlertTriangle size={15}/> Action rapide</small></div></div>

    <section className={styles.qualification}>
      <div className={styles.qualificationHead}><div><h2><Sparkles size={17}/> Analyse automatique</h2><p>Myvor identifie les publications pertinentes pour chaque dossier. Les correspondances les plus solides sont rattachées automatiquement.</p></div><button className={styles.qualificationButton} onClick={()=>qualify(false)} disabled={qualifying||!unlinked||!dossiers.length}><Sparkles size={15}/> {qualifying?"Analyse en cours…":"Relancer l’analyse"}</button></div>
      <div className={styles.qualificationStats}><span>Sources officielles</span><span>Rattachement automatique</span><span>Validation des cas incertains</span></div>
      <VeilleStatusMessage summary={qualificationMessage} technical={qualificationTechnical}/>
    </section>

    <div className={styles.sourceNotice}><b>Collecte automatique :</b> institutions parlementaires et gouvernementales, juridictions, Cour des comptes, CNIL, ARCEP et EUR-Lex.</div>{syncMessage&&<div className={styles.syncMessage}>{syncMessage}</div>}
    <div className={styles.toolbar}><label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un texte…"/></label><select className={styles.select} value={nature} onChange={e=>setNature(e.target.value)}><option value="all">Toutes les natures</option>{natures.map(value=><option key={value}>{value}</option>)}</select><select className={styles.select} value={urgency} onChange={e=>setUrgency(e.target.value)}><option value="all">Tous les impacts</option>{["faible","moyen","fort","absolument urgent"].map(value=><option key={value}>{value}</option>)}</select><select className={styles.select} value={dateRange} onChange={e=>setDateRange(e.target.value)}><option value="all">Toutes les dates</option><option value="today">Aujourd’hui</option><option value="7d">7 derniers jours</option><option value="30d">30 derniers jours</option><option value="90d">90 derniers jours</option></select><span className={styles.count}>{filtered.length} élément(s)</span></div>

    {filtered.length?<div className={styles.grid}>{filtered.map(item=>{const dossier=dossiers.find(d=>d.id===item.dossier_id);const suggestion=visibleSuggestions.find(s=>s.watch_id===item.id);const suggestedDossier=suggestion?dossiers.find(d=>d.id===suggestion.dossier_id):null;return <article id={`watch-${item.id}`} className={`${styles.card} ${focusId===item.id?"myvor-watch-focus":""}`} key={item.id}><div className={styles.top}><span className={styles.nature}>{item.nature}</span><span className={`${styles.urgency} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span></div><h3 className={styles.title}>{item.title}</h3><div className={styles.meta}><span><CalendarDays size={14}/>{publicationDate(item)}</span><span><Building2 size={14}/>{dossier?`${dossier.client} — ${dossier.title}`:"Aucun dossier"}</span></div>{suggestion&&suggestedDossier&&<div className={styles.suggestion}><div className={styles.suggestionTop}><b>Dossier suggéré : {suggestedDossier.client} — {suggestedDossier.title}</b><span className={styles.confidence}>{Math.round(suggestion.confidence*100)} %</span></div><p>{suggestion.reason}</p><div className={styles.suggestionActions}><button className={styles.accept} onClick={()=>void acceptSuggestion(suggestion)}>Rattacher</button><button className={styles.ignore} onClick={()=>void ignoreSuggestion(item.id)}>Ignorer</button></div></div>}<div className={styles.dossier}><label>Dossier lié</label><select value={item.dossier_id||""} onChange={e=>void manualLink(item.id,e.target.value||null)}><option value="">Non rattaché</option>{dossiers.map(d=><option value={d.id} key={d.id}>{d.client} — {d.title}</option>)}</select></div><div className={styles.footer}>{item.source_url?<a className={styles.source} href={item.source_url} target="_blank" rel="noreferrer">Lire le texte original</a>:<span/>}<span className={styles.count}>{item.source_name||sourceLabel(item.source_url)}</span></div></article>;})}</div>:<div className={styles.empty}><FileText size={34}/><h2>Aucun texte trouvé</h2><p>Synchronisez les sources ou modifiez vos filtres.</p></div>}
  </div>;
}