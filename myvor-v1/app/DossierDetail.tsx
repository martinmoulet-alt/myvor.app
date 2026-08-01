"use client";

import { ArrowLeft,FileText,Target,AlertTriangle,UserRound,CalendarDays,Sparkles } from "lucide-react";
import type { Action } from "./DashboardCorporate";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";

export default function DossierDetail({dossier,watch,actions,back,go}:{dossier:Dossier;watch:Watch[];actions:Action[];back:()=>void;go:(tab:Tab)=>void}){
  const related=watch.filter(w=>w.dossier_id===dossier.id);
  const openActions=actions.filter(a=>a.dossier_id===dossier.id&&a.status!=="termine");
  const urgent=related.filter(w=>["fort","absolument urgent"].includes(w.urgency));
  const contacts=openActions.filter(a=>a.type==="contact");
  return <div className="corp-dashboard">
    <button className="corp-primary" style={{marginBottom:18}} onClick={back}><ArrowLeft size={16}/> Retour aux dossiers</button>
    <div className="corp-head"><div><div className="corp-kicker">Dossier client</div><h1>{dossier.title}</h1><p>{dossier.client}</p></div><span className="corp-status">{dossier.status}</span></div>
    <section className="corp-panel" style={{marginBottom:16}}><div className="corp-panel-head"><div><span>Objectif stratégique</span><h2>{dossier.objective}</h2></div><Target size={20}/></div>{dossier.context&&<p>{dossier.context}</p>}</section>
    <div className="corp-kpis"><div className="corp-kpi"><span>Textes liés</span><strong>{related.length}</strong><small><FileText size={15}/> Corpus du dossier</small></div><div className="corp-kpi alert"><span>Risques forts</span><strong>{urgent.length}</strong><small><AlertTriangle size={15}/> À surveiller</small></div><div className="corp-kpi"><span>Actions ouvertes</span><strong>{openActions.length}</strong><small><CalendarDays size={15}/> À exécuter</small></div><div className="corp-kpi"><span>Acteurs à contacter</span><strong>{contacts.length}</strong><small><UserRound size={15}/> Radar opérationnel</small></div></div>
    <div className="corp-dashboard-grid"><section className="corp-panel"><div className="corp-panel-head"><div><span>Veille liée</span><h2>Textes du dossier</h2></div><button onClick={()=>go("veille")}>Ouvrir la veille</button></div><div className="corp-list">{related.length?related.map(item=><a className="corp-list-row" key={item.id} href={item.source_url||undefined} target={item.source_url?"_blank":undefined} rel="noreferrer"><span className="corp-doc"><FileText size={18}/></span><span className="corp-list-copy"><b>{item.title}</b><small>{item.nature}</small></span><span className={`corp-impact ${item.urgency.replaceAll(" ","-")}`}>{item.urgency}</span></a>):<div className="corp-empty">Aucun texte rattaché.</div>}</div></section>
    <section className="corp-panel"><div className="corp-panel-head"><div><span>Plan d’action</span><h2>Actions ouvertes</h2></div></div><div className="corp-list">{openActions.length?openActions.map(a=><button className="corp-list-row" key={a.id} onClick={()=>go(a.type==="contact"?"radar":a.type==="note_client"||a.type==="amendement"?"builder":"impact")}><span className="corp-list-copy"><b>{a.title}</b><small>{[a.actor_name,a.priority,a.due_date?new Date(a.due_date).toLocaleDateString("fr-FR"):null].filter(Boolean).join(" · ")}</small></span></button>):<div className="corp-empty">Aucune action ouverte.</div>}</div></section>
    <aside className="corp-side-stack"><section className="corp-panel corp-score-card"><span>Outils du dossier</span><button onClick={()=>go("impact")}><Sparkles size={15}/> Note d’impact</button><button onClick={()=>go("radar")}><Sparkles size={15}/> Radar d’influence</button><button onClick={()=>go("builder")}><Sparkles size={15}/> Note Builder</button></section></aside></div>
  </div>;
}
