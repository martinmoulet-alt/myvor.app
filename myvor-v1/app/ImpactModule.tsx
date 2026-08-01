"use client";

import { useMemo,useState } from "react";
import { AlertTriangle,CheckCircle2,FileText,Sparkles,Target } from "lucide-react";
import { saveProduction } from "@/lib/productions";
import styles from "./ImpactCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type ImpactDisposition={disposition:string;impact_client:string;niveau:string};
type ScoreDetail={juridique?:number;economique_operationnel?:number;urgence?:number;probabilite?:number;politique_reputation?:number;capacite_action?:number};
type Note={title?:string;executive_summary?:string;score?:number;level?:string;rationale?:string;risks?:string[];opportunities?:string[];deadlines?:string[];recommendations?:string[];sources_used?:{title:string;url:string}[];dispositions_concernees?:ImpactDisposition[];informations_a_confirmer?:string[];score_detail?:ScoreDetail|null};
type ActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};
type ImpactDepth="express"|"standard"|"deep";

const depthOptions:{value:ImpactDepth;label:string;description:string}[]=[
  {value:"express",label:"Express",description:"Décision immédiate : score, alertes critiques et actions prioritaires."},
  {value:"standard",label:"Standard",description:"Note de travail complète pour le suivi quotidien du dossier."},
  {value:"deep",label:"Approfondie",description:"Analyse stratégique détaillée avec décomposition du score et dispositions."},
];

const scoreLabels:{key:keyof ScoreDetail;label:string;max:number}[]=[
  {key:"juridique",label:"Juridique",max:20},
  {key:"economique_operationnel",label:"Éco. / opérationnel",max:20},
  {key:"urgence",label:"Urgence",max:15},
  {key:"probabilite",label:"Probabilité",max:15},
  {key:"politique_reputation",label:"Politique / réputation",max:15},
  {key:"capacite_action",label:"Capacité d’action",max:15},
];

