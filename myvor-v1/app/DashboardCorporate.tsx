"use client";

import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarDays, FileText, Search, Sparkles } from "lucide-react";

type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";
type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};

export default function DashboardCorporate({dossiers,watch,go}:{dossiers:Dossier[];watch:Watch[];go:(tab:Tab)=>void}){
  const urgent=watch.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
  const linked=watch.filter(item=>item.dossier_id).length;
  const recentDossiers=dossiers.slice(0,4);
  const recentWatch=watch.slice(0,4);
  const topPriority=watch.find(item=>["absolument urgent","fort"].includes(item.urgency))||watch[0];

  return <div className="corp-dashboard">
    <div className="corp-head">
      <div>
        <div className="corp-kicker">Vue d’ensemble</div>
        <h1>Tableau de bord</h1>
        <p>Suivez vos dossiers, vos textes et vos priorités en un coup d’œil.</p>
      </div>
      <div className="corp-head-actions">
        <div className="corp-search"><Search size={17}/><span>Rechercher…</span></div>
        <button className="corp-primary" onClick={()=>go("dossiers")}>+ Nouveau dossier</button>
      </div>
    </div>

    <div className="corp-kpis">
      <div className="corp-kpi"><span>Dossiers actifs</span><strong>{dossiers.length}</strong><small><BriefcaseBusiness size={15}/> Portefeuille client</small></div>
      <div className="corp-kpi"><span>Textes suivis</span><strong>{watch.length}</strong><small><FileText size={15}/> Veille institutionnelle</small></div>
      <div className="corp-kpi"><span>Textes rattachés</span><strong>{linked}</strong><small><Sparkles size={15}/> Analyse exploitable</small></div>
      <div className="corp-kpi alert"><span>Alertes actives</span><strong>{urgent}</strong><small><AlertTriangle size={15}/> À traiter rapidement</small></div>
    </div>

    <div className="corp-dashboard-grid">
      <section className="corp-panel">
        <div className="corp-panel-head"><div><span>Dossiers récents</span><h2>Portefeuille client</h2></div><button onClick={()=>go("dossiers")}>Voir tout <ArrowRight size={15}/></button></div>
        <div className="corp-list">
          {recentDossiers.length?recentDossiers.map((dossier,index)=><button className="corp-list-row" key={dossier.id} onClick={()=>go("dossiers")}>
            <span className="corp-avatar">{(dossier.client||dossier.title||"D").slice(0,2).toUpperCase()}</span>
            <span className="corp-list-copy"><b>{dossier.title}</b><small>{dossier.client}</small></span>
            <span className="corp-status">Actif</span>
            <ArrowRight size={16}/>
          </button>):<div className="corp-empty">Aucun dossier client pour le moment.</div>}
        </div>
      </section>

      <section className="corp-panel">
        <div className="corp-panel-head"><div><span>Veille récente</span><h2>Dernières évolutions</h2></div><button onClick={()=>go("veille")}>Voir tout <ArrowRight size={15}/></button></div>
        <div className="corp-list">
          {recentWatch.length?recentWatch.map(item=><button className="corp-list-row" key={item.id} onClick={()=>go("veille")}>
            <span className="corp-doc"><FileText size={18}/></span>
            <span className="corp-list-copy"><b>{item.title}</b><small>{item.nature}</small></span>
            <span className={`corp-impact ${item.urgency.replaceAll(" ","-")}`}>{item.urgency}</span>
          </button>):<div className="corp-empty">Aucun élément de veille pour le moment.</div>}
        </div>
      </section>

      <aside className="corp-side-stack">
        <section className="corp-panel corp-deadline">
          <div className="corp-panel-head"><div><span>Priorité</span><h2>Prochaine action</h2></div><CalendarDays size={19}/></div>
          {topPriority?<><div className="corp-date-box"><b>À traiter</b><span>{topPriority.nature}</span></div><h3>{topPriority.title}</h3><p>Niveau : {topPriority.urgency}</p><button onClick={()=>go("impact")}>Ouvrir la Note d’impact</button></>:<div className="corp-empty">Aucune priorité détectée.</div>}
        </section>
        <section className="corp-panel corp-score-card">
          <span>Capacité opérationnelle</span>
          <div className="corp-score-line"><strong>{watch.length?Math.min(100,55+linked*5):0}</strong><small>/100</small></div>
          <p>Votre veille est reliée à vos dossiers et prête à être transformée en action.</p>
          <button onClick={()=>go("builder")}>Ouvrir le Note Builder</button>
        </section>
      </aside>
    </div>
  </div>;
}
