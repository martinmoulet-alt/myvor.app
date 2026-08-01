"use client";

import { useMemo,useState } from "react";
import { Copy,FileText,Sparkles } from "lucide-react";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type BuiltDocument={title:string;subject:string;content:string;key_points:string[];sources:{title:string;url:string}[]};

const formats=[
  ["note-client","Note client"],
  ["argumentaire","Argumentaire"],
  ["email","E-mail"],
  ["rendez-vous","Préparation de rendez-vous"],
] as const;

export default function BuilderModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[]}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [format,setFormat]=useState("note-client");
  const [audience,setAudience]=useState("Client");
  const [tone,setTone]=useState("professionnel et direct");
  const [instruction,setInstruction]=useState("");
  const [document,setDocument]=useState<BuiltDocument|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}
    setLoading(true);setError("");setDocument(null);setCopied(false);
    try{
      const endpoint=new URL("/api/builder",window.location.origin).toString();
      const response=await fetch(endpoint,{
        method:"POST",
        headers:new Headers({"Content-Type":"application/json;charset=UTF-8"}),
        body:JSON.stringify({dossier,items:related,format,audience,tone,instruction}),
        cache:"no-store",
      });
      const raw=await response.text();
      let payload:any={};
      try{payload=raw?JSON.parse(raw):{};}catch{throw new Error(`Réponse serveur invalide (${response.status}).`);}
      if(!response.ok)throw new Error(payload?.error||`Génération impossible (${response.status})`);
      if(!payload?.document)throw new Error("Le Note Builder n’a renvoyé aucun document.");
      setDocument(payload.document);
    }catch(err:any){
      const message=String(err?.message||"");
      setError(message.includes("expected pattern")?"Le navigateur a refusé la requête. Le correctif est en cours de déploiement, recharge la page puis réessaie.":message||"Génération impossible");
    }finally{setLoading(false);}
  }

  async function copyDocument(){
    if(!document)return;
    const text=[document.title,document.subject?`Objet : ${document.subject}`:"",document.content,document.key_points?.length?`\nPoints clés\n${document.key_points.map(x=>`• ${x}`).join("\n")}`:""].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);setTimeout(()=>setCopied(false),1800);
  }

  return <>
    <div className="toolbar"><div><div className="eyebrow">Production opérationnelle</div><h1 className="h1">Note Builder</h1><p className="lead">Transformez un dossier et sa veille en document immédiatement exploitable.</p></div></div>
    <div className="grid two">
      <div className="card">
        <h2>1. Choisir la base</h2>
        <div className="field"><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setDocument(null);setError("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>
        {dossier&&<div className="notice small"><b>Objectif :</b> {dossier.objective}<br/><b>Textes liés :</b> {related.length}</div>}
      </div>
      <div className="card">
        <h2>2. Paramétrer le document</h2>
        <div className="field"><label>Format</label><select value={format} onChange={e=>setFormat(e.target.value)}>{formats.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></div>
        <div className="field"><label>Public visé</label><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Client, député, cabinet ministériel…"/></div>
        <div className="field"><label>Ton</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>professionnel et direct</option><option>institutionnel et diplomatique</option><option>convaincant et offensif</option><option>pédagogique et synthétique</option></select></div>
        <div className="field"><label>Instruction complémentaire</label><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Ex. Insister sur le coût économique et proposer un rendez-vous avant l’examen en commission."/></div>
      </div>
    </div>
    <div className="card" style={{marginTop:16}}><button className="btn primary" onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?" Rédaction en cours…":" Générer le document"}</button>{error&&<div className="notice" style={{marginTop:12}}>{error}</div>}</div>
    {document&&<div className="card" style={{marginTop:16}}>
      <div className="toolbar" style={{marginTop:0}}><div><div className="eyebrow">Document généré</div><h2>{document.title}</h2>{document.subject&&<p className="muted"><b>Objet :</b> {document.subject}</p>}</div><button className="btn dark" onClick={copyDocument}><Copy size={16}/>{copied?" Copié":" Copier"}</button></div>
      <div style={{whiteSpace:"pre-wrap",lineHeight:1.65,fontSize:15}}>{document.content}</div>
      {!!document.key_points?.length&&<div className="card" style={{marginTop:16}}><h3>Points clés</h3><ul>{document.key_points.map((point,i)=><li key={i}>{point}</li>)}</ul></div>}
      {!!document.sources?.length&&<div style={{marginTop:16}}><h3>Sources utilisées</h3><div className="list">{document.sources.map((source,i)=><div className="row" key={`${source.url}-${i}`}><span><FileText size={15} style={{marginRight:6,verticalAlign:"middle"}}/>{source.title}</span>{source.url&&<a className="small" href={source.url} target="_blank" rel="noreferrer">Lire la source</a>}</div>)}</div></div>}
    </div>}
  </>;
}