export default function ImpactModule({dossiers,watch,onActions}:{dossiers:Dossier[];watch:Watch[];onActions?:(drafts:ActionDraft[])=>Promise<void>|void}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");const [selectedIds,setSelectedIds]=useState<string[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [note,setNote]=useState<Note|null>(null);const [saveMessage,setSaveMessage]=useState("");const [depth,setDepth]=useState<ImpactDepth>("standard");
  const dossier=dossiers.find(d=>d.id===dossierId)||null;const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);const effectiveIds=selectedIds.length?selectedIds:related.map(w=>w.id);
  async function generate(){if(!dossier){setError("Sélectionne un dossier client.");return;}const items=related.filter(w=>effectiveIds.includes(w.id));if(!items.length){setError("Aucun élément de veille n’est rattaché à ce dossier.");return;}setLoading(true);setError("");setSaveMessage("");setNote(null);try{const endpoint=new URL("/api/impact",window.location.origin).toString();const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dossier,items,depth})});const payload=await response.json();if(!response.ok)throw new Error(payload?.error||"Génération impossible");const nextNote=payload.note||null;setNote(nextNote);if(nextNote){const title=String(nextNote.title||`Note d’impact — ${dossier.title}`);const saved=await saveProduction({dossier_id:dossier.id,type:"impact",title,content:{note:nextNote,item_ids:items.map(i=>i.id),depth}});setSaveMessage(saved.error?`Note générée, mais non enregistrée : ${saved.error.message}`:`Note ${depthOptions.find(option=>option.value===depth)?.label.toLowerCase()} enregistrée dans l’historique du dossier.`);}if(nextNote&&onActions){const priority=String(nextNote.level||"moyen");const drafts:ActionDraft[]=[{dossier_id:dossier.id,type:"note_client",title:`Envoyer la note d’impact — ${dossier.title}`,description:String(nextNote.executive_summary||"Note d’impact prête à partager avec le client."),priority}];if(Array.isArray(nextNote.deadlines)&&nextNote.deadlines.length){drafts.push({dossier_id:dossier.id,type:"echeance",title:`Vérifier la prochaine échéance — ${dossier.title}`,description:String(nextNote.deadlines[0]),priority,due_date:null});}await onActions(drafts);}}catch(err:any){setError(err?.message||"Génération impossible");}finally{setLoading(false);}}
  function toggle(id:string){const base=selectedIds.length?selectedIds:related.map(w=>w.id);setSelectedIds(base.includes(id)?base.filter(x=>x!==id):[...base,id]);}
  const level=String(note?.level||"moyen");const levelKey=level.replaceAll(" ","-") as keyof typeof styles;
  return <div className={styles.page}><header className={styles.head}><div><div className={styles.kicker}>Analyse stratégique</div><h1>Note d’impact</h1><p>Mesurez l’effet d’un texte sur l’objectif du client et transformez l’analyse en décisions opérationnelles.</p></div></header>
    <section className={styles.workflow}><div className={styles.stepCard}><div className={styles.stepTitle}><span>1</span><div><b>Dossier analysé</b><small>Sélectionnez le client et son objectif.</small></div></div><div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setSelectedIds([]);setNote(null);setError("");setSaveMessage("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<div className={styles.objective}><Target size={17}/><div><b>Objectif du client</b><p>{dossier.objective}</p></div></div>}</div>
    <div className={styles.stepCard}><div className={styles.stepTitle}><span>2</span><div><b>Éléments de veille</b><small>Choisissez les textes à intégrer au calcul.</small></div></div>{related.length?<div className={styles.watchList}>{related.map(item=><label key={item.id} className={styles.watchItem}><input type="checkbox" checked={effectiveIds.includes(item.id)} onChange={()=>toggle(item.id)}/><div className={styles.watchCopy}><div><span className={styles.nature}>{item.nature}</span><span className={`${styles.impact} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span></div><b>{item.title}</b></div></label>)}</div>:<div className={styles.empty}><AlertTriangle size={28}/><b>Aucun texte rattaché</b><span>Rattachez d’abord un élément depuis la page Veille.</span></div>}</div></section>
    <section className={styles.depthPanel}><div className={styles.depthHead}><div><b>Type de note</b><span>Choisissez le niveau d’analyse adapté au dossier.</span></div></div><div className={styles.depthGrid}>{depthOptions.map(option=><button type="button" key={option.value} className={`${styles.depthOption} ${depth===option.value?styles.depthActive:""}`} onClick={()=>{setDepth(option.value);setNote(null);setError("");setSaveMessage("");}}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></section>
    <section className={styles.launch}><div><div className={styles.launchIcon}><Sparkles size={20}/></div><div><b>Analyse prête — {depthOptions.find(option=>option.value===depth)?.label}</b><span>{effectiveIds.length} texte(s) sélectionné(s) pour {dossier?.client||"ce dossier"}.</span></div></div><button onClick={generate} disabled={loading||!dossier||!related.length}>{loading?"Analyse en cours…":`Générer la note ${depthOptions.find(option=>option.value===depth)?.label.toLowerCase()}`}</button></section>{error&&<div className={styles.error}>{error}</div>}{saveMessage&&<div className={styles.error}>{saveMessage}</div>}
    {note&&<section className={styles.result}>
      <div className={styles.resultHero}><div className={styles.resultCopy}><div className={styles.eyebrow}>Note {depthOptions.find(option=>option.value===depth)?.label}</div><h2>{note.title||`Note d’impact — ${dossier?.title||"Dossier"}`}</h2><p>{note.executive_summary}</p>{depth!=="express"&&note.rationale&&<div className={styles.rationale}><b>Lecture du score</b><span>{note.rationale}</span></div>}</div><div className={styles.scoreCard}><span>Score d’impact</span><strong>{Math.round(Number(note.score)||0)}</strong><small>/100</small><div className={`${styles.level} ${styles[levelKey]||""}`}>{level}</div></div></div>

      {depth==="express"&&<ExpressResult note={note}/>} 

      {depth==="standard"&&<>
        <Provisions items={note.dispositions_concernees}/>
        <div className={styles.sectionGrid}><ImpactSection title="Risques" icon={<AlertTriangle size={18}/>} items={note.risks}/><ImpactSection title="Opportunités" icon={<CheckCircle2 size={18}/>} items={note.opportunities}/><ImpactSection title="Échéances" icon={<Target size={18}/>} items={note.deadlines}/><ImpactSection title="Recommandations" icon={<Sparkles size={18}/>} items={note.recommendations}/></div>
        <Confirmations items={note.informations_a_confirmer}/>
      </>}

      {depth==="deep"&&<>
        <div className={styles.deepBanner}><Sparkles size={19}/><div><b>Analyse stratégique approfondie</b><span>Décomposition du score, dispositions détaillées, risques, opportunités et marges d’action.</span></div></div>
        <ScoreBreakdown detail={note.score_detail}/>
        <Provisions items={note.dispositions_concernees}/>
        <div className={styles.sectionGrid}><ImpactSection title="Risques stratégiques" icon={<AlertTriangle size={18}/>} items={note.risks}/><ImpactSection title="Opportunités stratégiques" icon={<CheckCircle2 size={18}/>} items={note.opportunities}/><ImpactSection title="Échéances et fenêtres d’action" icon={<Target size={18}/>} items={note.deadlines}/><ImpactSection title="Plan d’action recommandé" icon={<Sparkles size={18}/>} items={note.recommendations}/></div>
        <Confirmations items={note.informations_a_confirmer}/>
      </>}

      {!!note.sources_used?.length&&<div className={styles.sources}><div className={styles.sourcesHead}><FileText size={18}/><h3>Sources analysées</h3></div>{note.sources_used.map((source,index)=><div className={styles.sourceRow} key={`${source.url}-${index}`}><span>{source.title}</span>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">Lire le texte original</a>}</div>)}</div>}
    </section>}
  </div>;
}

function ExpressResult({note}:{note:Note}){return <div className={styles.expressGrid}><article className={styles.expressCard}><div className={styles.expressHead}><AlertTriangle size={18}/><h3>Alertes prioritaires</h3></div>{note.risks?.length?<ol>{note.risks.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ol>:<p>Aucune alerte prioritaire identifiée.</p>}</article><article className={styles.expressCard}><div className={styles.expressHead}><Sparkles size={18}/><h3>3 actions à lancer</h3></div>{note.recommendations?.length?<ol>{note.recommendations.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ol>:<p>Aucune action prioritaire identifiée.</p>}</article>{note.deadlines?.[0]&&<article className={`${styles.expressCard} ${styles.expressWide}`}><div className={styles.expressHead}><Target size={18}/><h3>Prochaine fenêtre d’action</h3></div><p>{note.deadlines[0]}</p></article>}</div>}

function Provisions({items}:{items?:ImpactDisposition[]}){if(!items?.length)return null;return <div className={styles.provisions}><div className={styles.provisionsHead}><FileText size={18}/><div><h3>Dispositions concernées</h3><span>Passages identifiés comme pertinents pour l’objectif du client.</span></div></div><div className={styles.provisionList}>{items.map((item,index)=>{const provisionLevel=String(item.niveau||"moyen").replaceAll("_"," ");const provisionKey=provisionLevel.replaceAll(" ","-") as keyof typeof styles;return <article className={styles.provisionRow} key={`${item.disposition}-${index}`}><div className={styles.provisionTop}><b>{item.disposition||"Disposition à préciser"}</b><span className={`${styles.level} ${styles[provisionKey]||""}`}>{provisionLevel}</span></div><p>{item.impact_client||"Impact client à confirmer."}</p></article>;})}</div></div>}

function Confirmations({items}:{items?:string[]}){if(!items?.length)return null;return <div className={styles.confirmBox}><div className={styles.confirmHead}><AlertTriangle size={18}/><div><h3>Informations à confirmer</h3><span>Points que Myvor n’a pas pu établir avec suffisamment de certitude.</span></div></div><ul>{items.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}

function ScoreBreakdown({detail}:{detail?:ScoreDetail|null}){if(!detail)return null;return <div className={styles.scoreBreakdown}><div className={styles.scoreBreakdownHead}><div><b>Décomposition du score</b><span>Lecture des six composantes de l’impact.</span></div></div><div className={styles.scoreMetricGrid}>{scoreLabels.map(metric=><div className={styles.scoreMetric} key={metric.key}><span>{metric.label}</span><strong>{Math.round(Number(detail[metric.key])||0)}<small>/{metric.max}</small></strong></div>)}</div></div>}

function ImpactSection({title,icon,items}:{title:string;icon:React.ReactNode;items?:string[]}){return <article className={styles.impactSection}><div className={styles.sectionHead}>{icon}<h3>{title}</h3></div>{items?.length?<ul>{items.map((item,index)=><li key={index}>{item}</li>)}</ul>:<p>Aucun élément identifié.</p>}</article>;}
