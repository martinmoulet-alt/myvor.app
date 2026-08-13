"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowRight,ChevronDown,ChevronUp,ExternalLink,RefreshCw} from "lucide-react";

type Dossier={id:string;client:string;title:string};
type LinkJustification={objective_link?:string|null;evidence?:string[]|null;consequence?:string|null};
type Watch={
  id:string;title:string;nature:string;source_url:string;dossier_id:string|null;created_at:string;
  source_name?:string|null;published_at?:string|null;change_type?:string|null;change_summary?:string|null;
  change_baseline_ids?:string[]|null;link_justification?:LinkJustification|null;
};
type Filter="all"|"nouveau"|"modification"|"precision"|"application"|"abrogation"|"aucun_changement"|"socle_initial";

type Disposition={label:string;detail:string};

const FILTERS:[Filter,string][]=[
  ["all","Tous les changements"],
  ["nouveau","Nouveaux"],
  ["modification","Modifications"],
  ["precision","Précisions"],
  ["application","Applications"],
  ["abrogation","Abrogations"],
  ["aucun_changement","Sans changement"],
  ["socle_initial","Socle initial"],
];

const BADGES:Record<string,{label:string;color:string}>={
  nouveau:{label:"Nouveau",color:"#7fe0b4"},
  modification:{label:"Modification",color:"#ffd466"},
  precision:{label:"Précision",color:"#8bc5ff"},
  application:{label:"Application",color:"#cfb2ff"},
  abrogation:{label:"Abrogation",color:"#ff9da3"},
  aucun_changement:{label:"Aucun changement",color:"#b8c6d9"},
  socle_initial:{label:"Socle initial",color:"#b9cdea"},
  pending:{label:"Analyse en cours",color:"#c2cee0"},
};

const MONTHS:Record<string,string>={
  janvier:"janvier",fevrier:"février","février":"février",mars:"mars",avril:"avril",mai:"mai",juin:"juin",
  juillet:"juillet",aout:"août","août":"août",septembre:"septembre",octobre:"octobre",novembre:"novembre",
  decembre:"décembre","décembre":"décembre",
};

function clean(v?:string|null){return String(v||"").replace(/\s+/g," ").trim();}
function cut(v?:string|null,n=130){const s=clean(v);return s.length>n?`${s.slice(0,n).trim()}…`:s;}
function dateLabel(raw?:string|null){
  if(!raw)return"";
  const d=new Date(raw);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"";
}
function timeOf(w:Watch){const t=Date.parse(w.published_at||w.created_at||"");return Number.isFinite(t)?t:0;}
function normKind(w:Watch){
  const s=`${w.nature} ${w.title}`.toLowerCase();
  const pairs:[RegExp,string][]=[
    [/projet de loi/,"Projet de loi"],[/proposition de loi/,"Proposition de loi"],[/\bloi\b/,"Loi"],[/décret|decret/,"Décret"],
    [/arrêté|arrete/,"Arrêté"],[/ordonnance/,"Ordonnance"],[/règlement|reglement/,"Règlement"],[/directive/,"Directive"],
    [/décision|decision/,"Décision"],[/amendement/,"Amendement"],[/rapport/,"Rapport"],
  ];
  for(const [r,n] of pairs)if(r.test(s))return n;
  return clean(w.nature)||"Texte";
}
function shortTitle(w:Watch){
  const m=clean(w.title).match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/i);
  let d="";
  if(m)d=`${Number(m[1])} ${MONTHS[m[2].toLowerCase()]||m[2]} ${m[3]}`;
  else{
    const x=new Date(w.published_at||w.created_at||"");
    if(Number.isFinite(x.getTime()))d=x.toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
  }
  return d?`${normKind(w)} du ${d}…`:`${normKind(w)}…`;
}
function dispositionLabel(t:string,i:number){
  const article=t.match(/\b(?:article|art\.)\s+([A-Z0-9LRC°\.\-]+)/i);
  if(article)return`Article ${article[1]}`;
  const pairs:[RegExp,string][]=[
    [/délai|échéance/i,"Délai"],[/seuil|montant|plafond/i,"Seuil / montant"],[/obligation|tenu de/i,"Obligation"],
    [/dérogation|exception/i,"Dérogation"],[/procédure|formalités/i,"Procédure"],[/agrément|autorisation/i,"Agrément / autorisation"],
    [/entrée en vigueur|applicable à compter/i,"Entrée en vigueur"],
  ];
  for(const [r,n] of pairs)if(r.test(t))return n;
  return`Disposition ${i+1}`;
}
function dispositions(w:Watch):Disposition[]{
  const evidence=(Array.isArray(w.link_justification?.evidence)?w.link_justification?.evidence:[]).map(clean).filter(Boolean).slice(0,6);
  const src=evidence.length?evidence:(clean(w.change_summary)?[clean(w.change_summary)]:[]);
  return src.map((detail,i)=>({label:dispositionLabel(detail,i),detail}));
}

