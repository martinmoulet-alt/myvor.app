"use client";

import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,Building2,CalendarDays,FileText,RefreshCw,Search} from "lucide-react";
import {supabase} from "@/lib/supabase";
import VeilleStatusMessage from "./VeilleStatusMessage";
import styles from "./VeilleCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type LinkJustification={summary?:string;objective_link?:string;evidence?:string[];consequence?:string;status?:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string;source_name?:string|null;published_at?:string|null;suggested_dossier_id?:string|null;qualification_confidence?:number|null;qualification_reason?:string|null;link_justification?:LinkJustification|null;link_justification_engine?:string|null;link_justified_at?:string|null};
type Suggestion={watch_id:string;dossier_id:string|null;confidence:number;reason:string};
type SourceTier=1|2|3|4;

const AUTO_LINK_THRESHOLD=0.95;
const REVIEW_THRESHOLD=0.60;
const IGNORED_REASON="Ignoré manuellement";

function sourceLabel(url:string){try{const host=new URL(url).hostname.replace(/^www\./,"");if(host.includes("assemblee-nationale.fr"))return "Assemblée nationale";if(host.includes("senat.fr"))return "Sénat";if(host.includes("legifrance.gouv.fr"))return "Légifrance — Journal officiel";if(host.includes("vie-publique.fr"))return "Vie-publique";if(host.includes("economie.gouv.fr"))return "Ministère de l’Économie";if(host.includes("ecologie.gouv.fr"))return "Transition écologique";if(host.includes("tresor.economie.gouv.fr"))return "Direction générale du Trésor";if(host.includes("conseil-etat.fr"))return "Conseil d’État";if(host.includes("conseil-constitutionnel.fr"))return "Conseil constitutionnel";if(host.includes("ccomptes.fr"))return "Cour des comptes";if(host.includes("cnil.fr"))return "CNIL";if(host.includes("arcep.fr"))return "ARCEP";if(host.includes("cre.fr"))return "CRE";if(host.includes("amf-france.org"))return "AMF";if(host.includes("autoritedelaconcurrence.fr"))return "Autorité de la concurrence";if(host.includes("eur-lex.europa.eu"))return "EUR-Lex";return host;}catch{return "Source officielle";}}
function sourceTier(item:Watch):SourceTier{const name=(item.source_name||sourceLabel(item.source_url)).toLocaleLowerCase("fr");if(name.includes("légifrance")||name.includes("journal officiel")||name.includes("assemblée nationale")||name.includes("sénat — textes")||name==="sénat"||name.includes("eur-lex"))return 1;if(name.includes("conseil d’état")||name.includes("conseil constitutionnel")||name.includes("dgccrf")||name.includes("cnil")||name.includes("arcep")||name.includes("cre")||name.includes("amf")||name.includes("autorité de la concurrence"))return 2;if(name.includes("rapport")||name.includes("cour des comptes")||name.includes("vie-publique")||name.includes("trésor"))return 3;return 4;}
function sourceTierLabel(tier:SourceTier){return tier===1?"Sources primaires":tier===2?"Autorités / doctrine":tier===3?"Expertise institutionnelle":"Actualité / communication";}
function sourceTierDescription(tier:SourceTier){return tier===1?"Textes normatifs et procédure parlementaire — JORF, Assemblée nationale, Sénat, EUR-Lex.":tier===2?"Décisions, doctrine et positions des autorités publiques et régulateurs.":tier===3?"Rapports, analyses et expertise produites par les institutions publiques.":"Communiqués, actualités et prises de parole institutionnelles.";}
function sourceTierRoman(tier:SourceTier){return tier===1?"I":tier===2?"II":tier===3?"III":"IV";}
function publicationDate(item:Watch){const value=item.published_at||item.created_at;const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString("fr-FR"):"";}
function publicationTime(item:Watch){const primary=item.published_at?Date.parse(item.published_at):NaN;if(Number.isFinite(primary))return primary;const fallback=Date.parse(item.created_at);return Number.isFinite(fallback)?fallback:0;}
function dateCutoff(range:string){const now=new Date();if(range==="today"){const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());return start.getTime();}const days=range==="7d"?7:range==="30d"?30:range==="90d"?90:0;return days?Date.now()-days*24*60*60*1000:0;}

