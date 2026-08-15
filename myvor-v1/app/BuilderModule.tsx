"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {Copy,Download,FileDown,FileText,MessageSquareText,Save,Scissors,ShieldCheck,Sparkles,Trash2,WandSparkles} from "lucide-react";
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
  "STANDARD DE SORTIE MYVOR — LIVRABLE PROFESSIONNEL.",
  "Le champ subject est obligatoire et doit contenir un objet court, précis et directement réutilisable.",
  "Le document doit être immédiatement exploitable par un consultant en affaires publiques et ne jamais ressembler à un bloc de texte IA.",
  "Sépare chaque partie par une ligne vide. Chaque intitulé de partie est seul sur sa ligne et se termine par deux-points.",
  "Pour une note stratégique, privilégie : Situation, Ce qui change, Impact pour le client, Niveau d’urgence, Recommandation, Actions à engager, Échéance.",
  "Pour une note de synthèse, privilégie : Situation, Faits et signaux essentiels, Convergences/divergences entre sources, Implications pour le client, Points de vigilance, Recommandation.",
  "Pour un e-mail, conserve une structure naturelle mais sépare clairement les paragraphes et fais ressortir le message clé, l’impact et la prochaine action.",
  "Mets uniquement les informations réellement décisives entre doubles astérisques **comme ceci** : changement majeur, date, échéance, chiffre déterminant, risque/opportunité majeur, recommandation, action prioritaire ou acteur clé.",
  "La recommandation doit être immédiatement identifiable et formulée comme une décision ou une action concrète.",
].join("\n");

const PROFESSIONAL_SECTION_LABELS=[
  "Synthèse exécutive","Situation","Message clé","Ce qui change","Faits et signaux essentiels","Faits essentiels",
  "Enjeu institutionnel","Convergences/divergences entre sources","Convergences et divergences","Implications pour le client",
  "Impact pour le client","Risques et opportunités","Risques / opportunités","Niveau d’urgence","Urgence","Recommandation",
  "Recommandations","Actions à engager","Actions prioritaires","Acteurs à mobiliser","Échéance","Échéances","Calendrier",
  "Points de vigilance","Prochaine action","Conclusion",
];

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
function slug(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"document-myvor";}
function reviewLabel(status:ReviewStatus){return status==="validated"?"Validé humainement":status==="reviewed"?"Vérifié — validation finale requise":"Généré — vérification requise";}
function formatLabel(value:string){return formats.find(([id])=>id===value)?.[1]||"Document opérationnel";}

