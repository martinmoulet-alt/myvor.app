"use client";

import {useMemo,useRef,useState} from "react";
import {AlertCircle,ArrowRight,Bell,CalendarDays,ChevronRight,CircleHelp,FilePenLine,Folder,Home,Import,Lightbulb,Network,Search,ShieldCheck,Target,X} from "lucide-react";

type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";
type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string;source_name?:string|null;published_at?:string|null};
export type Action={id:string;dossier_id:string|null;type:string;title:string;description:string|null;actor_name:string|null;priority:string;status:string;due_date:string|null;created_at:string;updated_at:string};
type Props={dossiers:Dossier[];watch:Watch[];actions:Action[];actionsLoading:boolean;actionsError:string;go:(tab:Tab)=>void};

type SearchRow={kind:"Dossier"|"Veille"|"Action";title:string;meta:string;tab:Tab};

function rank(value:string){return value==="absolument urgent"?4:value==="fort"?3:value==="moyen"?2:1;}
function timeLabel(value:string){const t=new Date(value).getTime();if(!Number.isFinite(t))return "";const d=Math.max(0,Date.now()-t);if(d<3600000)return `Il y a ${Math.max(1,Math.round(d/60000))} min`;if(d<86400000)return `Il y a ${Math.max(1,Math.round(d/3600000))} h`;return `Il y a ${Math.max(1,Math.round(d/86400000))} j`;}
function daysUntil(value:string|null){if(!value)return null;const t=new Date(value).getTime();if(!Number.isFinite(t))return null;return Math.max(0,Math.ceil((t-Date.now())/86400000));}

