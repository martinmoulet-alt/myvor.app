"use client";

import { useEffect,useMemo,useState } from "react";
import { Bell,BriefcaseBusiness,CalendarDays,ExternalLink,FileText,Folder,MoreHorizontal,Search,Sparkles,Trash2 } from "lucide-react";
import { isTransientError,withRetry } from "@/lib/reliability";
import { supabase } from "@/lib/supabase";
import styles from "./DossiersCorporate.module.css";

type ModuleTarget="impact"|"radar"|"builder";
type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string;published_at?:string|null;source_name?:string|null};
type EditDraft={client:string;title:string;objective:string;context:string;status:string};
type ImpactProductionRow={dossier_id:string;content:any;created_at:string};
type ImpactTone="critical"|"strong"|"medium"|"low";
type Assignment={watch_id:string;dossier_id:string|null;confidence:number;reason:string};
type Evolution={item:Watch;confidence:number|null;reason:string;linkedHere:boolean;linkedElsewhere:boolean};

function impactTone(score:number):ImpactTone{if(score>=80)return"critical";if(score>=65)return"strong";if(score>=45)return"medium";return"low";}
function asRetryable(error:any,status?:number){const wrapped:any=new Error(error?.message||"Opération Supabase impossible.");wrapped.status=status||error?.status||0;return wrapped;}
async function reliableSupabase<T extends {error:any;status?:number}>(operation:()=>PromiseLike<T>){return withRetry(async()=>{const result=await operation();if(result.error)throw asRetryable(result.error,result.status);return result;},{attempts:3,baseDelayMs:220,shouldRetry:error=>isTransientError(error)});}
function watchTime(item:Watch){const preferred=item.published_at?Date.parse(item.published_at):NaN;if(Number.isFinite(preferred))return preferred;const fallback=Date.parse(item.created_at);return Number.isFinite(fallback)?fallback:0;}
function watchDate(item:Watch){const time=watchTime(item);return time?new Date(time).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—";}

export default function DossiersCorporate({items,watch,add,search,searching,messages,open,launch}:{items:Dossier[];watch:Watch[];add:()=>void;search:(d:Dossier)=>void;searching:string|null;messages:Record<string,string>;open:(d:Dossier)=>void;launch:(target:ModuleTarget,dossier:Dossier,watchId?:string)=>void}){
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"all"|"active"|"urgent">("all");
  const [menuId,setMenuId]=useState<string|null>(null);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [deleteMessage,setDeleteMessage]=useState("");
  const [editing,setEditing]=useState<Dossier|null>(null);
  const [saving,setSaving]=useState(false);
  const [editMessage,setEditMessage]=useState("");
  const [revision,setRevision]=useState(0);
  const [impactScores,setImpactScores]=useState<Record<string,number>>({});
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [evolutionLoading,setEvolutionLoading]=useState(false);
  const [evolutionError,setEvolutionError]=useState("");
  const [draft,setDraft]=useState<EditDraft>({client:"",title:"",objective:"",context:"",status:"Actif"});

  useEffect(()=>{const target=sessionStorage.getItem("myvor:open-dossier");if(!target)return;const dossier=items.find(item=>item.id===target);if(dossier){sessionStorage.removeItem("myvor:open-dossier");open(dossier);}},[items,open]);
  useEffect(()=>{let active=true;async function loadValidatedScores(){if(!supabase||!items.length){if(active)setImpactScores({});return;}try{const dossierIds=items.map(item=>item.id);const {data}=await reliableSupabase(()=>supabase!.from("productions").select("dossier_id,content,created_at").eq("type","impact").in("dossier_id",dossierIds).order("created_at",{ascending:false}));if(!active)return;const scores:Record<string,number>={};for(const row of (data||[]) as ImpactProductionRow[]){if(scores[row.dossier_id]!=null)continue;const note=row.content?.note;const score=Number(note?.score);if(note?.quality?.status!=="validated"||note?.score_available===false||!Number.isFinite(score))continue;scores[row.dossier_id]=Math.max(0,Math.min(100,Math.round(score)));}if(active)setImpactScores(scores);}catch{}}void loadValidatedScores();return()=>{active=false;};},[items,revision]);

  function related(dossierId:string){return watch.filter(item=>item.dossier_id===dossierId);}
  function rank(dossierId:string){return impactScores[dossierId]??-1;}
  const filtered=useMemo(()=>items.filter(dossier=>{const q=query.trim().toLocaleLowerCase("fr");const matches=!q||[dossier.client,dossier.title,dossier.objective,dossier.context].join(" ").toLocaleLowerCase("fr").includes(q);const rel=watch.filter(item=>item.dossier_id===dossier.id);const urgent=rel.some(item=>["fort","absolument urgent"].includes(item.urgency));const status=filter==="all"||(filter==="active"&&dossier.status.toLowerCase()==="actif")||(filter==="urgent"&&urgent);return matches&&status;}).sort((a,b)=>rank(b.id)-rank(a.id)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime()),[items,watch,query,filter,revision,impactScores]);
  const selected=items.find(item=>item.id===selectedId)||filtered[0]||null;
  const activeCount=items.filter(d=>d.status.toLowerCase()==="actif").length;
  const urgentCount=items.filter(d=>watch.some(w=>w.dossier_id===d.id&&["fort","absolument urgent"].includes(w.urgency))).length;

  useEffect(()=>{if(!filtered.length){setSelectedId(null);return;}if(!selectedId||!filtered.some(item=>item.id===selectedId))setSelectedId(filtered[0].id);},[filtered,selectedId]);

  useEffect(()=>{
    if(!selected){setAssignments([]);setEvolutionError("");return;}
    let cancelled=false;
    const timer=setTimeout(async()=>{
      setEvolutionLoading(true);setEvolutionError("");
      try{
        const candidates=[...watch].sort((a,b)=>watchTime(b)-watchTime(a)).slice(0,24);
        if(!candidates.length){if(!cancelled)setAssignments([]);return;}
        const response=await fetch("/api/veille/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:candidates.map(item=>({id:item.id,title:item.title,nature:item.nature,source_url:item.source_url})),dossiers:[{id:selected.id,title:selected.title,objective:selected.objective,context:selected.context,watch_keywords:selected.watch_keywords||[],watch_priority_phrases:selected.watch_priority_phrases||[],watch_excluded_keywords:selected.watch_excluded_keywords||[]}]})});
        const payload=await response.json();
        if(!response.ok)throw new Error(payload?.error||"Analyse impossible");
        if(!cancelled)setAssignments(Array.isArray(payload.assignments)?payload.assignments:[]);
      }catch(error:any){if(!cancelled){setAssignments([]);setEvolutionError(error?.message||"Analyse indisponible");}}
      finally{if(!cancelled)setEvolutionLoading(false);}
    },220);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[selected?.id,selected?.title,selected?.objective,selected?.context,watch.length]);

  const evolutions=useMemo<Evolution[]>(()=>{
    if(!selected)return[];
    const assignmentByWatch=new Map(assignments.filter(a=>a.dossier_id===selected.id).map(a=>[a.watch_id,a]));
    return watch.map(item=>{
      const assignment=assignmentByWatch.get(item.id);
      const linkedHere=item.dossier_id===selected.id;
      const linkedElsewhere=!!item.dossier_id&&item.dossier_id!==selected.id;
      if(!linkedHere&&(!assignment||Number(assignment.confidence)<0.5))return null;
      return{item,confidence:assignment?Number(assignment.confidence):null,reason:assignment?.reason||(linkedHere?"Texte déjà rattaché à ce dossier.":"Correspondance détectée."),linkedHere,linkedElsewhere};
    }).filter(Boolean).sort((a,b)=>((b!.confidence??0)-(a!.confidence??0))||watchTime(b!.item)-watchTime(a!.item)) as Evolution[];
  },[selected,watch,assignments]);

  function beginEdit(dossier:Dossier){setMenuId(null);setEditMessage("");setEditing(dossier);setDraft({client:dossier.client,title:dossier.title,objective:dossier.objective,context:dossier.context||"",status:dossier.status||"Actif"});}
  async function saveDossier(e:React.FormEvent){e.preventDefault();if(!supabase||!editing||saving)return;const payload={client:draft.client.trim(),title:draft.title.trim(),objective:draft.objective.trim(),context:draft.context.trim(),status:draft.status};if(!payload.client||!payload.title||!payload.objective){setEditMessage("Client, intitulé et objectif sont obligatoires.");return;}setSaving(true);setEditMessage("");try{const {data}=await reliableSupabase(()=>supabase!.from("dossiers").update(payload).eq("id",editing.id).select("*").single());Object.assign(editing,data as Dossier);setEditing(null);setRevision(v=>v+1);if(typeof window!=="undefined")window.dispatchEvent(new Event("pageshow"));}catch(error:any){setEditMessage(`Impossible d’enregistrer : ${error?.message||"erreur réseau"}`);}finally{setSaving(false);}}
  async function removeDossier(dossier:Dossier){if(!supabase||deleting)return;const confirmed=window.confirm(`Supprimer définitivement le dossier « ${dossier.title} » pour ${dossier.client} ?\n\nCette action supprimera aussi ses actions et productions enregistrées.`);if(!confirmed)return;setDeleting(dossier.id);setDeleteMessage("");setMenuId(null);try{await reliableSupabase(()=>supabase!.from("productions").delete().eq("dossier_id",dossier.id));await reliableSupabase(()=>supabase!.from("actions").delete().eq("dossier_id",dossier.id));await reliableSupabase(()=>supabase!.from("dossiers").delete().eq("id",dossier.id));window.location.reload();}catch(error:any){setDeleteMessage(`Impossible de supprimer le dossier : ${error?.message||"erreur inconnue"}`);setDeleting(null);}}

  return <div className={styles.page}>
    <div className={styles.head}><div><h1>Dossiers clients</h1><p>Pilotez vos dossiers et voyez immédiatement les évolutions de veille qui leur sont pertinentes.</p></div><button className={styles.primary} onClick={add}>+ Nouveau dossier</button></div>
    {deleteMessage&&<div className={styles.message}>{deleteMessage}</div>}

    <div className={styles.kpis}>
      <button onClick={()=>setFilter("active")} className={styles.kpi}><span className={styles.kpiIcon}><Folder size={20}/></span><span><strong>{activeCount}</strong><small>Dossiers actifs</small></span></button>
      <button onClick={()=>setFilter("all")} className={styles.kpi}><span className={styles.kpiIcon}><FileText size={20}/></span><span><strong>{watch.length}</strong><small>Publications suivies</small></span></button>
      <button onClick={()=>setFilter("urgent")} className={styles.kpi}><span className={`${styles.kpiIcon} ${styles.alertIcon}`}><Bell size={20}/></span><span><strong>{urgentCount}</strong><small>Dossiers prioritaires</small></span></button>
    </div>

    <div className={styles.toolbar}><label className={styles.search}><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un dossier, un client…"/></label><div className={styles.filters}><button className={filter==="all"?styles.active:""} onClick={()=>setFilter("all")}>Tous</button><button className={filter==="active"?styles.active:""} onClick={()=>setFilter("active")}>Actifs</button><button className={filter==="urgent"?styles.active:""} onClick={()=>setFilter("urgent")}>Prioritaires</button></div></div>

    <div className={styles.workspace}>
      <section className={styles.leftPanel}>
        <div className={styles.panelHead}><div><span>Portefeuille</span><h2>Dossiers</h2></div><strong>{filtered.length}</strong></div>
        {filtered.length?<div className={styles.dossierList}>{filtered.map(dossier=>{const rel=related(dossier.id);const urgent=rel.filter(w=>["fort","absolument urgent"].includes(w.urgency)).length;const score=impactScores[dossier.id];const latest=rel.reduce((max,item)=>Math.max(max,watchTime(item)),0);return <article className={`${styles.dossierCard} ${selected?.id===dossier.id?styles.selected:""}`} key={dossier.id} onClick={()=>setSelectedId(dossier.id)}>
          <div className={styles.dossierTop}><div className={styles.dossierIdentity}><span className={styles.folderBadge}><Folder size={18}/></span><div><small>{dossier.client}</small><h3>{dossier.title}</h3></div></div><div className={styles.menuCell}><button className={styles.menuButton} onClick={e=>{e.stopPropagation();setMenuId(menuId===dossier.id?null:dossier.id);}} aria-label="Actions du dossier"><MoreHorizontal size={19}/></button>{menuId===dossier.id&&<div className={styles.menu} onClick={e=>e.stopPropagation()}><button onClick={()=>open(dossier)}>Ouvrir le dossier</button><button disabled={!!searching} onClick={()=>{setMenuId(null);search(dossier);}}><Sparkles size={14}/>{searching===dossier.id?"Analyse en cours…":"Rattacher les évolutions ≥ 50 %"}</button><button onClick={()=>launch("impact",dossier)}>Note d’impact</button><button onClick={()=>launch("radar",dossier)}>Radar d’influence</button><button onClick={()=>launch("builder",dossier)}>Note Builder</button><button onClick={()=>beginEdit(dossier)}>Modifier le dossier</button><button className={styles.danger} disabled={deleting===dossier.id} onClick={()=>void removeDossier(dossier)}><Trash2 size={14}/>{deleting===dossier.id?"Suppression…":"Supprimer"}</button></div>}</div></div>
          <p>{dossier.objective||"Objectif à préciser"}</p>
          <div className={styles.dossierMeta}><span className={`${styles.status} ${dossier.status.toLowerCase()==="actif"?styles.statusActive:styles.statusIdle}`}>{dossier.status}</span><span><Bell size={13}/>{urgent} alerte{urgent>1?"s":""}</span><span><CalendarDays size={13}/>{latest?new Date(latest).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"}):"Aucune évolution"}</span>{score!=null&&<span className={styles.scorePill}>Impact {score}%</span>}</div>
          {messages[dossier.id]&&<div className={styles.rowMessage}>{messages[dossier.id]}</div>}
        </article>;})}</div>:<div className={styles.empty}><BriefcaseBusiness size={34}/><h2>Aucun dossier trouvé</h2><p>Créez un dossier ou modifiez les filtres.</p></div>}
      </section>

      <section className={styles.rightPanel}>
        <div className={styles.panelHead}><div><span>Veille ciblée</span><h2>Évolutions pertinentes</h2>{selected&&<p>{selected.client} · {selected.title}</p>}</div><div className={styles.relevanceBadge}>Seuil 50 %</div></div>
        {!selected?<div className={styles.empty}><Sparkles size={34}/><h2>Sélectionnez un dossier</h2><p>Ses évolutions pertinentes apparaîtront ici.</p></div>:<>
          <div className={styles.evolutionSummary}><span><b>{evolutions.length}</b> évolution(s) pertinente(s)</span><button onClick={()=>open(selected)}>Ouvrir la fiche dossier</button></div>
          {evolutionLoading&&<div className={styles.analysisState}><Sparkles size={16}/> Analyse des publications récentes…</div>}
          {evolutionError&&<div className={styles.message}>{evolutionError}</div>}
          {!evolutionLoading&&evolutions.length?<div className={styles.evolutionList}>{evolutions.map(({item,confidence,reason,linkedHere,linkedElsewhere})=><article className={styles.evolutionCard} key={item.id}>
            <div className={styles.evolutionTop}><div className={styles.evolutionTags}><span>{item.nature}</span><span className={`${styles.urgency} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span></div>{confidence!=null?<strong className={styles.confidence}>{Math.round(confidence*100)} %</strong>:<strong className={styles.linkedBadge}>Rattaché</strong>}</div>
            <h3>{item.title}</h3>
            <div className={styles.evolutionMeta}><span><CalendarDays size={13}/>{watchDate(item)}</span><span>{linkedHere?"Rattaché à ce dossier":linkedElsewhere?"Déjà lié à un autre dossier":"Détecté par Myvor"}</span></div>
            <p>{reason}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}><button type="button" onClick={()=>launch("impact",selected,item.id)} style={{border:"1px solid #e8ae17",background:"linear-gradient(135deg,#ffc928,#f3bd3e)",color:"#07162c",borderRadius:9,padding:"8px 10px",fontWeight:850,cursor:"pointer"}}>Note d’impact</button><button type="button" onClick={()=>launch("radar",selected,item.id)} style={{border:"1px solid #29445f",background:"#0a213a",color:"#e7eef7",borderRadius:9,padding:"8px 10px",fontWeight:800,cursor:"pointer"}}>Radar d’influence</button><button type="button" onClick={()=>launch("builder",selected,item.id)} style={{border:"1px solid #29445f",background:"#0a213a",color:"#e7eef7",borderRadius:9,padding:"8px 10px",fontWeight:800,cursor:"pointer"}}>Note Builder</button></div>
            <div className={styles.evolutionFooter}>{item.source_url?<a href={item.source_url} target="_blank" rel="noreferrer">Lire la source <ExternalLink size={13}/></a>:<span/>}<span>{item.source_name||"Source officielle"}</span></div>
          </article>)}</div>:!evolutionLoading&&<div className={styles.empty}><FileText size={34}/><h2>Aucune évolution ≥ 50 %</h2><p>Myvor n’a pas identifié de publication suffisamment pertinente pour ce dossier dans les éléments récents.</p></div>}
        </>}
      </section>
    </div>

    {editing&&<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEditing(null);}}><form className={styles.modal} onSubmit={saveDossier}><div className={styles.modalHead}><div><small>Modifier le dossier</small><h2>{editing.title}</h2></div><button type="button" onClick={()=>setEditing(null)}>×</button></div>{editMessage&&<div className={styles.message}>{editMessage}</div>}<label>Client<input required value={draft.client} onChange={e=>setDraft({...draft,client:e.target.value})}/></label><label>Intitulé du dossier<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Objectif du client<textarea required value={draft.objective} onChange={e=>setDraft({...draft,objective:e.target.value})}/></label><label>Contexte<textarea value={draft.context} onChange={e=>setDraft({...draft,context:e.target.value})}/></label><label>Statut<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option>Actif</option><option>En pause</option><option>Terminé</option><option>Archivé</option></select></label><div className={styles.modalActions}><button type="button" onClick={()=>setEditing(null)} disabled={saving}>Annuler</button><button className={styles.save} disabled={saving}>{saving?"Enregistrement…":"Enregistrer"}</button></div></form></div>}
  </div>;
}
