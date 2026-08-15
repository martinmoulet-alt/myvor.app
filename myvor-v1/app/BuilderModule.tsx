"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {Copy,Download,FileText,Save,Sparkles,Trash2,WandSparkles,Scissors,MessageSquareText,ShieldCheck,FileDown} from "lucide-react";
import {listProductions,saveProduction} from "@/lib/productions";
import {filterPresentableLines,filterPresentableStrings,presentableText} from "@/lib/presentation";
import {clearBuilderDraft,readBuilderDraft,writeBuilderDraft} from "@/lib/builderDraft";
import {supabase} from "@/lib/supabase";
import styles from "./BuilderCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type BuiltDocument={title:string;subject:string;content:string;key_points:string[];sources:{title:string;url:string}[]};
type EditAction="reformulate"|"shorten"|"strengthen"|"diplomatic";
type ReviewStatus="generated"|"reviewed"|"validated";

const formats=[
  ["note-client","Note stratégique"],
  ["synthese","Note de synthèse"],
  ["email","E-mail client"],
  ["rendez-vous","Brief rendez-vous"],
  ["argumentaire","Argumentaire"],
  ["elements-langage","Éléments de langage"],
] as const;

const NOTE_BUILDER_OUTPUT_STANDARD=[
  "STANDARD DE SORTIE MYVOR — À RESPECTER IMPÉRATIVEMENT.",
  "Le champ subject est obligatoire : il doit contenir un objet court, précis et directement réutilisable.",
  "Le document doit être immédiatement exploitable : jamais de gros bloc continu.",
  "Sépare chaque partie par une ligne vide. Chaque intitulé de partie doit être seul sur sa ligne et se terminer par deux-points, par exemple « Situation : », « Ce qui change : », « Impact pour le client : », « Niveau d’urgence : », « Recommandation : », « Actions à engager : », « Échéance : » lorsque ces rubriques sont pertinentes pour le format demandé.",
  "Pour un e-mail, conserve une structure naturelle d’e-mail mais sépare clairement les paragraphes par une ligne vide et fais ressortir le message clé, l’impact et la prochaine action.",
  "Mets uniquement les informations réellement décisives entre doubles astérisques **comme ceci** afin qu’elles soient rendues en gras : changement juridique majeur, date ou échéance, chiffre déterminant, risque/opportunité majeur, décision recommandée, action prioritaire ou acteur clé.",
  "N’utilise pas le gras sur des phrases entières par défaut et n’en abuse pas : 1 à 3 mises en évidence maximum par partie.",
  "La recommandation doit être visible immédiatement et formulée comme une décision ou une action concrète.",
].join("\n");

const editActions:{id:EditAction;label:string;icon:any}[]=[
  {id:"reformulate",label:"Reformuler",icon:WandSparkles},
  {id:"shorten",label:"Raccourcir",icon:Scissors},
  {id:"strengthen",label:"Renforcer",icon:MessageSquareText},
  {id:"diplomatic",label:"Plus diplomatique",icon:ShieldCheck},
];

