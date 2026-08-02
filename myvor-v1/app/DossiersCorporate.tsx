"use client";

import { useEffect,useMemo,useState } from "react";
import { AlertTriangle,BriefcaseBusiness,CalendarDays,FileText,Search,Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEMO_DOSSIERS } from "@/lib/demoDossiers";
import styles from "./DossiersCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};

export default function DossiersCorporate({items,watch,add,search,searching,messages,open}:{items:Dossier[];watch:Watch[];add:()=>void;search:(d:Dossier)=>void;searching:string|null;messages:Record<string,string>;open:(d:Dossier)=>void}){
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"all"|"active"|"urgent">("all");
  const [seeding,setSeeding]=useState(false);
  const [seedMessage,setSeedMessage]=useState("");

  useEffect(()=>{const target=sessionStorage.getItem("myvor:open-dossier");if(!target)return;const dossier=items.find(item=>item.id===target);if(dossier){sessionStorage.removeItem("myvor:open-dossier");open(dossier);}},[items,open]);

  const filtered=useMemo(()=>items.filter(d=>{const matchesQuery=[d.client,d.title,d.objective,d.context].join(" ").toLowerCase().includes(query.toLowerCase());const dossierWatch=watch.filter(w=>w.dossier_id===d.id);const urgent=dossierWatch.some(w=>["fort","absolument urgent"].includes(w.urgency));const matchesFilter=filter==="all"||(filter==="active"&&d.status.toLowerCase()==="actif")||(filter==="urgent"&&urgent);return matchesQuery&&matchesFilter;}),[items,watch,query,filter]);
  const urgentCount=items.filter(d=>watch.some(w=>w.dossier_id===d.id&&["fort","absolument urgent"].includes(w.urgency))).length;
  const linkedCount=items.filter(d=>watch.some(w=>w.dossier_id===d.id)).length;

  async function seedDemoDossiers(){
    if(!supabase||seeding)return;
    setSeeding(true);setSeedMessage("");
    try{
      const {data:existing,error:readError}=await supabase.from("dossiers").select("title");
      if(readError)throw readError;
      const existingTitles=new Set((existing||[]).map((row:any)=>String(row.title||"").trim().toLowerCase()));
      const rows=DEMO_DOSSIERS.filter(d=>!existingTitles.has(d.title.trim().toLowerCase()));
      if(!rows.length){setSeedMessage("Les 20 dossiers de test sont déjà présents.");return;}
      const {error}=await supabase.from("dossiers").insert(rows);
      if(error)throw error;
      setSeedMessage(`${rows.length} dossier(s) client(s) de test ajouté(s). Rechargement…`);
      setTimeout(()=>window.location.reload(),650);
    }catch(error:any){setSeedMessage(`Impossible d’ajouter les dossiers : ${error?.message||"erreur inconnue"}`);}finally{setSeeding(false);}
  }

  return <div className={styles.page}>
    <div className={styles.head}>
      <div><div className={styles.kicker}>Portefeuille</div><h1>Dossiers clients</h1><p>Suivez l’ensemble de vos missions et priorités clients.</p></div>
      <div style={{display:"flex",gap:9,flexWrap:"wrap",width:"min(100%,520px)",justifyContent:"flex-end"}}>
        <button className={styles.primary} style={{background:"#eef4ff",color:"#0757d0",boxShadow:"none",border:"1px solid #cfdef5"}} onClick={seedDemoDossiers} disabled={seeding}><Sparkles size={15} style={{verticalAlign:"-2px",marginRight:6}}/>{seeding?"Ajout en cours…":"Ajouter 20 dossiers de test"}</button>
        <button className={styles.primary} onClick={add}>+ Nouveau dossier</button>
      </div>
    </div>
    {seedMessage&&<div className={styles.message}>{seedMessage}</div>}
    <div className={styles.kpis}><div className={styles.kpi}><span>Total dossiers</span><strong>{items.length}</strong><small><BriefcaseBusiness size={15}/> Portefeuille global</small></div><div className={styles.kpi}><span>Dossiers actifs</span><strong>{items.filter(d=>d.status.toLowerCase()==="actif").length}</strong><small><span className={styles.dot}/> En cours</small></div><div className={styles.kpi}><span>Avec veille liée</span><strong>{linkedCount}</strong><small><FileText size={15}/> Textes rattachés</small></div><div className={styles.kpi}><span>Priorités fortes</span><strong>{urgentCount}</strong><small><AlertTriangle size={15}/> À surveiller</small></div></div>
    <div className={styles.toolbar}><label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un client ou un dossier…"/></label><div className={styles.filters}><button className={filter==="all"?styles.active:""} onClick={()=>setFilter("all")}>Tous</button><button className={filter==="active"?styles.active:""} onClick={()=>setFilter("active")}>Actifs</button><button className={filter==="urgent"?styles.active:""} onClick={()=>setFilter("urgent")}>Prioritaires</button></div><span className={styles.count}>{filtered.length} dossier(s)</span></div>
    {filtered.length?<div className={styles.list}>{filtered.map(dossier=>{const related=watch.filter(w=>w.dossier_id===dossier.id);const urgent=related.filter(w=>["fort","absolument urgent"].includes(w.urgency)).length;return <article className={styles.card} key={dossier.id}><div className={styles.avatar}>{(dossier.client||dossier.title||"D").slice(0,2).toUpperCase()}</div><div className={styles.copy}><div className={styles.topline}><h3>{dossier.title}</h3><span className={styles.status}>{dossier.status}</span></div><div className={styles.client}>{dossier.client}</div><p className={styles.objective}><b>Objectif :</b> {dossier.objective}</p><div className={styles.meta}><span><FileText size={14}/>{related.length} texte(s) lié(s)</span><span><AlertTriangle size={14}/>{urgent} alerte(s) forte(s)</span><span><CalendarDays size={14}/>{new Date(dossier.created_at).toLocaleDateString("fr-FR")}</span></div>{messages[dossier.id]&&<div className={styles.message}>{messages[dossier.id]}</div>}</div><div className={styles.actions}><button className={styles.open} onClick={()=>open(dossier)}>Ouvrir le dossier</button><button className={styles.analyse} disabled={!!searching} onClick={()=>search(dossier)}><Sparkles size={15}/> {searching===dossier.id?"Analyse en cours…":"Chercher les évolutions"}</button></div></article>;})}</div>:<div className={styles.empty}><BriefcaseBusiness size={34}/><h2>Aucun dossier trouvé</h2><p>Créez un nouveau dossier ou modifiez vos filtres.</p></div>}
  </div>;
}
