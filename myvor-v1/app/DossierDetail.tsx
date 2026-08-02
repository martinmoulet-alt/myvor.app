"use client";

import { useEffect,useState } from "react";
import { ArrowLeft,FileText,Target,AlertTriangle,CalendarDays,Sparkles } from "lucide-react";
import type { Action } from "./DashboardCorporate";
import { listProductions,type Production } from "@/lib/productions";
import { supabase } from "@/lib/supabase";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";

function parseList(value:string){return [...new Set(value.split(/[\n,;]+/).map(item=>item.trim()).filter(Boolean))].slice(0,60);}

export default function DossierDetail({dossier,watch,actions,back,go,onUpdate}:{dossier:Dossier;watch:Watch[];actions:Action[];back:()=>void;go:(tab:Tab)=>void;onUpdate?:(dossier:Dossier)=>void}){
  const related=watch.filter(w=>w.dossier_id===dossier.id);
  const openActions=actions.filter(a=>a.dossier_id===dossier.id&&a.status!=="termine");
  const urgent=related.filter(w=>["fort","absolument urgent"].includes(w.urgency));
  const [productions,setProductions]=useState<Production[]>([]);const [productionError,setProductionError]=useState("");const [selectedProduction,setSelectedProduction]=useState<Production|null>(null);const [focusActionId,setFocusActionId]=useState<string|null>(null);
  const [editingWatch,setEditingWatch]=useState(false);const [savingWatch,setSavingWatch]=useState(false);const [watchMessage,setWatchMessage]=useState("");
  const [watchKeywords,setWatchKeywords]=useState((dossier.watch_keywords||[]).join("\n"));
  const [priorityPhrases,setPriorityPhrases]=useState((dossier.watch_priority_phrases||[]).join("\n"));
  const [excludedKeywords,setExcludedKeywords]=useState((dossier.watch_excluded_keywords||[]).join("\n"));

  useEffect(()=>{let active=true;listProductions(dossier.id).then(({data,error})=>{if(!active)return;setProductions(data);setProductionError(error?error.message:"");});return()=>{active=false;};},[dossier.id]);
  useEffect(()=>{setWatchKeywords((dossier.watch_keywords||[]).join("\n"));setPriorityPhrases((dossier.watch_priority_phrases||[]).join("\n"));setExcludedKeywords((dossier.watch_excluded_keywords||[]).join("\n"));setWatchMessage("");setEditingWatch(false);},[dossier.id]);
  useEffect(()=>{const raw=sessionStorage.getItem("myvor:focus-action");if(!raw)return;try{const action=JSON.parse(raw);if(action?.id&&openActions.some(item=>item.id===action.id)){setFocusActionId(action.id);sessionStorage.removeItem("myvor:focus-action");setTimeout(()=>document.getElementById(`action-${action.id}`)?.scrollIntoView({behavior:"smooth",block:"center"}),100);setTimeout(()=>setFocusActionId(null),2600);}}catch{sessionStorage.removeItem("myvor:focus-action");}},[dossier.id,actions.length]);

  async function saveWatchSettings(e:React.FormEvent){
    e.preventDefault();if(!supabase||savingWatch)return;setSavingWatch(true);setWatchMessage("");
    const payload={watch_keywords:parseList(watchKeywords),watch_priority_phrases:parseList(priorityPhrases),watch_excluded_keywords:parseList(excludedKeywords)};
    const {data,error}=await supabase.from("dossiers").update(payload).eq("id",dossier.id).select("*").single();
    if(error)setWatchMessage(`Impossible d’enregistrer : ${error.message}`);
    else{const updated=data as Dossier;setWatchKeywords((updated.watch_keywords||[]).join("\n"));setPriorityPhrases((updated.watch_priority_phrases||[]).join("\n"));setExcludedKeywords((updated.watch_excluded_keywords||[]).join("\n"));setEditingWatch(false);setWatchMessage("Paramètres de veille enregistrés. Les prochains rattachements utiliseront ces règles en priorité.");onUpdate?.(updated);}
    setSavingWatch(false);
  }

  const keywords=dossier.watch_keywords||[];const phrases=dossier.watch_priority_phrases||[];const exclusions=dossier.watch_excluded_keywords||[];
  const chipStyle={display:"inline-flex",padding:"6px 9px",borderRadius:999,background:"#eef5ff",border:"1px solid #dbe8f8",fontSize:12,fontWeight:750,margin:"4px 6px 0 0"} as const;
  const priorityChipStyle={...chipStyle,background:"#fff7df",border:"1px solid #f3df9a"} as const;
  const excludedChipStyle={...chipStyle,background:"#fff0f0",border:"1px solid #f1caca"} as const;

  return <div className="corp-dashboard">
    <style jsx global>{`.myvor-action-focus{outline:3px solid #f3bd3e!important;outline-offset:3px;box-shadow:0 0 0 8px rgba(243,189,62,.14)!important;background:#fff9e8!important}.myvor-watch-settings textarea{width:100%;min-height:88px;resize:vertical;border:1px solid #d8e1ed;border-radius:10px;padding:10px 12px;font:inherit;background:white}.myvor-watch-settings label{display:block;font-size:12px;font-weight:800;color:#34506f;margin:12px 0 6px}.myvor-watch-settings small{display:block;color:#71839a;margin-top:5px;line-height:1.4}`}</style>
    <button className="corp-primary" style={{marginBottom:18}} onClick={back}><ArrowLeft size={16}/> Retour aux dossiers</button>
    <div className="corp-head"><div><div className="corp-kicker">Dossier client</div><h1>{dossier.title}</h1><p>{dossier.client}</p></div><span className="corp-status">{dossier.status}</span></div>
    <section className="corp-panel" style={{marginBottom:16}}><div className="corp-panel-head"><div><span>Objectif stratégique</span><h2>{dossier.objective}</h2></div><Target size={20}/></div>{dossier.context&&<p>{dossier.context}</p>}</section>

    <section className="corp-panel myvor-watch-settings" style={{marginBottom:16}}>
      <div className="corp-panel-head"><div><span>Paramètres de veille</span><h2>Mots-clés du dossier</h2></div><button onClick={()=>{setEditingWatch(value=>!value);setWatchMessage("");}}>{editingWatch?"Annuler":"Modifier"}</button></div>
      {editingWatch?<form onSubmit={saveWatchSettings}>
        <label>Mots-clés de veille</label><textarea value={watchKeywords} onChange={e=>setWatchKeywords(e.target.value)} placeholder={"mobilité\ntransport\nVTC\nchauffeur"}/><small>Un mot ou une expression par ligne. 3 correspondances fortes permettent un rattachement automatique.</small>
        <label>Expressions prioritaires</label><textarea value={priorityPhrases} onChange={e=>setPriorityPhrases(e.target.value)} placeholder={"plateformes de mobilité\ntransport public urbain"}/><small>Une expression prioritaire exacte constitue un signal très fort, même si les autres mots-clés sont peu nombreux.</small>
        <label>Mots ou expressions à exclure</label><textarea value={excludedKeywords} onChange={e=>setExcludedKeywords(e.target.value)} placeholder={"sport automobile\ntransport maritime"}/><small>Si une exclusion apparaît dans le titre, Myvor ne rattache pas automatiquement le texte à ce dossier.</small>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button className="corp-primary" disabled={savingWatch}>{savingWatch?"Enregistrement…":"Enregistrer les règles"}</button></div>
      </form>:<div>
        <div style={{marginTop:4}}><b style={{fontSize:12,color:"#34506f"}}>Mots-clés</b><div>{keywords.length?keywords.map(value=><span key={value} style={chipStyle}>{value}</span>):<p style={{color:"#71839a",margin:"7px 0 0"}}>Aucun mot-clé explicite : Myvor utilise encore le titre, l’objectif et le contexte comme filet de sécurité.</p>}</div></div>
        {phrases.length>0&&<div style={{marginTop:13}}><b style={{fontSize:12,color:"#34506f"}}>Expressions prioritaires</b><div>{phrases.map(value=><span key={value} style={priorityChipStyle}>{value}</span>)}</div></div>}
        {exclusions.length>0&&<div style={{marginTop:13}}><b style={{fontSize:12,color:"#34506f"}}>Exclusions</b><div>{exclusions.map(value=><span key={value} style={excludedChipStyle}>{value}</span>)}</div></div>}
      </div>}
      {watchMessage&&<div style={{marginTop:12,padding:"10px 12px",borderRadius:10,background:"#f5f8fc",color:"#34506f",fontSize:13}}>{watchMessage}</div>}
    </section>

    <div className="corp-kpis"><div className="corp-kpi"><span>Textes liés</span><strong>{related.length}</strong><small><FileText size={15}/> Corpus du dossier</small></div><div className="corp-kpi alert"><span>Risques forts</span><strong>{urgent.length}</strong><small><AlertTriangle size={15}/> À surveiller</small></div><div className="corp-kpi"><span>Actions ouvertes</span><strong>{openActions.length}</strong><small><CalendarDays size={15}/> À exécuter</small></div><div className="corp-kpi"><span>Productions IA</span><strong>{productions.length}</strong><small><Sparkles size={15}/> Historique du dossier</small></div></div>
    <div className="corp-dashboard-grid"><section className="corp-panel"><div className="corp-panel-head"><div><span>Veille liée</span><h2>Textes du dossier</h2></div><button onClick={()=>go("veille")}>Ouvrir la veille</button></div><div className="corp-list">{related.length?related.map(item=><a className="corp-list-row" key={item.id} href={item.source_url||undefined} target={item.source_url?"_blank":undefined} rel="noreferrer"><span className="corp-doc"><FileText size={18}/></span><span className="corp-list-copy"><b>{item.title}</b><small>{item.nature}</small></span><span className={`corp-impact ${item.urgency.replaceAll(" ","-")}`}>{item.urgency}</span></a>):<div className="corp-empty">Aucun texte rattaché.</div>}</div></section>
    <section className="corp-panel"><div className="corp-panel-head"><div><span>Plan d’action</span><h2>Actions ouvertes</h2></div></div><div className="corp-list">{openActions.length?openActions.map(a=><button id={`action-${a.id}`} className={`corp-list-row ${focusActionId===a.id?"myvor-action-focus":""}`} key={a.id} onClick={()=>go(a.type==="contact"?"radar":a.type==="note_client"||a.type==="amendement"?"builder":"impact")}><span className="corp-list-copy"><b>{a.title}</b><small>{[a.actor_name,a.priority,a.due_date?new Date(a.due_date).toLocaleDateString("fr-FR"):null].filter(Boolean).join(" · ")}</small></span></button>):<div className="corp-empty">Aucune action ouverte.</div>}</div></section>
    <aside className="corp-side-stack"><section className="corp-panel corp-score-card"><span>Outils du dossier</span><button onClick={()=>go("impact")}><Sparkles size={15}/> Note d’impact</button><button onClick={()=>go("radar")}><Sparkles size={15}/> Radar d’influence</button><button onClick={()=>go("builder")}><Sparkles size={15}/> Note Builder</button></section></aside></div>
    <section className="corp-panel" style={{marginTop:16}}><div className="corp-panel-head"><div><span>Mémoire du dossier</span><h2>Productions IA</h2></div><Sparkles size={19}/></div>{productionError?<div className="corp-empty">Historique indisponible : {productionError}</div>:productions.length?<div className="corp-list">{productions.map(p=><button className="corp-list-row" key={p.id} onClick={()=>setSelectedProduction(selectedProduction?.id===p.id?null:p)}><span className="corp-doc"><Sparkles size={18}/></span><span className="corp-list-copy"><b>{p.title}</b><small>{labelType(p.type)} · {new Date(p.created_at).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"})}</small></span></button>)}</div>:<div className="corp-empty">Aucune production enregistrée pour ce dossier.</div>}{selectedProduction&&<ProductionPreview production={selectedProduction}/>}</section>
  </div>;
}

function labelType(type:Production["type"]){return type==="impact"?"Note d’impact":type==="radar"?"Radar d’influence":"Note Builder";}
function ProductionPreview({production}:{production:Production}){const content:any=production.content||{};if(production.type==="impact"){const note=content.note||{};return <div style={{marginTop:16,padding:16,border:"1px solid #e1e8f2",borderRadius:14,background:"#f9fbfe"}}><b>{note.executive_summary||production.title}</b>{note.score!=null&&<p>Score d’impact : {note.score}/100 · {note.level||""}</p>}{Array.isArray(note.recommendations)&&note.recommendations.length>0&&<ul>{note.recommendations.map((x:string,i:number)=><li key={i}>{x}</li>)}</ul>}</div>;}if(production.type==="radar"){const actors=Array.isArray(content.actors)?content.actors:[];return <div style={{marginTop:16,padding:16,border:"1px solid #e1e8f2",borderRadius:14,background:"#f9fbfe"}}><b>{actors.length} acteur(s) cartographié(s)</b><ul>{actors.slice(0,8).map((a:any,i:number)=><li key={a.id||i}>{a.name} — influence {a.influence}/5 — {a.position}</li>)}</ul></div>;}const doc=content.document||{};return <div style={{marginTop:16,padding:16,border:"1px solid #e1e8f2",borderRadius:14,background:"#f9fbfe"}}><b>{doc.subject?`Objet : ${doc.subject}`:production.title}</b><p style={{whiteSpace:"pre-wrap",lineHeight:1.6}}>{doc.content||"Document enregistré."}</p></div>;}