async function edgeFunctionError(error:any){const fallback=String(error?.message||"La fonction Supabase note-builder a échoué.");const response=error?.context;if(!response)return fallback;try{const payload=await response.clone().json();return String(payload?.error||fallback);}catch{return fallback;}}
function escapeHtml(value:unknown){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]||char));}
function richInlineHtml(value:unknown){return escapeHtml(value).replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>");}
function stripBoldMarkers(value:unknown){return String(value??"").replace(/\*\*([^*\n]+)\*\*/g,"$1");}
function contentParagraphs(content:string){return String(content||"").split(/\n+/).map(line=>line.trim()).filter(Boolean);}
function sanitizeDocument(document:BuiltDocument):BuiltDocument{const title=presentableText(document?.title)||"Document généré";return{title,subject:presentableText(document?.subject)||title,content:filterPresentableLines(document?.content),key_points:filterPresentableStrings(document?.key_points),sources:(Array.isArray(document?.sources)?document.sources:[]).map(source=>({title:presentableText(source?.title),url:String(source?.url||"").trim()})).filter(source=>source.title)};}
function documentBodyHtml(content:string){return contentParagraphs(content).map(line=>{const bullet=/^[-•]\s+/.test(line);const heading=!bullet&&line.length<=90&&/:$/.test(line);const text=richInlineHtml(line.replace(/^[-•]\s+/,""));if(bullet)return `<div class="bullet" style="display:grid;grid-template-columns:12px 1fr;gap:6px;margin:0 0 10px"><span>•</span><p style="margin:0">${text}</p></div>`;if(heading)return `<h2 style="font-size:13px;line-height:1.35;margin:22px 0 8px;color:#071936">${text.replace(/:$/,"")}</h2>`;return `<p style="margin:0 0 14px">${text}</p>`;}).join("");}
function slug(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"document-myvor";}
function reviewLabel(status:ReviewStatus){return status==="validated"?"Validé humainement":status==="reviewed"?"Vérifié — validation finale requise":"Généré — vérification requise";}

export default function BuilderModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[]}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [format,setFormat]=useState("note-client");
  const [audience,setAudience]=useState("Client");
  const [tone,setTone]=useState("professionnel et direct");
  const [instruction,setInstruction]=useState("");
  const [document,setDocument]=useState<BuiltDocument|null>(null);
  const [loading,setLoading]=useState(false);
  const [editing,setEditing]=useState<EditAction|null>(null);
  const [selection,setSelection]=useState({start:0,end:0,text:""});
  const [error,setError]=useState("");
  const [saveMessage,setSaveMessage]=useState("");
  const [draftMessage,setDraftMessage]=useState("");
  const [copied,setCopied]=useState(false);
  const [reviewStatus,setReviewStatus]=useState<ReviewStatus>("generated");
  const [generatedAt,setGeneratedAt]=useState<string|null>(null);
  const [reviewedAt,setReviewedAt]=useState<string|null>(null);
  const [validatedAt,setValidatedAt]=useState<string|null>(null);
  const hydratedDraft=useRef("");
  const draftTimer=useRef<number|null>(null);
  const titleRef=useRef<HTMLTextAreaElement|null>(null);
  const contentRef=useRef<HTMLTextAreaElement|null>(null);
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);

  function resizeTitle(){const el=titleRef.current;if(!el)return;el.style.height="auto";el.style.height=`${Math.max(el.scrollHeight,42)}px`;}
  function resizeEditor(){const el=contentRef.current;if(!el)return;el.style.height="auto";el.style.height=`${Math.max(el.scrollHeight,430)}px`;}
  function reviewPayload(status=reviewStatus){return{status,generated_at:generatedAt||new Date().toISOString(),reviewed_at:reviewedAt,validated_at:validatedAt};}
  function invalidateReview(){setReviewStatus("generated");setReviewedAt(null);setValidatedAt(null);}

  useEffect(()=>{
    if(!dossierId||hydratedDraft.current===dossierId)return;
    hydratedDraft.current=dossierId;
    const draft=readBuilderDraft(dossierId);
    if(!draft){setDraftMessage("");return;}
    setFormat(draft.format||"note-client");setAudience(draft.audience||"Client");setTone(draft.tone||"professionnel et direct");setInstruction(draft.instruction||"");setDocument(draft.document?sanitizeDocument(draft.document):null);invalidateReview();
    setDraftMessage("Brouillon repris automatiquement. Une nouvelle validation humaine est requise avant export.");
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

  useEffect(()=>{if(!document)return;window.requestAnimationFrame(()=>{resizeTitle();resizeEditor();});},[document?.title,document?.content]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}if(!supabase){setError("Supabase n’est pas configuré.");return;}
    setLoading(true);setError("");setSaveMessage("");setCopied(false);
    try{
      const {data:productions,error:productionsError}=await listProductions(dossier.id);if(productionsError)throw new Error(`Impossible de récupérer les analyses du dossier : ${productionsError.message}`);
      const latestImpact=productions.find(item=>item.type==="impact")?.content||null;const latestRadar=productions.find(item=>item.type==="radar")?.content||null;
      const generationInstruction=[NOTE_BUILDER_OUTPUT_STANDARD,instruction.trim()?`INSTRUCTION COMPLÉMENTAIRE DE L’UTILISATEUR :\n${instruction.trim()}`:""] .filter(Boolean).join("\n\n");
      const {data:payload,error:invokeError}=await supabase.functions.invoke("note-builder",{body:{dossier,items:related,format,audience,tone,instruction:generationInstruction,impact:latestImpact,radar:latestRadar}});
      if(invokeError)throw new Error(await edgeFunctionError(invokeError));if(payload?.error)throw new Error(String(payload.error));if(!payload?.document)throw new Error("Le Note Builder n’a renvoyé aucun document.");
      const nextDocument=sanitizeDocument(payload.document as BuiltDocument);const now=new Date().toISOString();setDocument(nextDocument);setSelection({start:0,end:0,text:""});setGeneratedAt(now);setReviewedAt(null);setValidatedAt(null);setReviewStatus("generated");
      const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:nextDocument.title||`Document — ${dossier.title}`,content:{document:nextDocument,format,audience,tone,instruction,item_ids:related.map(i=>i.id),context_used:payload.context_used||null,engine:payload.engine||"supabase-note-builder",model:payload.model||null,review:{status:"generated",generated_at:now,reviewed_at:null,validated_at:null}}});
      setSaveMessage(saved.error?`Document généré, mais non enregistré : ${saved.error.message}`:"Document enregistré. Vérification humaine requise avant export.");
    }catch(err:any){const message=String(err?.message||"");setError(message.includes("Failed to send a request")?"Impossible de joindre la fonction Supabase note-builder. Le brouillon reste sauvegardé.":message||"Génération impossible");}finally{setLoading(false);}
  }

  async function applyEdit(action:EditAction){
    if(!document||!supabase)return;
    const textarea=contentRef.current;const start=textarea?.selectionStart??selection.start;const end=textarea?.selectionEnd??selection.end;const selected=document.content.slice(start,end).trim();
    if(!selected){setError("Sélectionne d’abord un passage dans la note, puis choisis une action IA.");textarea?.focus();return;}
    setEditing(action);setError("");setSaveMessage("");
    try{
      const {data:payload,error:invokeError}=await supabase.functions.invoke("note-builder",{body:{mode:"edit",action,selected_text:selected,surrounding_text:document.content}});
      if(invokeError)throw new Error(await edgeFunctionError(invokeError));if(payload?.error)throw new Error(String(payload.error));const replacement=String(payload?.text||"").trim();if(!replacement)throw new Error("La réécriture n’a renvoyé aucun texte.");
      const next=document.content.slice(0,start)+replacement+document.content.slice(end);patchDocument({content:next});setSelection({start,end:start+replacement.length,text:replacement});invalidateReview();
      window.setTimeout(()=>{const el=contentRef.current;if(el){resizeEditor();el.focus();el.setSelectionRange(start,start+replacement.length);}},40);
      setSaveMessage("Passage réécrit. La validation humaine doit être refaite avant export.");
    }catch(err:any){setError(String(err?.message||"Réécriture impossible."));}finally{setEditing(null);}
  }

  async function saveCurrent(){
    if(!document||!dossier)return;
    const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:document.title||`Document — ${dossier.title}`,content:{document,format,audience,tone,instruction,item_ids:related.map(i=>i.id),engine:"note-builder-editor",review:reviewPayload()}});
    setSaveMessage(saved.error?`Enregistrement impossible : ${saved.error.message}`:"Modifications enregistrées dans le dossier.");
  }

  async function markReviewed(){
    if(!document||!dossier)return;const now=new Date().toISOString();setReviewStatus("reviewed");setReviewedAt(now);setValidatedAt(null);
    const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:document.title||`Document — ${dossier.title}`,content:{document,format,audience,tone,instruction,item_ids:related.map(i=>i.id),engine:"note-builder-editor",review:{status:"reviewed",generated_at:generatedAt||now,reviewed_at:now,validated_at:null}}});
    setSaveMessage(saved.error?`Vérification marquée, mais enregistrement impossible : ${saved.error.message}`:"Document vérifié. Une validation finale est encore requise avant export.");
  }

  async function validateDocument(){
    if(!document||!dossier||reviewStatus!=="reviewed")return;const now=new Date().toISOString();let validatedBy:string|null=null;if(supabase){const {data}=await supabase.auth.getSession();validatedBy=data.session?.user?.id||null;}setReviewStatus("validated");setValidatedAt(now);
    const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:document.title||`Document — ${dossier.title}`,content:{document,format,audience,tone,instruction,item_ids:related.map(i=>i.id),engine:"note-builder-editor",review:{status:"validated",generated_at:generatedAt||now,reviewed_at:reviewedAt||now,validated_at:now,validated_by:validatedBy}}});
    setSaveMessage(saved.error?`Document validé localement, mais enregistrement impossible : ${saved.error.message}`:"Document validé humainement et prêt à être exporté.");
  }

  async function copyDocument(){
    if(!document)return;
    const plainContent=stripBoldMarkers(document.content);const text=[stripBoldMarkers(document.title),document.subject?`Objet : ${stripBoldMarkers(document.subject)}`:"",plainContent,document.key_points?.length?`\nPoints clés\n${document.key_points.map(x=>`• ${stripBoldMarkers(x)}`).join("\n")}`:""].filter(Boolean).join("\n\n");
    const html=`<h1>${richInlineHtml(document.title)}</h1><p><strong>Objet :</strong> ${richInlineHtml(document.subject)}</p><div>${documentBodyHtml(document.content)}</div>${document.key_points?.length?`<h2>Points clés</h2><ul>${document.key_points.map(point=>`<li>${richInlineHtml(point)}</li>`).join("")}</ul>`:""}`;
    try{
      if(typeof ClipboardItem!=="undefined"&&navigator.clipboard?.write){const item=new ClipboardItem({"text/plain":new Blob([text],{type:"text/plain"}),"text/html":new Blob([html],{type:"text/html"})});await navigator.clipboard.write([item]);}else{await navigator.clipboard.writeText(text);}
      setCopied(true);setTimeout(()=>setCopied(false),1800);
    }catch{try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setError("La copie a été bloquée par le navigateur.");}}
  }

  function exportPdf(){
    if(!document||!dossier)return;if(reviewStatus!=="validated"){setError("Validez humainement le document avant export.");return;}setError("");
    const points=document.key_points?.length?`<section><h2>Points clés</h2><ul>${document.key_points.map(point=>`<li>${richInlineHtml(point)}</li>`).join("")}</ul></section>`:"";
    const sources=document.sources?.length?`<section><h2>Sources utilisées</h2>${document.sources.map((source,index)=>`<div class="source"><strong>[${index+1}] ${escapeHtml(source.title)}</strong>${source.url?`<small>${escapeHtml(source.url)}</small>`:""}</div>`).join("")}</section>`:"";
    const compliance=`<section class="compliance"><h2>Traçabilité IA</h2><p>Analyse assistée par IA via Myvor. Document vérifié et validé humainement avant export.</p><small>Statut: validated · Généré: ${escapeHtml(generatedAt||"")} · Validé: ${escapeHtml(validatedAt||"")}</small></section>`;
    const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="myvor-ai-assisted" content="true"><meta name="myvor-human-review" content="validated"><meta name="myvor-generated-at" content="${escapeHtml(generatedAt||"")}"><meta name="myvor-validated-at" content="${escapeHtml(validatedAt||"")}"><title>${escapeHtml(document.title)}</title><style>@page{size:A4;margin:17mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#14213d;font-size:11.5px;line-height:1.62}.top{display:flex;justify-content:space-between;border-bottom:2px solid #d5a83e;padding-bottom:12px;margin-bottom:22px}.brand{font-size:18px;font-weight:900;color:#071936}.meta{text-align:right;color:#6b778c;font-size:9.5px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;color:#a57b17;font-size:9px;font-weight:800}.hero h1{font-size:22px;line-height:1.25;margin:6px 0 10px}.subject,section{background:#f7f8fb;border:1px solid #e2e6ef;border-radius:8px;padding:10px;margin-top:12px}.compliance{border-color:#d5a83e;background:#fffaf0}.body p{margin:0 0 14px}.body h2{font-size:13px;margin:22px 0 8px}.body strong{font-weight:800;color:#071936}.bullet{display:grid;grid-template-columns:12px 1fr;gap:5px}.bullet p{margin:0}.source{display:grid;gap:2px;padding:6px 0}.source small{color:#7b8798;overflow-wrap:anywhere}section{break-inside:avoid}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class="top"><div><div class="brand">MYVOR</div><div class="eyebrow">Note Builder</div></div><div class="meta"><div>${escapeHtml(dossier.client)}</div><div>${escapeHtml(new Date().toLocaleDateString("fr-FR"))}</div><div>Validé humainement</div></div></div><div class="hero"><div class="eyebrow">Document opérationnel</div><h1>${richInlineHtml(document.title)}</h1><div class="subject"><strong>Objet :</strong> ${richInlineHtml(document.subject)}</div></div><div class="body">${documentBodyHtml(document.content)}</div>${points}${sources}${compliance}</body></html>`;
    const frame=window.document.createElement("iframe");frame.setAttribute("aria-hidden","true");frame.style.position="fixed";frame.style.right="0";frame.style.bottom="0";frame.style.width="1px";frame.style.height="1px";frame.style.border="0";frame.style.opacity="0";frame.style.pointerEvents="none";window.document.body.appendChild(frame);
    const printWindow=frame.contentWindow;const printDocument=frame.contentDocument||printWindow?.document;if(!printWindow||!printDocument){frame.remove();setError("Impossible de préparer l’export PDF sur ce navigateur.");return;}
    try{printDocument.open();printDocument.write(html);printDocument.close();const runPrint=()=>{try{printWindow.focus();printWindow.print();window.setTimeout(()=>frame.remove(),1200);}catch{frame.remove();setError("L’export PDF n’a pas pu s’ouvrir. Réessaie depuis Safari ou Chrome.");}};if(printDocument.readyState==="complete")window.setTimeout(runPrint,250);else frame.onload=()=>window.setTimeout(runPrint,150);}catch{frame.remove();setError("L’export PDF n’a pas pu être préparé.");}
  }

  function exportWord(){
    if(!document||!dossier)return;if(reviewStatus!=="validated"){setError("Validez humainement le document avant export.");return;}setError("");
    const sources=document.sources?.length?`<h2>Sources utilisées</h2><ol>${document.sources.map(source=>`<li><strong>${escapeHtml(source.title)}</strong>${source.url?`<br><span>${escapeHtml(source.url)}</span>`:""}</li>`).join("")}</ol>`:"";
    const compliance=`<h2>Traçabilité IA</h2><p>Analyse assistée par IA via Myvor. Document vérifié et validé humainement avant export.</p><p class="meta">Statut: validated · Généré: ${escapeHtml(generatedAt||"")} · Validé: ${escapeHtml(validatedAt||"")}</p>`;
    const html=`<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="fr"><head><meta charset="utf-8"><meta name="myvor-ai-assisted" content="true"><meta name="myvor-human-review" content="validated"><meta name="myvor-generated-at" content="${escapeHtml(generatedAt||"")}"><meta name="myvor-validated-at" content="${escapeHtml(validatedAt||"")}"><title>${escapeHtml(document.title)}</title><style>body{font-family:Arial,sans-serif;color:#14213d;line-height:1.55;margin:40px}h1{color:#071936;font-size:24px;border-bottom:2px solid #d0a740;padding-bottom:12px}h2{font-size:15px;color:#071936;margin-top:24px}.meta{color:#66758a;font-size:11px}.subject{background:#f4f6f9;padding:10px;margin:15px 0}.body p{margin:0 0 14px}.body strong{font-weight:700}li{margin-bottom:7px}</style></head><body><div class="meta">MYVOR — Note Builder · ${escapeHtml(dossier.client)} · ${escapeHtml(new Date().toLocaleDateString("fr-FR"))} · Validé humainement</div><h1>${richInlineHtml(document.title)}</h1><div class="subject"><strong>Objet :</strong> ${richInlineHtml(document.subject)}</div><div class="body">${documentBodyHtml(document.content)}</div>${document.key_points?.length?`<h2>Points clés</h2><ul>${document.key_points.map(point=>`<li>${richInlineHtml(point)}</li>`).join("")}</ul>`:""}${sources}${compliance}</body></html>`;
    const blob=new Blob(["\ufeff",html],{type:"application/msword"});const url=URL.createObjectURL(blob);const a=window.document.createElement("a");a.href=url;a.download=`${slug(document.title)}.doc`;window.document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function captureSelection(){if(!document)return;const el=contentRef.current;if(!el)return;const start=el.selectionStart||0;const end=el.selectionEnd||0;setSelection({start,end,text:document.content.slice(start,end)});}
  function discardDraft(){if(!dossierId)return;clearBuilderDraft(dossierId);setInstruction("");setDocument(null);setSelection({start:0,end:0,text:""});setDraftMessage("Brouillon supprimé.");setError("");setSaveMessage("");setGeneratedAt(null);invalidateReview();}
  function patchDocument(patch:Partial<BuiltDocument>){setDocument(current=>current?{...current,...patch}:current);invalidateReview();}

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.kicker}>Production opérationnelle</div><h1>Note Builder</h1><p>Transformez les décisions Myvor en livrables immédiatement exploitables.</p></div><div className={styles.statusPill}>Decision Engine · {reviewLabel(reviewStatus)}</div></header>

    <div className={styles.workspace}>
      <aside className={styles.contextColumn}>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Contexte</span><b>01</b></div><div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);hydratedDraft.current="";setDocument(null);setSelection({start:0,end:0,text:""});setError("");setSaveMessage("");setDraftMessage("");setGeneratedAt(null);invalidateReview();}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<div className={styles.contextCard}><small>Objectif client</small><strong>{dossier.objective||"Objectif non renseigné"}</strong></div>}</section>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Sources mobilisées</span><b>{related.length}</b></div><div className={styles.sourceStack}>{related.slice(0,5).map(item=><div className={styles.sourceMini} key={item.id}><FileText size={14}/><div><strong>{item.title}</strong><small>{item.nature||"Veille institutionnelle"}</small></div></div>)}{!related.length&&<div className={styles.empty}>Aucune source liée à ce dossier.</div>}</div></section>
        {draftMessage&&<div className={styles.draftState}>{draftMessage}</div>}
      </aside>

      <main className={styles.editorColumn}>
        <section className={styles.editorCard}>
          <div className={styles.editorToolbar}><div><span className={styles.eyebrow}>Éditeur</span><strong>{document?reviewLabel(reviewStatus):"Nouveau document"}</strong></div><div className={styles.documentActions}>{document&&<><button className={styles.secondary} onClick={saveCurrent}><Save size={15}/>Enregistrer</button><button className={styles.secondary} onClick={copyDocument}><Copy size={15}/>{copied?"Copié":"Copier"}</button>{reviewStatus==="generated"&&<button className={styles.secondary} onClick={markReviewed}><ShieldCheck size={15}/>Marquer vérifié</button>}{reviewStatus==="reviewed"&&<button className={styles.primarySmall} onClick={validateDocument}><ShieldCheck size={15}/>Valider</button>}<button className={styles.secondary} onClick={exportWord} disabled={reviewStatus!=="validated"}><FileDown size={15}/>Word</button><button className={styles.primarySmall} onClick={exportPdf} disabled={reviewStatus!=="validated"}><Download size={15}/>PDF</button></>}</div></div>
          {!document?<div className={styles.editorEmpty}><div className={styles.spark}><Sparkles size={22}/></div><h2>Votre document apparaîtra ici</h2><p>Myvor utilisera le dossier, la veille liée, le Score d’urgence, le Radar d’influence et la War Zone disponibles.</p><button onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":"Générer le document"}</button></div>:<div className={styles.editorFields}>
            <textarea ref={titleRef} rows={1} className={styles.titleInput} value={document.title} onChange={e=>{patchDocument({title:e.target.value});resizeTitle();}}/>
            <input className={styles.subjectInput} value={document.subject} onChange={e=>patchDocument({subject:e.target.value})} placeholder="Objet du document"/>
            {!!document.sources?.length&&<div className={styles.sourceBanner}><span><FileText size={14}/>{document.sources.length} sources vérifiables mobilisées</span><div>{document.sources.slice(0,3).map((source,index)=><a key={`${source.url}-${index}`} href={source.url||undefined} target={source.url?"_blank":undefined} rel="noreferrer">[{index+1}] {source.title}</a>)}</div></div>}
            <div style={{background:"#fff",border:"1px solid #e2e6ef",borderRadius:12,padding:"22px 24px",boxShadow:"0 8px 30px rgba(7,25,54,.05)"}}>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#9a741c",marginBottom:10}}>Aperçu du document</div>
              <div style={{fontSize:18,fontWeight:800,color:"#071936",lineHeight:1.35,marginBottom:12}}>{stripBoldMarkers(document.title)}</div>
              <div style={{background:"#f7f8fb",border:"1px solid #e4e8ef",borderRadius:8,padding:"10px 12px",marginBottom:18,fontSize:13}}><strong>Objet :</strong> {stripBoldMarkers(document.subject)}</div>
              <div style={{fontSize:13.5,lineHeight:1.68,color:"#26354d"}} dangerouslySetInnerHTML={{__html:documentBodyHtml(document.content)}}/>
            </div>
            <div className={styles.aiEditBar}><div><Sparkles size={14}/><span>{selection.text?`${selection.text.length} caractères sélectionnés`:"Sélectionnez un passage pour le retravailler avec Myvor"}</span></div><div>{editActions.map(({id,label,icon:Icon})=><button key={id} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>applyEdit(id)} disabled={!!editing||!selection.text}><Icon size={13}/>{editing===id?"Traitement…":label}</button>)}</div></div>
            <textarea ref={contentRef} className={styles.contentEditor} value={document.content} onSelect={captureSelection} onKeyUp={captureSelection} onMouseUp={captureSelection} onChange={e=>{patchDocument({content:e.target.value});resizeEditor();window.setTimeout(captureSelection,0);}}/>
            {!!document.key_points?.length&&<div className={styles.points}><h3>Points clés</h3>{document.key_points.map((point,index)=><div key={index}>• {stripBoldMarkers(point)}</div>)}</div>}
            {!!document.sources?.length&&<div className={styles.sources}><h3>Sources utilisées</h3>{document.sources.map((source,index)=><div className={styles.sourceRow} key={`${source.url}-${index}`}><span><FileText size={14}/><b>[{index+1}]</b>{source.title}</span>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">Ouvrir la source</a>}</div>)}</div>}
          </div>}
        </section>
        {error&&<div className={styles.error}>{error}</div>}{saveMessage&&<div className={styles.success}>{saveMessage}</div>}
      </main>

      <aside className={styles.settingsColumn}>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Paramètres</span><b>02</b></div><div className={styles.field}><label>Type de document</label><div className={styles.formats}>{formats.map(([id,label])=><button type="button" key={id} className={`${styles.formatButton} ${format===id?styles.active:""}`} onClick={()=>setFormat(id)}>{label}</button>)}</div></div><div className={styles.field}><label>Destinataire</label><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Client, député, cabinet…"/></div><div className={styles.field}><label>Ton</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>professionnel et direct</option><option>institutionnel et diplomatique</option><option>convaincant et offensif</option><option>pédagogique et synthétique</option></select></div><div className={styles.field}><label>Instructions complémentaires</label><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Ex. Insister sur le coût économique et proposer un rendez-vous avant l’examen en commission."/></div><button className={styles.generateButton} onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":document?"Régénérer":"Générer le document"}</button>{dossierId&&<button className={styles.clearButton} type="button" onClick={discardDraft}><Trash2 size={15}/>Effacer le brouillon</button>}</section>
      </aside>
    </div>
  </div>;
}
