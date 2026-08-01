"use client";

import { useMemo,useState } from "react";
import { AlertTriangle,Building2,CalendarDays,FileText,RefreshCw,Search,Sparkles } from "lucide-react";
import styles from "./VeilleCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Suggestion={watch_id:string;dossier_id:string|null;confidence:number;reason:string};

export default function VeilleCorporate({items,dossiers,add,sync,syncing,syncMessage,link}:{items:Watch[];dossiers:Dossier[];add:()=>void;sync:()=>void;syncing:boolean;syncMessage:string;link:(watchId:string,dossierId:string|null)=>Promise<void>|void}){
  const [query,setQuery]=useState("");
  const [nature,setNature]=useState("all");
  const [urgency,setUrgency]=useState("all");
  const [qualifying,setQualifying]=useState(false);
  const [qualificationMessage,setQualificationMessage]=useState("");
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [ignored,setIgnored]=useState<string[]>([]);
  const natures=useMemo(()=>Array.from(new Set(items.map(item=>item.nature))).sort(),[items]);
  const filtered=useMemo(()=>items.filter(item=>{
    const q=[item.title,item.nature].join(" ").toLowerCase().includes(query.toLowerCase());
    return q&&(nature==="all"||item.nature===nature)&&(urgency==="all"||item.urgency===urgency);
  }),[items,query,nature,urgency]);
  const urgent=items.filter(item=>["fort","absolument urgent"].includes(item.urgency)).length;
  const linked=items.filter(item=>item.dossier_id).length;
  const unlinkedItems=items.filter(item=>!item.dossier_id);
  const unlinked=unlinkedItems.length;
  const visibleSuggestions=suggestions.filter(s=>!ignored.includes(s.watch_id)&&!items.find(i=>i.id===s.watch_id)?.dossier_id&&s.dossier_id);

  async function qualify(){
    if(qualifying||!unlinkedItems.length||!dossiers.length)return;
    setQualifying(true);setQualificationMessage("");setSuggestions([]);setIgnored([]);
    try{
      const response=await fetch("/api/veille/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:unlinkedItems.slice(0,40).map(i=>({id:i.id,title:i.title,nature:i.nature})),dossiers:dossiers.map(d=>({id:d.id,title:d.title,objective:d.objective}))})});
      const payload=await response.json();if(!response.ok)throw new Error(payload?.error||"Qualification impossible");
      const results=(Array.isArray(payload.assignments)?payload.assignments:[]) as Suggestion[];
      const automatic=results.filter(s=>s.dossier_id&&Number(s.confidence)>=0.90);
      let autoLinked=0;
      for(const s of automatic){await link(s.watch_id,s.dossier_id);autoLinked++;}
      const review=results.filter(s=>s.dossier_id&&Number(s.confidence)>=0.55&&Number(s.confidence)<0.90);
      setSuggestions(review);
      const noMatch=results.filter(s=>!s.dossier_id||Number(s.confidence)<0.55).length;
      setQualificationMessage(`${autoLinked} rattachement(s) automatique(s) · ${review.length} suggestion(s) à valider · ${noMatch} sans correspondance solide. Moteur : ${payload.engine||"Myvor"}.`);
    }catch(error:any){setQualificationMessage(`Qualification impossible : ${error?.message||"erreur inconnue"}`);}finally{setQualifying(false);}
  }

  async function acceptSuggestion(s:Suggestion){if(!s.dossier_id)return;await link(s.watch_id,s.dossier_id);setSuggestions(current=>current.filter(x=>x.watch_id!==s.watch_id));}

  return <div className={styles.page}>
    <div className={styles.head}>
      <div><div className={styles.kicker}>Sources institutionnelles</div><h1>Veille</h1><p>Centralisez les publications officielles et rattachez-les à vos dossiers clients.</p></div>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={sync} disabled={syncing}><RefreshCw size={16}/> {syncing?"Synchronisation…":"Synchroniser"}</button>
        <button className={styles.primary} onClick={add}>+ Ajouter un texte</button>
      </div>
    </div>

    <div className={styles.kpis}>
      <div className={styles.kpi}><span>Total surveillé</span><strong>{items.length}</strong><small><FileText size={15}/> Publications suivies</small></div>
      <div className={styles.kpi}><span>Rattachés</span><strong>{linked}</strong><small><Building2 size={15}/> Liés à un dossier</small></div>
      <div className={styles.kpi}><span>À qualifier</span><strong>{unlinked}</strong><small><Search size={15}/> Non rattachés</small></div>
      <div className={styles.kpi}><span>Priorités fortes</span><strong>{urgent}</strong><small><AlertTriangle size={15}/> Action rapide</small></div>
    </div>

    <section className={styles.qualification}>
      <div className={styles.qualificationHead}><div><h2>Qualification assistée</h2><p>Myvor propose le dossier probable, explique pourquoi et rattache automatiquement uniquement les correspondances très sûres.</p></div><button className={styles.qualificationButton} onClick={qualify} disabled={qualifying||!unlinked||!dossiers.length}><Sparkles size={15}/> {qualifying?"Analyse en cours…":`Qualifier ${Math.min(unlinked,40)} texte(s)`}</button></div>
      <div className={styles.qualificationStats}><span>Auto-rattachement ≥ 90 %</span><span>Validation manuelle 55–89 %</span><span>En dessous : aucun rattachement</span></div>
      {qualificationMessage&&<div className={styles.syncMessage}>{qualificationMessage}</div>}
    </section>

    <div className={styles.sourceNotice}><b>Sources automatiques :</b> Assemblée nationale, Sénat et Journal officiel via Légifrance.</div>
    {syncMessage&&<div className={styles.syncMessage}>{syncMessage}</div>}

    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un texte…"/></label>
      <select className={styles.select} value={nature} onChange={e=>setNature(e.target.value)}><option value="all">Toutes les natures</option>{natures.map(value=><option key={value}>{value}</option>)}</select>
      <select className={styles.select} value={urgency} onChange={e=>setUrgency(e.target.value)}><option value="all">Tous les impacts</option>{["faible","moyen","fort","absolument urgent"].map(value=><option key={value}>{value}</option>)}</select>
      <span className={styles.count}>{filtered.length} élément(s)</span>
    </div>

    {filtered.length?<div className={styles.grid}>{filtered.map(item=>{
      const dossier=dossiers.find(d=>d.id===item.dossier_id);
      const suggestion=visibleSuggestions.find(s=>s.watch_id===item.id);
      const suggestedDossier=suggestion?dossiers.find(d=>d.id===suggestion.dossier_id):null;
      return <article className={styles.card} key={item.id}>
        <div className={styles.top}><span className={styles.nature}>{item.nature}</span><span className={`${styles.urgency} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span></div>
        <h3 className={styles.title}>{item.title}</h3>
        <div className={styles.meta}><span><CalendarDays size={14}/>{new Date(item.created_at).toLocaleDateString("fr-FR")}</span><span><Building2 size={14}/>{dossier?`${dossier.client} — ${dossier.title}`:"Aucun dossier"}</span></div>
        {suggestion&&suggestedDossier&&<div className={styles.suggestion}><div className={styles.suggestionTop}><b>Dossier suggéré : {suggestedDossier.client} — {suggestedDossier.title}</b><span className={styles.confidence}>{Math.round(suggestion.confidence*100)} %</span></div><p>{suggestion.reason}</p><div className={styles.suggestionActions}><button className={styles.accept} onClick={()=>acceptSuggestion(suggestion)}>Rattacher</button><button className={styles.ignore} onClick={()=>setIgnored(current=>[...current,item.id])}>Ignorer</button></div></div>}
        <div className={styles.dossier}><label>Dossier lié</label><select value={item.dossier_id||""} onChange={e=>link(item.id,e.target.value||null)}><option value="">Non rattaché</option>{dossiers.map(d=><option value={d.id} key={d.id}>{d.client} — {d.title}</option>)}</select></div>
        <div className={styles.footer}>{item.source_url?<a className={styles.source} href={item.source_url} target="_blank" rel="noreferrer">Lire le texte original</a>:<span/>}<span className={styles.count}>Source officielle</span></div>
      </article>;
    })}</div>:<div className={styles.empty}><FileText size={34}/><h2>Aucun texte trouvé</h2><p>Synchronisez les sources ou modifiez vos filtres.</p></div>}
  </div>;
}
