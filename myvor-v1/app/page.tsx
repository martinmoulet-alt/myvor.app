"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, BriefcaseBusiness, LogOut, Plus, Radar, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import ImpactModule from "./ImpactModule";
import RadarModule from "./RadarModule";

type Tab = "dashboard" | "dossiers" | "veille" | "impact" | "radar" | "builder";
type Dossier = { id:string; client:string; title:string; objective:string; context:string; status:string; created_at:string };
type Watch = { id:string; title:string; nature:string; source_url:string; dossier_id:string|null; urgency:string; created_at:string };
type SourceItem = { title:string; nature:string; source_url:string; source_name:string; published_at?:string };

const nav = [
  ["dashboard","Tableau de bord",BarChart3],
  ["dossiers","Dossiers clients",BriefcaseBusiness],
  ["veille","Veille",Search],
  ["impact","Note d’impact",AlertTriangle],
  ["radar","Radar d’influence",Radar],
  ["builder","Note Builder",Sparkles],
] as const;

export default function Home(){
  const [session,setSession]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<Tab>("dashboard");
  const [dossiers,setDossiers]=useState<Dossier[]>([]);
  const [watch,setWatch]=useState<Watch[]>([]);
  const [modal,setModal]=useState<"dossier"|"watch"|null>(null);
  const [authMode,setAuthMode]=useState<"login"|"signup">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState("");
  const [searchingDossier,setSearchingDossier]=useState<string|null>(null);
  const [dossierMessages,setDossierMessages]=useState<Record<string,string>>({});

  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false);});
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>data.subscription.unsubscribe();
  },[]);

  useEffect(()=>{if(session) loadData();},[session]);

  async function loadData(){
    if(!supabase)return;
    const [{data:d},{data:w}]=await Promise.all([
      supabase.from("dossiers").select("*").order("created_at",{ascending:false}),
      supabase.from("watch_items").select("*").order("created_at",{ascending:false}),
    ]);
    setDossiers(d||[]);
    setWatch(w||[]);
  }

  async function linkWatchToDossier(watchId:string,dossierId:string|null){
    if(!supabase)return;
    const previous=watch;
    setWatch(items=>items.map(item=>item.id===watchId?{...item,dossier_id:dossierId}:item));
    const {error}=await supabase.from("watch_items").update({dossier_id:dossierId}).eq("id",watchId);
    if(error){setWatch(previous);setSyncMessage(`Impossible de rattacher le texte : ${error.message}`);}
  }

  async function findRelevantForDossier(dossier:Dossier){
    if(!supabase || searchingDossier)return;
    setSearchingDossier(dossier.id);
    setDossierMessages(m=>({...m,[dossier.id]:"Analyse de la veille en cours…"}));
    try{
      const candidates=watch.filter(w=>!w.dossier_id || w.dossier_id===dossier.id).slice(0,40);
      if(!candidates.length){
        setDossierMessages(m=>({...m,[dossier.id]:"Aucune évolution à analyser pour le moment."}));
        return;
      }

      const response=await fetch("/api/veille/assign",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          items:candidates.map(w=>({id:w.id,title:w.title,nature:w.nature})),
          dossiers:[{id:dossier.id,title:dossier.title,objective:dossier.objective}],
        }),
      });
      const payload=await response.json();
      if(response.status===503) throw new Error("IA non configurée : ajoute OPENAI_API_KEY dans Netlify.");
      if(!response.ok) throw new Error(payload?.error||"Analyse IA impossible");

      const relevant=(payload.assignments||[]).filter((a:any)=>a.dossier_id===dossier.id && Number(a.confidence)>=0.78);
      let linked=0;
      for(const a of relevant){
        const {error}=await supabase.from("watch_items").update({dossier_id:dossier.id}).eq("id",a.watch_id);
        if(error) throw error;
        linked++;
      }
      await loadData();
      setDossierMessages(m=>({...m,[dossier.id]:linked?`${linked} évolution(s) pertinente(s) trouvée(s) et rattachée(s).`:"Aucune évolution suffisamment pertinente détectée."}));
    }catch(error:any){
      setDossierMessages(m=>({...m,[dossier.id]:error?.message||"Analyse impossible"}));
    }finally{
      setSearchingDossier(null);
    }
  }

  async function syncSources(){
    if(!supabase || syncing)return;
    setSyncing(true);setSyncMessage("");
    try{
      const response=await fetch("/api/veille/sources",{cache:"no-store"});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error||"Synchronisation impossible");
      const incoming:SourceItem[]=payload.items||[];
      const byUrl=new Map(watch.map(item=>[item.source_url,item]));
      const fresh=incoming.filter(item=>!byUrl.has(item.source_url));
      const existing=incoming.filter(item=>byUrl.has(item.source_url));
      if(fresh.length){
        const rows=fresh.map(item=>({title:item.title,nature:item.nature,source_url:item.source_url,dossier_id:null,urgency:"moyen"}));
        const {error}=await supabase.from("watch_items").insert(rows);if(error)throw error;
      }
      let repaired=0;
      for(const item of existing){
        const current=byUrl.get(item.source_url);if(!current)continue;
        if(current.title!==item.title || current.nature!==item.nature){
          const {error}=await supabase.from("watch_items").update({title:item.title,nature:item.nature}).eq("id",current.id);if(error)throw error;repaired++;
        }
      }
      await loadData();
      const active=(payload.active_sources||[]).join(", ");
      const unavailable=(payload.unavailable_sources||[]).join(", ");
      setSyncMessage(`${fresh.length} nouveau(x) élément(s), ${repaired} corrigé(s). Sources actives : ${active||"aucune"}.${unavailable?` Indisponibles : ${unavailable}.`:""}`);
    }catch(error:any){setSyncMessage(`Erreur de synchronisation : ${error?.message||"inconnue"}`);}finally{setSyncing(false);}
  }

  async function auth(e:React.FormEvent){
    e.preventDefault();setMessage("");if(!supabase)return;
    const result=authMode==="login"?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
    if(result.error)setMessage(result.error.message);else if(authMode==="signup")setMessage("Compte créé. Vérifie ton e-mail si la confirmation est activée.");
  }

  if(loading)return <div className="auth"><div style={{color:"white"}}>Chargement de Myvor…</div></div>;
  if(!isSupabaseConfigured)return <SetupScreen/>;
  if(!session)return <div className="auth"><form className="authbox" onSubmit={auth}><div className="brand" style={{color:"var(--navy)"}}><div className="logo">M</div>Myvor</div><h1>Anticipez l’impact.</h1><p className="muted">Votre cockpit opérationnel d’affaires publiques.</p><div className="tabs"><button type="button" className={authMode==="login"?"active":""} onClick={()=>setAuthMode("login")}>Connexion</button><button type="button" className={authMode==="signup"?"active":""} onClick={()=>setAuthMode("signup")}>Créer un compte</button></div><div className="form"><div className="field"><label>E-mail</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Mot de passe</label><input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></div>{message&&<div className="notice">{message}</div>}<button className="btn primary">{authMode==="login"?"Se connecter":"Créer mon espace"}</button></div></form></div>;

  const content=tab==="dashboard"
    ? <Dashboard dossiers={dossiers} watch={watch} go={setTab}/>
    : tab==="dossiers"
      ? <Dossiers items={dossiers} add={()=>setModal("dossier")} search={findRelevantForDossier} searching={searchingDossier} messages={dossierMessages}/>
      : tab==="veille"
        ? <Veille items={watch} dossiers={dossiers} add={()=>setModal("watch")} sync={syncSources} syncing={syncing} syncMessage={syncMessage} link={linkWatchToDossier}/>
        : tab==="impact"
          ? <ImpactModule dossiers={dossiers} watch={watch}/>
          : tab==="radar"
            ? <RadarModule dossiers={dossiers} watch={watch}/>
            : <ModulePlaceholder tab={tab} dossiers={dossiers} watch={watch}/>;

  return <div className="app"><header className="topbar"><div className="brand"><div className="logo">M</div>Myvor</div><button className="logout" onClick={()=>supabase?.auth.signOut()}><LogOut size={16}/></button></header><div className="shell"><aside className="sidebar">{nav.map(([id,label,Icon])=><button key={id} className={`navbtn ${tab===id?"active":""}`} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}</aside><main className="main">{content}</main></div><nav className="mobile-nav">{nav.slice(0,5).map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={19}/>{label.split(" ")[0]}</button>)}</nav>{modal==="dossier"&&<DossierModal close={()=>setModal(null)} done={()=>{setModal(null);loadData();}}/>}{modal==="watch"&&<WatchModal dossiers={dossiers} close={()=>setModal(null)} done={()=>{setModal(null);loadData();}}/>}</div>;
}

