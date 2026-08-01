"use client";

import { useMemo,useState } from "react";
import { AlertTriangle,FileText,Sparkles } from "lucide-react";
import styles from "./ImpactCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Note={title?:string;executive_summary?:string;score?:number;level?:string;rationale?:string;risks?:string[];opportunities?:string[];deadlines?:string[];recommendations?:string[];sources_used?:{title:string;url:string}[]};

export default function ImpactModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[]}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState<Note|null>(null);

  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);
  const effectiveIds=selectedIds.length?selectedIds:related.map(w=>w.id);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    const items=related.filter(w=>effectiveIds.includes(w.id));
    if(!items.length){setError("Aucun élément de veille n’est rattaché à ce dossier.");return;}
    setLoading(true);setError("");setNote(null);
    try{
      const response=await fetch("/api/impact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dossier,items})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error||"Génération impossible");
      setNote(payload.note||null);
    }catch(err:any){setError(err?.message||"Génération impossible");}
    finally{setLoading(false);}
  }

  function toggle(id:string){
    const base=selectedIds.length?selectedIds:related.map(w=>w.id);
    setSelectedIds(base.includes(id)?base.filter(x=>x!==id):[...base,id]);
  }

  const level=String(note?.level||"moyen");
  const levelKey=level.replaceAll(" ","-") as keyof typeof styles;

  return <div className={styles.page}>
    <div className={styles.head}>
      <div><div className={styles.kicker}>Analyse stratégique</div><h1>Note d’impact</h1><p>Transformez les évolutions institutionnelles en risques, opportunités, échéances et recommandations.</p></div>
    </div>

    <div className={styles.setup}>
      <section className={styles.panel}>
        <h2>1. Choisir le dossier</h2>
        <div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setSelectedIds([]);setNote(null);setError("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>
        {dossier&&<div className={styles.objective}><b>Objectif client :</b><br/>{dossier.objective}</div>}
      </section>

      <section className={styles.panel}>
        <h2>2. Choisir les éléments de veille</h2>
        {related.length?<div className={styles.watchList}>{related.map(item=><label key={item.id} className={styles.watchItem}>
          <input type="checkbox" checked={effectiveIds.includes(item.id)} onChange={()=>toggle(item.id)}/>
          <span className={styles.watchCopy}><span className={styles.nature}>{item.nature}</span><b>{item.title}</b></span>
          <span className={`${styles.impact} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span>
        </label>)}</div>:<div className={styles.empty}><AlertTriangle size={30}/><h3>Aucun texte rattaché</h3><p>Rattache d’abord un élément depuis la page Veille.</p></div>}
      </section>
    </div>

    <div className={styles.generate}>
      <div className={styles.generateCopy}><h3>Prêt à analyser</h3><p>{effectiveIds.length} texte(s) sélectionné(s) pour ce dossier.</p></div>
      <button disabled={loading||!dossier||!related.length} onClick={generate}><Sparkles size={17}/>{loading?"Analyse en cours…":"Générer la note d’impact"}</button>
    </div>
    {error&&<div className={styles.error}>{error}</div>}

    {note&&<div className={styles.result}>
      <section className={styles.summary}>
        <div className={styles.summaryTop}>
          <div><div className={styles.eyebrow}>Note générée</div><h2>{note.title||`Note d’impact — ${dossier?.title||"Dossier"}`}</h2><p>{note.executive_summary}</p></div>
          <div className={styles.scoreBox}><span>Score d’impact</span><div className={styles.scoreLine}><strong>{Math.round(Number(note.score)||0)}</strong><small>/100</small></div><div className={`${styles.level} ${styles[levelKey]||""}`}>{level}</div></div>
        </div>
        {note.rationale&&<div className={styles.rationale}><b>Pourquoi ce niveau :</b> {note.rationale}</div>}
      </section>

      <div className={styles.sections}>
        <Section title="Risques" items={note.risks}/>
        <Section title="Opportunités" items={note.opportunities}/>
        <Section title="Échéances" items={note.deadlines}/>
        <Section title="Recommandations" items={note.recommendations}/>
      </div>

      {!!note.sources_used?.length&&<section className={styles.sources}><h3>Sources analysées</h3>{note.sources_used.map((source,index)=><div className={styles.sourceRow} key={`${source.url}-${index}`}><span><FileText size={14}/> {source.title}</span>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">Lire le texte original</a>}</div>)}</section>}
    </div>}
  </div>;
}

function Section({title,items}:{title:string;items?:string[]}){
  return <section className={styles.section}><h3>{title}</h3>{items?.length?<ul>{items.map((item,index)=><li key={index}>{item}</li>)}</ul>:<p>Aucun élément identifié.</p>}</section>;
}
