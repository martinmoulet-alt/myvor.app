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
  nouveau:{label:"Nouveau",color:"#147a58",background:"#e9f8f1",border:"#bfe9d6"},
  modification:{label:"Modification",color:"#8a5a00",background:"#fff5db",border:"#f0d58a"},
  precision:{label:"Précision",color:"#245fa7",background:"#edf5ff",border:"#c9ddfb"},
  application:{label:"Application",color:"#6a3ba8",background:"#f4edff",border:"#dac7f4"},
  abrogation:{label:"Abrogation",color:"#a62d34",background:"#fff0f1",border:"#f2c7ca"},
  aucun_changement:{label:"Aucun changement",color:"#5b6675",background:"#f2f4f7",border:"#d9dee5"},
  socle_initial:{label:"Socle initial",color:"#41546d",background:"#eef3f8",border:"#d4dfeb"},
  indetermine:{label:"Comparaison insuffisante",color:"#5b6675",background:"#f2f4f7",border:"#d9dee5"},
  pending:{label:"Analyse en cours",color:"#617086",background:"#f4f7fa",border:"#dce4ec"},
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
      .changes-page{display:grid;gap:18px;color:#102d50}
      .changes-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
      .changes-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#71839a;font-weight:850}
      .changes-head h1{font-size:30px;margin:5px 0 7px;color:#08234a}
      .changes-head p{margin:0;color:#667a92;max-width:790px;line-height:1.55}
      .head-actions{display:flex;align-items:center;gap:9px}
      .head-actions select,.refresh{height:40px;border:1px solid #d8e2ed;background:white;border-radius:10px;padding:0 11px;color:#183a63;font-weight:750}
      .refresh{display:flex;align-items:center;gap:7px;cursor:pointer}.refresh svg{transition:.2s}.refreshing svg{transform:rotate(180deg)}
      .context{background:linear-gradient(135deg,#071936,#0c326d);border-radius:18px;padding:18px 20px;color:white;display:flex;justify-content:space-between;gap:18px;align-items:center}
      .context span{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#93add1;font-weight:850}.context h2{font-size:19px;margin:5px 0 2px}.context p{margin:0;color:#c8d5e7;font-size:12px}.context strong{font-size:27px;color:#ffd466}.context small{display:block;color:#98aac1;text-align:right;margin-top:2px}
      .stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.stat{border:1px solid #dfe7f0;background:#fff;border-radius:13px;padding:12px}.stat span{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#76879d;font-weight:850}.stat strong{display:block;margin-top:5px;font-size:21px;color:#0c376c}
      .panel{border:1px solid #dfe7f0;background:white;border-radius:17px;padding:16px}.filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}.filters button{border:1px solid #d9e3ee;background:#f8fafc;color:#50657e;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.filters button.active{background:#0b3267;color:white;border-color:#0b3267}
      .list{display:grid;gap:12px}.row{border:1px solid #dfe7f0;border-radius:15px;background:#fff;overflow:hidden}.row-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:14px 15px;border-bottom:1px solid #e6edf4}.meta{display:flex;gap:7px;flex-wrap:wrap;color:#7b8ca2;font-size:10px}.row h3{font-size:13px;line-height:1.4;margin:5px 0 0;color:#15365f}.badge{border:1px solid;border-radius:999px;padding:6px 9px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;font-weight:900;white-space:nowrap}
      .comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}.column{padding:16px;min-width:0;display:flex;flex-direction:column;gap:9px}.column+.column{border-left:1px solid #e3eaf2}.column.previous{background:#f8fafc}.column.current{background:#fffdf7}.column.impact{background:#f6f9fd}.column-label{display:flex;align-items:center;gap:8px;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:900;color:#345373}.marker{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-size:10px;font-weight:950;background:#e8eef5;color:#24486f}.current .marker{background:#ffd466;color:#17304f}.impact .marker{background:#0b3267;color:white}.column h4{font-size:13px;line-height:1.42;margin:0;color:#17365f}.column p{font-size:11px;line-height:1.58;color:#50677f;margin:0}.column small{display:block;color:#8795a7;font-size:9px;line-height:1.45}.normative{font-weight:680!important;color:#263f5d!important}.evidence{margin:0;padding-left:16px;color:#51677f;font-size:10px;line-height:1.5}.evidence li+li{margin-top:5px}.placeholder{color:#8492a3!important;font-style:italic}.source-tag{display:inline-flex;align-items:center;align-self:flex-start;border:1px solid #dce5ee;background:white;border-radius:999px;padding:5px 8px;color:#657b94;font-size:9px;font-weight:800}.links{display:flex;gap:8px;flex-wrap:wrap;padding:11px 15px;border-top:1px solid #e6edf4;background:#fbfcfe}.links a{display:inline-flex;align-items:center;gap:6px;border:1px solid #d7e1ec;background:white;color:#265282;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:850;text-decoration:none}.empty{padding:28px;text-align:center;color:#74869b}.changes-empty{padding:30px;background:white;border-radius:16px}
      @media(max-width:1150px){.stats{grid-template-columns:repeat(3,1fr)}.comparison{grid-template-columns:1fr}.column+.column{border-left:0;border-top:1px solid #e3eaf2}}
      @media(max-width:700px){.changes-head{display:grid}.head-actions{display:grid;grid-template-columns:1fr auto}.context{align-items:flex-start}.stats{grid-template-columns:repeat(2,1fr)}.row-head{display:grid}.changes-head h1{font-size:25px}}
    `}</style>

    <header className="changes-head">
      <div>
        <div className="changes-kicker">Comparaison normative du dossier</div>
        <h1>Ce qui change</h1>
        <p>Comparez les règles précédemment applicables, les normes désormais applicables et leur effet concret sur votre dossier.</p>
      </div>
      <div className="head-actions">
        <select value={selectedDossierId} onChange={e=>{setSelectedDossierId(e.target.value);setFilter("all");}} aria-label="Dossier analysé">
          {dossiers.map(d=><option value={d.id} key={d.id}>{d.client} · {d.title}</option>)}
        </select>
        <button className={`refresh ${refreshing?"refreshing":""}`} onClick={refresh}><RefreshCw size={15}/>Actualiser</button>
      </div>
    </header>

    {dossier&&<section className="context">
      <div><span>Dossier actif</span><h2>{dossier.title}</h2><p>{dossier.client} · Lecture avant / après / effet dossier.</p></div>
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
