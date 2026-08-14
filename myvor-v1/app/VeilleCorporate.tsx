"use client";

import {useEffect,useMemo,useState} from "react";
import {RefreshCw,Search} from "lucide-react";
import {supabase} from "@/lib/supabase";
import CorpusImportancePyramid from "./CorpusImportancePyramid";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string;source_name?:string|null;published_at?:string|null};
type Assignment={id:string;score:number;reason:string};
type PyramidItem=Watch&{confidence:number;reason:string;linkedToCurrent:boolean;linkedElsewhere:boolean};

const RELEVANCE_THRESHOLD=.50;
function publicationTime(item:Watch){const value=item.published_at||item.created_at;const timestamp=Date.parse(value);return Number.isFinite(timestamp)?timestamp:0;}
function sourceLabel(url:string){try{const host=new URL(url).hostname.replace(/^www\./,"");if(host.includes("legifrance.gouv.fr"))return "Légifrance — Journal officiel";if(host.includes("eur-lex.europa.eu"))return "EUR-Lex";if(host.includes("assemblee-nationale.fr"))return "Assemblée nationale";if(host.includes("senat.fr"))return "Sénat";return host||"Source officielle";}catch{return "Source officielle";}}

export default function VeilleCorporate({items,dossiers,refresh,refreshing,refreshMessage}:{items:Watch[];dossiers:Dossier[];add:()=>void;refresh:()=>void;refreshing:boolean;refreshMessage:string;link:(watchId:string,dossierId:string|null)=>Promise<void>|void}){
  const [selectedId,setSelectedId]=useState("");
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");

  const activeDossiers=useMemo(()=>dossiers.filter(d=>String(d.status||"").toLocaleLowerCase("fr-FR")!=="archivé"),[dossiers]);
  const selected=activeDossiers.find(d=>d.id===selectedId)||null;

  useEffect(()=>{
    if(selectedId&&activeDossiers.some(d=>d.id===selectedId))return;
    setSelectedId(activeDossiers[0]?.id||"");
  },[activeDossiers,selectedId]);

  useEffect(()=>{
    if(!selectedId)return;
    void buildCorpus(selectedId,true);
  },[selectedId,items.length]);

  async function buildCorpus(dossierId:string,automatic=false){
    if(!supabase||loading)return;
    setLoading(true);
    if(!automatic)setMessage("Reconstruction du corpus applicable…");
    try{
      const {data,error}=await supabase.functions.invoke("scan-dossier-history",{body:{dossier_id:dossierId}});
      if(error)throw error;
      const results=Array.isArray(data?.results)?data.results:[];
      const next:Assignment[]=results.map((result:any)=>({id:String(result.id),score:Number(result.score)||0,reason:String(result.reason||"Correspondance détectée.")})).filter((result:Assignment)=>result.score>=RELEVANCE_THRESHOLD);
      setAssignments(next);
      setMessage(next.length?`${next.length} texte(s) priorisé(s) pour ce dossier.`:"Aucun texte applicable détecté pour ce dossier.");
    }catch(error:any){
      setAssignments([]);
      setMessage(`Analyse indisponible : ${error?.message||"erreur inconnue"}`);
    }finally{
      setLoading(false);
    }
  }

  async function refreshAndRebuild(){
    refresh();
    if(selectedId)await buildCorpus(selectedId,false);
  }

  const pyramidItems=useMemo(()=>assignments.map(result=>{
    const item=items.find(candidate=>candidate.id===result.id);
    if(!item)return null;
    const sourceName=item.source_name||sourceLabel(item.source_url);
    return {...item,source_name:sourceName,confidence:result.score,reason:result.reason,linkedToCurrent:item.dossier_id===selectedId,linkedElsewhere:!!item.dossier_id&&item.dossier_id!==selectedId} as PyramidItem;
  }).filter((item):item is PyramidItem=>!!item).sort((a,b)=>b.confidence-a.confidence||publicationTime(b)-publicationTime(a)),[assignments,items,selectedId]);

  function openWatch(item:Watch){
    if(item.source_url){window.open(item.source_url,"_blank","noopener,noreferrer");return;}
    try{sessionStorage.setItem("myvor:open-watch",item.id);}catch{}
  }

  const criticalPreview=useMemo(()=>pyramidItems.filter(item=>{
    const text=`${item.title} ${item.nature} ${item.reason}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return /\b(loi|reglement|directive|ordonnance|modifie|abroge|abrogation|remplace|nouvelle obligation|interdiction|echeance|seuil)\b/.test(text)&&item.confidence>=.72;
  }).length,[pyramidItems]);

  return <div className="veille-prioritized">
    <style jsx>{`
      .veille-prioritized{display:grid;gap:18px}.veille-hero{background:linear-gradient(145deg,#06152d,#0b2c5e);color:#fff;border-radius:20px;padding:22px;box-shadow:0 18px 45px rgba(6,21,45,.18)}.veille-kicker{font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#f3bd3e}.veille-hero h1{margin:7px 0 6px;font-size:28px}.veille-hero p{margin:0;color:#b9c9dc;max-width:760px;line-height:1.5}.veille-controls{display:grid;grid-template-columns:minmax(240px,1fr) auto;gap:12px;margin-top:18px}.veille-controls label{display:grid;gap:6px;color:#9fb4ce;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.veille-controls select{width:100%;border:1px solid rgba(255,255,255,.15);background:#0b2348;color:#fff;border-radius:11px;padding:11px 12px;font:inherit}.veille-refresh{align-self:end;border:1px solid rgba(243,189,62,.4);background:#f3bd3e;color:#10213a;border-radius:11px;padding:11px 15px;font-weight:900;display:flex;gap:8px;align-items:center;justify-content:center;cursor:pointer}.veille-refresh:disabled{opacity:.6;cursor:default}.veille-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.veille-stat{background:#fff;border:1px solid #dfe7f0;border-radius:14px;padding:14px}.veille-stat span{display:block;color:#74859b;font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:850}.veille-stat strong{display:block;margin-top:5px;color:#123860;font-size:22px}.veille-panel{background:#fff;border:1px solid #dfe7f0;border-radius:18px;padding:18px}.veille-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.veille-panel-head h2{margin:4px 0 0;color:#15375f}.veille-panel-head span{font-size:10px;color:#74859b;text-transform:uppercase;letter-spacing:.08em;font-weight:850}.veille-message{margin:0 0 10px;padding:10px 12px;border-radius:10px;background:#f5f8fc;color:#34506f;font-size:12px}.veille-empty{padding:26px;text-align:center;border:1px dashed #d6e0ec;border-radius:13px;color:#71839a;background:#f8fbff}.veille-empty svg{display:block;margin:0 auto 8px}.veille-note{font-size:11px;color:#7a8a9d;line-height:1.5;margin:8px 0 0}.veille-refresh-message{font-size:11px;color:#8fa3bb;margin-top:8px}@media(max-width:720px){.veille-controls{grid-template-columns:1fr}.veille-strip{grid-template-columns:1fr}.veille-hero h1{font-size:24px}.veille-panel{padding:14px}}
    `}</style>

    <section className="veille-hero">
      <div className="veille-kicker">Veille priorisée</div>
      <h1>Ce qui compte pour vos dossiers</h1>
      <p>La veille générale reste en arrière-plan pour alimenter Myvor. Ici, seuls les textes réellement pertinents pour le dossier sélectionné sont affichés et classés par importance.</p>
      <div className="veille-controls">
        <label>Dossier à surveiller
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} disabled={!activeDossiers.length}>
            {!activeDossiers.length&&<option value="">Aucun dossier actif</option>}
            {activeDossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}
          </select>
        </label>
        <button className="veille-refresh" type="button" onClick={()=>void refreshAndRebuild()} disabled={refreshing||loading||!selectedId}><RefreshCw size={16}/>{refreshing||loading?"Analyse…":"Actualiser"}</button>
      </div>
      {refreshMessage&&<div className="veille-refresh-message">{refreshMessage}</div>}
    </section>

    {selected&&<div className="veille-strip">
      <div className="veille-stat"><span>Dossier</span><strong>{selected.client}</strong></div>
      <div className="veille-stat"><span>Textes applicables</span><strong>{pyramidItems.length}</strong></div>
      <div className="veille-stat"><span>Priorité critique estimée</span><strong>{criticalPreview}</strong></div>
    </div>}

    <section className="veille-panel">
      <div className="veille-panel-head"><div><span>Hiérarchie réglementaire</span><h2>Pyramide de veille</h2></div></div>
      {message&&<div className="veille-message">{message}</div>}
      {!activeDossiers.length?<div className="veille-empty"><Search size={24}/>Créez d’abord un dossier client pour obtenir une veille priorisée.</div>:pyramidItems.length?<CorpusImportancePyramid items={pyramidItems} onOpen={openWatch}/>:<div className="veille-empty"><Search size={24}/>{loading?"Analyse du corpus en cours…":"Aucun texte priorisé pour ce dossier pour le moment."}</div>}
      <p className="veille-note">Ordre de lecture : Critique → Majeur → Secondaire → Contexte. À niveau égal, la pertinence départage les textes.</p>
    </section>
  </div>;
}
