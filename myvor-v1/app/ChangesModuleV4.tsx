"use client";

import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,ChevronDown,ChevronUp,ExternalLink,FileText,RefreshCw,Scale,ShieldCheck,Target} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Dossier={
  id:string;client:string;title:string;objective?:string|null;context?:string|null;
  key_deadlines?:string[]|null;reference_texts?:string[]|null;
};
type LinkJustification={objective_link?:string|null;evidence?:string[]|null;consequence?:string|null};
type ChainStatus="complete"|"partial"|"no_explicit_reference"|"unresolved";
type HistoricalStatus="resolved"|"partial"|"no_history"|"unresolved";
type ChangeView="evolution"|"filiation"|"fondements";
type Watch={
  id:string;title:string;nature:string;source_url:string;dossier_id:string|null;created_at:string;
  source_name?:string|null;published_at?:string|null;urgency?:string|null;change_type?:string|null;change_summary?:string|null;
  change_baseline_ids?:string[]|null;link_justification?:LinkJustification|null;
  normative_chain_ids?:string[]|null;normative_chain_status?:ChainStatus|null;normative_unresolved_references?:number|null;
  historical_path_ids?:string[]|null;historical_predecessor_id?:string|null;historical_status?:HistoricalStatus|null;historical_computed_at?:string|null;historical_engine?:string|null;
};
type CorpusResult={id:string;title?:string;score:number;status?:string;reason?:string;change_type?:string|null;change_summary?:string|null};
type CorpusMeta={scanned:number;processed:number;reused:number;relevant:number;linked:number;suggested:number;message:string};
type Filter="all"|"nouveau"|"modification"|"precision"|"application"|"abrogation"|"aucun_changement"|"socle_initial";
type Disposition={label:string;detail:string};

const CORPUS_THRESHOLD=.50;
const FILTERS:[Filter,string][]=[
  ["all","Tous les actes"],["nouveau","Nouveaux"],["modification","Modifications"],["precision","Précisions"],
  ["application","Applications"],["abrogation","Abrogations"],["socle_initial","Socle initial"],["aucun_changement","Sans changement"],
];
const BADGES:Record<string,{label:string;color:string}>={
  nouveau:{label:"Nouveau",color:"#7fe0b4"},modification:{label:"Modifie",color:"#ffd466"},precision:{label:"Précise",color:"#8bc5ff"},
  application:{label:"Met en application",color:"#cfb2ff"},abrogation:{label:"Abroge",color:"#ff9da3"},aucun_changement:{label:"Sans changement",color:"#b8c6d9"},
  socle_initial:{label:"Fonde",color:"#b9cdea"},pending:{label:"À qualifier",color:"#c2cee0"},
};
const MONTHS:Record<string,string>={janvier:"janvier",fevrier:"février","février":"février",mars:"mars",avril:"avril",mai:"mai",juin:"juin",juillet:"juillet",aout:"août","août":"août",septembre:"septembre",octobre:"octobre",novembre:"novembre",decembre:"décembre","décembre":"décembre"};