export default function DashboardCorporate({dossiers,watch,actions,go}:Props){
  const[modal,setModal]=useState<"search"|"help"|"calendar"|"import"|null>(null);
  const[query,setQuery]=useState("");
  const[fileName,setFileName]=useState("");
  const inputRef=useRef<HTMLInputElement|null>(null);

  const urgentWatch=useMemo(()=>[...watch].filter(w=>rank(w.urgency)>=2).sort((a,b)=>rank(b.urgency)-rank(a.urgency)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,3),[watch]);
  const priorityDossier=dossiers[0]||null;
  const deadlines=useMemo(()=>actions.filter(a=>a.status!=="termine"&&a.due_date&&new Date(a.due_date).getTime()>=Date.now()).sort((a,b)=>new Date(a.due_date||0).getTime()-new Date(b.due_date||0).getTime()),[actions]);
  const nextDeadline=deadlines[0]||null;

  const results=useMemo<SearchRow[]>(()=>{const q=query.trim().toLowerCase();if(!q)return[];return [
    ...dossiers.filter(d=>`${d.title} ${d.client} ${d.objective}`.toLowerCase().includes(q)).slice(0,4).map(d=>({kind:"Dossier" as const,title:d.title,meta:d.client||"Dossier client",tab:"dossiers" as Tab})),
    ...watch.filter(w=>`${w.title} ${w.nature}`.toLowerCase().includes(q)).slice(0,4).map(w=>({kind:"Veille" as const,title:w.title,meta:w.nature,tab:"veille" as Tab})),
    ...actions.filter(a=>`${a.title} ${a.description||""}`.toLowerCase().includes(q)).slice(0,4).map(a=>({kind:"Action" as const,title:a.title,meta:a.priority,tab:(a.type==="analyse"?"impact":a.type==="contact"?"radar":"builder") as Tab}))
  ].slice(0,10);},[query,dossiers,watch,actions]);

  const nav=[
    ["dashboard","Accueil",Home],
    ["veille","Veille",Target],
    ["impact","Note d’impact",AlertCircle],
    ["radar","Radar d’influence",Network],
    ["builder","Note Builder",FilePenLine],
    ["dossiers","Dossiers clients",Folder],
  ] as const;

  const openFile=()=>{setModal("import");setTimeout(()=>inputRef.current?.click(),20);};

  return <div className="myvor-home">
    <style jsx global>{`
      html,body{background:#020b1b!important}.app:has(.myvor-home){background:#020b1b!important}.app:has(.myvor-home) .topbar,.app:has(.myvor-home) .sidebar{display:none!important}.app:has(.myvor-home) .main{padding:0!important;margin:0!important;max-width:none!important;width:100%!important;background:#020b1b!important;min-height:100vh!important}
      .myvor-home{--navy:#020b1b;--panel:#06162d;--panel2:#081b36;--line:#173654;--text:#f7f9fd;--muted:#9eacc0;--gold:#ffc928;min-height:100vh;background:radial-gradient(circle at 55% -10%,rgba(26,64,113,.16),transparent 35%),#020b1b;color:var(--text);display:grid;grid-template-columns:250px minmax(0,1fr);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.myvor-home *{box-sizing:border-box}.myvor-home button{font:inherit}.myvor-side{border-right:1px solid #17304c;min-height:100vh;padding:25px 17px 20px;display:flex;flex-direction:column;background:linear-gradient(180deg,#020b1b,#041329)}.myvor-brand{font-size:25px;font-weight:900;letter-spacing:.06em;margin:0 0 26px 8px}.myvor-brand span{color:var(--gold)}.myvor-nav{display:grid;gap:7px}.myvor-nav button,.myvor-side-action{border:0;color:#d9e2ef;background:transparent;border-radius:8px;display:flex;align-items:center;gap:13px;padding:12px 13px;text-align:left;cursor:pointer}.myvor-nav button:hover,.myvor-side-action:hover{background:#0d2342}.myvor-nav button.active{background:#0e2344;box-shadow:inset 3px 0 0 var(--gold);color:#fff}.myvor-nav svg,.myvor-side-action svg{width:18px;height:18px}.myvor-nav button.active svg{color:var(--gold)}.myvor-badge{margin-left:auto;background:var(--gold);color:#061122;min-width:22px;height:22px;padding:0 6px;border-radius:999px;display:grid;place-items:center;font-weight:850;font-size:11px}.myvor-side-divider{height:1px;background:#17304c;margin:20px 0 13px}.myvor-profile{margin-top:auto;border-top:1px solid #17304c;padding:20px 6px 0;display:flex;align-items:center;gap:11px}.myvor-avatar{width:38px;height:38px;border-radius:50%;border:2px solid var(--gold);display:grid;place-items:center;font-weight:800}.myvor-profile strong{font-size:13px}.myvor-profile small{display:block;color:var(--muted);margin-top:2px}
      .myvor-shell{padding:24px 26px 26px;min-width:0}.myvor-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:27px}.myvor-top h1{font-size:27px;margin:0 0 4px;letter-spacing:-.02em}.myvor-top p{margin:0;color:#b0bdd0;font-size:13px}.myvor-top-actions{display:flex;gap:12px}.ghost-btn{height:43px;border:1px solid #1b3b5c;background:#06162d;color:#e4ebf5;border-radius:8px;padding:0 15px;display:flex;gap:9px;align-items:center;cursor:pointer}.ghost-btn:hover{border-color:#315d86;background:#0a1f3d}.ghost-btn svg{width:17px}.section-title{color:var(--gold);font-size:13px;font-weight:850;letter-spacing:.02em;margin:0 0 11px;text-transform:uppercase}.myvor-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:25px}.myvor-main{min-width:0}.workflow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #173654;border-radius:10px;overflow:hidden;background:#06162d}.workflow button{min-height:108px;border:0;border-right:1px solid #173654;background:transparent;color:#dce5f0;padding:17px 14px;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer}.workflow button:last-child{border-right:0}.workflow button:hover{background:#0b2141}.workflow button.active{background:linear-gradient(135deg,#0d2a50,#0b1e39);box-shadow:inset 0 -4px 0 var(--gold)}.step-n{width:41px;height:41px;border-radius:50%;border:1px solid #5f7187;display:grid;place-items:center;font-size:20px;flex:0 0 auto}.workflow button.active .step-n{border-color:var(--gold);color:var(--gold)}.step-copy strong{display:block;font-size:13px;line-height:1.35}.step-copy small{display:block;color:#a6b4c6;margin-top:4px}.step-copy small.gold{color:var(--gold)}.workflow-note{margin:16px 0 33px;border:1px solid #173654;border-radius:9px;background:#06162d;min-height:58px;display:flex;align-items:center;gap:15px;padding:0 17px;color:#c2ccda;font-size:12px}.workflow-note svg{color:var(--gold);width:18px}.priority{border:1px solid #173654;border-radius:10px;background:linear-gradient(145deg,#06162d,#071a34);min-height:122px;padding:20px;display:flex;align-items:center;gap:18px}.priority-icon{width:52px;height:52px;border:1px solid #1e4670;background:#06152c;border-radius:10px;display:grid;place-items:center}.priority-icon svg{width:26px}.priority-copy{min-width:0}.priority-copy h3{margin:0 0 6px;font-size:17px}.priority-copy .danger{color:#ff4a55;font-weight:800;font-size:12px}.priority-copy small{display:block;color:#9dacc0;margin-top:6px}.primary-btn{margin-left:auto;border:1px solid #1460be;background:#0b4fae;color:#fff;border-radius:8px;height:43px;padding:0 18px;display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:750}.primary-btn:hover{background:#1260c8}.primary-btn svg{width:17px}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}.quick-card{border:1px solid #173654;border-radius:10px;background:linear-gradient(145deg,#06162d,#071a34);padding:18px;min-height:210px;display:flex;flex-direction:column;align-items:flex-start;color:#fff;text-align:left;cursor:pointer}.quick-card:hover{border-color:#2a547e;transform:translateY(-1px)}.quick-icon{width:52px;height:52px;border-radius:50%;background:#0c284f;display:grid;place-items:center;margin-bottom:16px}.quick-icon svg{width:25px}.quick-card h3{margin:0 0 8px;font-size:16px}.quick-card p{margin:0;color:#bec9d8;font-size:12px;line-height:1.5}.quick-link{margin-top:auto;color:var(--gold);display:flex;gap:10px;align-items:center;font-weight:760;font-size:13px}.quick-link svg{width:16px}.help-strip{margin-top:18px;border:1px solid #173654;border-radius:10px;background:#06162d;display:flex;align-items:center;gap:15px;padding:14px 16px}.help-icon{width:46px;height:46px;border-radius:50%;background:#0d2c58;display:grid;place-items:center}.help-icon svg{width:24px}.help-strip strong{font-size:13px}.help-strip p{margin:4px 0 0;color:#aab8ca;font-size:11px}.gold-btn{margin-left:auto;border:1px solid var(--gold);background:transparent;color:var(--gold);border-radius:8px;height:39px;padding:0 19px;cursor:pointer;font-weight:800}.gold-btn:hover{background:rgba(255,201,40,.08)}
      .rightcol{display:grid;gap:18px;align-content:start}.sidepanel{border:1px solid #173654;border-radius:10px;background:linear-gradient(145deg,#06162d,#071a34);overflow:hidden}.paneltitle{height:58px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #173654;font-size:14px;font-weight:850}.alerts{display:grid}.alertrow{border:0;border-bottom:1px solid #173654;background:transparent;color:#fff;padding:17px;display:grid;grid-template-columns:13px 1fr 18px;gap:11px;text-align:left;cursor:pointer}.alertrow:hover{background:#0b213e}.alertrow:last-of-type{border-bottom:0}.dot{width:11px;height:11px;border-radius:50%;margin-top:3px}.dot.red{background:#ff3d48}.dot.orange{background:#ff8f24}.dot.gold{background:#ffc928}.alertcopy b{display:block;font-size:11px;margin-bottom:9px}.alertcopy b.red{color:#ff4b55}.alertcopy b.orange{color:#ff9430}.alertcopy b.gold{color:#ffc928}.alertcopy strong{display:block;font-size:13px;margin-bottom:8px}.alertcopy p{margin:0 0 6px;color:#bdc7d6;font-size:11px;line-height:1.45}.alertcopy small{color:#8798ad}.alertrow svg{width:17px;align-self:center;color:#9fb0c5}.panel-link{border:0;border-top:1px solid #173654;background:transparent;color:#57a3ff;width:100%;padding:14px 17px;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between}.deadline-panel{border-color:#c99b00;background:linear-gradient(145deg,#121910,#07172c)}.deadline-panel .paneltitle{color:var(--gold);border-bottom-color:#504716}.deadlinebox{padding:17px;display:grid;grid-template-columns:55px 1fr auto;gap:14px;align-items:start}.calicon{width:55px;height:55px;border-radius:9px;border:1px solid #6a5700;background:linear-gradient(145deg,#735800,#1b250e);display:grid;place-items:center}.calicon svg{color:#fff;width:25px}.deadlinebox h3{margin:2px 0 7px;font-size:18px}.deadlinebox p{margin:0 0 5px;font-size:13px}.deadlinebox small{color:#aeb8c7}.jbadge{background:var(--gold);color:#071222;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:900}.deadline-link{border-top:1px solid #504716;color:var(--gold)}
      .myvor-modalback{position:fixed;inset:0;z-index:9999;background:rgba(0,7,19,.78);display:grid;place-items:center;padding:20px}.myvor-modal{width:min(560px,100%);max-height:80vh;overflow:auto;background:#06162d;border:1px solid #24496d;border-radius:14px;box-shadow:0 24px 90px rgba(0,0,0,.55);padding:20px;color:#fff}.modalhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.modalhead h3{margin:0}.closebtn{border:1px solid #284765;background:#0a203c;color:#fff;border-radius:8px;width:36px;height:36px;display:grid;place-items:center;cursor:pointer}.searchinput{width:100%;height:44px;border:1px solid #284765;background:#031126;color:#fff;border-radius:9px;padding:0 13px;outline:none}.searchresults{display:grid;gap:8px;margin-top:14px}.searchresult{border:1px solid #173654;background:#071a34;color:#fff;border-radius:9px;padding:12px;text-align:left;cursor:pointer}.searchresult small{display:block;color:#93a4b9;margin-top:3px}.modalcopy{color:#b6c2d2;line-height:1.6}.modal-list{display:grid;gap:10px}.modal-item{border:1px solid #173654;border-radius:9px;padding:12px;background:#071a34}.modal-item strong{display:block}.modal-item small{color:#9eacc0}.hidden-input{display:none}
      @media(max-width:1100px){.myvor-home{grid-template-columns:205px minmax(0,1fr)}.myvor-grid{grid-template-columns:1fr}.rightcol{grid-template-columns:1fr 1fr}.workflow{grid-template-columns:repeat(2,1fr)}.workflow button:nth-child(2){border-right:0}.workflow button:nth-child(-n+2){border-bottom:1px solid #173654}.quick-grid{grid-template-columns:1fr}}
      @media(max-width:760px){.myvor-home{display:block}.myvor-side{display:none}.myvor-shell{padding:18px 14px}.myvor-top{align-items:center}.myvor-top h1{font-size:22px}.myvor-top-actions .ghost-btn:first-child{display:none}.myvor-grid{display:block}.rightcol{grid-template-columns:1fr;margin-top:18px}.workflow{grid-template-columns:1fr}.workflow button{border-right:0;border-bottom:1px solid #173654!important}.workflow button:last-child{border-bottom:0!important}.priority{align-items:flex-start;flex-wrap:wrap}.primary-btn{margin-left:70px}.quick-grid{grid-template-columns:1fr}.help-strip{align-items:flex-start;flex-wrap:wrap}.gold-btn{margin-left:61px}}
    `}</style>

    <aside className="myvor-side">
      <div className="myvor-brand">MY<span>V</span>OR</div>
      <nav className="myvor-nav">
        {nav.map(([tab,label,Icon])=><button key={tab} className={tab==="dashboard"?"active":""} onClick={()=>go(tab)}><Icon/>{label}</button>)}
        <button onClick={()=>go("veille")}><Bell/>Alertes <span className="myvor-badge">{Math.max(urgentWatch.length,3)}</span></button>
      </nav>
      <div className="myvor-side-divider"/>
      <button className="myvor-side-action" onClick={()=>setModal("search")}><Search/>Recherche</button>
      <button className="myvor-side-action" onClick={openFile}><Import/>Importer un document</button>
      <input ref={inputRef} className="hidden-input" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" onChange={e=>{const f=e.target.files?.[0];if(f){setFileName(f.name);setModal("import");}}}/>
      <div className="myvor-profile"><div className="myvor-avatar">MM</div><div><strong>Martin Moulet</strong><small>Myvor Conseil</small></div></div>
    </aside>

    <main className="myvor-shell">
      <header className="myvor-top">
        <div><h1>Bonjour Martin,</h1><p>Voici votre pilotage opérationnel du jour.</p></div>
        <div className="myvor-top-actions">
          <button className="ghost-btn" onClick={()=>setModal("calendar")}><CalendarDays/>7 août 2026</button>
          <button className="ghost-btn" onClick={()=>setModal("help")}><CircleHelp/>Besoin d’aide ?</button>
        </div>
      </header>

      <div className="myvor-grid">
        <section className="myvor-main">
          <h2 className="section-title">Procédure recommandée aujourd’hui</h2>
          <div className="workflow">
            <button className="active" onClick={()=>go("veille")}><span className="step-n">1</span><span className="step-copy"><strong>Consulter<br/>votre veille ciblée</strong><small className="gold">5 min</small></span></button>
            <button onClick={()=>go("impact")}><span className="step-n">2</span><span className="step-copy"><strong>Analyser l’impact</strong><small>15 min</small></span></button>
            <button onClick={()=>go("builder")}><span className="step-n">3</span><span className="step-copy"><strong>Rédiger avec<br/>Note Builder</strong><small>20 min</small></span></button>
            <button onClick={()=>go("radar")}><span className="step-n">4</span><span className="step-copy"><strong>Passer à l’action</strong><small>5 min</small></span></button>
          </div>
          <div className="workflow-note"><Lightbulb/>Suivez ces 4 étapes chaque jour pour ne rien manquer d’essentiel et produire vite l’essentiel.</div>

          <h2 className="section-title">Vos priorités du jour</h2>
          <div className="priority">
            <div className="priority-icon"><Folder/></div>
            <div className="priority-copy"><h3>{priorityDossier?.title||"Loi de finances 2026"}</h3><div className="danger">Impact élevé détecté</div><small>Dernière analyse : il y a 2 h</small></div>
            <button className="primary-btn" onClick={()=>go("impact")}>Reprendre l’analyse <ArrowRight/></button>
          </div>

          <div className="quick-grid">
            <button className="quick-card" onClick={()=>go("veille")}><span className="quick-icon"><Search/></span><h3>Consulter la veille</h3><p>Les informations clés du jour,<br/>sélectionnées pour vous.</p><span className="quick-link">Accéder <ArrowRight/></span></button>
            <button className="quick-card" onClick={()=>go("impact")}><span className="quick-icon"><Target/></span><h3>Analyser un sujet</h3><p>Générez une note d’impact<br/>en quelques minutes.</p><span className="quick-link">Démarrer <ArrowRight/></span></button>
            <button className="quick-card" onClick={()=>go("builder")}><span className="quick-icon"><FilePenLine/></span><h3>Rédiger une note</h3><p>Créez une note ou un email<br/>prêt à envoyer avec<br/>Note Builder.</p><span className="quick-link">Ouvrir <ArrowRight/></span></button>
          </div>

          <div className="help-strip"><div className="help-icon"><ShieldCheck/></div><div><strong>Besoin d’aide pour bien démarrer ?</strong><p>Consultez le guide rapide pour prendre en main Myvor en 2 minutes.</p></div><button className="gold-btn" onClick={()=>setModal("help")}>Voir le guide</button></div>
        </section>

        <aside className="rightcol">
          <section className="sidepanel">
            <div className="paneltitle"><span>ALERTES ESSENTIELLES</span><span className="myvor-badge">{Math.max(urgentWatch.length,3)}</span></div>
            <div className="alerts">
              {(urgentWatch.length?urgentWatch:[
                {id:"a",title:"Réforme des retraites",nature:"Nouvel amendement adopté en commission",urgency:"absolument urgent",created_at:new Date(Date.now()-15*60000).toISOString()},
                {id:"b",title:"Loi de finances 2026",nature:"Article 12 : modification du texte",urgency:"fort",created_at:new Date(Date.now()-45*60000).toISOString()},
                {id:"c",title:"Transition énergétique",nature:"Rapport publié au Sénat",urgency:"moyen",created_at:new Date(Date.now()-2*3600000).toISOString()}
              ] as any[]).slice(0,3).map((item:any,index:number)=>{const cls=index===0?"red":index===1?"orange":"gold";const level=index===0?"TRÈS ÉLEVÉ":index===1?"ÉLEVÉ":"MOYEN";return <button className="alertrow" key={item.id||index} onClick={()=>go("veille")}><span className={`dot ${cls}`}/><span className="alertcopy"><b className={cls}>{level}</b><strong>{item.title}</strong><p>{item.nature}</p><small>{timeLabel(item.created_at)}</small></span><ChevronRight/></button>;})}
            </div>
            <button className="panel-link" onClick={()=>go("veille")}>Voir toutes les alertes <ArrowRight size={16}/></button>
          </section>

          <section className="sidepanel deadline-panel">
            <div className="paneltitle">PROCHAINE ÉCHÉANCE</div>
            <div className="deadlinebox"><div className="calicon"><CalendarDays/></div><div><h3>{nextDeadline?.due_date?new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long"}).format(new Date(nextDeadline.due_date)):"12 août"}</h3><p>{nextDeadline?.title||"Débat à l’Assemblée"}</p><small>{nextDeadline?.description||"Réforme des retraites"}</small></div><span className="jbadge">J-{nextDeadline?.due_date??""?daysUntil(nextDeadline.due_date)??5:5}</span></div>
            <button className="panel-link deadline-link" onClick={()=>setModal("calendar")}>Voir le calendrier <ArrowRight size={16}/></button>
          </section>
        </aside>
      </div>
    </main>

    {modal&&<div className="myvor-modalback" onMouseDown={e=>{if(e.currentTarget===e.target)setModal(null)}}><div className="myvor-modal">
      <div className="modalhead"><h3>{modal==="search"?"Recherche":modal==="calendar"?"Calendrier":modal==="import"?"Importer un document":"Guide Myvor"}</h3><button className="closebtn" onClick={()=>setModal(null)}><X size={18}/></button></div>
      {modal==="search"&&<><input autoFocus className="searchinput" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un dossier, une veille, une action…"/><div className="searchresults">{query&&!results.length&&<div className="modalcopy">Aucun résultat.</div>}{results.map((r,i)=><button key={`${r.kind}-${i}`} className="searchresult" onClick={()=>{setModal(null);go(r.tab)}}><strong>{r.title}</strong><small>{r.kind} · {r.meta}</small></button>)}</div></>}
      {modal==="help"&&<div className="modalcopy"><strong>La procédure Myvor en 4 étapes</strong><p>1. Consultez la veille ciblée. 2. Analysez l’impact des évolutions importantes. 3. Rédigez votre livrable avec Note Builder. 4. Passez à l’action avec le Radar d’influence.</p></div>}
      {modal==="calendar"&&<div className="modal-list">{deadlines.length?deadlines.slice(0,8).map(d=><div className="modal-item" key={d.id}><strong>{d.title}</strong><small>{d.due_date?new Intl.DateTimeFormat("fr-FR",{dateStyle:"long"}).format(new Date(d.due_date)):"Sans date"}</small></div>):<div className="modal-item"><strong>12 août — Débat à l’Assemblée</strong><small>Réforme des retraites</small></div>}</div>}
      {modal==="import"&&<div className="modalcopy">{fileName?<><strong>{fileName}</strong><p>Document sélectionné. Vous pouvez maintenant l’exploiter dans vos modules Myvor.</p><button className="gold-btn" style={{marginLeft:0}} onClick={()=>{setModal(null);go("impact")}}>Analyser le document</button></>:<><p>Sélectionnez un document PDF, Word ou texte.</p><button className="gold-btn" style={{marginLeft:0}} onClick={()=>inputRef.current?.click()}>Choisir un fichier</button></>}</div>}
    </div></div>}
  </div>;
}
