"use client";

import { useMemo } from "react";
import { AlertTriangle,ArrowRight,BriefcaseBusiness,CalendarDays,FileText,Link2,Search,Sparkles,Target,Zap } from "lucide-react";

type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";
type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
export type Action={id:string;dossier_id:string|null;type:string;title:string;description:string|null;actor_name:string|null;priority:string;status:string;due_date:string|null;created_at:string;updated_at:string};
type DailyAction={id:string;title:string;detail:string;level:"critical"|"high"|"medium"|"low";tab:Tab;cta:string};

function actionDestination(type:string):Tab{return type==="contact"?"radar":type==="note_client"||type==="amendement"?"builder":type==="analyse"?"impact":"dossiers";}
function actionCta(type:string){return type==="contact"?"Contacter":type==="note_client"?"Rédiger la note":type==="amendement"?"Préparer l’amendement":type==="echeance"?"Voir l’échéance":type==="analyse"?"Analyser":"Ouvrir le dossier";}
function actionLevel(priority:string):DailyAction["level"]{return priority==="absolument urgent"?"critical":priority==="fort"?"high":priority==="moyen"?"medium":"low";}

export default function DashboardCorporate({dossiers,watch,actions,actionsLoading,actionsError,go}:{dossiers:Dossier[];watch:Watch[];actions:Action[];actionsLoading:boolean;actionsError:string;go:(tab:Tab)=>void}){
  const openActions=useMemo(()=>actions.filter(action=>action.status!=="termine"),[actions]);
  const urgentItems=watch.filter(item=>["fort","absolument urgent"].includes(item.urgency));
  const linked=watch.filter(item=>item.dossier_id).length;
  const sevenDaysAgo=Date.now()-7*24*60*60*1000;
  const newRisks=urgentItems.filter(item=>{const created=new Date(item.created_at).getTime();return Number.isFinite(created)&&created>=sevenDaysAgo;}).length;
  const priorityDossiers=new Set([...urgentItems.map(item=>item.dossier_id).filter(Boolean),...openActions.filter(action=>["fort","absolument urgent"].includes(action.priority)).map(action=>action.dossier_id).filter(Boolean)]).size;
  const sevenDays=Date.now()+7*24*60*60*1000;
  const criticalDeadlines=openActions.filter(action=>action.type==="echeance"&&action.due_date&&new Date(action.due_date).getTime()<=sevenDays).length;
  const notesClient=openActions.filter(action=>action.type==="note_client").length;
  const dossierName=(id:string|null)=>id?dossiers.find(d=>d.id===id)?.title||"Dossier lié":"Sans dossier";
  const openExactDossier=(id:string)=>{sessionStorage.setItem("myvor:open-dossier",id);go("dossiers");};
  const openExactWatch=(id:string)=>{sessionStorage.setItem("myvor:open-watch",id);go("veille");};
  const actionRows:DailyAction[]=openActions.slice(0,5).map(action=>({id:`action-${action.id}`,title:action.title,detail:[action.actor_name,dossierName(action.dossier_id),action.due_date?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short"}).format(new Date(action.due_date)):null].filter(Boolean).join(" · "),level:actionLevel(action.priority),tab:actionDestination(action.type),cta:actionCta(action.type)}));
  const fallbackRows:DailyAction[]=[...urgentItems.slice(0,3).map(item=>({id:`impact-${item.id}`,title:item.title,detail:item.dossier_id?`Analyse prioritaire · ${item.nature}`:`Rattacher au bon dossier · ${item.nature}`,level:item.urgency==="absolument urgent"?"critical" as const:"high" as const,tab:item.dossier_id?"impact" as const:"veille" as const,cta:item.dossier_id?"Analyser l’impact":"Qualifier"})),...watch.filter(item=>!item.dossier_id&&!urgentItems.some(u=>u.id===item.id)).slice(0,2).map(item=>({id:`link-${item.id}`,title:item.title,detail:`Veille non rattachée · ${item.nature}`,level:"medium" as const,tab:"veille" as const,cta:"Qualifier"}))];
  const dailyActions=(actionRows.length?actionRows:fallbackRows).slice(0,4);
  const recentDossiers=dossiers.slice(0,4);const recentWatch=watch.slice(0,4);
  const rank=(value:string)=>value==="absolument urgent"?4:value==="fort"?3:value==="moyen"?2:1;
  const topPriorityAction=[...openActions].sort((a,b)=>rank(b.priority)-rank(a.priority))[0];
  const topPriorityWatch=watch.find(item=>item.urgency==="absolument urgent")||watch.find(item=>item.urgency==="fort")||watch[0];
  const priorityCount=dailyActions.filter(action=>action.level==="critical"||action.level==="high").length;

  return <div className="corp-dashboard">
    <style jsx global>{`
      .topbar{padding-top:env(safe-area-inset-top);height:calc(68px + env(safe-area-inset-top));min-height:calc(68px + env(safe-area-inset-top))}
      .topbar .brand{min-width:0;white-space:nowrap}.topbar .logo{flex:0 0 auto}.topbar .logout{flex:0 0 auto}
      .today-level.low{background:#3fc48d;box-shadow:0 0 0 4px rgba(63,196,141,.14)}
      .today-metrics button,.corp-kpis .corp-kpi{position:relative;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .12s ease,filter .12s ease,background .12s ease,border-color .12s ease}
      .today-metrics button:active,.corp-kpis .corp-kpi:active{transform:scale(.97)}
      .today-metrics button:focus-visible,.corp-kpis .corp-kpi:focus-visible{outline:2px solid #f3bd3e;outline-offset:2px}
      .corp-kpis .corp-kpi{border:0;text-align:left;width:100%}.corp-kpis .corp-kpi:hover{filter:brightness(1.06)}
      @media(max-width:560px){
        .topbar{padding-left:20px;padding-right:20px}.topbar .brand{font-size:18px;gap:9px}.topbar .logo{width:38px;height:38px}
        .main{padding-top:16px}.corp-head{gap:12px}.corp-head>div:first-child{display:none}.corp-head-actions{width:100%}.corp-search{display:none}.corp-primary{min-height:52px;font-size:16px;border-radius:13px}
        .today-panel{padding:18px;border-radius:18px}.today-head{margin-bottom:14px;gap:12px}.today-head h2{font-size:23px;line-height:1.12;margin-top:8px}.today-head p{font-size:13px}.today-review{display:none}
        .today-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.today-metrics button{padding:12px;min-height:96px}.today-metrics strong{font-size:24px;margin:7px 0 2px}.today-metrics span{font-size:11px}
        .today-actions{margin-top:14px;padding-top:13px}.today-actions-title small{font-size:11px}.today-action{padding:12px 0}.today-action-copy b{font-size:13px;line-height:1.35}.today-action-copy small{line-height:1.35}.corp-kpis{display:none}
      }
    `}</style>
    <div className="corp-head"><div><div className="corp-kicker">Vue d’ensemble</div><h1>Tableau de bord</h1><p>Votre cockpit opérationnel : ce qui compte, ce qui change et ce qu’il faut faire maintenant.</p></div><div className="corp-head-actions"><div className="corp-search"><Search size={17}/><span>Rechercher…</span></div><button className="corp-primary" onClick={()=>go("dossiers")}>+ Nouveau dossier</button></div></div>
    <section className="today-panel"><div className="today-head"><div><span className="today-kicker"><Zap size={14}/> Aujourd’hui</span><h2>Que dois-je faire aujourd’hui ?</h2><p>Vos priorités calculées à partir de vos dossiers et de votre veille.</p></div><button className="today-review" onClick={()=>go("dossiers")}>Voir les dossiers <ArrowRight size={15}/></button></div>
      <div className="today-metrics">
        <button type="button" aria-label="Ouvrir les dossiers prioritaires" onClick={()=>go("dossiers")}><Target size={18}/><strong>{priorityDossiers}</strong><span>Dossiers prioritaires</span></button>
        <button type="button" aria-label="Ouvrir les risques nouveaux" onClick={()=>go("impact")}><AlertTriangle size={18}/><strong>{newRisks}</strong><span>Risques nouveaux</span></button>
        <button type="button" aria-label="Ouvrir les notes à envoyer" onClick={()=>go("builder")}><FileText size={18}/><strong>{notesClient}</strong><span>Notes à envoyer</span></button>
        <button type="button" aria-label="Ouvrir les échéances critiques" onClick={()=>go("dossiers")}><CalendarDays size={18}/><strong>{criticalDeadlines}</strong><span>Échéances critiques</span></button>
      </div>
      <div className="today-actions"><div className="today-actions-title"><span>Priorités du jour</span><small>{actionsLoading?"Actualisation…":actionsError?"Certaines actions n’ont pas pu être chargées":dailyActions.length?`${dailyActions.length} action(s) affichée(s) · ${priorityCount} prioritaire(s)`:"Aucune action prioritaire"}</small></div>{dailyActions.length?dailyActions.map(action=><button key={action.id} className="today-action" onClick={()=>go(action.tab)}><span className={`today-level ${action.level}`}/><span className="today-action-copy"><b>{action.title}</b><small>{action.detail}</small></span><span className="today-cta">{action.cta}</span><ArrowRight size={16}/></button>):<div className="today-clear"><Sparkles size={18}/><div><b>Aucune action prioritaire détectée.</b><span>Vous êtes à jour pour le moment.</span></div></div>}</div>
    </section>
    <div className="corp-kpis">
      <button type="button" className="corp-kpi" onClick={()=>go("dossiers")} aria-label="Ouvrir les dossiers actifs"><span>Dossiers actifs</span><strong>{dossiers.length}</strong><small><BriefcaseBusiness size={15}/> Portefeuille client</small></button>
      <button type="button" className="corp-kpi" onClick={()=>go("veille")} aria-label="Ouvrir les textes suivis"><span>Textes suivis</span><strong>{watch.length}</strong><small><FileText size={15}/> Veille institutionnelle</small></button>
      <button type="button" className="corp-kpi" onClick={()=>go("impact")} aria-label="Ouvrir les textes rattachés"><span>Textes rattachés</span><strong>{linked}</strong><small><Link2 size={15}/> Analyse exploitable</small></button>
      <button type="button" className="corp-kpi alert" onClick={()=>go(topPriorityAction?actionDestination(topPriorityAction.type):"dossiers")} aria-label="Ouvrir les actions à traiter"><span>Actions ouvertes</span><strong>{openActions.length}</strong><small><AlertTriangle size={15}/> À traiter</small></button>
    </div>
    <div className="corp-dashboard-grid"><section className="corp-panel"><div className="corp-panel-head"><div><span>Dossiers récents</span><h2>Portefeuille client</h2></div><button onClick={()=>go("dossiers")}>Voir tout <ArrowRight size={15}/></button></div><div className="corp-list">{recentDossiers.length?recentDossiers.map(d=><button className="corp-list-row" key={d.id} onClick={()=>openExactDossier(d.id)}><span className="corp-avatar">{(d.client||d.title||"D").slice(0,2).toUpperCase()}</span><span className="corp-list-copy"><b>{d.title}</b><small>{d.client}</small></span><span className="corp-status">Actif</span><ArrowRight size={16}/></button>):<div className="corp-empty">Aucun dossier client pour le moment.</div>}</div></section><section className="corp-panel"><div className="corp-panel-head"><div><span>Veille récente</span><h2>Dernières évolutions</h2></div><button onClick={()=>go("veille")}>Voir tout <ArrowRight size={15}/></button></div><div className="corp-list">{recentWatch.length?recentWatch.map(item=><button className="corp-list-row" key={item.id} onClick={()=>openExactWatch(item.id)}><span className="corp-doc"><FileText size={18}/></span><span className="corp-list-copy"><b>{item.title}</b><small>{item.nature}</small></span><span className={`corp-impact ${item.urgency.replaceAll(" ","-")}`}>{item.urgency}</span></button>):<div className="corp-empty">Aucun élément de veille pour le moment.</div>}</div></section><aside className="corp-side-stack"><section className="corp-panel corp-deadline"><div className="corp-panel-head"><div><span>Priorité</span><h2>Prochaine action</h2></div><CalendarDays size={19}/></div>{topPriorityAction?<><div className="corp-date-box"><b>{topPriorityAction.priority}</b><span>{topPriorityAction.type.replaceAll("_"," ")}</span></div><h3>{topPriorityAction.title}</h3><p>{topPriorityAction.actor_name?`Acteur : ${topPriorityAction.actor_name}`:dossierName(topPriorityAction.dossier_id)}</p><button onClick={()=>go(actionDestination(topPriorityAction.type))}>{actionCta(topPriorityAction.type)}</button></>:topPriorityWatch?<><div className="corp-date-box"><b>À traiter</b><span>{topPriorityWatch.nature}</span></div><h3>{topPriorityWatch.title}</h3><p>Niveau : {topPriorityWatch.urgency}</p><button onClick={()=>go(topPriorityWatch.dossier_id?"impact":"veille")}>{topPriorityWatch.dossier_id?"Analyser l’impact":"Qualifier le texte"}</button></>:<div className="corp-empty">Aucune priorité détectée.</div>}</section><section className="corp-panel corp-score-card"><span>Capacité opérationnelle</span><div className="corp-score-line"><strong>{watch.length||actions.length?Math.min(100,45+linked*4+Math.min(openActions.length,8)*3):0}</strong><small>/100</small></div><p>Veille, dossiers et actions sont reliés à la même source de vérité.</p><button onClick={()=>go("builder")}>Ouvrir le Note Builder</button></section></aside></div>
  </div>;
}