export default function VeilleCorporate({items,dossiers,add,refresh,refreshing,refreshMessage,link}:{items:Watch[];dossiers:Dossier[];add:()=>void;refresh:()=>void;refreshing:boolean;refreshMessage:string;link:(watchId:string,dossierId:string|null)=>Promise<void>|void}){
  const[query,setQuery]=useState("");
  const[nature,setNature]=useState("all");
  const[urgency,setUrgency]=useState("all");
  const[dateRange,setDateRange]=useState("all");
  const[operationMessage,setOperationMessage]=useState("");
  const[operationTechnical,setOperationTechnical]=useState("");
  const[ignored,setIgnored]=useState<string[]>([]);
  const[focusId,setFocusId]=useState<string|null>(null);

  useEffect(()=>{const target=sessionStorage.getItem("myvor:open-watch");if(!target)return;const item=items.find(entry=>entry.id===target);if(!item)return;sessionStorage.removeItem("myvor:open-watch");setQuery(item.title);setNature("all");setUrgency("all");setDateRange("all");setFocusId(item.id);setTimeout(()=>document.getElementById(`watch-${item.id}`)?.scrollIntoView({behavior:"smooth",block:"center"}),80);setTimeout(()=>setFocusId(null),2200);},[items]);

  const natures=useMemo(()=>Array.from(new Set(items.map(item=>item.nature))).sort(),[items]);
  const filtered=useMemo(()=>{const cutoff=dateCutoff(dateRange);return items.filter(item=>{const q=[item.title,item.nature,item.source_name||""].join(" ").toLowerCase().includes(query.toLowerCase());const dateOk=!cutoff||publicationTime(item)>=cutoff;return q&&dateOk&&(nature==="all"||item.nature===nature)&&(urgency==="all"||item.urgency===urgency);}).sort((a,b)=>publicationTime(b)-publicationTime(a));},[items,query,nature,urgency,dateRange]);
  const grouped=useMemo(()=>(([1,2,3,4] as SourceTier[]).map(tier=>({tier,items:filtered.filter(item=>sourceTier(item)===tier)}))),[filtered]);
  const urgent=items.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
  const linked=items.filter(item=>item.dossier_id).length;
  const unlinked=items.filter(item=>!item.dossier_id&&!String(item.qualification_reason||"").startsWith(IGNORED_REASON)).length;
  const persistedSuggestions:Suggestion[]=items.filter(item=>!item.dossier_id&&item.suggested_dossier_id&&Number(item.qualification_confidence)>=REVIEW_THRESHOLD&&Number(item.qualification_confidence)<AUTO_LINK_THRESHOLD).map(item=>({watch_id:item.id,dossier_id:item.suggested_dossier_id||null,confidence:Number(item.qualification_confidence)||0,reason:item.qualification_reason||"Correspondance à valider."}));
  const visibleSuggestions=persistedSuggestions.filter(s=>!ignored.includes(s.watch_id)&&!items.find(i=>i.id===s.watch_id)?.dossier_id&&s.dossier_id);
  const visibleRefreshMessage=refreshMessage.startsWith("Impossible")?refreshMessage:refreshMessage?"Veille actualisée.":"";

  function justificationBlock(justification:LinkJustification|null|undefined,compact=false){
    if(!justification)return null;
    const evidence=Array.isArray(justification.evidence)?justification.evidence.filter(Boolean).slice(0,3):[];
    const hasDetail=Boolean(justification.objective_link||evidence.length||justification.consequence);
    if(!justification.summary&&!hasDetail)return null;
    return <div className={`myvor-link-why ${compact?"myvor-link-why-compact":""}`}>
      <div className="myvor-link-why-title">Pourquoi ce rattachement ?</div>
      {justification.summary&&<p className="myvor-link-why-summary">{justification.summary}</p>}
      {justification.objective_link&&<div className="myvor-link-why-row"><b>Lien avec le dossier</b><span>{justification.objective_link}</span></div>}
      {evidence.length>0&&<div className="myvor-link-why-row"><b>Preuves</b><ul>{evidence.map((value,index)=><li key={`${index}-${value}`}>{value}</li>)}</ul></div>}
      {justification.consequence&&<div className="myvor-link-why-row"><b>Conséquence</b><span>{justification.consequence}</span></div>}
    </div>;
  }

  async function manualLink(watchId:string,dossierId:string|null,preserveJustification=false){
    if(!supabase){await link(watchId,dossierId);return;}
    setOperationMessage("");setOperationTechnical("");
    const current=items.find(item=>item.id===watchId);
    const now=new Date().toISOString();
    const existing=current?.link_justification||null;
    const linkJustification=dossierId?(preserveJustification&&existing?{...existing,status:"confirmed"}:{summary:"Rattachement manuel.",objective_link:"Ce texte a été rattaché manuellement à ce dossier.",evidence:[],consequence:"Le texte est intégré au suivi du dossier après validation manuelle.",status:"confirmed"}):null;
    const{error}=await supabase.from("watch_items").update({
      suggested_dossier_id:null,
      qualification_confidence:preserveJustification?(current?.qualification_confidence??null):null,
      qualification_reason:preserveJustification?(current?.qualification_reason||null):(dossierId?"Rattachement manuel.":null),
      link_justification:linkJustification,
      link_justification_engine:dossierId?(preserveJustification?(current?.link_justification_engine||"accepted-suggestion"):"manual"):null,
      link_justified_at:dossierId?now:null,
      qualified_at:dossierId?now:null
    }).eq("id",watchId);
    if(error){setOperationMessage("Le rattachement n’a pas pu être enregistré.");setOperationTechnical(error.message);return;}
    setIgnored(currentIds=>currentIds.filter(id=>id!==watchId));
    await link(watchId,dossierId);
  }

  async function acceptSuggestion(s:Suggestion){if(!s.dossier_id)return;await manualLink(s.watch_id,s.dossier_id,true);}
  async function ignoreSuggestion(watchId:string){
    if(!supabase)return;
    setOperationMessage("");setOperationTechnical("");
    const{error}=await supabase.from("watch_items").update({suggested_dossier_id:null,qualification_confidence:null,qualification_reason:`${IGNORED_REASON}.`,link_justification:null,link_justification_engine:null,link_justified_at:null,qualified_at:new Date().toISOString()}).eq("id",watchId);
    if(error){setOperationMessage("La suggestion n’a pas pu être ignorée.");setOperationTechnical(error.message);return;}
    setIgnored(current=>[...new Set([...current,watchId])]);
  }

  function renderWatch(item:Watch){
    const dossier=dossiers.find(d=>d.id===item.dossier_id);
    const suggestion=visibleSuggestions.find(s=>s.watch_id===item.id);
    const suggestedDossier=suggestion?dossiers.find(d=>d.id===suggestion.dossier_id):null;
    const tier=sourceTier(item);
    const sourceName=item.source_name||sourceLabel(item.source_url);
    return <article id={`watch-${item.id}`} className={`${styles.card} ${focusId===item.id?"myvor-watch-focus":""}`} key={item.id}>
      <div className={styles.top}><span className={styles.nature}>{item.nature}</span><span className={`${styles.urgency} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span></div>
      <h3 className={styles.title}>{item.title}</h3>
      <div className={styles.meta}><span><CalendarDays size={14}/>{publicationDate(item)}</span><span><Building2 size={14}/>{dossier?`${dossier.client} — ${dossier.title}`:"Aucun dossier"}</span></div>
      {dossier&&justificationBlock(item.link_justification)}
      {suggestion&&suggestedDossier&&<div className={styles.suggestion}><div className={styles.suggestionTop}><b>Dossier suggéré : {suggestedDossier.client} — {suggestedDossier.title}</b><span className={styles.confidence}>{Math.round(suggestion.confidence*100)} %</span></div>{item.link_justification?justificationBlock(item.link_justification,true):<p>{suggestion.reason}</p>}<div className={styles.suggestionActions}><button className={styles.accept} onClick={()=>void acceptSuggestion(suggestion)}>Rattacher</button><button className={styles.ignore} onClick={()=>void ignoreSuggestion(item.id)}>Ignorer</button></div></div>}
      <div className={styles.dossier}><label>Dossier lié</label><select value={item.dossier_id||""} onChange={e=>void manualLink(item.id,e.target.value||null)}><option value="">Non rattaché</option>{dossiers.map(d=><option value={d.id} key={d.id}>{d.client} — {d.title}</option>)}</select></div>
      <div className={styles.footer}>{item.source_url?<a className={styles.source} href={item.source_url} target="_blank" rel="noreferrer">Lire le texte original</a>:<span/>}<span className="myvor-source-footer"><span className={`myvor-source-tier myvor-source-tier-${tier}`} title={`Priorité ${tier} — ${sourceTierLabel(tier)}`}>P{tier}</span><span className={styles.count}>{sourceName}</span></span></div>
    </article>;
  }

  return <div className={styles.page}>
    <style jsx global>{`.myvor-watch-focus{outline:3px solid #f3bd3e;outline-offset:3px;box-shadow:0 0 0 8px rgba(243,189,62,.12)!important}.myvor-link-why{margin:13px 0;padding:14px 15px;border:1px solid rgba(243,189,62,.3);border-left:4px solid #f3bd3e;border-radius:12px;background:rgba(7,25,47,.72);display:grid;gap:9px}.myvor-link-why-title{color:#f3bd3e;font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.myvor-link-why-summary{margin:0!important;color:#f5f8fc!important;font-size:13px!important;font-weight:750;line-height:1.5!important}.myvor-link-why-row{display:grid;grid-template-columns:128px minmax(0,1fr);gap:10px;align-items:start;color:#cbd7e5;font-size:12px;line-height:1.5}.myvor-link-why-row b{color:#91a5bc;font-size:10px;letter-spacing:.04em;text-transform:uppercase}.myvor-link-why-row ul{margin:0;padding-left:17px;display:grid;gap:3px}.myvor-link-why-compact{margin:10px 0;background:rgba(3,15,30,.32)}.myvor-source-legend{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}.myvor-source-tier{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;line-height:1;border:1px solid transparent;white-space:nowrap;box-shadow:0 5px 14px rgba(0,0,0,.18)}.myvor-source-tier::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.myvor-source-tier-1{background:#ffc62a;border-color:#ffd967;color:#07162c}.myvor-source-tier-2{background:#3199ff;border-color:#72b9ff;color:#04172b}.myvor-source-tier-3{background:#8b6cf6;border-color:#b19df9;color:#fff}.myvor-source-tier-4{background:#68798d;border-color:#8b9aab;color:#fff}.myvor-source-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.myvor-watch-sections{display:grid;gap:24px}.myvor-watch-section{display:grid;gap:10px}.myvor-watch-section-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:center;padding:14px 16px;border-radius:14px;background:#07192f;border:1px solid #24415f}.myvor-watch-section-number{font-size:24px;font-weight:950;letter-spacing:-.04em;min-width:42px}.myvor-watch-section-copy h2{margin:0;color:#f7f9fc;font-size:17px}.myvor-watch-section-copy p{margin:3px 0 0;color:#91a5bc;font-size:11px;line-height:1.4}.myvor-watch-section-count{font-size:12px;font-weight:900;color:#d8e2ed;background:#0b2541;border:1px solid #29445f;border-radius:999px;padding:7px 10px;white-space:nowrap}.myvor-watch-section-1 .myvor-watch-section-head{border-left:5px solid #ffc62a}.myvor-watch-section-1 .myvor-watch-section-number{color:#ffc62a}.myvor-watch-section-2 .myvor-watch-section-head{border-left:5px solid #3199ff}.myvor-watch-section-2 .myvor-watch-section-number{color:#69b5ff}.myvor-watch-section-3 .myvor-watch-section-head{border-left:5px solid #8b6cf6}.myvor-watch-section-3 .myvor-watch-section-number{color:#b9a3ff}.myvor-watch-section-4 .myvor-watch-section-head{border-left:5px solid #68798d}.myvor-watch-section-4 .myvor-watch-section-number{color:#9bacc2}@media(max-width:620px){.myvor-link-why-row{grid-template-columns:1fr;gap:3px}.myvor-source-legend{gap:6px}.myvor-source-tier{font-size:10px;padding:5px 8px}.myvor-source-footer{justify-content:flex-start}.myvor-watch-section-head{grid-template-columns:auto 1fr;padding:12px}.myvor-watch-section-count{grid-column:2;justify-self:start}.myvor-watch-section-number{font-size:20px;min-width:34px}}`}</style>
    <div className={styles.head}><div><div className={styles.kicker}>Sources institutionnelles</div><h1>Veille</h1><p>Centralisez les publications officielles et rattachez-les à vos dossiers clients.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={refresh} disabled={refreshing}><RefreshCw size={16}/> {refreshing?"Actualisation…":"Actualiser"}</button><button className={styles.primary} onClick={add}>+ Ajouter un texte</button></div></div>
    <div className={styles.kpis}><div className={styles.kpi}><span>Total surveillé</span><strong>{items.length}</strong><small><FileText size={15}/> Publications suivies</small></div><div className={styles.kpi}><span>Rattachés</span><strong>{linked}</strong><small><Building2 size={15}/> Liés à un dossier</small></div><div className={styles.kpi}><span>À qualifier</span><strong>{unlinked}</strong><small><Search size={15}/> À examiner</small></div><div className={styles.kpi}><span>Priorités fortes</span><strong>{urgent}</strong><small><AlertTriangle size={15}/> Action rapide</small></div></div>
    {(operationMessage||visibleRefreshMessage)&&<VeilleStatusMessage summary={operationMessage||visibleRefreshMessage} technical={operationTechnical}/>} 
    <div className="myvor-source-legend" aria-label="Priorité des sources"><span className="myvor-source-tier myvor-source-tier-1">I · Sources primaires</span><span className="myvor-source-tier myvor-source-tier-2">II · Autorités / doctrine</span><span className="myvor-source-tier myvor-source-tier-3">III · Expertise</span><span className="myvor-source-tier myvor-source-tier-4">IV · Communication</span></div>
    <div className={styles.toolbar}><label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un texte ou une source…"/></label><select className={styles.select} value={nature} onChange={e=>setNature(e.target.value)}><option value="all">Toutes les natures</option>{natures.map(value=><option key={value}>{value}</option>)}</select><select className={styles.select} value={urgency} onChange={e=>setUrgency(e.target.value)}><option value="all">Tous les impacts</option>{["faible","moyen","fort","absolument urgent"].map(value=><option key={value}>{value}</option>)}</select><select className={styles.select} value={dateRange} onChange={e=>setDateRange(e.target.value)}><option value="all">Toutes les dates</option><option value="today">Aujourd’hui</option><option value="7d">7 derniers jours</option><option value="30d">30 derniers jours</option><option value="90d">90 derniers jours</option></select><span className={styles.count}>{filtered.length} élément(s)</span></div>

    {filtered.length?<div className="myvor-watch-sections">{grouped.map(group=>group.items.length?<section className={`myvor-watch-section myvor-watch-section-${group.tier}`} key={group.tier}><div className="myvor-watch-section-head"><div className="myvor-watch-section-number">{sourceTierRoman(group.tier)}.</div><div className="myvor-watch-section-copy"><h2>{sourceTierLabel(group.tier)}</h2><p>{sourceTierDescription(group.tier)}</p></div><div className="myvor-watch-section-count">{group.items.length} publication{group.items.length>1?"s":""}</div></div><div className={styles.grid}>{group.items.map(renderWatch)}</div></section>:null)}</div>:<div className={styles.empty}><FileText size={34}/><h2>Aucun texte trouvé</h2><p>Aucune publication ne correspond aux filtres sélectionnés.</p></div>}
  </div>;
}
