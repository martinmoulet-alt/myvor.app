"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {Copy,Download,FileText,Save,Sparkles,Trash2} from "lucide-react";
import {listProductions,saveProduction} from "@/lib/productions";
import {filterPresentableLines,filterPresentableStrings,presentableText} from "@/lib/presentation";
import {clearBuilderDraft,readBuilderDraft,writeBuilderDraft} from "@/lib/builderDraft";
import {supabase} from "@/lib/supabase";
import styles from "./BuilderCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type BuiltDocument={title:string;subject:string;content:string;key_points:string[];sources:{title:string;url:string}[]};

const formats=[
  ["note-client","Note stratégique"],
  ["synthese","Note de synthèse"],
  ["email","E-mail client"],
  ["rendez-vous","Brief rendez-vous"],
  ["argumentaire","Argumentaire"],
  ["elements-langage","Éléments de langage"],
] as const;

async function edgeFunctionError(error:any){const fallback=String(error?.message||"La fonction Supabase note-builder a échoué.");const response=error?.context;if(!response)return fallback;try{const payload=await response.clone().json();return String(payload?.error||fallback);}catch{return fallback;}}
function escapeHtml(value:unknown){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]||char));}
function contentParagraphs(content:string){return String(content||"").split(/\n+/).map(line=>line.trim()).filter(Boolean);}
function sanitizeDocument(document:BuiltDocument):BuiltDocument{return{title:presentableText(document?.title)||"Document généré",subject:presentableText(document?.subject),content:filterPresentableLines(document?.content),key_points:filterPresentableStrings(document?.key_points),sources:(Array.isArray(document?.sources)?document.sources:[]).map(source=>({title:presentableText(source?.title),url:String(source?.url||"").trim()})).filter(source=>source.title)};}
function documentBodyHtml(content:string){return contentParagraphs(content).map(line=>{const bullet=/^[-•]\s+/.test(line);const heading=!bullet&&line.length<=90&&/:$/.test(line);const text=escapeHtml(line.replace(/^[-•]\s+/,""));if(bullet)return `<div class="bullet"><span>•</span><p>${text}</p></div>`;if(heading)return `<h2>${text.replace(/:$/,"")}</h2>`;return `<p>${text}</p>`;}).join("");}

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
  const [draftMessage,setDraftMessage]=useState("");
  const [copied,setCopied]=useState(false);
  const hydratedDraft=useRef("");
  const draftTimer=useRef<number|null>(null);
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);

  useEffect(()=>{
    if(!dossierId||hydratedDraft.current===dossierId)return;
    hydratedDraft.current=dossierId;
    const draft=readBuilderDraft(dossierId);
    if(!draft){setDraftMessage("");return;}
    setFormat(draft.format||"note-client");setAudience(draft.audience||"Client");setTone(draft.tone||"professionnel et direct");setInstruction(draft.instruction||"");setDocument(draft.document?sanitizeDocument(draft.document):null);
    setDraftMessage("Brouillon repris automatiquement.");
  },[dossierId]);

  useEffect(()=>{
    if(!dossierId||hydratedDraft.current!==dossierId)return;
    if(draftTimer.current)window.clearTimeout(draftTimer.current);
    draftTimer.current=window.setTimeout(()=>{
      const saved=writeBuilderDraft({version:1,saved_at:new Date().toISOString(),dossier_id:dossierId,format,audience,tone,instruction,document});
      setDraftMessage(saved?"Brouillon sauvegardé automatiquement.":"Sauvegarde locale indisponible.");
    },700);
    return()=>{if(draftTimer.current)window.clearTimeout(draftTimer.current);};
  },[dossierId,format,audience,tone,instruction,document]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}if(!supabase){setError("Supabase n’est pas configuré.");return;}
    setLoading(true);setError("");setSaveMessage("");setCopied(false);
    try{
      const {data:productions,error:productionsError}=await listProductions(dossier.id);if(productionsError)throw new Error(`Impossible de récupérer les analyses du dossier : ${productionsError.message}`);
      const latestImpact=productions.find(item=>item.type==="impact")?.content||null;const latestRadar=productions.find(item=>item.type==="radar")?.content||null;
      const {data:payload,error:invokeError}=await supabase.functions.invoke("note-builder",{body:{dossier,items:related,format,audience,tone,instruction,impact:latestImpact,radar:latestRadar}});
      if(invokeError)throw new Error(await edgeFunctionError(invokeError));if(payload?.error)throw new Error(String(payload.error));if(!payload?.document)throw new Error("Le Note Builder n’a renvoyé aucun document.");
      const nextDocument=sanitizeDocument(payload.document as BuiltDocument);setDocument(nextDocument);
      const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:nextDocument.title||`Document — ${dossier.title}`,content:{document:nextDocument,format,audience,tone,instruction,item_ids:related.map(i=>i.id),context_used:payload.context_used||null,engine:payload.engine||"supabase-note-builder"}});
      setSaveMessage(saved.error?`Document généré, mais non enregistré : ${saved.error.message}`:"Document enregistré dans l’historique du dossier.");
    }catch(err:any){const message=String(err?.message||"");setError(message.includes("Failed to send a request")?"Impossible de joindre la fonction Supabase note-builder. Le brouillon reste sauvegardé.":message||"Génération impossible");}finally{setLoading(false);}
  }

  async function saveCurrent(){
    if(!document||!dossier)return;
    const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:document.title||`Document — ${dossier.title}`,content:{document,format,audience,tone,instruction,item_ids:related.map(i=>i.id),engine:"note-builder-editor"}});
    setSaveMessage(saved.error?`Enregistrement impossible : ${saved.error.message}`:"Modifications enregistrées dans le dossier.");
  }

  async function copyDocument(){if(!document)return;const text=[document.title,document.subject?`Objet : ${document.subject}`:"",document.content,document.key_points?.length?`\nPoints clés\n${document.key_points.map(x=>`• ${x}`).join("\n")}`:""].filter(Boolean).join("\n\n");try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setError("La copie a été bloquée par le navigateur.");}}

  function exportPdf(){
    if(!document||!dossier)return;
    setError("");
    const points=document.key_points?.length?`<section><h2>Points clés</h2><ul>${document.key_points.map(point=>`<li>${escapeHtml(point)}</li>`).join("")}</ul></section>`:"";
    const sources=document.sources?.length?`<section><h2>Sources utilisées</h2>${document.sources.map(source=>`<div class="source"><span>${escapeHtml(source.title)}</span>${source.url?`<small>${escapeHtml(source.url)}</small>`:""}</div>`).join("")}</section>`:"";
    const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>@page{size:A4;margin:17mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#14213d;font-size:11.5px;line-height:1.62}.top{display:flex;justify-content:space-between;border-bottom:2px solid #d5a83e;padding-bottom:12px;margin-bottom:22px}.brand{font-size:18px;font-weight:900;color:#071936}.meta{text-align:right;color:#6b778c;font-size:9.5px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:#a57b17;font-size:9px;font-weight:800}.hero h1{font-size:22px;line-height:1.25;margin:6px 0 10px}.subject,section{background:#f7f8fb;border:1px solid #e2e6ef;border-radius:8px;padding:10px;margin-top:12px}.body p{margin:0 0 12px}.body h2{font-size:13px;margin:18px 0 7px}.bullet{display:grid;grid-template-columns:12px 1fr;gap:5px}.bullet p{margin:0}.source{display:grid;gap:2px;padding:6px 0}.source small{color:#7b8798;overflow-wrap:anywhere}section{break-inside:avoid}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="top"><div><div class="brand">MYVOR</div><div class="eyebrow">Note Builder</div></div><div class="meta"><div>${escapeHtml(dossier.client)}</div><div>${escapeHtml(new Date().toLocaleDateString("fr-FR"))}</div></div></div><div class="hero"><div class="eyebrow">Document opérationnel</div><h1>${escapeHtml(document.title)}</h1>${document.subject?`<div class="subject"><strong>Objet :</strong> ${escapeHtml(document.subject)}</div>`:""}</div><div class="body">${documentBodyHtml(document.content)}</div>${points}${sources}</body></html>`;
    const frame=document.createElement("iframe");
    frame.setAttribute("aria-hidden","true");
    frame.style.position="fixed";frame.style.right="0";frame.style.bottom="0";frame.style.width="1px";frame.style.height="1px";frame.style.border="0";frame.style.opacity="0";frame.style.pointerEvents="none";
    document.body.appendChild(frame);
    const printWindow=frame.contentWindow;const printDocument=frame.contentDocument||printWindow?.document;
    if(!printWindow||!printDocument){frame.remove();setError("Impossible de préparer l’export PDF sur ce navigateur.");return;}
    try{
      printDocument.open();printDocument.write(html);printDocument.close();
      const runPrint=()=>{try{printWindow.focus();printWindow.print();window.setTimeout(()=>frame.remove(),1200);}catch{frame.remove();setError("L’export PDF n’a pas pu s’ouvrir. Réessaie depuis Safari ou Chrome.");}};
      if(printDocument.readyState==="complete")window.setTimeout(runPrint,250);else frame.onload=()=>window.setTimeout(runPrint,150);
    }catch{frame.remove();setError("L’export PDF n’a pas pu être préparé.");}
  }

  function discardDraft(){if(!dossierId)return;clearBuilderDraft(dossierId);setInstruction("");setDocument(null);setDraftMessage("Brouillon supprimé.");setError("");setSaveMessage("");}
  function patchDocument(patch:Partial<BuiltDocument>){setDocument(current=>current?{...current,...patch}:current);}

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.kicker}>Production opérationnelle</div><h1>Note Builder</h1><p>Transformez les analyses Myvor en livrables prêts à envoyer.</p></div><div className={styles.statusPill}>IA contextualisée</div></header>

    <div className={styles.workspace}>
      <aside className={styles.contextColumn}>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Contexte</span><b>01</b></div><div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);hydratedDraft.current="";setDocument(null);setError("");setSaveMessage("");setDraftMessage("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<div className={styles.contextCard}><small>Objectif client</small><strong>{dossier.objective||"Objectif non renseigné"}</strong></div>}</section>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Sources mobilisées</span><b>{related.length}</b></div><div className={styles.sourceStack}>{related.slice(0,5).map(item=><div className={styles.sourceMini} key={item.id}><FileText size={14}/><div><strong>{item.title}</strong><small>{item.nature||"Veille institutionnelle"}</small></div></div>)}{!related.length&&<div className={styles.empty}>Aucune source liée à ce dossier.</div>}</div></section>
        {draftMessage&&<div className={styles.draftState}>{draftMessage}</div>}
      </aside>

      <main className={styles.editorColumn}>
        <section className={styles.editorCard}>
          <div className={styles.editorToolbar}><div><span className={styles.eyebrow}>Éditeur</span><strong>{document?"Document généré":"Nouveau document"}</strong></div><div className={styles.documentActions}>{document&&<><button className={styles.secondary} onClick={saveCurrent}><Save size={15}/>Enregistrer</button><button className={styles.secondary} onClick={copyDocument}><Copy size={15}/>{copied?"Copié":"Copier"}</button><button className={styles.primarySmall} onClick={exportPdf}><Download size={15}/>PDF</button></>}</div></div>
          {!document?<div className={styles.editorEmpty}><div className={styles.spark}><Sparkles size={22}/></div><h2>Votre document apparaîtra ici</h2><p>Myvor utilisera le dossier, la veille liée, la Note d’impact et le Radar d’influence disponibles.</p><button onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":"Générer le document"}</button></div>:<div className={styles.editorFields}><input className={styles.titleInput} value={document.title} onChange={e=>patchDocument({title:e.target.value})}/><input className={styles.subjectInput} value={document.subject} onChange={e=>patchDocument({subject:e.target.value})} placeholder="Objet du document"/><textarea className={styles.contentEditor} value={document.content} onChange={e=>patchDocument({content:e.target.value})}/>{!!document.key_points?.length&&<div className={styles.points}><h3>Points clés</h3>{document.key_points.map((point,index)=><div key={index}>• {point}</div>)}</div>}{!!document.sources?.length&&<div className={styles.sources}><h3>Sources</h3>{document.sources.map((source,index)=><div className={styles.sourceRow} key={`${source.url}-${index}`}><span><FileText size={14}/>{source.title}</span>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">Ouvrir</a>}</div>)}</div>}</div>}
        </section>
        {error&&<div className={styles.error}>{error}</div>}{saveMessage&&<div className={styles.success}>{saveMessage}</div>}
      </main>

      <aside className={styles.settingsColumn}>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Paramètres</span><b>02</b></div><div className={styles.field}><label>Type de document</label><div className={styles.formats}>{formats.map(([id,label])=><button type="button" key={id} className={`${styles.formatButton} ${format===id?styles.active:""}`} onClick={()=>setFormat(id)}>{label}</button>)}</div></div><div className={styles.field}><label>Destinataire</label><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Client, député, cabinet…"/></div><div className={styles.field}><label>Ton</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>professionnel et direct</option><option>institutionnel et diplomatique</option><option>convaincant et offensif</option><option>pédagogique et synthétique</option></select></div><div className={styles.field}><label>Instructions complémentaires</label><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Ex. Insister sur le coût économique et proposer un rendez-vous avant l’examen en commission."/></div><button className={styles.generateButton} onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":document?"Régénérer":"Générer le document"}</button>{dossierId&&<button className={styles.clearButton} type="button" onClick={discardDraft}><Trash2 size={15}/>Effacer le brouillon</button>}</section>
      </aside>
    </div>
  </div>;
}
