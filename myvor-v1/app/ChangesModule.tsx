"use client";

import {useEffect,useMemo,useState} from "react";
import {ExternalLink,RefreshCw} from "lucide-react";

type Dossier={id:string;client:string;title:string;status?:string};
type LinkJustification={
  status?:string|null;
  summary?:string|null;
  objective_link?:string|null;
  evidence?:string[]|null;
  consequence?:string|null;
};
type Watch={
  id:string;title:string;nature:string;source_url:string;dossier_id:string|null;created_at:string;
  source_name?:string|null;published_at?:string|null;qualification_confidence?:number|null;qualification_reason?:string|null;
  change_type?:string|null;change_summary?:string|null;change_baseline_ids?:string[]|null;change_computed_at?:string|null;
  link_justification?:LinkJustification|null;
};

type Filter="all"|"nouveau"|"modification"|"precision"|"application"|"abrogation"|"aucun_changement"|"socle_initial"|"indetermine";
type Meta={label:string;color:string;background:string;border:string};

const META:Record<string,Meta>={
  nouveau:{label:"Nouveau",color:"#7fe0b4",background:"rgba(47,191,132,.12)",border:"rgba(127,224,180,.34)"},
  modification:{label:"Modification",color:"#ffd466",background:"rgba(243,189,62,.12)",border:"rgba(255,212,102,.36)"},
  precision:{label:"Précision",color:"#8bc5ff",background:"rgba(70,151,235,.12)",border:"rgba(139,197,255,.34)"},
  application:{label:"Application",color:"#cfb2ff",background:"rgba(147,101,214,.13)",border:"rgba(207,178,255,.34)"},
  abrogation:{label:"Abrogation",color:"#ff9da3",background:"rgba(222,75,86,.13)",border:"rgba(255,157,163,.34)"},
  aucun_changement:{label:"Aucun changement",color:"#b8c6d9",background:"rgba(184,198,217,.09)",border:"rgba(184,198,217,.22)"},
  socle_initial:{label:"Socle initial",color:"#b9cdea",background:"rgba(111,146,190,.11)",border:"rgba(185,205,234,.24)"},
  indetermine:{label:"Comparaison insuffisante",color:"#b8c6d9",background:"rgba(184,198,217,.09)",border:"rgba(184,198,217,.22)"},
  pending:{label:"Analyse en cours",color:"#c2cee0",background:"rgba(194,206,224,.08)",border:"rgba(194,206,224,.2)"},
};

const FILTERS:[Filter,string][]=[
  ["all","Tous"],["nouveau","Nouveau"],["modification","Modification"],["precision","Précision"],
  ["application","Application"],["abrogation","Abrogation"],["aucun_changement","Aucun changement"],["socle_initial","Socle initial"]
];

function dateLabel(raw?:string|null){
  if(!raw)return"";
  const d=new Date(raw);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"";
}
function timeOf(item:Watch){const v=Date.parse(item.published_at||item.created_at||"");return Number.isFinite(v)?v:0;}
function itemType(item:Watch){return String(item.change_type||"")||"pending";}
function clean(value?:string|null){return String(value||"").replace(/\s+/g," ").trim();}

