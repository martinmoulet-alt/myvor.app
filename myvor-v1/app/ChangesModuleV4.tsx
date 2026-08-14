"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowRight,ChevronDown,ChevronUp,ExternalLink,FileText,RefreshCw,ShieldCheck} from "lucide-react";

type Dossier={id:string;client:string;title:string};
type LinkJustification={objective_link?:string|null;evidence?:string[]|null;consequence?:string|null};
type ChainStatus="complete"|"partial"|"no_explicit_reference"|"unresolved";
type ChangeView="evolution"|"filiation"|"fondements";
type Watch={
  id:string;title:string;nature:string;source_url:string;dossier_id:string|null;created_at:string;
  source_name?:string|null;published_at?:string|null;change_type?:string|null;change_summary?:string|null;
  change_baseline_ids?:string[]|null;link_justification?:LinkJustification|null;
  normative_chain_ids?:string[]|null;normative_chain_status?:ChainStatus|null;normative_unresolved_references?:number|null;
};
type Filter="all"|"nouveau"|"modification"|"precision"|"application"|"abrogation"|"aucun_changement"|"socle_initial";
type Disposition={label:string;detail:string};

const FILTERS:[Filter,string][]=[
  ["all","Tous les changements"],["nouveau","Nouveaux"],["modification","Modifications"],["precision","Précisions"],
  ["application","Applications"],["abrogation","Abrogations"],["aucun_changement","Sans changement"],["socle_initial","Socle initial"],
];
const BADGES:Record<string,{label:string;color:string}>={
  nouveau:{label:"Nouveau",color:"#7fe0b4"},modification:{label:"Modification",color:"#ffd466"},precision:{label:"Précision",color:"#8bc5ff"},
  application:{label:"Application",color:"#cfb2ff"},abrogation:{label:"Abrogation",color:"#ff9da3"},aucun_changement:{label:"Aucun changement",color:"#b8c6d9"},
  socle_initial:{label:"Socle initial",color:"#b9cdea"},pending:{label:"Analyse en cours",color:"#c2cee0"},
};
const MONTHS:Record<string,string>={janvier:"janvier",fevrier:"février","février":"février",mars:"mars",avril:"avril",mai:"mai",juin:"juin",juillet:"juillet",aout:"août","août":"août",septembre:"septembre",octobre:"octobre",novembre:"novembre",decembre:"décembre","décembre":"décembre"};