function clean(v?:string|null){return String(v||"").replace(/\s+/g," ").trim();}
function cut(v?:string|null,n=160){const s=clean(v);return s.length>n?`${s.slice(0,n).trim()}…`:s;}
function dateLabel(raw?:string|null){if(!raw)return"";const d=new Date(raw);return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"";}
function timeOf(w:Watch){const t=Date.parse(w.published_at||w.created_at||"");return Number.isFinite(t)?t:0;}
function uniqueWatchIds(ids?:string[]|null){return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean))];}
function normKind(w:Watch){
  const s=`${w.nature} ${w.title}`.toLowerCase();
  const pairs:[RegExp,string][]=[[/projet de loi/,"Projet de loi"],[/proposition de loi/,"Proposition de loi"],[/\bloi\b/,"Loi"],[/décret|decret/,"Décret"],[/arrêté|arrete/,"Arrêté"],[/ordonnance/,"Ordonnance"],[/règlement|reglement/,"Règlement"],[/directive/,"Directive"],[/décision|decision/,"Décision"],[/amendement/,"Amendement"],[/résolution|resolution/,"Résolution"]];
  for(const [r,n] of pairs)if(r.test(s))return n;return clean(w.nature)||"Acte";
}
function isLegalAct(w:Watch){
  const s=`${w.nature} ${w.title}`.toLowerCase();
  return /(projet de loi|proposition de loi|\bloi\b|décret|decret|arrêté|arrete|ordonnance|règlement|reglement|directive|décision|decision|amendement|résolution|resolution|jurisprudence)/i.test(s);
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
function sourceTarget(d:Disposition){const article=d.detail.match(/\b(?:article|art\.)\s+([A-Z0-9LRC°\.\-]+)/i);if(article)return`Article ${article[1]}`;return(clean(d.detail).split(/[.;:]/)[0]?.trim()||d.label).slice(0,90);}
function provisionHref(sourceUrl:string,disposition?:Disposition|null){
  const raw=clean(sourceUrl);if(!raw||!disposition)return raw;
  try{const u=new URL(raw);if(!/^https?:$/.test(u.protocol))return raw;const target=sourceTarget(disposition);if(!target)return raw;const oldHash=u.hash.replace(/^#/,"").split(":~:")[0];const base=`${u.origin}${u.pathname}${u.search}`;return`${base}#${oldHash?`${oldHash}:`:""}~:text=${encodeURIComponent(target)}`;}catch{return raw;}
}
function chainMessage(item:Watch,chain:Watch[]){
  const unresolved=Math.max(0,Number(item.normative_unresolved_references||0));
  if(item.normative_chain_status==="complete")return{label:"Chaîne vérifiée",tone:"ok",detail:`${chain.length} acte(s) antérieur(s) relié(s par une référence normative explicite.`};
  if(item.normative_chain_status==="partial")return{label:"Chaîne partielle",tone:"warn",detail:`${chain.length} acte(s) retrouvés · ${unresolved} référence(s) restent à résoudre.`};
  if(item.normative_chain_status==="unresolved")return{label:"Références à résoudre",tone:"warn",detail:`${unresolved||1} référence(s) explicite(s) restent non résolues.`};
  if(item.normative_chain_status==="no_explicit_reference")return{label:"Pas de filiation explicite",tone:"neutral",detail:"L’acte est pertinent pour le dossier mais aucune filiation normative explicite n’a été détectée."};
  return{label:"Filiation en cours",tone:"neutral",detail:"Myvor vérifie les actes qui fondent, modifient, remplacent ou appliquent cette norme."};
}
function historicalMessage(item:Watch,path:Watch[]){
  if(item.historical_status==="resolved")return{label:"Prédécesseur établi",tone:"ok",detail:`${path.length} état(s) antérieur(s) démontré(s).`};
  if(item.historical_status==="partial")return{label:"Historique partiel",tone:"warn",detail:`${path.length} état(s) démontré(s), mais la succession reste à consolider.`};
  if(item.historical_status==="unresolved")return{label:"Prédécesseur à résoudre",tone:"warn",detail:"L’acte annonce une mutation d’une norme antérieure, mais le texte précédent n’est pas encore résolu avec certitude."};
  if(item.historical_status==="no_history")return{label:"Pas d’état antérieur démontré",tone:"neutral",detail:"Cet acte n’est pas artificiellement présenté comme une modification."};
  return{label:"Historique en cours",tone:"neutral",detail:"Myvor vérifie les états successifs de la norme."};
}
function relatedIds(w:Watch){return uniqueWatchIds([...(w.normative_chain_ids||[]),...(w.historical_path_ids||[]),...(w.change_baseline_ids||[]),...(w.historical_predecessor_id?[w.historical_predecessor_id]:[])]);}
function roleBadge(w:Watch){return BADGES[w.change_type||"pending"]||BADGES.pending;}
function urgencyLabel(v?:string|null){const s=clean(v).toLowerCase();if(s==="absolument urgent")return"Critique";if(s==="fort")return"Prioritaire";if(s==="moyen")return"À suivre";return"Suivi";}

export default function ChangesModuleV4({dossiers,watch,onOpenImpact}:{dossiers:Dossier[];watch:Watch[];onOpenImpact?:(dossierId:string,watchIds:string[])=>void}){
  const[selectedDossierId,setSelectedDossierId]=useState(dossiers[0]?.id||"");
  const[filter,setFilter]=useState<Filter>("all");
  const[view,setView]=useState<ChangeView>("evolution");
  const[selectedChangeId,setSelectedChangeId]=useState("");
  const[selectedDisposition,setSelectedDisposition]=useState(0);
  const[detailOpen,setDetailOpen]=useState(false);
  const[refreshing,setRefreshing]=useState(false);
  const[corpusLoading,setCorpusLoading]=useState(false);
  const[corpusError,setCorpusError]=useState("");
  const[corpusResults,setCorpusResults]=useState<CorpusResult[]>([]);
  const[corpusMeta,setCorpusMeta]=useState<CorpusMeta|null>(null);

  useEffect(()=>{if(!selectedDossierId||!dossiers.some(d=>d.id===selectedDossierId))setSelectedDossierId(dossiers[0]?.id||"");},[dossiers,selectedDossierId]);
  const dossier=dossiers.find(d=>d.id===selectedDossierId)||dossiers[0]||null;

  async function scanCorpus(){
    if(!supabase||!selectedDossierId)return;
    setCorpusLoading(true);setCorpusError("");
    try{
      const{data,error}=await supabase.functions.invoke("scan-dossier-history",{body:{dossier_id:selectedDossierId}});
      if(error)throw error;
      const results=Array.isArray(data?.results)?data.results:[];
      setCorpusResults(results.map((r:any)=>({id:String(r.id||""),title:String(r.title||""),score:Number(r.score)||0,status:String(r.status||""),reason:String(r.reason||""),change_type:r.change_type||null,change_summary:r.change_summary||null})).filter((r:CorpusResult)=>r.id));
      setCorpusMeta({scanned:Number(data?.scanned)||0,processed:Number(data?.processed)||0,reused:Number(data?.reused)||0,relevant:Number(data?.relevant)||0,linked:Number(data?.linked)||0,suggested:Number(data?.suggested)||0,message:String(data?.message||"")});
    }catch(error:any){setCorpusError(error?.message||"Le corpus juridique n’a pas pu être actualisé.");}
    finally{setCorpusLoading(false);}
  }

  useEffect(()=>{setCorpusResults([]);setCorpusMeta(null);setCorpusError("");if(selectedDossierId){const timer=window.setTimeout(()=>{void scanCorpus();},180);return()=>window.clearTimeout(timer);}},[selectedDossierId]);

  const corpusScore=useMemo(()=>new Map(corpusResults.map(r=>[r.id,r.score])),[corpusResults]);
  const corpusReason=useMemo(()=>new Map(corpusResults.map(r=>[r.id,r.reason||""])),[corpusResults]);
  const directIds=useMemo(()=>watch.filter(w=>w.dossier_id===selectedDossierId).map(w=>w.id),[watch,selectedDossierId]);
  const seedIds=useMemo(()=>new Set([...directIds,...corpusResults.filter(r=>r.score>=CORPUS_THRESHOLD).map(r=>r.id)]),[directIds,corpusResults]);
  const legalCorpus=useMemo(()=>{
    const ids=new Set(seedIds);let changed=true,depth=0;
    while(changed&&depth<8){changed=false;depth++;for(const id of [...ids]){const w=watch.find(x=>x.id===id);if(!w)continue;for(const related of relatedIds(w)){if(!ids.has(related)){ids.add(related);changed=true;}}}}
    return watch.filter(w=>ids.has(w.id)&&isLegalAct(w)).sort((a,b)=>timeOf(b)-timeOf(a));
  },[watch,seedIds]);
  const filtered=useMemo(()=>filter==="all"?legalCorpus:legalCorpus.filter(w=>(w.change_type||"pending")===filter),[legalCorpus,filter]);
  useEffect(()=>{if(!filtered.length){setSelectedChangeId("");return;}if(!filtered.some(w=>w.id===selectedChangeId))setSelectedChangeId(filtered[0].id);},[filtered,selectedChangeId]);
  useEffect(()=>{setSelectedDisposition(0);setDetailOpen(false);},[selectedChangeId]);

  const item=filtered.find(w=>w.id===selectedChangeId)||filtered[0]||null;
  const baseline=item?uniqueWatchIds(item.change_baseline_ids).map(id=>watch.find(w=>w.id===id)).filter(Boolean) as Watch[]:[];
  const chain=item?uniqueWatchIds(item.normative_chain_ids?.length?item.normative_chain_ids:item.change_baseline_ids).map(id=>watch.find(w=>w.id===id)).filter(Boolean).sort((a,b)=>timeOf(a as Watch)-timeOf(b as Watch)) as Watch[]:[];
  const historicalPath=item?uniqueWatchIds(item.historical_path_ids).map(id=>watch.find(w=>w.id===id)).filter(Boolean).sort((a,b)=>timeOf(a as Watch)-timeOf(b as Watch)) as Watch[]:[];
  const historicalPrevious=item?.historical_predecessor_id?watch.find(w=>w.id===item.historical_predecessor_id)||null:null;
  const previous=historicalPrevious||(historicalPath.length?historicalPath[historicalPath.length-1]:(chain.length?chain[chain.length-1]:(baseline[0]||null)));
  const chainState=item?chainMessage(item,chain):null;
  const historicalState=item?historicalMessage(item,historicalPath):null;
  const ds=item?dispositions(item):[];
  const chosen=ds[Math.min(selectedDisposition,Math.max(0,ds.length-1))]||null;
  const badge=item?roleBadge(item):BADGES.pending;
  const previousRule=previous?(clean(previous.change_summary)||"Dernier état antérieur identifié comme prédécesseur direct de la norme actuelle."):item?.historical_status==="unresolved"?"Le texte précédent n’est pas encore résolu avec un niveau de certitude suffisant.":"Aucun état antérieur démontré.";
  const currentRule=item?(clean(item.change_summary)||"La portée juridique de cet acte est en cours de qualification."):"";
  const impact=item?(clean(item.link_justification?.consequence)||"L’incidence opérationnelle sur ce dossier n’a pas encore été qualifiée."):"";
  const objective=item?clean(item.link_justification?.objective_link):"";
  const currentProvisionUrl=item?provisionHref(item.source_url,chosen):"";
  const previousProvisionUrl=previous&&chosen?provisionHref(previous.source_url,chosen):previous?.source_url||"";
  const legalSources=legalCorpus.filter((w,i,arr)=>w.source_url&&arr.findIndex(x=>x.id===w.id)===i).sort((a,b)=>timeOf(b)-timeOf(a));

  const currentState=legalCorpus.find(w=>w.change_type!=="aucun_changement")||legalCorpus[0]||null;
  const foundingState=[...legalCorpus].reverse().find(w=>w.change_type==="socle_initial")||[...legalCorpus].reverse()[0]||null;
  const latestMovement=legalCorpus[0]||null;
  const unresolvedCount=legalCorpus.reduce((sum,w)=>sum+Math.max(0,Number(w.normative_unresolved_references||0)),0);
  const partialCount=legalCorpus.filter(w=>w.normative_chain_status==="partial"||w.normative_chain_status==="unresolved"||w.historical_status==="partial"||w.historical_status==="unresolved").length;
  const coverage=corpusLoading?{label:"Actualisation",tone:"loading",detail:"Le corpus est en cours de reconstruction."}:corpusError?{label:"À vérifier",tone:"warn",detail:"Le dernier corpus disponible reste affiché."}:!legalCorpus.length?{label:"À construire",tone:"neutral",detail:"Aucun acte juridique applicable n’est encore identifié."}:unresolvedCount||partialCount?{label:"À consolider",tone:"warn",detail:`${partialCount} chaîne(s) partielles · ${unresolvedCount} référence(s) non résolue(s).`}:{label:"Consolidé",tone:"ok",detail:"Aucune rupture de chaîne détectée dans le corpus affiché."};
  const nextDeadline=Array.isArray(dossier?.key_deadlines)&&dossier!.key_deadlines!.length?dossier!.key_deadlines![0]:"Aucune échéance fiable renseignée";
  const actionItem=legalCorpus.find(w=>clean(w.link_justification?.consequence)&&w.change_type!=="aucun_changement")||currentState;

  async function refresh(){setRefreshing(true);await scanCorpus();window.dispatchEvent(new Event("pageshow"));window.setTimeout(()=>setRefreshing(false),450);}

  if(!dossiers.length)return<section className="emptyPage"><h1>Ce qui change</h1><p>Créez d’abord un dossier client.</p></section>;

  return <div className="page"><style jsx>{`
    .page{min-width:0;display:grid;gap:16px;margin:-28px -30px -36px;padding:28px 30px 36px;min-height:calc(100vh - 68px);color:#f4f7fb;background:radial-gradient(circle at 55% -12%,rgba(18,69,120,.24),transparent 39%),linear-gradient(180deg,#041326 0%,#05172b 100%)}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.kicker{text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:900;color:#f3bd3e}.head h1{font-size:38px;line-height:1.04;letter-spacing:-.045em;margin:5px 0 7px;color:#f9fbff}.head p{margin:0;color:#9eb0c4;line-height:1.45;font-size:13px;max-width:760px}.refresh{border:1px solid #f4ca58;background:linear-gradient(135deg,#ffd45b,#eeb332);color:#07162c;border-radius:11px;padding:11px 15px;font-weight:900;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;box-shadow:0 10px 26px rgba(243,189,62,.13);cursor:pointer}.refreshing svg{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    .tabs{display:flex;gap:22px;border-bottom:1px solid #173653}.tabs button{border:0;background:transparent;color:#8fa4bb;padding:5px 2px 12px;font-size:13px;font-weight:850;position:relative;cursor:pointer}.tabs button:hover{color:#dbe7f3}.tabs .tabActive{color:#f3bd3e}.tabs .tabActive:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#f3bd3e;border-radius:999px}
    .contextBar{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #173653;padding:3px 0 13px}.contextControls{display:flex;align-items:center;gap:18px;min-width:0;flex:1}.contextBar label{display:flex;align-items:center;gap:9px;min-width:0}.contextBar label>span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#7890a7}.contextBar select{min-width:250px;max-width:520px;border:0;border-bottom:1px solid #29475f;background:transparent;color:#e6edf6;padding:8px 3px;font-size:12px;outline:none}.contextBar select:focus{border-color:#f3bd3e}.contextMeta{display:flex;align-items:center;gap:15px;color:#91a5bb;font-size:10px}.contextMeta span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.contextMeta svg{color:#f3bd3e}.scanError{font-size:9px;color:#ef9d98}
    .overview{display:grid;grid-template-columns:minmax(0,1.65fr) repeat(3,minmax(150px,.7fr));border:1px solid #173653;border-radius:14px;overflow:hidden;background:#071c33}.overviewMain,.metric{padding:15px 17px}.metric{border-left:1px solid #173653}.eyebrow{display:flex;align-items:center;gap:7px;color:#f3bd3e;text-transform:uppercase;letter-spacing:.08em;font-size:8px;font-weight:950}.overview h2{font-size:17px;line-height:1.3;margin:8px 0 6px;color:#fff}.overview p{font-size:10px;line-height:1.52;color:#aebed0;margin:0}.overviewMain a{display:inline-flex;align-items:center;gap:5px;color:#dbe8f4;font-size:9px;text-decoration:none;margin-top:10px}.metric small{display:block;color:#71869e;font-size:8px;text-transform:uppercase;letter-spacing:.07em;font-weight:900}.metric strong{display:block;color:#fff;font-size:17px;line-height:1.15;margin:8px 0 4px}.metric p{font-size:9px;line-height:1.4}.tone-ok{color:#7fe0b4!important}.tone-warn{color:#ffd466!important}.tone-loading{color:#8bc5ff!important}
    .actionStrip{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 14px;border:1px solid #29445f;border-left:3px solid #f3bd3e;background:#081f39;border-radius:10px}.actionIcon{width:33px;height:33px;border-radius:9px;background:#102844;display:grid;place-items:center;color:#f3bd3e}.actionStrip small{display:block;color:#7890a7;font-size:8px;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.actionStrip strong{display:block;color:#f7fbff;font-size:11px;margin:3px 0}.actionStrip p{margin:0;color:#9fb1c3;font-size:9.5px;line-height:1.45}.actionBtns{display:flex;gap:7px}.textBtn,.impactBtn{border:1px solid #29475f;background:transparent;color:#dbe8f4;border-radius:8px;padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer}.impactBtn{border-color:#8a6a20;color:#f3bd3e}
    .sectionHead{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.sectionHead h3{margin:0;color:#fff;font-size:14px}.sectionHead p{margin:3px 0 0;color:#7890a7;font-size:9px}.sectionHead span{color:#7890a7;font-size:9px}.actTable{border-top:1px solid #29445f}.actRow{display:grid;grid-template-columns:105px minmax(210px,1.25fr) 118px minmax(220px,1.15fr) minmax(190px,1fr) 28px;gap:13px;align-items:center;border-bottom:1px solid #173653;padding:11px 7px;cursor:pointer;transition:.14s}.actRow:hover{background:#081f39}.actRow.active{background:#0b2542;box-shadow:inset 2px 0 #f3bd3e}.actDate small{display:block;color:#71869e;font-size:8px}.actDate strong{display:block;color:#cbd8e5;font-size:9px;margin-top:3px}.actTitle strong{display:block;color:#f4f8fc;font-size:10px;line-height:1.38}.actTitle small{display:block;color:#71869e;font-size:8px;margin-top:4px}.role{display:inline-flex;width:max-content;max-width:115px;border:1px solid currentColor;border-radius:999px;padding:4px 7px;font-size:7.5px;font-weight:950;text-transform:uppercase}.actText{font-size:9px;line-height:1.45;color:#aebed0}.actImpact{font-size:9px;line-height:1.45;color:#d0dbe6}.actSource{color:#8196ac}.empty{padding:32px;text-align:center;color:#71869e;border:1px dashed #29445f;border-radius:10px}
    .workspace{border-top:1px solid #29445f;padding-top:15px;display:grid;gap:13px}.changeHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.meta{font-size:9px;color:#8196ac}.shortTitle{margin:4px 0 0;font-size:16px;line-height:1.3;color:#fff}.badge{border:1px solid currentColor;border-radius:999px;padding:5px 8px;font-size:8px;text-transform:uppercase;font-weight:900}.historyStatusLine{display:flex;align-items:center;gap:7px;font-size:9px;color:#91a5bb}.historyStatusLine.ok{color:#7fe0b4}.historyStatusLine.warn{color:#ffd466}
    .dispositions{display:flex;gap:7px;flex-wrap:wrap}.dispositionLink{display:inline-flex;align-items:center;gap:6px;border:1px solid #183853;background:#071c33;color:#aebed1;border-radius:8px;padding:7px 9px;font-size:9px;font-weight:850;text-decoration:none}.dispositionLink.active{border-color:#8a6a20;background:#102844;color:#f3bd3e}
    .scheme{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr);gap:8px}.node{border-radius:11px;padding:15px;display:grid;align-content:start;gap:8px;border:1px solid #183853;min-height:150px;position:relative;overflow:hidden;background:#071c33}.node:before{content:"";position:absolute;left:0;right:0;top:0;height:2px}.nodeLabel{font-size:8px;letter-spacing:.09em;text-transform:uppercase;font-weight:950}.node h3{font-size:14px;margin:0;color:#fff}.node p{font-size:10px;line-height:1.55;margin:0;color:#b1c0cf}.before:before{background:#d6574f}.before .nodeLabel{color:#ef8c88}.now:before{background:#39a86b}.now .nodeLabel{color:#7fe0b4}.case:before{background:#f3bd3e}.case .nodeLabel{color:#f3bd3e}.arrow{display:grid;place-items:center;color:#617b96}
    .focusBox{background:#071c33;border:1px solid #183853;border-radius:10px;padding:11px 12px;display:grid;grid-template-columns:auto 1fr auto auto;gap:11px;align-items:center}.focusIcon{width:32px;height:32px;border-radius:8px;background:#0c2948;color:#f3bd3e;display:grid;place-items:center;font-weight:950}.focusBox span{display:block;color:#71869e;font-size:8px;text-transform:uppercase;font-weight:900}.focusBox strong{display:block;font-size:11px;margin-top:3px;color:#eaf1f8}.focusBtn,.sourceBtn{border:0;background:transparent;color:#d6e6f6;font-size:9px;font-weight:850;display:flex;align-items:center;gap:5px;cursor:pointer;text-decoration:none}.sourceBtn{border:1px solid #29475f;padding:6px 8px;border-radius:7px}.detail{background:#071c33;border:1px solid #183853;border-radius:10px;padding:13px}.detail h4{font-size:11px;margin:0 0 7px;color:#fff}.detail p{font-size:10px;line-height:1.55;color:#b1c0cf;margin:0}.detailFoot{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}.detailFoot a{display:inline-flex;align-items:center;gap:5px;color:#d6e6f6;font-size:9px;text-decoration:none}.objective{margin-top:10px;padding-top:10px;border-top:1px solid #173653;color:#91a5bb;font-size:9px}
    .chainPanel,.sourcesPanel{display:grid;gap:11px}.panelIntro{padding-bottom:11px;border-bottom:1px solid #29445f}.panelIntro span{display:block;color:#f3bd3e;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.panelIntro p{margin:4px 0 0;color:#8196ac;font-size:10px}.chainStatus.ok span{color:#7fe0b4}.chainStatus.warn span{color:#f3bd3e}.chainStatus.neutral span{color:#9eb0c4}.chainFlow{display:flex;align-items:stretch;gap:7px;overflow-x:auto;padding:4px 0 8px}.chainNode{min-width:190px;max-width:245px;background:#071c33;border:1px solid #183853;border-radius:9px;padding:10px;display:grid;align-content:start;gap:5px}.chainNode.current{border-color:#8a6a20;background:#102844}.chainNode small{color:#7890a7;font-size:8px}.chainNode strong{font-size:9.5px;line-height:1.35;color:#e3edf6}.chainNode a{display:inline-flex;align-items:center;gap:4px;color:#d6e6f6;font-size:8px;text-decoration:none;margin-top:3px}.chainArrow{display:grid;place-items:center;color:#617b96;min-width:20px}.sourceRow{display:grid;grid-template-columns:115px minmax(0,1fr) 120px auto;gap:12px;align-items:center;border-bottom:1px solid #173653;padding:10px 4px}.sourceRow small{color:#7890a7;font-size:8px}.sourceRow strong{font-size:9.5px;line-height:1.35;color:#e3edf6}.sourceRow em{font-style:normal;color:#91a5bb;font-size:8px}.sourceRow a{display:inline-flex;align-items:center;gap:5px;color:#d6e6f6;font-size:9px;text-decoration:none}.emptyPage{padding:30px;background:#041326;color:#fff}
    @media(max-width:1150px){.overview{grid-template-columns:1fr 1fr}.metric{border-left:0;border-top:1px solid #173653}.overviewMain{grid-column:1/-1}.actRow{grid-template-columns:92px minmax(180px,1.1fr) 105px minmax(190px,1fr) 28px}.actImpact{display:none}.scheme{grid-template-columns:1fr}.arrow{height:18px;transform:rotate(90deg)}}
    @media(max-width:760px){.page{margin:-20px -18px -28px;padding:20px 18px 28px}.head{flex-direction:column}.refresh{width:100%;justify-content:center}.tabs{gap:16px;overflow-x:auto}.tabs button{white-space:nowrap}.contextBar{display:grid}.contextControls{display:grid}.contextBar label{display:grid;gap:5px}.contextBar select{min-width:0;width:100%}.contextMeta{flex-wrap:wrap}.overview{grid-template-columns:1fr}.overviewMain{grid-column:auto}.metric{border-top:1px solid #173653}.actionStrip{grid-template-columns:auto 1fr}.actionBtns{grid-column:1/-1}.actRow{grid-template-columns:80px 1fr 24px}.actRole,.actText,.actImpact{display:none}.changeHead{display:grid}.focusBox{grid-template-columns:auto 1fr}.focusBtn,.sourceBtn{grid-column:1/-1;justify-content:flex-start}.sourceRow{grid-template-columns:1fr}.sourceRow em{display:none}}
  `}</style>

  <header className="head"><div><div className="kicker">Cockpit juridique</div><h1>Ce qui change</h1><p>État du droit, actes applicables, mutations normatives et incidence dossier — avec une chaîne de preuve vérifiable.</p></div><button className={`refresh ${refreshing||corpusLoading?"refreshing":""}`} onClick={()=>void refresh()} disabled={refreshing||corpusLoading}><RefreshCw size={17}/>{refreshing||corpusLoading?"Actualisation…":"Actualiser le corpus"}</button></header>

  <div className="tabs" role="tablist" aria-label="Vues du module Ce qui change">
    <button type="button" className={view==="evolution"?"tabActive":""} onClick={()=>setView("evolution")}>Évolution normative</button>
    <button type="button" className={view==="filiation"?"tabActive":""} onClick={()=>setView("filiation")}>Filiation normative</button>
    <button type="button" className={view==="fondements"?"tabActive":""} onClick={()=>setView("fondements")}>Fondements juridiques</button>
  </div>

  <section className="contextBar"><div className="contextControls"><label><span>Dossier</span><select value={selectedDossierId} onChange={e=>{setSelectedDossierId(e.target.value);setFilter("all");setSelectedChangeId("");}}>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></label>{view==="evolution"&&<label><span>Type d’acte</span><select value={filter} onChange={e=>{setFilter(e.target.value as Filter);setSelectedChangeId("");}}>{FILTERS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}</div><div className="contextMeta"><span><FileText size={14}/>{legalCorpus.length} acte{legalCorpus.length>1?"s":""} dans le corpus</span>{corpusMeta&&<span><ShieldCheck size={14}/>{corpusMeta.scanned} texte{corpusMeta.scanned>1?"s":""} vérifiés</span>}{corpusError&&<span className="scanError"><AlertTriangle size={13}/>{corpusError}</span>}</div></section>

  {view==="evolution"&&<>
    <section className="overview">
      <div className="overviewMain"><div className="eyebrow"><Scale size={13}/>État juridique actuel</div>{currentState?<><h2>{currentState.title}</h2><p>{cut(currentState.change_summary||currentState.link_justification?.consequence||"Dernier acte applicable identifié dans le corpus juridique du dossier.",260)}</p>{currentState.source_url&&<a href={currentState.source_url} target="_blank" rel="noreferrer">Vérifier la source officielle <ExternalLink size={10}/></a>}</>:<><h2>État du droit à reconstruire</h2><p>Myvor n’a pas encore identifié d’acte juridique suffisamment pertinent pour ce dossier.</p></>}</div>
      <div className="metric"><small>Dernier mouvement</small><strong>{latestMovement?dateLabel(latestMovement.published_at||latestMovement.created_at):"—"}</strong><p>{latestMovement?`${roleBadge(latestMovement).label} · ${shortTitle(latestMovement)}`:"Aucun mouvement qualifié"}</p></div>
      <div className="metric"><small>Couverture du corpus</small><strong className={`tone-${coverage.tone}`}>{coverage.label}</strong><p>{coverage.detail}</p></div>
      <div className="metric"><small>Prochaine échéance</small><strong>{nextDeadline}</strong><p>{foundingState?`Socle suivi depuis ${dateLabel(foundingState.published_at||foundingState.created_at)}`:"Échéance issue de la fiche dossier"}</p></div>
    </section>

    {actionItem&&<section className="actionStrip"><div className="actionIcon"><Target size={16}/></div><div><small>À traiter maintenant · {urgencyLabel(actionItem.urgency)}</small><strong>{actionItem.title}</strong><p>{cut(actionItem.link_justification?.consequence||actionItem.change_summary||"Vérifier la portée de cet acte sur le dossier.",230)}</p></div><div className="actionBtns"><button className="textBtn" onClick={()=>setSelectedChangeId(actionItem.id)}>Ouvrir l’analyse</button>{onOpenImpact&&<button className="impactBtn" onClick={()=>onOpenImpact(selectedDossierId,[actionItem.id])}>Évaluer l’urgence</button>}</div></section>}

    <section><div className="sectionHead"><div><h3>Chronologie juridique du dossier</h3><p>Tous les actes applicables détectés dans le corpus Myvor, plus récent d’abord. Cliquez sur une ligne pour ouvrir le comparatif.</p></div><span>{filtered.length} acte{filtered.length>1?"s":""} affiché{filtered.length>1?"s":""}</span></div>
      {filtered.length?<div className="actTable">{filtered.map(w=>{const active=w.id===item?.id,b=roleBadge(w),score=corpusScore.get(w.id),reason=corpusReason.get(w.id)||"";return <article key={w.id} className={`actRow ${active?"active":""}`} onClick={()=>setSelectedChangeId(w.id)}><div className="actDate"><small>{dateLabel(w.published_at||w.created_at)}</small><strong>{normKind(w)}</strong></div><div className="actTitle"><strong>{w.title}</strong><small>{w.source_name||"Source institutionnelle"}{score!=null?` · pertinence ${Math.round(score*100)} %`:w.dossier_id===selectedDossierId?" · rattaché au dossier":" · filiation normative"}</small></div><div className="actRole"><span className="role" style={{color:b.color}}>{b.label}</span></div><div className="actText">{cut(w.change_summary||reason||"Acte pertinent identifié dans le corpus juridique.",170)}</div><div className="actImpact">{cut(w.link_justification?.consequence||"Incidence dossier à qualifier.",140)}</div><ExternalLink className="actSource" size={13}/></article>})}</div>:<div className="empty">{corpusLoading?"Myvor construit le corpus juridique du dossier…":"Aucun acte juridique ne correspond encore à ce dossier et à ce filtre."}</div>}
    </section>

    {item&&<section className="workspace"><div className="changeHead"><div><div className="meta">Analyse sélectionnée · {item.source_name||item.nature} · {dateLabel(item.published_at||item.created_at)}</div><h2 className="shortTitle">{item.title}</h2></div><span className="badge" style={{color:badge.color}}>{badge.label}</span></div>
      {historicalState&&<div className={`historyStatusLine ${historicalState.tone}`} >{historicalState.tone==="ok"?<CheckCircle2 size={13}/>:historicalState.tone==="warn"?<AlertTriangle size={13}/>:<ShieldCheck size={13}/>}<strong>{historicalState.label}</strong><span>— {historicalState.detail}</span></div>}
      {ds.length>0&&<div className="dispositions">{ds.map((d,i)=><a key={`${item.id}-${i}`} className={`dispositionLink ${i===selectedDisposition?"active":""}`} href={provisionHref(item.source_url,d)} target="_blank" rel="noreferrer" onClick={()=>{setSelectedDisposition(i);setDetailOpen(false)}}><span>{d.label}</span><ExternalLink size={10}/></a>)}</div>}
      <div className="scheme"><article className="node before"><div className="nodeLabel">État antérieur</div><h3>{previous?shortTitle(previous):item.historical_status==="unresolved"?"Prédécesseur à résoudre":"Aucun état antérieur démontré"}</h3><p>{cut(previousRule,230)}</p></article><div className="arrow"><ArrowRight size={21}/></div><article className="node now"><div className="nodeLabel">État nouveau</div><h3>{chosen?.label||badge.label}</h3><p>{cut(chosen?.detail||currentRule,230)}</p></article><div className="arrow"><ArrowRight size={21}/></div><article className="node case"><div className="nodeLabel">Incidence dossier</div><h3>Conséquence opérationnelle</h3><p>{cut(impact,230)}</p></article></div>
      <div className="focusBox"><div className="focusIcon">Δ</div><div><span>Disposition analysée</span><strong>{chosen?.label||"Changement principal"}</strong></div><button className="focusBtn" onClick={()=>setDetailOpen(v=>!v)}>{detailOpen?<>Masquer le détail <ChevronUp size={13}/></>:<>Voir le détail <ChevronDown size={13}/></>}</button>{currentProvisionUrl&&<a className="sourceBtn" href={currentProvisionUrl} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={11}/></a>}</div>
      {detailOpen&&<div className="detail"><h4>{chosen?.label||"Détail du changement"}</h4><p>{chosen?.detail||currentRule}</p>{objective&&<div className="objective"><strong>Point du dossier concerné :</strong> {objective}</div>}<div className="detailFoot">{previousProvisionUrl&&<a href={previousProvisionUrl} target="_blank" rel="noreferrer">Disposition précédente <ExternalLink size={11}/></a>}{currentProvisionUrl&&<a href={currentProvisionUrl} target="_blank" rel="noreferrer">Disposition actuelle <ExternalLink size={11}/></a>}</div></div>}
    </section>}
  </>}

  {view==="filiation"&&<section className="chainPanel">{item&&chainState?<><div className={`panelIntro chainStatus ${chainState.tone}`}><span>{chainState.label}</span><p>{chainState.detail}</p></div>{chain.length?<div className="chainFlow">{chain.map((w,i)=><div key={w.id} style={{display:"contents"}}><article className="chainNode"><small>{dateLabel(w.published_at||w.created_at)} · {normKind(w)}</small><strong>{cut(w.title,125)}</strong>{w.source_url&&<a href={w.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={9}/></a>}</article><div className="chainArrow"><ArrowRight size={15}/></div></div>)}<article className="chainNode current"><small>{dateLabel(item.published_at||item.created_at)} · Acte sélectionné</small><strong>{cut(item.title,125)}</strong>{item.source_url&&<a href={item.source_url} target="_blank" rel="noreferrer">Source <ExternalLink size={9}/></a>}</article></div>:<div className="empty">Aucune filiation normative explicite n’est encore démontrée pour cet acte.</div>}</>:<div className="empty">Sélectionnez d’abord un acte dans Évolution normative.</div>}</section>}

  {view==="fondements"&&<section className="sourcesPanel"><div className="panelIntro"><span>Fondements juridiques du dossier</span><p>Corpus de sources officielles utilisé par Myvor pour établir l’état du droit et ses évolutions. Chaque ligne reste directement vérifiable.</p></div>{legalSources.length?legalSources.map(w=>{const b=roleBadge(w);return <article key={w.id} className="sourceRow"><small>{dateLabel(w.published_at||w.created_at)}<br/>{normKind(w)}</small><strong>{w.title}</strong><em style={{color:b.color}}>{b.label}</em><a href={w.source_url} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={10}/></a></article>}):<div className="empty">Aucun fondement juridique officiel n’est encore disponible pour ce dossier.</div>}</section>}
  </div>;
}
