"use client";

import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarDays, FileText, Link2, Search, Sparkles, Target, Zap } from "lucide-react";

type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";
type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};

type DailyAction={
  id:string;
  title:string;
  detail:string;
  level:"critical"|"high"|"medium";
  tab:Tab;
  cta:string;
};

export default function DashboardCorporate({dossiers,watch,go}:{dossiers:Dossier[];watch:Watch[];go:(tab:Tab)=>void}){
  const urgentItems=watch.filter(item=>["fort","absolument urgent"].includes(item.urgency));
  const urgent=urgentItems.length;
  const linked=watch.filter(item=>item.dossier_id).length;
  const unlinked=watch.filter(item=>!item.dossier_id).length;
  const critical=watch.filter(item=>item.urgency==="absolument urgent").length;
  const urgentLinked=urgentItems.filter(item=>item.dossier_id).length;
  const amendments=urgentItems.filter(item=>item.nature.toLowerCase().includes("amendement")).length;
  const priorityDossierIds=new Set(urgentItems.map(item=>item.dossier_id).filter(Boolean));
  const priorityDossiers=priorityDossierIds.size;
  const sevenDaysAgo=Date.now()-7*24*60*60*1000;
  const newRisks=urgentItems.filter(item=>{
    const created=new Date(item.created_at).getTime();
    return Number.isFinite(created) && created>=sevenDaysAgo;
  }).length;

  const recentDossiers=dossiers.slice(0,4);
  const recentWatch=watch.slice(0,4);
  const topPriority=watch.find(item=>item.urgency==="absolument urgent")||watch.find(item=>item.urgency==="fort")||watch[0];

  const dailyActions:DailyAction[]=[
    ...urgentItems.slice(0,3).map(item=>({
      id:`impact-${item.id}`,
      title:item.title,
      detail:item.dossier_id?`Analyse prioritaire · ${item.nature}`:`Rattacher au bon dossier · ${item.nature}`,
      level:item.urgency==="absolument urgent"?"critical" as const:"high" as const,
      tab:item.dossier_id?"impact" as const:"veille" as const,
      cta:item.dossier_id?"Préparer la Note d’impact":"Rattacher le texte",
    })),
    ...watch.filter(item=>!item.dossier_id && !urgentItems.some(urgentItem=>urgentItem.id===item.id)).slice(0,2).map(item=>({
      id:`link-${item.id}`,
      title:item.title,
      detail:`Veille non rattachée · ${item.nature}`,
      level:"medium" as const,
      tab:"veille" as const,
      cta:"Qualifier",
    })),
  ].slice(0,5);

  return <div className="corp-dashboard">
    <div className="corp-head">
      <div>
        <div className="corp-kicker">Vue d’ensemble</div>
        <h1>Tableau de bord</h1>
        <p>Votre cockpit opérationnel : ce qui compte, ce qui change et ce qu’il faut faire maintenant.</p>
      </div>
      <div className="corp-head-actions">
        <div className="corp-search"><Search size={17}/><span>Rechercher…</span></div>
        <button className="corp-primary" onClick={()=>go("dossiers")}>+ Nouveau dossier</button>
      </div>
    </div>

    <section className="today-panel">
      <div className="today-head">
        <div>
          <span className="today-kicker"><Zap size={14}/> Aujourd’hui</span>
          <h2>Que dois-je faire aujourd’hui ?</h2>
          <p>Myvor transforme automatiquement votre portefeuille et votre veille en priorités de travail.</p>
        </div>
        <button className="today-review" onClick={()=>go("veille")}>Revoir la veille <ArrowRight size={15}/></button>
      </div>

      <div className="today-metrics">
        <button onClick={()=>go("dossiers")}><Target size={18}/><strong>{priorityDossiers}</strong><span>Dossiers prioritaires</span></button>
        <button onClick={()=>go("veille")}><AlertTriangle size={18}/><strong>{newRisks}</strong><span>Risques nouveaux</span></button>
        <button onClick={()=>go("veille")}><CalendarDays size={18}/><strong>{critical}</strong><span>Alertes critiques</span></button>
        <button onClick={()=>go("veille")}><Link2 size={18}/><strong>{unlinked}</strong><span>Textes à rattacher</span></button>
        <button onClick={()=>go("impact")}><FileText size={18}/><strong>{urgentLinked}</strong><span>Notes d’impact à préparer</span></button>
        <button onClick={()=>go("builder")}><Sparkles size={18}/><strong>{amendments}</strong><span>Amendements à préparer</span></button>
      </div>

      <div className="today-actions">
        <div className="today-actions-title"><span>Actions recommandées</span><small>Calculées à partir des données réelles de Myvor</small></div>
        {dailyActions.length?dailyActions.map(action=><button key={action.id} className="today-action" onClick={()=>go(action.tab)}>
          <span className={`today-level ${action.level}`}/>
          <span className="today-action-copy"><b>{action.title}</b><small>{action.detail}</small></span>
          <span className="today-cta">{action.cta}</span>
          <ArrowRight size={16}/>
        </button>):<div className="today-clear"><Sparkles size={18}/><div><b>Aucune action prioritaire détectée.</b><span>Les nouvelles évolutions apparaîtront automatiquement ici.</span></div></div>}
      </div>
    </section>

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
          {recentDossiers.length?recentDossiers.map(dossier=><button className="corp-list-row" key={dossier.id} onClick={()=>go("dossiers")}>
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
          {topPriority?<><div className="corp-date-box"><b>À traiter</b><span>{topPriority.nature}</span></div><h3>{topPriority.title}</h3><p>Niveau : {topPriority.urgency}</p><button onClick={()=>go(topPriority.dossier_id?"impact":"veille")}>{topPriority.dossier_id?"Ouvrir la Note d’impact":"Rattacher à un dossier"}</button></>:<div className="corp-empty">Aucune priorité détectée.</div>}
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