export default function ChangesModuleV3({dossiers,watch}:{dossiers:Dossier[];watch:Watch[];onOpenImpact?:(dossierId:string,watchIds:string[])=>void}){
  const[selectedDossierId,setSelectedDossierId]=useState(dossiers[0]?.id||"");
  const[filter,setFilter]=useState<Filter>("all");
  const[selectedChangeId,setSelectedChangeId]=useState("");
  const[selectedDisposition,setSelectedDisposition]=useState(0);
  const[detailOpen,setDetailOpen]=useState(false);
  const[refreshing,setRefreshing]=useState(false);

  useEffect(()=>{
    if(!selectedDossierId||!dossiers.some(d=>d.id===selectedDossierId))setSelectedDossierId(dossiers[0]?.id||"");
  },[dossiers,selectedDossierId]);

  const dossier=dossiers.find(d=>d.id===selectedDossierId)||dossiers[0]||null;
  const linked=useMemo(()=>watch.filter(w=>w.dossier_id===selectedDossierId).sort((a,b)=>timeOf(b)-timeOf(a)),[watch,selectedDossierId]);
  const filtered=useMemo(()=>filter==="all"?linked:linked.filter(w=>(w.change_type||"pending")===filter),[linked,filter]);

  useEffect(()=>{
    if(!filtered.length){setSelectedChangeId("");return;}
    if(!filtered.some(w=>w.id===selectedChangeId))setSelectedChangeId(filtered[0].id);
  },[filtered,selectedChangeId]);

  useEffect(()=>{setSelectedDisposition(0);setDetailOpen(false);},[selectedChangeId]);

  const item=filtered.find(w=>w.id===selectedChangeId)||filtered[0]||null;
  const baseline=item?(Array.isArray(item.change_baseline_ids)?item.change_baseline_ids:[]).map(id=>watch.find(w=>w.id===id)).filter(Boolean) as Watch[]:[];
  const previous=baseline[0]||null;
  const ds=item?dispositions(item):[];
  const chosen=ds[Math.min(selectedDisposition,Math.max(0,ds.length-1))]||null;
  const badge=item?BADGES[item.change_type||"pending"]||BADGES.pending:BADGES.pending;
  const previousRule=previous?(clean(previous.change_summary)||"État antérieur identifié comme base de comparaison."):"Aucune règle antérieure suffisamment documentée.";
  const currentRule=item?(clean(item.change_summary)||"La nouvelle règle est en cours de qualification."):"";
  const impact=item?(clean(item.link_justification?.consequence)||"L’effet sur ce dossier n’a pas encore été qualifié."):"";
  const objective=item?clean(item.link_justification?.objective_link):"";

  function refresh(){setRefreshing(true);window.dispatchEvent(new Event("pageshow"));window.setTimeout(()=>setRefreshing(false),700);}

  if(!dossiers.length)return <section className="emptyPage"><h1>Ce qui change</h1><p>Créez d’abord un dossier client.</p></section>;

  return <div className="page">
    <style jsx>{`
      .page{display:grid;gap:18px;background:linear-gradient(180deg,#07162d,#081b36);color:#fff;border-radius:22px;padding:22px;min-height:calc(100vh - 130px)}
      .head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.kicker{color:#f3bd3e;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.head h1{font-size:32px;margin:6px 0 7px;line-height:1.1}.head p{margin:0;color:#b8c7d9;font-size:13px;line-height:1.55}.refresh{height:40px;border:1px solid rgba(255,255,255,.13);background:#0d284d;color:#fff;border-radius:10px;padding:0 12px;font-weight:800;display:flex;align-items:center;gap:7px}.refreshing svg{transform:rotate(180deg)}
      .filters{display:grid;grid-template-columns:minmax(230px,1.5fr) minmax(190px,1fr);gap:10px;max-width:720px}.filterBox{background:#0b2447;border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:9px 11px}.filterBox label{display:block;color:#8298b4;font-size:8px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;margin-bottom:5px}.filterBox select{width:100%;border:0;background:transparent;color:#fff;font-size:12px;font-weight:800;outline:none}
      .context{display:flex;justify-content:space-between;gap:15px;align-items:center;background:#0a203e;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:13px 15px}.context span{font-size:9px;color:#91a5bd;text-transform:uppercase;font-weight:900}.context strong{display:block;margin-top:3px;font-size:14px;color:#fff}.contextCount{color:#ffd466!important;font-size:11px!important}
      .timelineWrap{display:grid;gap:8px}.sectionLabel{font-size:8px;color:#8197b2;text-transform:uppercase;letter-spacing:.09em;font-weight:900}.timeline{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.timeCard{min-width:150px;text-align:left;border:1px solid rgba(255,255,255,.09);background:#0b2344;color:#cad5e2;border-radius:12px;padding:10px;cursor:pointer}.timeCard.active{border-color:#f3bd3e;background:linear-gradient(180deg,rgba(243,189,62,.16),#0b2344);box-shadow:0 5px 18px rgba(243,189,62,.09)}.timeCard small{display:block;color:#8298b4;font-size:8px;margin-bottom:4px}.timeCard strong{display:block;color:#fff;font-size:11px;line-height:1.35}.timeCard em{display:block;margin-top:5px;color:#ffd466;font-size:8px;font-style:normal;font-weight:900;text-transform:uppercase}
      .workspace{display:grid;gap:13px}.changeHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;background:#0b2344;border:1px solid rgba(255,255,255,.09);border-radius:15px;padding:15px 17px}.meta{font-size:9px;color:#8298b4}.shortTitle{margin:5px 0 0;font-size:20px;line-height:1.25;color:#fff}.badge{border:1px solid currentColor;border-radius:999px;padding:6px 9px;font-size:8px;text-transform:uppercase;font-weight:900;white-space:nowrap}
      .dispositions{display:flex;gap:7px;flex-wrap:wrap}.dispositions button{border:1px solid rgba(255,255,255,.1);background:#0d2948;color:#aebed1;border-radius:999px;padding:7px 10px;font-size:9px;font-weight:850;cursor:pointer}.dispositions button.active{border-color:#6ce0ad;background:rgba(42,172,116,.18);color:#baf2d5}
      .scheme{display:grid;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr) 32px minmax(0,1fr);align-items:stretch;gap:8px}.node{border-radius:16px;padding:18px;display:grid;align-content:start;gap:9px;border:1px solid rgba(255,255,255,.09);min-height:180px;position:relative;overflow:hidden}.node:before{content:"";position:absolute;left:0;right:0;top:0;height:4px}.nodeLabel{font-size:8px;letter-spacing:.09em;text-transform:uppercase;font-weight:950}.node h3{font-size:18px;line-height:1.28;margin:0}.node p{font-size:11px;line-height:1.62;margin:0}.before{background:linear-gradient(180deg,rgba(176,54,67,.28),rgba(96,29,39,.17));}.before:before{background:#ff858d}.before .nodeLabel{color:#ffadb2}.before p{color:#f0d9dc}.now{background:linear-gradient(180deg,rgba(42,172,116,.26),rgba(27,94,67,.17));}.now:before{background:#6ce0ad}.now .nodeLabel{color:#9be8c4}.now p{color:#d8f0e4}.case{background:linear-gradient(180deg,rgba(243,189,62,.27),rgba(110,82,20,.17));}.case:before{background:#f3bd3e}.case .nodeLabel{color:#ffd466}.case p{color:#f5e7bd}.arrow{display:grid;place-items:center;color:#7188a4}
      .focusBox{background:#0b2344;border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:13px 15px;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center}.focusIcon{width:34px;height:34px;border-radius:10px;background:rgba(42,172,116,.16);color:#83e5b8;display:grid;place-items:center;font-size:12px;font-weight:950}.focusBox span{display:block;color:#8197b2;font-size:8px;text-transform:uppercase;font-weight:900}.focusBox strong{display:block;color:#fff;font-size:12px;margin-top:3px}.focusBox button{border:0;background:transparent;color:#ffd466;font-size:9px;font-weight:900;display:flex;align-items:center;gap:5px;cursor:pointer}
      .detail{background:#091d38;border:1px solid rgba(255,255,255,.08);border-radius:13px;padding:14px 15px}.detail h4{font-size:12px;margin:0 0 7px}.detail p{font-size:10px;line-height:1.6;color:#c3cfdd;margin:0}.detailFoot{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}.detailFoot a{display:inline-flex;align-items:center;gap:5px;color:#ffd466;font-size:9px;font-weight:850;text-decoration:none}.objective{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);color:#aebed1;font-size:9px;line-height:1.5}
      .empty{padding:35px;text-align:center;color:#8ea2ba;background:#0a203e;border-radius:15px;border:1px solid rgba(255,255,255,.08)}.emptyPage{padding:30px;background:#071936;color:#fff;border-radius:16px}
      @media(max-width:1050px){.scheme{grid-template-columns:1fr}.arrow{height:18px;transform:rotate(90deg)}}
      @media(max-width:700px){.page{padding:15px}.head{display:grid}.filters{grid-template-columns:1fr}.changeHead{display:grid}.shortTitle{font-size:18px}.focusBox{grid-template-columns:auto 1fr}.focusBox button{grid-column:1/-1;justify-content:flex-start}.context{align-items:flex-start}}
    `}</style>

    <header className="head">
      <div><div className="kicker">Comparaison normative du dossier</div><h1>Ce qui change</h1><p>Choisissez un dossier, puis naviguez changement par changement.</p></div>
      <button className={`refresh ${refreshing?"refreshing":""}`} onClick={refresh}><RefreshCw size={14}/>Actualiser</button>
    </header>

    <section className="filters">
      <div className="filterBox"><label>Dossier</label><select value={selectedDossierId} onChange={e=>{setSelectedDossierId(e.target.value);setFilter("all");setSelectedChangeId("");}}>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} · {d.title}</option>)}</select></div>
      <div className="filterBox"><label>Type de changement</label><select value={filter} onChange={e=>{setFilter(e.target.value as Filter);setSelectedChangeId("");}}>{FILTERS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
    </section>

    {dossier&&<section className="context"><div><span>Dossier sélectionné</span><strong>{dossier.title}</strong></div><span className="contextCount">{filtered.length} évolution(s)</span></section>}

    {filtered.length?<>
      <section className="timelineWrap"><div className="sectionLabel">Chronologie du dossier</div><div className="timeline">{filtered.map(w=>{const active=w.id===item?.id;const b=BADGES[w.change_type||"pending"]||BADGES.pending;return <button key={w.id} className={`timeCard ${active?"active":""}`} onClick={()=>setSelectedChangeId(w.id)}><small>{dateLabel(w.published_at||w.created_at)}</small><strong>{shortTitle(w)}</strong><em style={{color:b.color}}>{b.label}</em></button>})}</div></section>

      {item&&<section className="workspace">
        <div className="changeHead"><div><div className="meta">{item.source_name||item.nature} · {dateLabel(item.published_at||item.created_at)}</div><h2 className="shortTitle" title={item.title}>{shortTitle(item)}</h2></div><span className="badge" style={{color:badge.color}}>{badge.label}</span></div>

        {ds.length>0&&<div className="dispositions">{ds.map((d,i)=><button key={`${item.id}-${i}`} className={i===selectedDisposition?"active":""} onClick={()=>{setSelectedDisposition(i);setDetailOpen(false)}}>{d.label}</button>)}</div>}

        <div className="scheme">
          <article className="node before"><div className="nodeLabel">Avant</div><h3>{previous?shortTitle(previous):"Règle antérieure"}</h3><p>{cut(previousRule,220)}</p></article>
          <div className="arrow"><ArrowRight size={22}/></div>
          <article className="node now"><div className="nodeLabel">Maintenant</div><h3>{chosen?.label||badge.label}</h3><p>{cut(chosen?.detail||currentRule,220)}</p></article>
          <div className="arrow"><ArrowRight size={22}/></div>
          <article className="node case"><div className="nodeLabel">Mon dossier</div><h3>Impact concret</h3><p>{cut(impact,220)}</p></article>
        </div>

        <div className="focusBox"><div className="focusIcon">Δ</div><div><span>Disposition sélectionnée</span><strong>{chosen?.label||"Changement principal"}</strong></div><button onClick={()=>setDetailOpen(v=>!v)}>{detailOpen?<>Masquer le détail <ChevronUp size={13}/></>:<>Voir le détail <ChevronDown size={13}/></>}</button></div>

        {detailOpen&&<div className="detail"><h4>{chosen?.label||"Détail du changement"}</h4><p>{chosen?.detail||currentRule}</p>{objective&&<div className="objective"><strong>Point du dossier concerné :</strong> {objective}</div>}<div className="detailFoot">{previous?.source_url&&<a href={previous.source_url} target="_blank" rel="noreferrer">Source précédente <ExternalLink size={11}/></a>}{item.source_url&&<a href={item.source_url} target="_blank" rel="noreferrer">Source actuelle <ExternalLink size={11}/></a>}</div></div>}
      </section>}
    </>:<div className="empty">Aucune évolution ne correspond à ce dossier et à ce filtre.</div>}
  </div>;
}
