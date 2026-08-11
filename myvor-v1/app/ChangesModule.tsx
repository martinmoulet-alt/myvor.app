"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowRight,ChevronDown,ChevronUp,ExternalLink,RefreshCw} from "lucide-react";

type Dossier={id:string;client:string;title:string;status?:string};
type Watch={
  id:string;title:string;nature:string;source_url:string;dossier_id:string|null;created_at:string;
  source_name?:string|null;published_at?:string|null;qualification_confidence?:number|null;
  change_type?:string|null;change_summary?:string|null;change_baseline_ids?:string[]|null;change_computed_at?:string|null;
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

function dateLabel(raw?:string|null){if(!raw)return"";const d=new Date(raw);return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"";}
function timeOf(item:Watch){const v=Date.parse(item.published_at||item.created_at||"");return Number.isFinite(v)?v:0;}
function itemType(item:Watch){return String(item.change_type||"")||"pending";}

export default function ChangesModule({dossiers,watch,onOpenImpact}:{dossiers:Dossier[];watch:Watch[];onOpenImpact:(dossierId:string,watchIds:string[])=>void}){
  const[selectedDossierId,setSelectedDossierId]=useState(dossiers[0]?.id||"");
  const[filter,setFilter]=useState<Filter>("all");
  const[openId,setOpenId]=useState<string|null>(null);
  const[refreshing,setRefreshing]=useState(false);

  useEffect(()=>{if(!selectedDossierId||!dossiers.some(d=>d.id===selectedDossierId))setSelectedDossierId(dossiers[0]?.id||"");},[dossiers,selectedDossierId]);

  const dossier=dossiers.find(d=>d.id===selectedDossierId)||dossiers[0]||null;
  const linked=useMemo(()=>watch.filter(item=>item.dossier_id===selectedDossierId).sort((a,b)=>timeOf(b)-timeOf(a)),[watch,selectedDossierId]);
  const visible=useMemo(()=>filter==="all"?linked:linked.filter(item=>itemType(item)===filter),[linked,filter]);
  const counts=useMemo(()=>linked.reduce<Record<string,number>>((acc,item)=>{const type=itemType(item);acc[type]=(acc[type]||0)+1;return acc;},{}),[linked]);
  const changed=linked.filter(item=>item.change_type&&item.change_type!=="aucun_changement"&&item.change_type!=="socle_initial").length;

  function baselineFor(item:Watch){const ids=Array.isArray(item.change_baseline_ids)?item.change_baseline_ids:[];return ids.map(id=>watch.find(candidate=>candidate.id===id)).filter(Boolean) as Watch[];}
  function refresh(){setRefreshing(true);window.dispatchEvent(new Event("pageshow"));window.setTimeout(()=>setRefreshing(false),700);}

  if(!dossiers.length)return <section className="changes-empty"><h1>Ce qui change</h1><p>Créez d’abord un dossier client pour analyser ses évolutions.</p></section>;

  return <div className="changes-page">
    <style jsx>{`
      .changes-page{display:grid;gap:18px;color:#102d50}.changes-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.changes-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#71839a;font-weight:850}.changes-head h1{font-size:30px;margin:5px 0 7px;color:#08234a}.changes-head p{margin:0;color:#667a92;max-width:760px;line-height:1.55}.head-actions{display:flex;align-items:center;gap:9px}.head-actions select,.refresh{height:40px;border:1px solid #d8e2ed;background:white;border-radius:10px;padding:0 11px;color:#183a63;font-weight:750}.refresh{display:flex;align-items:center;gap:7px;cursor:pointer}.refresh svg{transition:.2s}.refreshing svg{transform:rotate(180deg)}
      .context{background:linear-gradient(135deg,#071936,#0c326d);border-radius:18px;padding:18px 20px;color:white;display:flex;justify-content:space-between;gap:18px;align-items:center}.context span{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#93add1;font-weight:850}.context h2{font-size:19px;margin:5px 0 2px}.context p{margin:0;color:#c8d5e7;font-size:12px}.context strong{font-size:27px;color:#ffd466}.context small{display:block;color:#98aac1;text-align:right;margin-top:2px}
      .stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.stat{border:1px solid #dfe7f0;background:#fff;border-radius:13px;padding:12px}.stat span{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#76879d;font-weight:850}.stat strong{display:block;margin-top:5px;font-size:21px;color:#0c376c}
      .panel{border:1px solid #dfe7f0;background:white;border-radius:17px;padding:16px}.filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}.filters button{border:1px solid #d9e3ee;background:#f8fafc;color:#50657e;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.filters button.active{background:#0b3267;color:white;border-color:#0b3267}.list{display:grid;gap:9px}.row{border:1px solid #dfe7f0;border-radius:13px;background:#fff;overflow:hidden}.row-main{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:14px;align-items:center;cursor:pointer}.meta{display:flex;gap:7px;flex-wrap:wrap;color:#7b8ca2;font-size:10px}.row h3{font-size:13px;line-height:1.4;margin:5px 0;color:#15365f}.summary{font-size:11px;line-height:1.45;color:#536981;margin:0;max-width:900px}.side{display:flex;align-items:center;gap:9px}.badge{border:1px solid;border-radius:999px;padding:6px 9px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;font-weight:900;white-space:nowrap}.score{font-weight:900;color:#0b3a75;font-size:13px}.open{border:0;background:#f3f6fa;color:#315273;border-radius:8px;width:30px;height:30px;display:grid;place-items:center}.detail{border-top:1px solid #e3e9f0;background:#f8fbff;padding:16px}.flow{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr);align-items:stretch;gap:7px}.node{border:1px solid #d9e3ee;background:white;border-radius:12px;padding:12px;min-width:0}.node-label{display:flex;align-items:center;gap:7px;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:900;color:#345373;margin-bottom:9px}.step{display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:#0e5ec9;color:white;font-size:10px}.node h4{font-size:12px;line-height:1.4;margin:0 0 6px;color:#17365f}.node p{font-size:11px;line-height:1.5;color:#51677f;margin:0}.node small{display:block;color:#8795a7;font-size:9px;margin-top:7px}.arrow{display:grid;place-items:center;color:#d7a51e}.result p{font-weight:650;color:#2f4966}.consequence{border-color:#eed389;background:#fff9e8}.links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.links a,.impact{display:inline-flex;align-items:center;gap:6px;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:850;text-decoration:none}.links a{border:1px solid #d7e1ec;background:white;color:#265282}.impact{border:0;background:#f3bd3e;color:#122b4d;cursor:pointer;margin-left:auto}.empty{padding:28px;text-align:center;color:#74869b}.changes-empty{padding:30px;background:white;border-radius:16px}
      @media(max-width:1150px){.stats{grid-template-columns:repeat(3,1fr)}.flow{grid-template-columns:1fr}.arrow{transform:rotate(90deg);height:22px}.impact{margin-left:0}}@media(max-width:700px){.changes-head{display:grid}.head-actions{display:grid;grid-template-columns:1fr auto}.context{align-items:flex-start}.stats{grid-template-columns:repeat(2,1fr)}.row-main{grid-template-columns:1fr}.side{justify-content:space-between}.changes-head h1{font-size:25px}}
    `}</style>

    <header className="changes-head"><div><div className="changes-kicker">Étape 3 · Intelligence du dossier</div><h1>Ce qui change</h1><p>Visualisez les évolutions qui modifient concrètement le cadre applicable à vos dossiers.</p></div><div className="head-actions"><select value={selectedDossierId} onChange={e=>{setSelectedDossierId(e.target.value);setFilter("all");setOpenId(null);}} aria-label="Dossier analysé">{dossiers.map(d=><option value={d.id} key={d.id}>{d.client} · {d.title}</option>)}</select><button className={`refresh ${refreshing?"refreshing":""}`} onClick={refresh}><RefreshCw size={15}/>Actualiser</button></div></header>

    {dossier&&<section className="context"><div><span>Dossier actif</span><h2>{dossier.title}</h2><p>{dossier.client} · Myvor compare chaque nouveau texte au corpus déjà applicable au dossier.</p></div><div><strong>{changed}</strong><small>évolution(s) matérielle(s)</small></div></section>}

    <section className="stats">
      <div className="stat"><span>Évolutions détectées</span><strong>{linked.length}</strong></div>
      <div className="stat"><span>Nouveaux</span><strong>{counts.nouveau||0}</strong></div>
      <div className="stat"><span>Modifications</span><strong>{counts.modification||0}</strong></div>
      <div className="stat"><span>Précisions</span><strong>{counts.precision||0}</strong></div>
      <div className="stat"><span>Applications</span><strong>{counts.application||0}</strong></div>
      <div className="stat"><span>Abrogations</span><strong>{counts.abrogation||0}</strong></div>
    </section>

    <section className="panel"><div className="filters">{FILTERS.map(([id,label])=><button key={id} className={filter===id?"active":""} onClick={()=>setFilter(id)}>{label}{id!=="all"&&counts[id]?` · ${counts[id]}`:""}</button>)}</div>
      <div className="list">{visible.length?visible.map(item=>{const type=itemType(item),meta=META[type]||META.indetermine,baseline=baselineFor(item),isOpen=openId===item.id,confidence=Number(item.qualification_confidence);return <article className="row" key={item.id}>
        <div className="row-main" onClick={()=>setOpenId(isOpen?null:item.id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")setOpenId(isOpen?null:item.id);}}><div><div className="meta"><span>{item.nature}</span><span>•</span><span>{dateLabel(item.published_at||item.created_at)}</span>{item.source_name&&<><span>•</span><span>{item.source_name}</span></>}</div><h3>{item.title}</h3><p className="summary">{item.change_summary||"Le delta est en cours de calcul par Myvor."}</p></div><div className="side">{Number.isFinite(confidence)&&<span className="score">{Math.round(confidence*100)} %</span>}<span className="badge" style={{color:meta.color,background:meta.background,borderColor:meta.border}}>{meta.label}</span><span className="open">{isOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</span></div></div>
        {isOpen&&<div className="detail"><div className="flow">
          <div className="node"><div className="node-label"><span className="step">1</span>{type==="socle_initial"?"Socle initial":"Socle antérieur"}</div>{type==="socle_initial"?<><h4>Premier point de référence</h4><p>Premier texte de référence disponible pour ce dossier. Il servira de base aux évolutions suivantes.</p></>:baseline.length?<><h4>{baseline[0].title}</h4><p>{baseline.length>1?`${baseline.length} textes antérieurs ont été utilisés pour établir la comparaison.`:"État de référence utilisé pour comparer le nouveau texte."}</p><small>{dateLabel(baseline[0].published_at||baseline[0].created_at)}{baseline[0].source_name?` · ${baseline[0].source_name}`:""}</small></>:<><h4>Baseline non disponible</h4><p>Le corpus fourni ne permet pas d’identifier un texte antérieur précis.</p></>}</div>
          <span className="arrow"><ArrowRight size={20}/></span>
          <div className="node"><div className="node-label"><span className="step">2</span>Nouveau texte</div><h4>{item.title}</h4><p>Nouvelle publication détectée et rattachée au dossier.</p><small>{dateLabel(item.published_at||item.created_at)}{item.source_name?` · ${item.source_name}`:""}</small></div>
          <span className="arrow"><ArrowRight size={20}/></span>
          <div className="node result" style={{borderColor:meta.border,background:meta.background}}><div className="node-label"><span className="step">3</span>Ce qui change</div><h4>{meta.label}</h4><p>{item.change_summary||"Analyse en cours : Myvor n’a pas encore produit de delta structuré pour ce texte."}</p></div>
          <span className="arrow"><ArrowRight size={20}/></span>
          <div className="node consequence"><div className="node-label"><span className="step">4</span>Conséquence pour le dossier</div><h4>À prioriser dans le Score d’urgence</h4><p>Cette évolution sera prise en compte dans le Score d’urgence. Myvor n’invente aucune conséquence non calculée à cette étape.</p></div>
        </div><div className="links">{baseline[0]?.source_url&&<a href={baseline[0].source_url} target="_blank" rel="noreferrer">Voir le texte antérieur <ExternalLink size={12}/></a>}{item.source_url&&<a href={item.source_url} target="_blank" rel="noreferrer">Voir le texte source <ExternalLink size={12}/></a>}<button className="impact" onClick={()=>onOpenImpact(selectedDossierId,[item.id])}>Analyser l’urgence <ArrowRight size={13}/></button></div></div>}
      </article>}):<div className="empty">Aucune évolution correspondant à ce filtre pour le moment.</div>}</div>
    </section>
  </div>;
}
