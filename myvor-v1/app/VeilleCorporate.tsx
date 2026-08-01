"use client";

import { useMemo,useState } from "react";
import { AlertTriangle,Building2,CalendarDays,FileText,RefreshCw,Search } from "lucide-react";
import styles from "./VeilleCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};

export default function VeilleCorporate({items,dossiers,add,sync,syncing,syncMessage,link}:{items:Watch[];dossiers:Dossier[];add:()=>void;sync:()=>void;syncing:boolean;syncMessage:string;link:(watchId:string,dossierId:string|null)=>void}){
  const [query,setQuery]=useState("");
  const [nature,setNature]=useState("all");
  const [urgency,setUrgency]=useState("all");
  const natures=useMemo(()=>Array.from(new Set(items.map(item=>item.nature))).sort(),[items]);
  const filtered=useMemo(()=>items.filter(item=>{
    const q=[item.title,item.nature].join(" ").toLowerCase().includes(query.toLowerCase());
    return q&&(nature==="all"||item.nature===nature)&&(urgency==="all"||item.urgency===urgency);
  }),[items,query,nature,urgency]);
  const urgent=items.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
  const linked=items.filter(item=>item.dossier_id).length;
  const unlinked=items.length-linked;

  return <div className={styles.page}>
    <div className={styles.head}>
      <div><div className={styles.kicker}>Sources institutionnelles</div><h1>Veille</h1><p>Centralisez les publications officielles et rattachez-les à vos dossiers clients.</p></div>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={sync} disabled={syncing}><RefreshCw size={16}/> {syncing?"Synchronisation…":"Synchroniser"}</button>
        <button className={styles.primary} onClick={add}>+ Ajouter un texte</button>
      </div>
    </div>

    <div className={styles.kpis}>
      <div className={styles.kpi}><span>Total surveillé</span><strong>{items.length}</strong><small><FileText size={15}/> Publications suivies</small></div>
      <div className={styles.kpi}><span>Rattachés</span><strong>{linked}</strong><small><Building2 size={15}/> Liés à un dossier</small></div>
      <div className={styles.kpi}><span>À qualifier</span><strong>{unlinked}</strong><small><Search size={15}/> Non rattachés</small></div>
      <div className={styles.kpi}><span>Priorités fortes</span><strong>{urgent}</strong><small><AlertTriangle size={15}/> Action rapide</small></div>
    </div>

    <div className={styles.sourceNotice}><b>Sources automatiques :</b> Assemblée nationale, Sénat et Journal officiel via Légifrance.</div>
    {syncMessage&&<div className={styles.syncMessage}>{syncMessage}</div>}

    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un texte…"/></label>
      <select className={styles.select} value={nature} onChange={e=>setNature(e.target.value)}><option value="all">Toutes les natures</option>{natures.map(value=><option key={value}>{value}</option>)}</select>
      <select className={styles.select} value={urgency} onChange={e=>setUrgency(e.target.value)}><option value="all">Tous les impacts</option>{["faible","moyen","fort","absolument urgent"].map(value=><option key={value}>{value}</option>)}</select>
      <span className={styles.count}>{filtered.length} élément(s)</span>
    </div>

    {filtered.length?<div className={styles.grid}>{filtered.map(item=>{
      const dossier=dossiers.find(d=>d.id===item.dossier_id);
      return <article className={styles.card} key={item.id}>
        <div className={styles.top}><span className={styles.nature}>{item.nature}</span><span className={`${styles.urgency} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span></div>
        <h3 className={styles.title}>{item.title}</h3>
        <div className={styles.meta}><span><CalendarDays size={14}/>{new Date(item.created_at).toLocaleDateString("fr-FR")}</span><span><Building2 size={14}/>{dossier?`${dossier.client} — ${dossier.title}`:"Aucun dossier"}</span></div>
        <div className={styles.dossier}><label>Dossier lié</label><select value={item.dossier_id||""} onChange={e=>link(item.id,e.target.value||null)}><option value="">Non rattaché</option>{dossiers.map(d=><option value={d.id} key={d.id}>{d.client} — {d.title}</option>)}</select></div>
        <div className={styles.footer}>{item.source_url?<a className={styles.source} href={item.source_url} target="_blank" rel="noreferrer">Lire le texte original</a>:<span/>}<span className={styles.count}>Source officielle</span></div>
      </article>;
    })}</div>:<div className={styles.empty}><FileText size={34}/><h2>Aucun texte trouvé</h2><p>Synchronisez les sources ou modifiez vos filtres.</p></div>}
  </div>;
}
