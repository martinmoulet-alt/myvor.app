"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";

type Dossier = { id:string; client:string; title:string; objective:string; context:string; status:string; created_at:string };
type Watch = { id:string; title:string; nature:string; source_url:string; dossier_id:string|null; urgency:string; created_at:string };
type Note = {
  title?: string;
  executive_summary?: string;
  score?: number;
  level?: string;
  rationale?: string;
  risks?: string[];
  opportunities?: string[];
  deadlines?: string[];
  recommendations?: string[];
  sources_used?: {title:string;url:string}[];
};

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
      const response=await fetch("/api/impact",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({dossier,items}),
      });
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
  const levelClass=level==="faible"?"green":level==="moyen"?"orange":level==="fort"?"red":"wine";

  return <>
    <div className="toolbar"><div><div className="eyebrow">Analyse stratégique</div><h1 className="h1">Note d’impact</h1><p className="lead">Transformez les évolutions institutionnelles d’un dossier en risques, opportunités, échéances et recommandations.</p></div></div>

    <div className="grid two">
      <div className="card">
        <h2>1. Choisir le dossier</h2>
        <div className="field"><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setSelectedIds([]);setNote(null);setError("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>
        {dossier&&<div className="notice small"><b>Objectif :</b> {dossier.objective}</div>}
      </div>

      <div className="card">
        <h2>2. Choisir les éléments de veille</h2>
        {related.length?<div className="list">{related.map(w=><label key={w.id} className="row" style={{cursor:"pointer"}}><div style={{display:"flex",gap:10,alignItems:"flex-start"}}><input type="checkbox" checked={effectiveIds.includes(w.id)} onChange={()=>toggle(w.id)} style={{marginTop:4}}/><div><span className="badge">{w.nature}</span><h3 style={{marginTop:7}}>{w.title}</h3></div></div></label>)}</div>:<div className="empty"><AlertTriangle size={30}/><h3>Aucun texte rattaché</h3><p className="muted">Rattache d’abord un élément depuis la page Veille.</p></div>}
      </div>
    </div>

    <div className="card" style={{marginTop:16}}>
      <button className="btn primary" disabled={loading||!dossier||!related.length} onClick={generate}><Sparkles size={17}/>{loading?" Analyse en cours…":" Générer la note d’impact"}</button>
      {error&&<div className="notice" style={{marginTop:12}}>{error}</div>}
    </div>

    {note&&<div className="card" style={{marginTop:16}}>
      <div className="toolbar" style={{marginTop:0}}><div><div className="eyebrow">Note générée</div><h2>{note.title||`Note d’impact — ${dossier?.title||"Dossier"}`}</h2></div><div style={{display:"flex",gap:8,alignItems:"center"}}><span className={`badge ${levelClass}`}>{level}</span><span className="badge">Score {Math.round(Number(note.score)||0)}/100</span></div></div>
      <p>{note.executive_summary}</p>
      {note.rationale&&<div className="notice small"><b>Pourquoi ce niveau :</b> {note.rationale}</div>}
      <div className="grid two" style={{marginTop:14}}>
        <Section title="Risques" items={note.risks}/>
        <Section title="Opportunités" items={note.opportunities}/>
        <Section title="Échéances" items={note.deadlines}/>
        <Section title="Recommandations" items={note.recommendations}/>
      </div>
      {!!note.sources_used?.length&&<div style={{marginTop:16}}><h3>Sources analysées</h3><div className="list">{note.sources_used.map((s,i)=><div className="row" key={`${s.url}-${i}`}><span>{s.title}</span>{s.url&&<a className="small" href={s.url} target="_blank" rel="noreferrer">Lire le texte original</a>}</div>)}</div></div>}
    </div>}
  </>;
}

function Section({title,items}:{title:string;items?:string[]}){
  return <div className="card"><h3>{title}</h3>{items?.length?<ul>{items.map((item,i)=><li key={i}>{item}</li>)}</ul>:<p className="muted small">Aucun élément identifié.</p>}</div>;
}