function clean(v?:string|null){return String(v||"").replace(/\s+/g," ").trim();}
function cut(v?:string|null,n=130){const s=clean(v);return s.length>n?`${s.slice(0,n).trim()}…`:s;}
function dateLabel(raw?:string|null){if(!raw)return"";const d=new Date(raw);return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"";}
function timeOf(w:Watch){const t=Date.parse(w.published_at||w.created_at||"");return Number.isFinite(t)?t:0;}
function uniqueWatchIds(ids?:string[]|null){return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean))];}
function normKind(w:Watch){
  const s=`${w.nature} ${w.title}`.toLowerCase();
  const pairs:[RegExp,string][]=[[/projet de loi/,"Projet de loi"],[/proposition de loi/,"Proposition de loi"],[/\bloi\b/,"Loi"],[/décret|decret/,"Décret"],[/arrêté|arrete/,"Arrêté"],[/ordonnance/,"Ordonnance"],[/règlement|reglement/,"Règlement"],[/directive/,"Directive"],[/décision|decision/,"Décision"],[/amendement/,"Amendement"],[/rapport/,"Rapport"]];
  for(const [r,n] of pairs)if(r.test(s))return n;return clean(w.nature)||"Texte";
}
function shortTitle(w:Watch){
  const m=clean(w.title).match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/i);
  let d="";if(m)d=`${Number(m[1])} ${MONTHS[m[2].toLowerCase()]||m[2]} ${m[3]}`;else{const x=new Date(w.published_at||w.created_at||"");if(Number.isFinite(x.getTime()))d=x.toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});}
  return d?`${normKind(w)} du ${d}`:normKind(w);
}
function dispositionLabel(t:string,i:number){
  const article=t.match(/\b(?:article|art\.)\s+([A-Z0-9LRC°\.\-]+)/i);if(article)return`Article ${article[1]}`;
  const pairs:[RegExp,string][]=[[/délai|échéance/i,"Délai"],[/seuil|montant|plafond/i,"Seuil / montant"],[/obligation|tenu de/i,"Obligation"],[/dérogation|exception/i,"Dérogation"],[/procédure|formalités/i,"Procédure"],[/agrément|autorisation/i,"Agrément / autorisation"],[/entrée en vigueur|applicable à compter/i,"Entrée en vigueur"]];
  for(const [r,n] of pairs)if(r.test(t))return n;return`Disposition ${i+1}`;
}
function dispositions(w:Watch):Disposition[]{
  const evidence=(Array.isArray(w.link_justification?.evidence)?w.link_justification?.evidence:[]).map(clean).filter(Boolean).slice(0,6);
  const src=evidence.length?evidence:(clean(w.change_summary)?[clean(w.change_summary)]:[]);return src.map((detail,i)=>({label:dispositionLabel(detail,i),detail}));
}
function sourceTarget(d:Disposition){
  const article=d.detail.match(/\b(?:article|art\.)\s+([A-Z0-9LRC°\.\-]+)/i);if(article)return`Article ${article[1]}`;
  return(clean(d.detail).split(/[.;:]/)[0]?.trim()||d.label).slice(0,90);
}
function provisionHref(sourceUrl:string,disposition?:Disposition|null){
  const raw=clean(sourceUrl);if(!raw||!disposition)return raw;
  try{const u=new URL(raw);if(!/^https?:$/.test(u.protocol))return raw;const target=sourceTarget(disposition);if(!target)return raw;const oldHash=u.hash.replace(/^#/,"").split(":~:")[0];const base=`${u.origin}${u.pathname}${u.search}`;return`${base}#${oldHash?`${oldHash}:`:""}~:text=${encodeURIComponent(target)}`;}catch{return raw;}
}
function chainMessage(item:Watch,chain:Watch[]){
  const unresolved=Math.max(0,Number(item.normative_unresolved_references||0));
  if(item.normative_chain_status==="complete")return{label:"Chaîne normative reconstituée",tone:"ok",detail:`${chain.length} texte(s) antérieur(s) relié(s) au nouveau texte.`};
  if(item.normative_chain_status==="partial")return{label:"Chaîne normative partielle",tone:"warn",detail:`${chain.length} texte(s) retrouvés · ${unresolved} référence(s) restent à résoudre.`};
  if(item.normative_chain_status==="unresolved")return{label:"Références antérieures à résoudre",tone:"warn",detail:`${unresolved||1} référence(s) explicite(s) restent non résolues.`};
  if(item.normative_chain_status==="no_explicit_reference")return{label:"Aucune référence explicite détectée",tone:"neutral",detail:"Le corpus historique du dossier sert de base de comparaison."};
  return{label:"Filiation normative en cours",tone:"neutral",detail:"Myvor reconstruit les textes qui ont créé, modifié ou appliqué la norme."};
}

export default function ChangesModuleV4({dossiers,watch}:{dossiers:Dossier[];watch:Watch[];onOpenImpact?:(dossierId:string,watchIds:string[])=>void}){
  const[selectedDossierId,setSelectedDossierId]=useState(dossiers[0]?.id||"");
  const[filter,setFilter]=useState<Filter>("all");
  const[view,setView]=useState<ChangeView>("evolution");
  const[selectedChangeId,setSelectedChangeId]=useState("");
  const[selectedDisposition,setSelectedDisposition]=useState(0);
  const[detailOpen,setDetailOpen]=useState(false);
  const[refreshing,setRefreshing]=useState(false);

  useEffect(()=>{if(!selectedDossierId||!dossiers.some(d=>d.id===selectedDossierId))setSelectedDossierId(dossiers[0]?.id||"");},[dossiers,selectedDossierId]);
  const dossier=dossiers.find(d=>d.id===selectedDossierId)||dossiers[0]||null;
  const linked=useMemo(()=>watch.filter(w=>w.dossier_id===selectedDossierId).sort((a,b)=>timeOf(b)-timeOf(a)),[watch,selectedDossierId]);
  const filtered=useMemo(()=>filter==="all"?linked:linked.filter(w=>(w.change_type||"pending")===filter),[linked,filter]);
  useEffect(()=>{if(!filtered.length){setSelectedChangeId("");return;}if(!filtered.some(w=>w.id===selectedChangeId))setSelectedChangeId(filtered[0].id);},[filtered,selectedChangeId]);
  useEffect(()=>{setSelectedDisposition(0);setDetailOpen(false);},[selectedChangeId]);

  const item=filtered.find(w=>w.id===selectedChangeId)||filtered[0]||null;
  const baseline=item?(Array.isArray(item.change_baseline_ids)?item.change_baseline_ids:[]).map(id=>watch.find(w=>w.id===id)).filter(Boolean) as Watch[]:[];
  const chain=item?uniqueWatchIds(item.normative_chain_ids?.length?item.normative_chain_ids:item.change_baseline_ids).map(id=>watch.find(w=>w.id===id)).filter(Boolean).sort((a,b)=>timeOf(a as Watch)-timeOf(b as Watch)) as Watch[]:[];
  const previous=chain.length?chain[chain.length-1]:(baseline[0]||null);
  const chainState=item?chainMessage(item,chain):null;
  const ds=item?dispositions(item):[];
  const chosen=ds[Math.min(selectedDisposition,Math.max(0,ds.length-1))]||null;
  const badge=item?BADGES[item.change_type||"pending"]||BADGES.pending:BADGES.pending;
  const previousRule=previous?(clean(previous.change_summary)||"État antérieur identifié comme base de comparaison."):"Aucune règle antérieure suffisamment documentée.";
  const currentRule=item?(clean(item.change_summary)||"La nouvelle règle est en cours de qualification."):"";
  const impact=item?(clean(item.link_justification?.consequence)||"L’effet sur ce dossier n’a pas encore été qualifié."):"";
  const objective=item?clean(item.link_justification?.objective_link):"";
  const currentProvisionUrl=item?provisionHref(item.source_url,chosen):"";
  const previousProvisionUrl=previous&&chosen?provisionHref(previous.source_url,chosen):previous?.source_url||"";
  const legalSources=item?[...chain,item].filter((w,i,arr)=>w.source_url&&arr.findIndex(x=>x.id===w.id)===i):[];

  function refresh(){setRefreshing(true);window.dispatchEvent(new Event("pageshow"));window.setTimeout(()=>setRefreshing(false),700);}

  if(!dossiers.length)return<section className="emptyPage"><h1>Ce qui change</h1><p>Créez d’abord un dossier client.</p></section>;

  return <div className="page"><style jsx>{`
    .page{min-width:0;display:grid;gap:16px;margin:-28px -30px -36px;padding:28px 30px 36px;min-height:calc(100vh - 68px);color:#f4f7fb;background:radial-gradient(circle at 55% -12%,rgba(18,69,120,.24),transparent 39%),linear-gradient(180deg,#041326 0%,#05172b 100%)}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.kicker{text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:900;color:#f3bd3e}.head h1{font-size:38px;line-height:1.04;letter-spacing:-.045em;margin:5px 0 7px;color:#f9fbff}.head p{margin:0;color:#9eb0c4;line-height:1.45;font-size:13px}.refresh{border:1px solid #f4ca58;background:linear-gradient(135deg,#ffd45b,#eeb332);color:#07162c;border-radius:11px;padding:11px 15px;font-weight:900;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow:0 10px 26px rgba(243,189,62,.13);cursor:pointer}.refreshing svg{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    .tabs{display:flex;gap:22px;border-bottom:1px solid #173653}.tabs button{border:0;background:transparent;color:#8fa4bb;padding:5px 2px 12px;font-size:13px;font-weight:850;position:relative;cursor:pointer}.tabs button:hover{color:#dbe7f3}.tabs .tabActive{color:#f3bd3e}.tabs .tabActive:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#f3bd3e;border-radius:999px}
    .contextBar{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #173653;border-radius:13px;background:rgba(7,26,49,.88);padding:10px 12px}.contextControls{display:flex;align-items:center;gap:14px;min-width:0;flex:1}.contextBar label{display:flex;align-items:center;gap:9px;min-width:0}.contextBar label>span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#f3bd3e}.contextBar select{min-width:240px;max-width:520px;border:1px solid #25435f;background:#071b32;color:#e6edf6;border-radius:9px;padding:9px 10px;font-size:12px;outline:none}.contextBar select:focus{border-color:#f3bd3e}.contextMeta{display:flex;align-items:center;gap:14px;color:#91a5bb;font-size:10px}.contextMeta span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.contextMeta svg{color:#f3bd3e}
    .timelineWrap{display:grid;gap:7px}.sectionLabel{font-size:8px;color:#71869e;text-transform:uppercase;letter-spacing:.09em;font-weight:900}.timeline{display:flex;gap:7px;overflow-x:auto;padding-bottom:3px}.timeCard{min-width:155px;text-align:left;border:1px solid #173653;background:#071c33;color:#cad5e2;border-radius:9px;padding:9px 10px;cursor:pointer}.timeCard:hover{border-color:#294a68;background:#09223d}.timeCard.active{border-color:#8a6a20;background:#102844}.timeCard small{display:block;color:#7890a7;font-size:8px;margin-bottom:4px}.timeCard strong{display:block;color:#eaf1f8;font-size:10px;line-height:1.25}.timeCard em{display:block;margin-top:5px;font-size:8px;font-style:normal;font-weight:900;text-transform:uppercase}
    .workspace{border:1px solid #173653;border-radius:15px;background:linear-gradient(180deg,rgba(8,30,54,.98),rgba(5,24,45,.98));box-shadow:0 16px 36px rgba(0,0,0,.16);padding:14px;display:grid;gap:13px;min-width:0}.changeHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:3px 3px 11px;border-bottom:1px solid #173653}.meta{font-size:9px;color:#8196ac}.shortTitle{margin:4px 0 0;font-size:16px;line-height:1.3;color:#fff}.badge{border:1px solid currentColor;border-radius:999px;padding:5px 8px;font-size:8px;text-transform:uppercase;font-weight:900}
    .dispositions{display:flex;gap:7px;flex-wrap:wrap}.dispositionLink{display:inline-flex;align-items:center;gap:6px;border:1px solid #183853;background:#071c33;color:#aebed1;border-radius:8px;padding:7px 9px;font-size:9px;font-weight:850;text-decoration:none}.dispositionLink.active{border-color:#8a6a20;background:#102844;color:#f3bd3e}.dispositionLink:hover{border-color:#294a68;color:#dbe7f3}
    .scheme{display:grid;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr) 32px minmax(0,1fr);gap:8px}.node{border-radius:12px;padding:16px;display:grid;align-content:start;gap:8px;border:1px solid #183853;min-height:170px;position:relative;overflow:hidden;background:#071c33}.node:before{content:"";position:absolute;left:0;right:0;top:0;height:2px}.nodeLabel{font-size:8px;letter-spacing:.09em;text-transform:uppercase;font-weight:950}.node h3{font-size:15px;margin:0;color:#fff}.node p{font-size:10.5px;line-height:1.58;margin:0;color:#b1c0cf}.before:before{background:#d6574f}.before .nodeLabel{color:#ef8c88}.now:before{background:#39a86b}.now .nodeLabel{color:#7fe0b4}.case:before{background:#f3bd3e}.case .nodeLabel{color:#f3bd3e}.arrow{display:grid;place-items:center;color:#617b96}
    .focusBox{background:#071c33;border:1px solid #183853;border-radius:10px;padding:11px 12px;display:grid;grid-template-columns:auto 1fr auto auto;gap:11px;align-items:center}.focusIcon{width:32px;height:32px;border-radius:8px;background:#0c2948;color:#f3bd3e;display:grid;place-items:center;font-weight:950}.focusBox span{display:block;color:#71869e;font-size:8px;text-transform:uppercase;font-weight:900}.focusBox strong{display:block;font-size:11px;margin-top:3px;color:#eaf1f8}.focusBtn,.sourceBtn{border:0;background:transparent;color:#d6e6f6;font-size:9px;font-weight:850;display:flex;align-items:center;gap:5px;cursor:pointer;text-decoration:none}.sourceBtn{border:1px solid #29475f;padding:6px 8px;border-radius:7px}.detail{background:#071c33;border:1px solid #183853;border-radius:10px;padding:13px}.detail h4{font-size:11px;margin:0 0 7px;color:#fff}.detail p{font-size:10px;line-height:1.55;color:#b1c0cf;margin:0}.detailFoot{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}.detailFoot a{display:inline-flex;align-items:center;gap:5px;color:#d6e6f6;font-size:9px;text-decoration:none}.objective{margin-top:10px;padding-top:10px;border-top:1px solid #173653;color:#91a5bb;font-size:9px}
    .chainPanel,.sourcesPanel{display:grid;gap:10px;background:#071c33;border:1px solid #183853;border-radius:12px;padding:14px}.chainTop span,.sourcesHead span{display:block;color:#f3bd3e;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.chainTop p,.sourcesHead p{margin:4px 0 0;color:#8196ac;font-size:10px}.chainStatus.ok span{color:#7fe0b4}.chainStatus.warn span{color:#f3bd3e}.chainStatus.neutral span{color:#9eb0c4}.chainFlow{display:flex;align-items:stretch;gap:7px;overflow-x:auto;padding-top:2px}.chainNode{min-width:180px;max-width:240px;background:#081f39;border:1px solid #183853;border-radius:9px;padding:10px;display:grid;align-content:start;gap:5px}.chainNode.current{border-color:#8a6a20;background:#102844}.chainNode small{color:#7890a7;font-size:8px}.chainNode strong{font-size:9.5px;line-height:1.35;color:#e3edf6}.chainNode a{display:inline-flex;align-items:center;gap:4px;color:#d6e6f6;font-size:8px;text-decoration:none;margin-top:3px}.chainArrow{display:grid;place-items:center;color:#617b96;min-width:20px}
    .sourceRow{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:12px;align-items:center;background:#081f39;border:1px solid #183853;border-radius:9px;padding:10px 11px}.sourceRow small{color:#7890a7;font-size:8px}.sourceRow strong{font-size:9.5px;line-height:1.35;color:#e3edf6}.sourceRow a{display:inline-flex;align-items:center;gap:5px;color:#d6e6f6;font-size:9px;text-decoration:none}.sourceCurrent{border-color:#8a6a20;background:#102844}.empty{padding:34px;text-align:center;color:#71869e;background:#071c33;border:1px solid #183853;border-radius:12px}.emptyPage{padding:30px;background:#041326;color:#fff}
    @media(max-width:1050px){.scheme{grid-template-columns:1fr}.arrow{height:18px;transform:rotate(90deg)}.contextBar{align-items:flex-start}.contextControls{flex-wrap:wrap}.contextMeta{padding-top:7px}}
    @media(max-width:700px){.page{margin:-20px -18px -28px;padding:20px 18px 28px}.head{flex-direction:column}.refresh{width:100%;justify-content:center}.tabs{gap:16px;overflow-x:auto}.tabs button{white-space:nowrap}.contextBar{display:grid}.contextControls{display:grid}.contextBar label{display:grid;gap:5px}.contextBar select{min-width:0;width:100%}.contextMeta{flex-wrap:wrap}.changeHead{display:grid}.focusBox{grid-template-columns:auto 1fr}.focusBtn,.sourceBtn{grid-column:1/-1;justify-content:flex-start}.sourceRow{grid-template-columns:1fr}}
  `}</style>

  <header className="head"><div><div className="kicker">Analyse réglementaire</div><h1>Ce qui change</h1><p>{dossier?`Dossier actif : ${dossier.title}`:"Sélectionnez un dossier pour analyser ses évolutions normatives."}</p></div><button className={`refresh ${refreshing?"refreshing":""}`} onClick={refresh}><RefreshCw size={17}/>{refreshing?"Mise à jour…":"Actualiser"}</button></header>

  <div className="tabs" role="tablist" aria-label="Vues du module Ce qui change">
    <button type="button" className={view==="evolution"?"tabActive":""} onClick={()=>setView("evolution")}>Évolution normative</button>
    <button type="button" className={view==="filiation"?"tabActive":""} onClick={()=>setView("filiation")}>Filiation normative</button>
    <button type="button" className={view==="fondements"?"tabActive":""} onClick={()=>setView("fondements")}>Fondements juridiques</button>
  </div>

  <section className="contextBar"><div className="contextControls"><label><span>Dossier</span><select value={selectedDossierId} onChange={e=>{setSelectedDossierId(e.target.value);setFilter("all");setSelectedChangeId("");}}>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></label><label><span>Qualification</span><select value={filter} onChange={e=>{setFilter(e.target.value as Filter);setSelectedChangeId("");}}>{FILTERS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div><div className="contextMeta"><span><FileText size={14}/>{filtered.length} évolution{filtered.length>1?"s":""}</span><span><ShieldCheck size={14}/>{item?.normative_chain_status==="complete"?"Chaîne vérifiée":item?.normative_chain_status==="partial"?"À consolider":"Analyse en cours"}</span></div></section>

  {filtered.length?<><section className="timelineWrap"><div className="sectionLabel">Chronologie du dossier</div><div className="timeline">{filtered.map(w=>{const active=w.id===item?.id;const b=BADGES[w.change_type||"pending"]||BADGES.pending;return<button key={w.id} className={`timeCard ${active?"active":""}`} onClick={()=>setSelectedChangeId(w.id)}><small>{dateLabel(w.published_at||w.created_at)}</small><strong>{shortTitle(w)}</strong><em style={{color:b.color}}>{b.label}</em></button>})}</div></section>

  {item&&<section className="workspace"><div className="changeHead"><div><div className="meta">{item.source_name||item.nature} · {dateLabel(item.published_at||item.created_at)}</div><h2 className="shortTitle" title={item.title}>{item.title}</h2></div><span className="badge" style={{color:badge.color}}>{badge.label}</span></div>

  {view==="filiation"&&chainState&&<div className="chainPanel"><div className={`chainTop chainStatus ${chainState.tone}`}><span>{chainState.label}</span><p>{chainState.detail}</p></div><div className="chainFlow">{chain.map((w,i)=><div key={w.id} style={{display:"contents"}}><article className="chainNode"><small>{dateLabel(w.published_at||w.created_at)} · {normKind(w)}</small><strong title={w.title}>{cut(w.title,115)}</strong>{w.source_url&&<a href={w.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={9}/></a>}</article>{i<chain.length&&<div className="chainArrow"><ArrowRight size={15}/></div>}</div>)}<article className="chainNode current"><small>{dateLabel(item.published_at||item.created_at)} · Nouveau texte</small><strong title={item.title}>{cut(item.title,115)}</strong>{item.source_url&&<a href={item.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={9}/></a>}</article></div></div>}

  {view==="fondements"&&<div className="sourcesPanel"><div className="sourcesHead"><span>Fondements juridiques identifiés</span><p>Textes utilisés pour reconstituer l’état du droit et qualifier l’évolution normative.</p></div>{legalSources.length?legalSources.map(w=><article key={w.id} className={`sourceRow ${w.id===item.id?"sourceCurrent":""}`}><small>{dateLabel(w.published_at||w.created_at)}<br/>{normKind(w)}</small><strong>{w.title}</strong><a href={w.source_url} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={10}/></a></article>):<div className="empty">Aucun fondement juridique sourcé n’est encore disponible pour ce changement.</div>}</div>}

  {view==="evolution"&&<>{ds.length>0&&<div className="dispositions">{ds.map((d,i)=><a key={`${item.id}-${i}`} className={`dispositionLink ${i===selectedDisposition?"active":""}`} href={provisionHref(item.source_url,d)} target="_blank" rel="noreferrer" onClick={()=>{setSelectedDisposition(i);setDetailOpen(false)}}><span>{d.label}</span><ExternalLink size={10}/></a>)}</div>}

  <div className="scheme"><article className="node before"><div className="nodeLabel">État antérieur</div><h3>{previous?shortTitle(previous):"Règle antérieure"}</h3><p>{cut(previousRule,220)}</p></article><div className="arrow"><ArrowRight size={22}/></div><article className="node now"><div className="nodeLabel">État nouveau</div><h3>{chosen?.label||badge.label}</h3><p>{cut(chosen?.detail||currentRule,220)}</p></article><div className="arrow"><ArrowRight size={22}/></div><article className="node case"><div className="nodeLabel">Incidence dossier</div><h3>Impact concret</h3><p>{cut(impact,220)}</p></article></div>

  <div className="focusBox"><div className="focusIcon">Δ</div><div><span>Disposition analysée</span><strong>{chosen?.label||"Changement principal"}</strong></div><button className="focusBtn" onClick={()=>setDetailOpen(v=>!v)}>{detailOpen?<>Masquer le détail <ChevronUp size={13}/></>:<>Voir le détail <ChevronDown size={13}/></>}</button>{currentProvisionUrl&&<a className="sourceBtn" href={currentProvisionUrl} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={11}/></a>}</div>

  {detailOpen&&<div className="detail"><h4>{chosen?.label||"Détail du changement"}</h4><p>{chosen?.detail||currentRule}</p>{objective&&<div className="objective"><strong>Point du dossier concerné :</strong> {objective}</div>}<div className="detailFoot">{previousProvisionUrl&&<a href={previousProvisionUrl} target="_blank" rel="noreferrer">Disposition précédente <ExternalLink size={11}/></a>}{currentProvisionUrl&&<a href={currentProvisionUrl} target="_blank" rel="noreferrer">Disposition actuelle <ExternalLink size={11}/></a>}</div></div>}</>}</section>}</>:<div className="empty">Aucune évolution ne correspond à ce dossier et à ce filtre.</div>}</div>;
}