function SetupScreen(){return <div className="auth"><div className="authbox"><div className="brand" style={{color:"var(--navy)"}}><div className="logo">M</div>Myvor</div><h1>Configuration requise</h1><p className="muted">Le code est prêt. Ajoute les variables Supabase dans Netlify.</p><div className="notice small">NEXT_PUBLIC_SUPABASE_URL<br/>NEXT_PUBLIC_SUPABASE_ANON_KEY<br/>OPENAI_API_KEY</div></div></div>;}
function Header({eyebrow,title,lead,action}:{eyebrow:string,title:string,lead:string,action?:React.ReactNode}){return <div className="toolbar"><div><div className="eyebrow">{eyebrow}</div><h1 className="h1">{title}</h1><p className="lead">{lead}</p></div>{action}</div>;}
function Dashboard({dossiers,watch,go}:{dossiers:Dossier[],watch:Watch[],go:(t:Tab)=>void}){const urgent=watch.filter(x=>["fort","absolument urgent"].includes(x.urgency)).length;return <><Header eyebrow="Vue d’ensemble" title="Bonjour, voici vos priorités." lead="Un point d’entrée unique pour passer de l’information à l’action."/><div className="grid stats"><div className="card stat"><span className="muted">Dossiers actifs</span><strong>{dossiers.length}</strong></div><div className="card stat"><span className="muted">Éléments de veille</span><strong>{watch.length}</strong></div><div className="card stat"><span className="muted">Alertes fortes</span><strong>{urgent}</strong></div><div className="card stat"><span className="muted">Notes produites</span><strong>0</strong></div></div><div className="grid two" style={{marginTop:16}}><div className="card"><h2>Dossiers récents</h2>{dossiers.length?<div className="list">{dossiers.slice(0,4).map(d=><div className="row" key={d.id}><div><h3>{d.title}</h3><span className="muted small">{d.client}</span></div><span className="badge green">Actif</span></div>)}</div>:<Empty title="Aucun dossier" text="Créez votre premier dossier client."/>}<button className="btn ghost" style={{marginTop:12}} onClick={()=>go("dossiers")}>Voir les dossiers</button></div><div className="card"><h2>Priorités</h2>{urgent?<p>{urgent} élément(s) nécessitent une analyse rapide.</p>:<Empty title="Aucune alerte urgente" text="Les éléments critiques apparaîtront ici."/>}<button className="btn ghost" onClick={()=>go("veille")}>Ouvrir la veille</button></div></div></>;}
function Dossiers({items,add,search,searching,messages}:{items:Dossier[],add:()=>void,search:(d:Dossier)=>void,searching:string|null,messages:Record<string,string>}){return <><Header eyebrow="Portefeuille" title="Dossiers clients" lead="Chaque analyse part d’un objectif client clairement défini." action={<button className="btn primary" onClick={add}><Plus size={16}/> Nouveau dossier</button>}/>{items.length?<div className="list">{items.map(d=><div className="row" key={d.id}><div style={{minWidth:0,flex:1}}><h3>{d.title}</h3><div className="muted small">{d.client}</div><p className="small">Objectif : {d.objective}</p>{messages[d.id]&&<div className="notice small" style={{marginTop:10,marginBottom:0}}>{messages[d.id]}</div>}</div><div style={{display:"grid",gap:8,justifyItems:"end"}}><span className="badge green">{d.status}</span><button className="btn dark" disabled={!!searching} onClick={()=>search(d)}><Sparkles size={16}/> {searching===d.id?"Analyse en cours…":"Chercher les évolutions pertinentes"}</button></div></div>)}</div>:<div className="card"><Empty title="Votre portefeuille est vide" text="Ajoutez un premier client et son objectif stratégique."/></div>}</>;}
function Veille({items,dossiers,add,sync,syncing,syncMessage,link}:{items:Watch[],dossiers:Dossier[],add:()=>void,sync:()=>void,syncing:boolean,syncMessage:string,link:(watchId:string,dossierId:string|null)=>void}){return <><Header eyebrow="Sources institutionnelles" title="Veille" lead="Assemblée nationale, Sénat et Journal officiel sont reliés à Myvor." action={<div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}><button className="btn ghost" onClick={sync} disabled={syncing}><RefreshCw size={16}/>{syncing?" Synchronisation…":" Synchroniser les sources"}</button><button className="btn primary" onClick={add}><Plus size={16}/> Ajouter un texte</button></div>}/><div className="notice small"><b>Sources automatiques :</b> Assemblée nationale — publications parlementaires · Sénat — textes et rapports · Légifrance — Journal officiel.</div>{syncMessage&&<div className="notice small">{syncMessage}</div>}{items.length?<div className="list">{items.map(w=><div className="row" key={w.id}><div style={{minWidth:0,flex:1}}><span className="badge">{w.nature}</span><h3 style={{marginTop:8}}>{w.title}</h3><div className="small" style={{marginTop:9,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span className="muted">Dossier :</span><select aria-label="Rattacher à un dossier" value={w.dossier_id||""} onChange={e=>link(w.id,e.target.value||null)} style={{border:"1px solid var(--line)",borderRadius:9,padding:"7px 9px",background:"white",maxWidth:360}}><option value="">Non rattaché</option>{dossiers.map(d=><option value={d.id} key={d.id}>{d.client} — {d.title}</option>)}</select></div></div><div style={{display:"grid",gap:7,justifyItems:"end"}}><Urgency value={w.urgency}/>{w.source_url&&<a className="small" href={w.source_url} target="_blank" rel="noreferrer">Lire le texte original</a>}</div></div>)}</div>:<div className="card"><Empty title="Aucun texte suivi" text="Cliquez sur Synchroniser les sources pour importer les dernières publications officielles."/></div>}</>;}
function ModulePlaceholder({tab,dossiers,watch}:{tab:Tab,dossiers:Dossier[],watch:Watch[]}){const names:any={impact:["Analyse stratégique","Note d’impact","Transformez un texte en risques, opportunités, échéances et recommandations."],radar:["Cartographie","Radar d’influence","Positionnez les acteurs par rapport à l’objectif précis du client."],builder:["Production","Note Builder","Préparez une note, un argumentaire ou un e-mail à partir du dossier."]};const n=names[tab];return <><Header eyebrow={n[0]} title={n[1]} lead={n[2]}/><div className="card empty"><Sparkles size={34}/><h2>Module prêt à être connecté au moteur d’analyse</h2><p className="muted">La structure fonctionnelle est en place. Il utilisera les {dossiers.length} dossier(s) et {watch.length} élément(s) de veille de votre espace.</p><span className="badge orange">Étape suivante de la V1</span></div></>;}
function Empty({title,text}:{title:string,text:string}){return <div className="empty"><h3>{title}</h3><p className="muted">{text}</p></div>;}
function Urgency({value}:{value:string}){const cls=value==="faible"?"green":value==="moyen"?"orange":value==="fort"?"red":"wine";return <span className={`badge ${cls}`}>{value}</span>;}
function DossierModal({close,done}:{close:()=>void,done:()=>void}){const [f,setF]=useState({client:"",title:"",objective:"",context:""});const [err,setErr]=useState("");async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;const {error}=await supabase.from("dossiers").insert({...f,status:"Actif"});if(error)setErr(error.message);else done();}return <Modal title="Nouveau dossier" close={close}><form className="form" onSubmit={save}>{[["client","Client"],["title","Intitulé du dossier"],["objective","Objectif du client"]].map(([k,l])=><div className="field" key={k}><label>{l}</label><input required value={(f as any)[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></div>)}<div className="field"><label>Contexte</label><textarea value={f.context} onChange={e=>setF({...f,context:e.target.value})}/></div>{err&&<div className="notice">{err}</div>}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Annuler</button><button className="btn primary">Créer le dossier</button></div></form></Modal>;}
function WatchModal({dossiers,close,done}:{dossiers:Dossier[],close:()=>void,done:()=>void}){const [f,setF]=useState({title:"",nature:"Projet de loi",source_url:"",dossier_id:"",urgency:"moyen"});const [err,setErr]=useState("");async function save(e:React.FormEvent){e.preventDefault();if(!supabase)return;const {error}=await supabase.from("watch_items").insert({...f,dossier_id:f.dossier_id||null});if(error)setErr(error.message);else done();}return <Modal title="Ajouter un texte" close={close}><form className="form" onSubmit={save}><div className="field"><label>Titre</label><input required value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></div><div className="field"><label>Nature juridique</label><select value={f.nature} onChange={e=>setF({...f,nature:e.target.value})}>{["Projet de loi","Proposition de loi","Amendement","Décret","Arrêté","Ordonnance","Résolution","Rapport","Question parlementaire","Audition","Communiqué institutionnel","Décision / jurisprudence"].map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Lien officiel</label><input type="url" required value={f.source_url} onChange={e=>setF({...f,source_url:e.target.value})}/></div><div className="field"><label>Dossier lié</label><select value={f.dossier_id} onChange={e=>setF({...f,dossier_id:e.target.value})}><option value="">Non rattaché</option>{dossiers.map(d=><option value={d.id} key={d.id}>{d.title}</option>)}</select></div><div className="field"><label>Niveau d’impact</label><select value={f.urgency} onChange={e=>setF({...f,urgency:e.target.value})}>{["faible","moyen","fort","absolument urgent"].map(x=><option key={x}>{x}</option>)}</select></div>{err&&<div className="notice">{err}</div>}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Annuler</button><button className="btn primary">Ajouter</button></div></form></Modal>;}
function Modal({title,close,children}:{title:string,close:()=>void,children:React.ReactNode}){return <div className="modal"><div className="modalbox"><div className="toolbar" style={{marginTop:0}}><h2>{title}</h2><button className="btn ghost" onClick={close}><X size={18}/></button></div>{children}</div></div>;}