export default function ChangesModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[];onOpenImpact?:(dossierId:string,watchIds:string[])=>void}){
  const[selectedDossierId,setSelectedDossierId]=useState(dossiers[0]?.id||"");
  const[filter,setFilter]=useState<Filter>("all");
  const[refreshing,setRefreshing]=useState(false);

  useEffect(()=>{
    if(!selectedDossierId||!dossiers.some(d=>d.id===selectedDossierId))setSelectedDossierId(dossiers[0]?.id||"");
  },[dossiers,selectedDossierId]);

  const dossier=dossiers.find(d=>d.id===selectedDossierId)||dossiers[0]||null;
  const linked=useMemo(()=>watch.filter(item=>item.dossier_id===selectedDossierId).sort((a,b)=>timeOf(b)-timeOf(a)),[watch,selectedDossierId]);
  const visible=useMemo(()=>filter==="all"?linked:linked.filter(item=>itemType(item)===filter),[linked,filter]);
  const counts=useMemo(()=>linked.reduce<Record<string,number>>((acc,item)=>{const type=itemType(item);acc[type]=(acc[type]||0)+1;return acc;},{}),[linked]);
  const changed=linked.filter(item=>item.change_type&&item.change_type!=="aucun_changement"&&item.change_type!=="socle_initial").length;

  function baselineFor(item:Watch){
    const ids=Array.isArray(item.change_baseline_ids)?item.change_baseline_ids:[];
    return ids.map(id=>watch.find(candidate=>candidate.id===id)).filter(Boolean) as Watch[];
  }

  function refresh(){
    setRefreshing(true);
    window.dispatchEvent(new Event("pageshow"));
    window.setTimeout(()=>setRefreshing(false),700);
  }

  if(!dossiers.length)return <section className="changes-empty"><h1>Ce qui change</h1><p>Créez d’abord un dossier client pour analyser ses évolutions.</p></section>;

  return <div className="changes-page">
    <style jsx>{`
      .changes-page{display:grid;gap:18px;color:#f4f7fb;background:linear-gradient(180deg,#07162d 0%,#081b36 100%);border-radius:22px;padding:22px;min-height:calc(100vh - 130px);box-shadow:0 18px 50px rgba(3,11,24,.12)}
      .changes-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:2px 2px 4px}
      .changes-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:#f3bd3e;font-weight:900}
      .changes-head h1{font-size:32px;line-height:1.08;margin:7px 0 8px;color:#fff;letter-spacing:-.02em}
      .changes-head p{margin:0;color:#b8c7d9;max-width:760px;line-height:1.6;font-size:13px}
      .head-actions{display:flex;align-items:center;gap:9px;flex-shrink:0}
      .head-actions select,.refresh{height:42px;border:1px solid rgba(255,255,255,.13);background:#0d284d;border-radius:11px;padding:0 12px;color:#f7f9fc;font-weight:760;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
      .head-actions select{max-width:320px}.refresh{display:flex;align-items:center;gap:7px;cursor:pointer;transition:.18s ease}.refresh:hover{border-color:rgba(243,189,62,.55);color:#ffd466}.refresh svg{transition:.2s}.refreshing svg{transform:rotate(180deg)}

      .context{background:#0b2447;border:1px solid rgba(255,255,255,.09);border-radius:17px;padding:17px 18px;color:white;display:flex;justify-content:space-between;gap:20px;align-items:center;box-shadow:0 10px 28px rgba(0,0,0,.1)}
      .context span{font-size:9px;text-transform:uppercase;letter-spacing:.13em;color:#8fa7c4;font-weight:900}.context h2{font-size:18px;margin:5px 0 3px;color:#fff}.context p{margin:0;color:#aebfd3;font-size:11px}.context strong{font-size:29px;line-height:1;color:#ffd466}.context small{display:block;color:#91a5bd;text-align:right;margin-top:4px;font-size:9px;text-transform:uppercase;letter-spacing:.06em}

      .stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.stat{border:1px solid rgba(255,255,255,.08);background:#0a2140;border-radius:12px;padding:11px 12px}.stat span{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#8197b2;font-weight:900}.stat strong{display:block;margin-top:5px;font-size:19px;color:#f7f9fc}.stat:first-child{border-color:rgba(243,189,62,.3);background:linear-gradient(135deg,rgba(243,189,62,.09),#0a2140)}.stat:first-child strong{color:#ffd466}

      .panel{border:1px solid rgba(255,255,255,.09);background:#081d38;border-radius:17px;padding:14px;box-shadow:0 14px 35px rgba(0,0,0,.11)}
      .filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px;padding:1px}
      .filters button{border:1px solid rgba(255,255,255,.09);background:#0d284a;color:#aebed2;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:820;cursor:pointer;transition:.17s ease}
      .filters button:hover{color:#fff;border-color:rgba(255,255,255,.18)}.filters button.active{background:#f3bd3e;color:#102541;border-color:#f3bd3e;box-shadow:0 4px 16px rgba(243,189,62,.15)}

      .list{display:grid;gap:12px}.row{border:1px solid rgba(255,255,255,.09);border-radius:15px;background:#0a203e;overflow:hidden;box-shadow:0 9px 24px rgba(0,0,0,.08)}
      .row-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:#0b2344}
      .meta{display:flex;gap:7px;flex-wrap:wrap;color:#8298b4;font-size:9px;font-weight:700}.row h3{font-size:13px;line-height:1.45;margin:6px 0 0;color:#f8fafc;font-weight:800}
      .badge{border:1px solid;border-radius:999px;padding:6px 9px;font-size:8px;text-transform:uppercase;letter-spacing:.06em;font-weight:900;white-space:nowrap}

      .comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}.column{padding:17px;min-width:0;display:flex;flex-direction:column;gap:10px;position:relative}.column+.column{border-left:1px solid rgba(255,255,255,.08)}
      .column.previous{background:#0a1e39}.column.current{background:#0b2341}.column.impact{background:#0c294c}
      .column.current:before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:#f3bd3e}.column.impact:before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,212,102,.45)}
      .column-label{display:flex;align-items:center;gap:9px;font-size:9px;text-transform:uppercase;letter-spacing:.075em;font-weight:950;color:#d7e1ee;min-height:24px}
      .marker{width:23px;height:23px;border-radius:7px;display:grid;place-items:center;font-size:9px;font-weight:950;background:#173654;color:#a9bdd5;border:1px solid rgba(255,255,255,.06)}
      .current .marker{background:#f3bd3e;color:#112743;border-color:#f3bd3e}.impact .marker{background:#fff;color:#0b2a50;border-color:#fff}
      .column h4{font-size:13px;line-height:1.45;margin:1px 0 0;color:#fff;font-weight:820}.column p{font-size:11px;line-height:1.62;color:#b8c6d8;margin:0}.column small{display:block;color:#7f95af;font-size:9px;line-height:1.45}.normative{font-weight:680!important;color:#edf2f8!important}.impact .normative{color:#fff!important;font-size:11.5px}.evidence{margin:0;padding:10px 11px 10px 27px;border-radius:10px;background:rgba(255,255,255,.035);color:#b3c2d4;font-size:9.5px;line-height:1.55}.evidence li+li{margin-top:6px}.placeholder{color:#7f93aa!important;font-style:italic}.source-tag{display:inline-flex;align-items:center;align-self:flex-start;border:1px solid rgba(255,255,255,.09);background:#102c50;border-radius:999px;padding:5px 8px;color:#9fb2ca;font-size:8px;font-weight:850}

      .links{display:flex;gap:8px;flex-wrap:wrap;padding:10px 15px;border-top:1px solid rgba(255,255,255,.08);background:#091d38}.links a{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.1);background:#0e294a;color:#d4dfec;border-radius:9px;padding:8px 10px;font-size:9px;font-weight:850;text-decoration:none;transition:.17s ease}.links a:hover{border-color:rgba(243,189,62,.5);color:#ffd466}
      .empty{padding:34px;text-align:center;color:#8fa3bb}.changes-empty{padding:30px;background:#071936;color:white;border-radius:16px}

      @media(max-width:1150px){.stats{grid-template-columns:repeat(3,1fr)}.comparison{grid-template-columns:1fr}.column+.column{border-left:0;border-top:1px solid rgba(255,255,255,.08)}.column.current:before,.column.impact:before{width:2px;height:auto;top:0;bottom:0;right:auto}}
      @media(max-width:700px){.changes-page{padding:15px;border-radius:16px}.changes-head{display:grid}.head-actions{display:grid;grid-template-columns:minmax(0,1fr) auto}.head-actions select{max-width:none;width:100%}.context{align-items:flex-start}.stats{grid-template-columns:repeat(2,1fr)}.row-head{display:grid}.changes-head h1{font-size:27px}.column{padding:15px}}
    `}</style>

    <header className="changes-head">
      <div>
        <div className="changes-kicker">Comparaison normative du dossier</div>
        <h1>Ce qui change</h1>
        <p>Comparez en un coup d’œil la règle précédente, la norme désormais applicable et son effet concret sur votre dossier.</p>
      </div>
      <div className="head-actions">
        <select value={selectedDossierId} onChange={e=>{setSelectedDossierId(e.target.value);setFilter("all");}} aria-label="Dossier analysé">
          {dossiers.map(d=><option value={d.id} key={d.id}>{d.client} · {d.title}</option>)}
        </select>
        <button className={`refresh ${refreshing?"refreshing":""}`} onClick={refresh}><RefreshCw size={15}/>Actualiser</button>
      </div>
    </header>

    {dossier&&<section className="context">
      <div><span>Dossier actif</span><h2>{dossier.title}</h2><p>{dossier.client} · Avant → Désormais → Impact dossier</p></div>
      <div><strong>{changed}</strong><small>évolution(s) matérielle(s)</small></div>
    </section>}

    <section className="stats">
      <div className="stat"><span>Évolutions détectées</span><strong>{linked.length}</strong></div>
      <div className="stat"><span>Nouveaux</span><strong>{counts.nouveau||0}</strong></div>
      <div className="stat"><span>Modifications</span><strong>{counts.modification||0}</strong></div>
      <div className="stat"><span>Précisions</span><strong>{counts.precision||0}</strong></div>
      <div className="stat"><span>Applications</span><strong>{counts.application||0}</strong></div>
      <div className="stat"><span>Abrogations</span><strong>{counts.abrogation||0}</strong></div>
    </section>

    <section className="panel">
      <div className="filters">{FILTERS.map(([id,label])=><button key={id} className={filter===id?"active":""} onClick={()=>setFilter(id)}>{label}{id!=="all"&&counts[id]?` · ${counts[id]}`:""}</button>)}</div>
      <div className="list">{visible.length?visible.map(item=>{
        const type=itemType(item);
        const meta=META[type]||META.indetermine;
        const baseline=baselineFor(item);
        const previous=baseline[0]||null;
        const previousSummary=clean(previous?.change_summary);
        const currentSummary=clean(item.change_summary);
        const impact=clean(item.link_justification?.consequence);
        const evidence=(Array.isArray(item.link_justification?.evidence)?item.link_justification?.evidence:[]).map(clean).filter(Boolean).slice(0,2);
        return <article className="row" key={item.id}>
          <div className="row-head">
            <div>
              <div className="meta"><span>{item.nature}</span><span>•</span><span>{dateLabel(item.published_at||item.created_at)}</span>{item.source_name&&<><span>•</span><span>{item.source_name}</span></>}</div>
              <h3>{item.title}</h3>
            </div>
            <span className="badge" style={{color:meta.color,background:meta.background,borderColor:meta.border}}>{meta.label}</span>
          </div>

          <div className="comparison">
            <section className="column previous">
              <div className="column-label"><span className="marker">1</span>Règles précédemment applicables</div>
              {type==="socle_initial"?<>
                <h4>Aucun état antérieur identifié</h4>
                <p className="placeholder">Ce texte constitue le premier point de référence disponible pour ce dossier.</p>
              </>:previous?<>
                <h4>{previous.title}</h4>
                {previousSummary?<p className="normative">{previousSummary}</p>:<p>État de référence antérieur identifié par Myvor pour établir la comparaison.</p>}
                <small>{dateLabel(previous.published_at||previous.created_at)}{previous.source_name?` · ${previous.source_name}`:""}</small>
                {baseline.length>1&&<span className="source-tag">+ {baseline.length-1} autre(s) texte(s) de référence</span>}
              </>:<>
                <h4>Règle antérieure non documentée</h4>
                <p className="placeholder">Le corpus disponible ne permet pas encore d’isoler une norme antérieure précise.</p>
              </>}
            </section>

            <section className="column current">
              <div className="column-label"><span className="marker">2</span>Normes désormais applicables</div>
              <h4>{item.title}</h4>
              {currentSummary?<p className="normative">{currentSummary}</p>:<p className="placeholder">La comparaison normative est en cours de calcul pour ce texte.</p>}
              {evidence.length>0&&<ul className="evidence">{evidence.map((quote,index)=><li key={`${item.id}-e-${index}`}>{quote}</li>)}</ul>}
              <small>{dateLabel(item.published_at||item.created_at)}{item.source_name?` · ${item.source_name}`:""}</small>
            </section>

            <section className="column impact">
              <div className="column-label"><span className="marker">3</span>Qu’est-ce que ça change pour mon dossier ?</div>
              {impact?<p className="normative">{impact}</p>:<p className="placeholder">L’effet concret sur ce dossier n’a pas encore été qualifié. Myvor n’affiche pas de conséquence non établie.</p>}
              {clean(item.link_justification?.objective_link)&&<><small>Point du dossier concerné</small><p>{clean(item.link_justification?.objective_link)}</p></>}
            </section>
          </div>

          <div className="links">
            {previous?.source_url&&<a href={previous.source_url} target="_blank" rel="noreferrer">Voir la règle précédente <ExternalLink size={12}/></a>}
            {item.source_url&&<a href={item.source_url} target="_blank" rel="noreferrer">Voir la norme actuelle <ExternalLink size={12}/></a>}
          </div>
        </article>;
      }):<div className="empty">Aucune évolution correspondant à ce filtre pour le moment.</div>}</div>
    </section>
  </div>;
}
