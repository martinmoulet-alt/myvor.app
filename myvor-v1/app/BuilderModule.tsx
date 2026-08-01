"use client";

import { useMemo,useState } from "react";
import { Copy,FileText,Sparkles } from "lucide-react";
import { listProductions,saveProduction } from "@/lib/productions";
import { supabase } from "@/lib/supabase";
import styles from "./BuilderCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type BuiltDocument={title:string;subject:string;content:string;key_points:string[];sources:{title:string;url:string}[]};

const formats=[
  ["note-client","Note client"],
  ["argumentaire","Argumentaire"],
  ["email","E-mail"],
  ["rendez-vous","Préparation de rendez-vous"],
] as const;

async function edgeFunctionError(error:any){
  const fallback=String(error?.message||"La fonction Supabase note-builder a échoué.");
  const response=error?.context;
  if(!response)return fallback;
  try{
    const payload=await response.clone().json();
    return String(payload?.error||fallback);
  }catch{return fallback;}
}

export default function BuilderModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[]}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [format,setFormat]=useState("note-client");
  const [audience,setAudience]=useState("Client");
  const [tone,setTone]=useState("professionnel et direct");
  const [instruction,setInstruction]=useState("");
  const [document,setDocument]=useState<BuiltDocument|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [saveMessage,setSaveMessage]=useState("");
  const [copied,setCopied]=useState(false);
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}
    if(!supabase){setError("Supabase n’est pas configuré.");return;}
    setLoading(true);setError("");setSaveMessage("");setDocument(null);setCopied(false);
    try{
      const {data:productions,error:productionsError}=await listProductions(dossier.id);
      if(productionsError)throw new Error(`Impossible de récupérer les analyses du dossier : ${productionsError.message}`);

      const latestImpact=productions.find(item=>item.type==="impact")?.content||null;
      const latestRadar=productions.find(item=>item.type==="radar")?.content||null;

      const {data:payload,error:invokeError}=await supabase.functions.invoke("note-builder",{
        body:{dossier,items:related,format,audience,tone,instruction,impact:latestImpact,radar:latestRadar},
      });

      if(invokeError)throw new Error(await edgeFunctionError(invokeError));
      if(payload?.error)throw new Error(String(payload.error));
      if(!payload?.document)throw new Error("Le Note Builder n’a renvoyé aucun document.");

      const nextDocument=payload.document as BuiltDocument;
      setDocument(nextDocument);

      const saved=await saveProduction({
        dossier_id:dossier.id,
        type:"builder",
        title:nextDocument.title||`Document — ${dossier.title}`,
        content:{
          document:nextDocument,
          format,
          audience,
          tone,
          instruction,
          item_ids:related.map(i=>i.id),
          context_used:payload.context_used||null,
          engine:payload.engine||"supabase-note-builder",
        },
      });

      const contextUsed=payload.context_used||{};
      const contextParts=[
        `${Number(contextUsed.watch_items)||related.length} élément(s) de veille`,
        contextUsed.impact?"dernière Note d’impact":null,
        contextUsed.radar?"dernier Radar d’influence":null,
      ].filter(Boolean).join(" + ");
      const savedText=saved.error?`Document généré, mais non enregistré : ${saved.error.message}`:"Document enregistré dans l’historique du dossier.";
      setSaveMessage(`${savedText} Moteur Supabase actif. Contexte utilisé : ${contextParts}.`);
    }catch(err:any){
      const message=String(err?.message||"");
      setError(message.includes("Failed to send a request")?"Impossible de joindre la fonction Supabase note-builder. Vérifie qu’elle est bien déployée.":message||"Génération impossible");
    }finally{setLoading(false);}
  }

  async function copyDocument(){
    if(!document)return;
    const text=[document.title,document.subject?`Objet : ${document.subject}`:"",document.content,document.key_points?.length?`\nPoints clés\n${document.key_points.map(x=>`• ${x}`).join("\n")}`:""].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);setTimeout(()=>setCopied(false),1800);
  }

  return <div className={styles.page}>
    <div className={styles.head}><div><div className={styles.kicker}>Production opérationnelle</div><h1>Note Builder</h1><p>Transformez un dossier et sa veille en document immédiatement exploitable.</p></div></div>

    <div className={styles.setup}>
      <section className={styles.panel}>
        <h2>1. Choisir la base</h2>
        <div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setDocument(null);setError("");setSaveMessage("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>
        {dossier&&<div className={styles.summary}><b>Objectif client :</b><br/>{dossier.objective}<br/><br/><b>Textes liés :</b> {related.length}</div>}
      </section>

      <section className={styles.panel}>
        <h2>2. Paramétrer le document</h2>
        <div className={styles.formats}>{formats.map(([id,label])=><button type="button" key={id} className={`${styles.formatButton} ${format===id?styles.active:""}`} onClick={()=>setFormat(id)}>{label}</button>)}</div>
        <div className={styles.field}><label>Public visé</label><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Client, député, cabinet ministériel…"/></div>
        <div className={styles.field}><label>Ton</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>professionnel et direct</option><option>institutionnel et diplomatique</option><option>convaincant et offensif</option><option>pédagogique et synthétique</option></select></div>
        <div className={styles.field}><label>Instruction complémentaire</label><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Ex. Insister sur le coût économique et proposer un rendez-vous avant l’examen en commission."/></div>
      </section>
    </div>

    <div className={styles.generate}><div><h3>Prêt à rédiger</h3><p>{related.length} texte(s) lié(s) au dossier sélectionné.</p></div><button onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":"Générer le document"}</button></div>
    {error&&<div className={styles.error}>{error}</div>}{saveMessage&&<div className={styles.error}>{saveMessage}</div>}

    {document&&<section className={styles.document}>
      <div className={styles.documentHead}><div><div className={styles.eyebrow}>Document généré</div><h2>{document.title}</h2>{document.subject&&<div className={styles.subject}><b>Objet :</b> {document.subject}</div>}</div><button className={styles.copy} onClick={copyDocument}><Copy size={16}/>{copied?"Copié":"Copier"}</button></div>
      <div className={styles.content}>{document.content}</div>
      {!!document.key_points?.length&&<div className={styles.points}><h3>Points clés</h3><ul>{document.key_points.map((point,index)=><li key={index}>{point}</li>)}</ul></div>}
      {!!document.sources?.length&&<div className={styles.sources}><h3>Sources utilisées</h3>{document.sources.map((source,index)=><div className={styles.sourceRow} key={`${source.url}-${index}`}><span><FileText size={15}/>{source.title}</span>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">Lire la source</a>}</div>)}</div>}
    </section>}
  </div>;
}