function normalizeProfessionalContent(value:unknown){
  let text=String(value??"").replace(/\r/g," ").replace(/[\t ]+/g," ").trim();
  if(!text)return"";
  const labels=PROFESSIONAL_SECTION_LABELS.map(label=>label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");
  text=text.replace(new RegExp("\\s*("+labels+")\\s*:\\s*","gi"),"\n\n$1:\n");
  text=text.replace(/\s+-\s+(?=[A-ZÀ-ÖØ-Þ0-9])/g,"\n• ");
  text=text.replace(/\n{3,}/g,"\n\n");
  return text.trim();
}

function sanitizeDocument(document:BuiltDocument):BuiltDocument{
  const title=presentableText(document?.title)||"Document généré";
  return{
    title,
    subject:presentableText(document?.subject)||title,
    content:normalizeProfessionalContent(filterPresentableLines(document?.content)),
    key_points:filterPresentableStrings(document?.key_points),
    sources:(Array.isArray(document?.sources)?document.sources:[]).map(source=>({title:presentableText(source?.title),url:String(source?.url||"").trim()})).filter(source=>source.title),
  };
}

function documentBodyHtml(content:string){
  const lines=normalizeProfessionalContent(content).split(/\n+/).map(line=>line.trim()).filter(Boolean);
  let html="";let sectionOpen=false;
  for(const line of lines){
    const bullet=/^[-•]\s+/.test(line);
    const heading=!bullet&&line.length<=105&&/:$/.test(line);
    const text=richInlineHtml(line.replace(/^[-•]\s+/,""));
    if(heading){
      if(sectionOpen)html+="</section>";
      html+=`<section style="margin:0 0 24px;padding:0 0 20px;border-bottom:1px solid #e8edf3"><h2 style="margin:0 0 10px;font-size:11px;line-height:1.3;letter-spacing:.08em;text-transform:uppercase;color:#9a741c;font-weight:900">${text.replace(/:$/,"")}</h2>`;
      sectionOpen=true;continue;
    }
    if(!sectionOpen){html+='<section style="margin:0 0 24px">';sectionOpen=true;}
    if(bullet)html+=`<div style="display:grid;grid-template-columns:14px 1fr;gap:7px;margin:0 0 8px"><span style="color:#b88719;font-weight:900">•</span><p style="margin:0;color:#26354d;line-height:1.68">${text}</p></div>`;
    else html+=`<p style="margin:0 0 12px;color:#26354d;line-height:1.72">${text}</p>`;
  }
  if(sectionOpen)html+="</section>";
  return html;
}

function ProfessionalDocumentPreview({document,dossier,format,reviewStatus}:{document:BuiltDocument;dossier:Dossier|null;format:string;reviewStatus:ReviewStatus}){
  const date=new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});
  return <div style={{background:"#edf1f5",padding:"30px 18px 36px",borderRadius:14}}>
    <article style={{maxWidth:820,margin:"0 auto",background:"#fff",border:"1px solid #dfe5ec",boxShadow:"0 18px 42px rgba(7,25,54,.12)",padding:"48px 54px 42px",color:"#172942"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:18,paddingBottom:16,borderBottom:"2px solid #d0a740"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}><div style={{width:34,height:34,borderRadius:10,display:"grid",placeItems:"center",background:"#d0a740",color:"#071426",fontWeight:950,fontSize:17}}>M</div><div><div style={{fontWeight:950,fontSize:16,color:"#071936"}}>MYVOR</div><div style={{fontSize:10,textTransform:"uppercase",letterSpacing:".1em",color:"#8b99aa",marginTop:2}}>{formatLabel(format)}</div></div></div>
        <div style={{textAlign:"right",fontSize:10.5,lineHeight:1.55,color:"#718097"}}><strong style={{display:"block",fontSize:11.5,color:"#253850"}}>{dossier?.client||"Client"}</strong><span>{date}</span></div>
      </header>
      <div style={{paddingTop:28}}>
        <div style={{fontSize:10,fontWeight:900,letterSpacing:".13em",textTransform:"uppercase",color:"#9a741c",marginBottom:8}}>Document opérationnel</div>
        <h1 style={{fontSize:28,lineHeight:1.2,letterSpacing:"-.025em",margin:"0 0 18px",color:"#071936"}}>{stripBoldMarkers(document.title)}</h1>
        <div style={{display:"grid",gridTemplateColumns:"68px 1fr",gap:12,alignItems:"start",padding:"13px 15px",background:"#f7f8fa",borderLeft:"3px solid #d0a740",marginBottom:24}}><span style={{fontSize:10,fontWeight:900,letterSpacing:".08em",color:"#8d6b1c"}}>OBJET</span><strong style={{fontSize:13px,lineHeight:1.5,color:"#26354d"}}>{stripBoldMarkers(document.subject)}</strong></div>
        {!!document.key_points?.length&&<section style={{marginBottom:28,padding:"16px 18px",background:"#fff9e9",border:"1px solid #ead79b"}}><div style={{fontSize:10,fontWeight:900,letterSpacing:".1em",textTransform:"uppercase",color:"#8f6911",marginBottom:9}}>À retenir</div><div style={{display:"grid",gap:7}}>{document.key_points.slice(0,4).map((point,index)=><div key={index} style={{display:"grid",gridTemplateColumns:"18px 1fr",gap:7,fontSize:12.5,lineHeight:1.55,color:"#26354d"}}><b style={{color:"#b88719"}}>{String(index+1).padStart(2,"0")}</b><span dangerouslySetInnerHTML={{__html:richInlineHtml(point)}}/></div>)}</div></section>}
        <div style={{fontSize:13.2}} dangerouslySetInnerHTML={{__html:documentBodyHtml(document.content)}}/>
        {!!document.sources?.length&&<footer style={{marginTop:34,paddingTop:18,borderTop:"1px solid #dfe5ec"}}><div style={{fontSize:10,fontWeight:900,letterSpacing:".09em",textTransform:"uppercase",color:"#718097",marginBottom:8}}>Sources</div><div style={{display:"grid",gap:5}}>{document.sources.map((source,index)=><div key={`${source.url}-${index}`} style={{fontSize:9.8,lineHeight:1.45,color:"#6b788b"}}><b style={{color:"#394c65"}}>[{index+1}]</b> {source.title}</div>)}</div></footer>}
        <div style={{marginTop:24,paddingTop:12,borderTop:"1px solid #edf0f4",display:"flex",justifyContent:"space-between",gap:12,fontSize:9.5,color:"#8a96a6"}}><span>Analyse assistée par Myvor · validation humaine requise avant diffusion</span><span>{reviewLabel(reviewStatus)}</span></div>
      </div>
    </article>
  </div>;
}

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
  function invalidateReview(){setReviewStatus("generated");setReviewedAt(null);setValidatedAt(null);}
  function patchDocument(patch:Partial<BuiltDocument>){setDocument(current=>current?{...current,...patch}:current);invalidateReview();}

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
    draftTimer.current=window.setTimeout(()=>{const saved=writeBuilderDraft({version:1,saved_at:new Date().toISOString(),dossier_id:dossierId,format,audience,tone,instruction,document});setDraftMessage(saved?"Brouillon sauvegardé automatiquement.":"Sauvegarde locale indisponible.");},700);
    return()=>{if(draftTimer.current)window.clearTimeout(draftTimer.current);};
  },[dossierId,format,audience,tone,instruction,document]);

  useEffect(()=>{if(document)window.requestAnimationFrame(()=>{resizeTitle();resizeEditor();});},[document?.title,document?.content]);

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
      setSaveMessage(saved.error?`Document généré, mais non enregistré : ${saved.error.message}`:"Document généré dans le format livrable. Vérification humaine requise avant export.");
    }catch(err:any){const message=String(err?.message||"");setError(message.includes("Failed to send a request")?"Impossible de joindre la fonction Supabase note-builder. Le brouillon reste sauvegardé.":message||"Génération impossible");}finally{setLoading(false);}
  }

  async function applyEdit(action:EditAction){
    if(!document||!supabase)return;const textarea=contentRef.current;const start=textarea?.selectionStart??selection.start;const end=textarea?.selectionEnd??selection.end;const selected=document.content.slice(start,end).trim();
    if(!selected){setError("Sélectionne d’abord un passage dans le texte, puis choisis une action IA.");textarea?.focus();return;}
    setEditing(action);setError("");
    try{const {data:payload,error:invokeError}=await supabase.functions.invoke("note-builder",{body:{mode:"edit",action,selected_text:selected,surrounding_text:document.content}});if(invokeError)throw new Error(await edgeFunctionError(invokeError));if(payload?.error)throw new Error(String(payload.error));const replacement=String(payload?.text||"").trim();if(!replacement)throw new Error("La réécriture n’a renvoyé aucun texte.");const next=document.content.slice(0,start)+replacement+document.content.slice(end);patchDocument({content:normalizeProfessionalContent(next)});setSaveMessage("Passage réécrit. La validation humaine doit être refaite avant export.");}
    catch(err:any){setError(String(err?.message||"Réécriture impossible."));}finally{setEditing(null);}
  }

  async function saveCurrent(){if(!document||!dossier)return;const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:document.title||`Document — ${dossier.title}`,content:{document,format,audience,tone,instruction,item_ids:related.map(i=>i.id),engine:"note-builder-editor",review:{status:reviewStatus,generated_at:generatedAt||new Date().toISOString(),reviewed_at:reviewedAt,validated_at:validatedAt}}});setSaveMessage(saved.error?`Enregistrement impossible : ${saved.error.message}`:"Modifications enregistrées dans le dossier.");}
  async function markReviewed(){if(!document||!dossier)return;const now=new Date().toISOString();setReviewStatus("reviewed");setReviewedAt(now);setValidatedAt(null);await saveCurrent();setSaveMessage("Document vérifié. Une validation finale est encore requise avant export.");}
  async function validateDocument(){if(!document||!dossier||reviewStatus!=="reviewed")return;const now=new Date().toISOString();setReviewStatus("validated");setValidatedAt(now);const saved=await saveProduction({dossier_id:dossier.id,type:"builder",title:document.title||`Document — ${dossier.title}`,content:{document,format,audience,tone,instruction,item_ids:related.map(i=>i.id),engine:"note-builder-editor",review:{status:"validated",generated_at:generatedAt||now,reviewed_at:reviewedAt||now,validated_at:now}}});setSaveMessage(saved.error?`Document validé localement, mais enregistrement impossible : ${saved.error.message}`:"Document validé humainement et prêt à être exporté.");}

  async function copyDocument(){
    if(!document)return;const text=[stripBoldMarkers(document.title),`Objet : ${stripBoldMarkers(document.subject)}`,stripBoldMarkers(normalizeProfessionalContent(document.content)),document.key_points?.length?`À retenir\n${document.key_points.map(x=>`• ${stripBoldMarkers(x)}`).join("\n")}`:""].filter(Boolean).join("\n\n");
    const html=`<h1>${richInlineHtml(document.title)}</h1><p><strong>Objet :</strong> ${richInlineHtml(document.subject)}</p>${document.key_points?.length?`<h2>À retenir</h2><ul>${document.key_points.map(point=>`<li>${richInlineHtml(point)}</li>`).join("")}</ul>`:""}<div>${documentBodyHtml(document.content)}</div>`;
    try{if(typeof ClipboardItem!=="undefined"&&navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({"text/plain":new Blob([text],{type:"text/plain"}),"text/html":new Blob([html],{type:"text/html"})})]);else await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setError("La copie a été bloquée par le navigateur.");}
  }

  function exportWord(){
    if(!document||!dossier)return;if(reviewStatus!=="validated"){setError("Validez humainement le document avant export.");return;}
    const points=document.key_points?.length?`<section class="key"><h2>À retenir</h2><ul>${document.key_points.map(point=>`<li>${richInlineHtml(point)}</li>`).join("")}</ul></section>`:"";
    const sources=document.sources?.length?`<footer><h2>Sources</h2>${document.sources.map((source,index)=>`<p><strong>[${index+1}]</strong> ${escapeHtml(source.title)}${source.url?`<br><span>${escapeHtml(source.url)}</span>`:""}</p>`).join("")}</footer>`:"";
    const html=`<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="fr"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172942;line-height:1.6;margin:48px}.top{display:flex;justify-content:space-between;border-bottom:2px solid #d0a740;padding-bottom:14px}.brand{font-weight:900;font-size:18px}.meta{font-size:10px;color:#718097;text-align:right}h1{font-size:26px;color:#071936;margin:26px 0 16px}.subject{background:#f4f6f8;border-left:3px solid #d0a740;padding:12px 14px;margin-bottom:24px}.key{background:#fff8e7;border:1px solid #ead79b;padding:12px 16px}.body strong{color:#071936}footer{margin-top:30px;border-top:1px solid #dfe5ec;padding-top:14px;font-size:9px;color:#718097}</style></head><body><div class="top"><div class="brand">MYVOR</div><div class="meta">${escapeHtml(dossier.client)}<br>${escapeHtml(new Date().toLocaleDateString("fr-FR"))}</div></div><h1>${richInlineHtml(document.title)}</h1><div class="subject"><strong>OBJET</strong><br>${richInlineHtml(document.subject)}</div>${points}<div class="body">${documentBodyHtml(document.content)}</div>${sources}</body></html>`;
    const blob=new Blob(["\ufeff",html],{type:"application/msword"});const url=URL.createObjectURL(blob);const a=window.document.createElement("a");a.href=url;a.download=`${slug(document.title)}.doc`;window.document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportPdf(){
    if(!document||!dossier)return;if(reviewStatus!=="validated"){setError("Validez humainement le document avant export.");return;}
    const points=document.key_points?.length?`<section class="key"><h2>À retenir</h2><ul>${document.key_points.map(point=>`<li>${richInlineHtml(point)}</li>`).join("")}</ul></section>`:"";
    const sources=document.sources?.length?`<footer><h2>Sources</h2>${document.sources.map((source,index)=>`<p><strong>[${index+1}]</strong> ${escapeHtml(source.title)}</p>`).join("")}</footer>`:"";
    const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>@page{size:A4;margin:17mm}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#172942;font-size:11.5px;line-height:1.62}.top{display:flex;justify-content:space-between;border-bottom:2px solid #d0a740;padding-bottom:12px}.brand{font-weight:900;font-size:18px;color:#071936}.meta{text-align:right;color:#718097;font-size:9.5px}h1{font-size:22px;line-height:1.25;margin:24px 0 14px;color:#071936}.subject{background:#f5f7f9;border-left:3px solid #d0a740;padding:10px 12px;margin-bottom:20px}.key{background:#fff8e7;border:1px solid #ead79b;padding:10px 14px;margin-bottom:20px}.body strong{font-weight:800;color:#071936}footer{margin-top:24px;border-top:1px solid #dfe5ec;padding-top:12px;font-size:8.8px;color:#718097}section{break-inside:avoid}</style></head><body><div class="top"><div class="brand">MYVOR</div><div class="meta">${escapeHtml(dossier.client)}<br>${escapeHtml(new Date().toLocaleDateString("fr-FR"))}<br>Validé humainement</div></div><h1>${richInlineHtml(document.title)}</h1><div class="subject"><strong>OBJET</strong><br>${richInlineHtml(document.subject)}</div>${points}<div class="body">${documentBodyHtml(document.content)}</div>${sources}</body></html>`;
    const frame=window.document.createElement("iframe");frame.style.position="fixed";frame.style.width="1px";frame.style.height="1px";frame.style.opacity="0";frame.style.border="0";window.document.body.appendChild(frame);const printWindow=frame.contentWindow;const printDocument=frame.contentDocument||printWindow?.document;if(!printWindow||!printDocument){frame.remove();setError("Impossible de préparer l’export PDF.");return;}printDocument.open();printDocument.write(html);printDocument.close();window.setTimeout(()=>{printWindow.focus();printWindow.print();window.setTimeout(()=>frame.remove(),1000);},250);
  }

  function captureSelection(){if(!document)return;const el=contentRef.current;if(!el)return;const start=el.selectionStart||0;const end=el.selectionEnd||0;setSelection({start,end,text:document.content.slice(start,end)});}
  function discardDraft(){if(!dossierId)return;clearBuilderDraft(dossierId);setInstruction("");setDocument(null);setSelection({start:0,end:0,text:""});setDraftMessage("Brouillon supprimé.");setError("");setSaveMessage("");setGeneratedAt(null);invalidateReview();}

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.kicker}>Production opérationnelle</div><h1>Note Builder</h1><p>Transformez les décisions Myvor en livrables prêts à être utilisés.</p></div><div className={styles.statusPill}>Decision Engine · {reviewLabel(reviewStatus)}</div></header>

    <div className={styles.workspace}>
      <aside className={styles.contextColumn}>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Contexte</span><b>01</b></div><div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);hydratedDraft.current="";setDocument(null);setError("");setSaveMessage("");setDraftMessage("");setGeneratedAt(null);invalidateReview();}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<div className={styles.contextCard}><small>Objectif client</small><strong>{dossier.objective||"Objectif non renseigné"}</strong></div>}</section>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Sources mobilisées</span><b>{related.length}</b></div><div className={styles.sourceStack}>{related.slice(0,6).map(item=><div className={styles.sourceMini} key={item.id}><FileText size={14}/><div><strong>{item.title}</strong><small>{item.nature||"Veille institutionnelle"}</small></div></div>)}{!related.length&&<div className={styles.empty}>Aucune source liée à ce dossier.</div>}</div></section>
        {draftMessage&&<div className={styles.draftState}>{draftMessage}</div>}
      </aside>

      <main className={styles.editorColumn}>
        <section className={styles.editorCard}>
          <div className={styles.editorToolbar}><div><span className={styles.eyebrow}>Livrable</span><strong>{document?reviewLabel(reviewStatus):"Nouveau document"}</strong></div><div className={styles.documentActions}>{document&&<><button className={styles.secondary} onClick={saveCurrent}><Save size={15}/>Enregistrer</button><button className={styles.secondary} onClick={copyDocument}><Copy size={15}/>{copied?"Copié":"Copier"}</button>{reviewStatus==="generated"&&<button className={styles.secondary} onClick={markReviewed}><ShieldCheck size={15}/>Marquer vérifié</button>}{reviewStatus==="reviewed"&&<button className={styles.primarySmall} onClick={validateDocument}><ShieldCheck size={15}/>Valider</button>}<button className={styles.secondary} onClick={exportWord} disabled={reviewStatus!=="validated"}><FileDown size={15}/>Word</button><button className={styles.primarySmall} onClick={exportPdf} disabled={reviewStatus!=="validated"}><Download size={15}/>PDF</button></>}</div></div>
          {!document?<div className={styles.editorEmpty}><div className={styles.spark}><Sparkles size={22}/></div><h2>Votre livrable apparaîtra ici</h2><p>Myvor croise le dossier, la veille liée, le Score d’urgence, le Radar d’influence et la War Zone pour produire un document directement exploitable.</p><button onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":"Générer le livrable"}</button></div>:<div className={styles.editorFields}>
            <ProfessionalDocumentPreview document={document} dossier={dossier} format={format} reviewStatus={reviewStatus}/>
            <details style={{marginTop:18,border:"1px solid #dfe5ed",borderRadius:12,background:"#f8fafc",overflow:"hidden"}}>
              <summary style={{cursor:"pointer",padding:"14px 18px",fontSize:12,fontWeight:850,color:"#31445e",listStyle:"none"}}>Modifier le livrable</summary>
              <div style={{padding:"0 20px 22px"}}>
                <label style={{display:"block",fontSize:9,fontWeight:900,letterSpacing:".08em",textTransform:"uppercase",color:"#8a96a6",margin:"6px 0 7px"}}>Titre</label><textarea ref={titleRef} rows={1} className={styles.titleInput} value={document.title} onChange={e=>{patchDocument({title:e.target.value});resizeTitle();}}/>
                <label style={{display:"block",fontSize:9,fontWeight:900,letterSpacing:".08em",textTransform:"uppercase",color:"#8a96a6",margin:"16px 0 7px"}}>Objet</label><input className={styles.subjectInput} value={document.subject} onChange={e=>patchDocument({subject:e.target.value})} placeholder="Objet du document"/>
                <div className={styles.aiEditBar}><div><Sparkles size={14}/><span>{selection.text?`${selection.text.length} caractères sélectionnés`:"Sélectionnez un passage pour le retravailler avec Myvor"}</span></div><div>{editActions.map(({id,label,icon:Icon})=><button key={id} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>applyEdit(id)} disabled={!!editing||!selection.text}><Icon size={13}/>{editing===id?"Traitement…":label}</button>)}</div></div>
                <textarea ref={contentRef} className={styles.contentEditor} value={document.content} onSelect={captureSelection} onKeyUp={captureSelection} onMouseUp={captureSelection} onChange={e=>{patchDocument({content:e.target.value});resizeEditor();window.setTimeout(captureSelection,0);}}/>
              </div>
            </details>
          </div>}
        </section>
        {error&&<div className={styles.error}>{error}</div>}{saveMessage&&<div className={styles.success}>{saveMessage}</div>}
      </main>

      <aside className={styles.settingsColumn}>
        <section className={styles.panel}><div className={styles.panelTitle}><span>Paramètres</span><b>02</b></div><div className={styles.field}><label>Type de document</label><div className={styles.formats}>{formats.map(([id,label])=><button type="button" key={id} className={`${styles.formatButton} ${format===id?styles.active:""}`} onClick={()=>setFormat(id)}>{label}</button>)}</div></div><div className={styles.field}><label>Destinataire</label><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Client, député, cabinet…"/></div><div className={styles.field}><label>Ton</label><select value={tone} onChange={e=>setTone(e.target.value)}><option>professionnel et direct</option><option>institutionnel et diplomatique</option><option>convaincant et offensif</option><option>pédagogique et synthétique</option></select></div><div className={styles.field}><label>Instructions complémentaires</label><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Ex. Insister sur le coût économique et proposer un rendez-vous avant l’examen en commission."/></div><button className={styles.generateButton} onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Rédaction en cours…":document?"Régénérer":"Générer le livrable"}</button>{dossierId&&<button className={styles.clearButton} type="button" onClick={discardDraft}><Trash2 size={15}/>Effacer le brouillon</button>}</section>
      </aside>
    </div>
  </div>;
}
