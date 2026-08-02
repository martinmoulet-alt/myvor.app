"use client";

import { useEffect,useMemo,useState } from "react";
import { AlertTriangle,BriefcaseBusiness,CalendarDays,FileText,MoreHorizontal,Search,Sparkles,Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./DossiersCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Priority={rank:number;label:string;itemClass:string;pillClass:string};
type EditDraft={client:string;title:string;objective:string;context:string;status:string};

const fieldStyle={display:"grid",gap:6,fontSize:11,fontWeight:850,color:"#60708a",textTransform:"uppercase",letterSpacing:".07em"} as const;
const inputStyle={width:"100%",border:"1px solid #d9e3f2",borderRadius:10,padding:"10px 11px",font:"inherit",color:"#24364f",background:"white"} as const;

export default function DossiersCorporate({items,watch,add,search,searching,messages,open}:{items:Dossier[];watch:Watch[];add:()=>void;search:(d:Dossier)=>void;searching:string|null;messages:Record<string,string>;open:(d:Dossier)=>void}){
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"all"|"active"|"urgent">("all");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [deleting,setDeleting]=useState<string|null>(null);
  const [deleteMessage,setDeleteMessage]=useState("");
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editMessage,setEditMessage]=useState("");
  const [revision,setRevision]=useState(0);
  const [draft,setDraft]=useState<EditDraft>({client:"",title:"",objective:"",context:"",status:"Actif"});

  useEffect(()=>{const target=sessionStorage.getItem("myvor:open-dossier");if(!target)return;const dossier=items.find(item=>item.id===target);if(dossier){sessionStorage.removeItem("myvor:open-dossier");open(dossier);}},[items,open]);

  function relatedWatch(dossierId:string){return watch.filter(item=>item.dossier_id===dossierId);}
  function priorityFor(dossierId:string):Priority{
    const related=relatedWatch(dossierId);
    if(related.some(item=>item.urgency==="absolument urgent"))return{rank:4,label:"Absolument urgent",itemClass:styles.portfolioItemCritical,pillClass:styles.priorityCritical};
    if(related.some(item=>item.urgency==="fort"))return{rank:3,label:"Fort",itemClass:styles.portfolioItemStrong,pillClass:styles.priorityStrong};
    if(related.some(item=>item.urgency==="moyen"))return{rank:2,label:"Moyen",itemClass:styles.portfolioItemMedium,pillClass:styles.priorityMedium};
    return{rank:1,label:related.length?"Faible":"Stable",itemClass:styles.portfolioItemLow,pillClass:styles.priorityLow};
  }

  const filtered=useMemo(()=>items
    .filter(dossier=>{
      const matchesQuery=[dossier.client,dossier.title,dossier.objective,dossier.context].join(" ").toLowerCase().includes(query.toLowerCase());
      const related=watch.filter(item=>item.dossier_id===dossier.id);
      const urgent=related.some(item=>["fort","absolument urgent"].includes(item.urgency));
      const matchesFilter=filter==="all"||(filter==="active"&&dossier.status.toLowerCase()==="actif")||(filter==="urgent"&&urgent);
      return matchesQuery&&matchesFilter;
    })
    .sort((a,b)=>priorityFor(b.id).rank-priorityFor(a.id).rank||new Date(b.created_at).getTime()-new Date(a.created_at).getTime()),[items,watch,query,filter,revision]);

  useEffect(()=>{
    if(!filtered.length){setSelectedId(null);return;}
    if(!selectedId||!filtered.some(dossier=>dossier.id===selectedId))setSelectedId(filtered[0].id);
  },[filtered,selectedId]);

  const selected=filtered.find(dossier=>dossier.id===selectedId)||null;
  const urgentCount=items.filter(d=>watch.some(w=>w.dossier_id===d.id&&["fort","absolument urgent"].includes(w.urgency))).length;
  const linkedCount=items.filter(d=>watch.some(w=>w.dossier_id===d.id)).length;

  function beginEdit(dossier:Dossier){
    setMenuOpen(false);setEditMessage("");setEditing(true);
    setDraft({client:dossier.client,title:dossier.title,objective:dossier.objective,context:dossier.context||"",status:dossier.status||"Actif"});
  }

  function cancelEdit(){
    setEditing(false);setEditMessage("");
    if(selected)setDraft({client:selected.client,title:selected.title,objective:selected.objective,context:selected.context||"",status:selected.status||"Actif"});
  }

  function choose(dossier:Dossier){
    setMenuOpen(false);setEditing(false);setEditMessage("");setSelectedId(dossier.id);
    if(typeof window!=="undefined"&&window.matchMedia("(max-width:820px)").matches){setTimeout(()=>document.getElementById("dossier-command-detail")?.scrollIntoView({behavior:"smooth",block:"start"}),60);}
  }

  async function saveDossier(e:React.FormEvent){
    e.preventDefault();
    if(!supabase||!selected||saving)return;
    const payload={client:draft.client.trim(),title:draft.title.trim(),objective:draft.objective.trim(),context:draft.context.trim(),status:draft.status};
    if(!payload.client||!payload.title||!payload.objective){setEditMessage("Client, intitulé et objectif sont obligatoires.");return;}
    setSaving(true);setEditMessage("");
    const {data,error}=await supabase.from("dossiers").update(payload).eq("id",selected.id).select("*").single();
    if(error){setEditMessage(`Impossible d’enregistrer : ${error.message}`);setSaving(false);return;}
    const updated=data as Dossier;
    Object.assign(selected,updated);
    setDraft({client:updated.client,title:updated.title,objective:updated.objective,context:updated.context||"",status:updated.status||"Actif"});
    setEditing(false);setEditMessage("Dossier mis à jour.");setRevision(value=>value+1);setSaving(false);
    if(typeof window!=="undefined")window.dispatchEvent(new Event("pageshow"));
  }

  async function removeDossier(dossier:Dossier){
    if(!supabase||deleting)return;
    const confirmed=window.confirm(`Supprimer définitivement le dossier « ${dossier.title} » pour ${dossier.client} ?\n\nCette action supprimera aussi ses actions et productions enregistrées.`);
    if(!confirmed)return;
    setDeleting(dossier.id);setDeleteMessage("");setMenuOpen(false);
    try{
      const {error:actionsError}=await supabase.from("actions").delete().eq("dossier_id",dossier.id);
      if(actionsError)throw actionsError;
      const {error:dossierError}=await supabase.from("dossiers").delete().eq("id",dossier.id);
      if(dossierError)throw dossierError;
      window.location.reload();
    }catch(error:any){
      setDeleteMessage(`Impossible de supprimer le dossier : ${error?.message||"erreur inconnue"}`);
      setDeleting(null);
    }
  }

  return <div className={styles.page}>
    <div className={styles.head}>
      <div><div className={styles.kicker}>Portefeuille</div><h1>Dossiers clients</h1><p>Priorisez vos dossiers et ouvrez immédiatement celui qui demande une action.</p></div>
      <button className={styles.primary} onClick={add}>+ Nouveau dossier</button>
    </div>

    {deleteMessage&&<div className={styles.message}>{deleteMessage}</div>}

    <div className={styles.kpis}>
      <div className={styles.kpi}><span>Total dossiers</span><strong>{items.length}</strong><small><BriefcaseBusiness size={15}/> Portefeuille global</small></div>
      <div className={styles.kpi}><span>Dossiers actifs</span><strong>{items.filter(d=>d.status.toLowerCase()==="actif").length}</strong><small><span className={styles.dot}/> En cours</small></div>
      <div className={styles.kpi}><span>Avec veille liée</span><strong>{linkedCount}</strong><small><FileText size={15}/> Textes rattachés</small></div>
      <div className={styles.kpi}><span>Priorités fortes</span><strong>{urgentCount}</strong><small><AlertTriangle size={15}/> À traiter</small></div>
    </div>

    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un client ou un dossier…"/></label>
      <div className={styles.filters}><button className={filter==="all"?styles.active:""} onClick={()=>setFilter("all")}>Tous</button><button className={filter==="active"?styles.active:""} onClick={()=>setFilter("active")}>Actifs</button><button className={filter==="urgent"?styles.active:""} onClick={()=>setFilter("urgent")}>Prioritaires</button></div>
      <span className={styles.count}>{filtered.length} dossier(s)</span>
    </div>

    {filtered.length?<div className={styles.workspace}>
      <section className={styles.portfolio}>
        <div className={styles.portfolioHead}><b>Portefeuille priorisé</b><span>Urgence → dernière création</span></div>
        <div className={styles.portfolioList}>
          {filtered.map(dossier=>{
            const related=relatedWatch(dossier.id);
            const alerts=related.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
            const priority=priorityFor(dossier.id);
            return <button type="button" key={dossier.id} className={`${styles.portfolioItem} ${priority.itemClass} ${selectedId===dossier.id?styles.portfolioItemSelected:""}`} onClick={()=>choose(dossier)}>
              <div className={styles.rowTop}>
                <div className={styles.rowIdentity}><div className={styles.rowAvatar}>{(dossier.client||dossier.title||"D").slice(0,2).toUpperCase()}</div><div className={styles.rowName}><div className={styles.rowClient}>{dossier.client}</div><div className={styles.rowTitle}>{dossier.title}</div></div></div>
                <span className={`${styles.priorityPill} ${priority.pillClass}`}>{priority.label}</span>
              </div>
              <p className={styles.rowSummary}>{dossier.objective||"Objectif à préciser"}</p>
              <div className={styles.rowMeta}><span><FileText size={13}/>{related.length} texte(s)</span><span><AlertTriangle size={13}/>{alerts} alerte(s)</span><span>Sélectionner →</span></div>
            </button>;
          })}
        </div>
      </section>

      {selected?(()=>{
        const related=relatedWatch(selected.id);
        const alerts=related.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
        const priority=priorityFor(selected.id);
        const latest=related.reduce((max,item)=>Math.max(max,new Date(item.created_at).getTime()||0),0);
        return <aside id="dossier-command-detail" className={styles.detailPanel}>
          <div className={styles.detailTop}>
            <div className={styles.detailEyebrow}>Dossier sélectionné</div>
            <div className={styles.detailTitleRow}>
              <div><h2 className={styles.detailTitle}>{selected.title}</h2><div className={styles.detailClient}>{selected.client} · {selected.status}</div></div>
              <div style={{position:"relative"}}>
                <button type="button" className={styles.menuButton} aria-label="Actions du dossier" onClick={()=>setMenuOpen(value=>!value)}><MoreHorizontal size={19}/></button>
                {menuOpen&&<div style={{position:"absolute",right:0,top:44,zIndex:10,minWidth:205,padding:6,background:"white",border:"1px solid #dfe7f2",borderRadius:11,boxShadow:"0 14px 32px rgba(14,40,80,.14)"}}>
                  <button type="button" onClick={()=>beginEdit(selected)} style={{width:"100%",border:0,background:"transparent",color:"#17365f",padding:"10px 11px",borderRadius:8,fontWeight:800,textAlign:"left"}}>Modifier le dossier</button>
                  <div style={{height:1,background:"#edf1f6",margin:"3px 0"}}/>
                  <button type="button" onClick={()=>void removeDossier(selected)} disabled={deleting===selected.id} style={{width:"100%",border:0,background:"transparent",color:"#a92a3b",padding:"10px 11px",borderRadius:8,fontWeight:800,display:"flex",alignItems:"center",gap:8,textAlign:"left"}}><Trash2 size={15}/>{deleting===selected.id?"Suppression…":"Supprimer le dossier"}</button>
                </div>}
              </div>
            </div>
            <div style={{marginTop:12}}><span className={`${styles.priorityPill} ${priority.pillClass}`}>{priority.label}</span></div>
          </div>

          <div className={styles.detailBody}>
            {editMessage&&<div className={styles.message}>{editMessage}</div>}
            {editing?<form onSubmit={saveDossier} style={{display:"grid",gap:13}}>
              <label style={fieldStyle}>Client<input style={inputStyle} required value={draft.client} onChange={e=>setDraft({...draft,client:e.target.value})}/></label>
              <label style={fieldStyle}>Intitulé du dossier<input style={inputStyle} required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
              <label style={fieldStyle}>Objectif du client<textarea style={{...inputStyle,minHeight:92,resize:"vertical"}} required value={draft.objective} onChange={e=>setDraft({...draft,objective:e.target.value})}/></label>
              <label style={fieldStyle}>Contexte<textarea style={{...inputStyle,minHeight:100,resize:"vertical"}} value={draft.context} onChange={e=>setDraft({...draft,context:e.target.value})}/></label>
              <label style={fieldStyle}>Statut<select style={inputStyle} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option>Actif</option><option>En pause</option><option>Terminé</option><option>Archivé</option></select></label>
              <div className={styles.detailActions}><button type="button" className={styles.detailSecondary} onClick={cancelEdit} disabled={saving}>Annuler</button><button className={styles.detailPrimary} disabled={saving}>{saving?"Enregistrement…":"Enregistrer"}</button></div>
            </form>:<>
              <div className={styles.detailSection}><div className={styles.detailSectionLabel}>Objectif client</div><p className={styles.detailObjective}>{selected.objective||"Objectif à préciser."}</p></div>
              {selected.context&&<div className={styles.detailSection}><div className={styles.detailSectionLabel}>Contexte</div><p className={styles.detailObjective}>{selected.context}</p></div>}
              <div className={styles.detailStats}>
                <div className={styles.detailStat}><span>Textes liés</span><strong>{related.length}</strong><small>veille rattachée</small></div>
                <div className={styles.detailStat}><span>Alertes fortes</span><strong>{alerts}</strong><small>à surveiller</small></div>
                <div className={styles.detailStat}><span>Dernière évolution</span><strong style={{fontSize:latest?15:18}}>{latest?new Date(latest).toLocaleDateString("fr-FR"):"—"}</strong><small>{latest?"publication liée":"aucune veille"}</small></div>
              </div>
              {messages[selected.id]&&<div className={styles.message}>{messages[selected.id]}</div>}
              <div className={styles.detailActions}>
                <button className={styles.detailPrimary} onClick={()=>open(selected)}>Ouvrir le dossier</button>
                <button className={styles.detailSecondary} disabled={!!searching} onClick={()=>search(selected)}><Sparkles size={15} style={{verticalAlign:"-2px",marginRight:6}}/>{searching===selected.id?"Analyse en cours…":"Chercher les évolutions"}</button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,color:"#8794a8",fontSize:11}}><CalendarDays size={13}/> Dossier créé le {new Date(selected.created_at).toLocaleDateString("fr-FR")}</div>
            </>}
          </div>
        </aside>;
      })():<div className={styles.emptySelection}><BriefcaseBusiness size={32}/><h3>Sélectionnez un dossier</h3><p>Son objectif, ses alertes et ses actions apparaîtront ici.</p></div>}
    </div>:<div className={styles.empty}><BriefcaseBusiness size={34}/><h2>Aucun dossier trouvé</h2><p>Créez un nouveau dossier ou modifiez vos filtres.</p></div>}
  </div>;
}
