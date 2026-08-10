"use client";

import {useMemo,useState} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,Clock3,FileText,Radar,Sparkles,Target} from "lucide-react";
import {saveProduction} from "@/lib/productions";
import {supabase} from "@/lib/supabase";
import styles from "./UrgencyScoreModule.module.css";

type Mode="express"|"standard"|"deep";
type CriterionKey="juridique"|"reglementaire"|"operationnel"|"reputationnel"|"fenetre_action"|"risque_inaction";
type Dossier={id:string;client:string;title:string;objective:string;context?:string;sector?:string|null;activity?:string|null;strategic_issues?:string[];risks_to_avoid?:string[];opportunities?:string[];client_position?:string|null;key_actors?:string[];key_deadlines?:string[];internal_notes?:string|null};
type Watch={id:string;title:string;nature:string;source_url?:string;dossier_id:string|null;urgency?:string;source_name?:string|null;published_at?:string|null;created_at?:string;qualification_reason?:string|null};
type ActionDraft={dossier_id:string;type:string;title:string;description?:string;priority:string;due_date?:string|null};
type CriterionResult={score:number;max:number;justification:string;evidence:string[]};
type UrgencyResult={score:number;level:string;decision:string;action_needed:boolean;summary:string;criteria:Record<CriterionKey,CriterionResult>;workstreams:string[];next_actions:string[];uncertainties:string[];sources:{title:string;url:string;status:string}[];mode:Mode;engine?:string;model?:string;execution_ms?:number};

const MODES:{value:Mode;label:string;time:string;description:string;maxItems:number}[]=[
  {value:"express",label:"Express",time:"cible 20 s",description:"Décision immédiate : faut-il agir, pourquoi, et sur quoi en premier ?",maxItems:6},
  {value:"standard",label:"Standard",time:"cible 40 s",description:"Score justifié + pistes de travail pour préparer la suite du dossier.",maxItems:12},
  {value:"deep",label:"Approfondie",time:"analyse complète",description:"Justification détaillée de chaque chiffre, preuves, incertitudes et leviers.",maxItems:24},
];

const CRITERIA:{key:CriterionKey;label:string;max:number;description:string}[]=[
  {key:"juridique",label:"Juridique",max:15,description:"Effet sur les droits, obligations, responsabilités ou contentieux."},
  {key:"reglementaire",label:"Réglementaire",max:15,description:"Évolution de norme, procédure, conformité ou contrôle."},
  {key:"operationnel",label:"Opérationnel",max:20,description:"Conséquences concrètes sur l’activité et l’organisation du client."},
  {key:"reputationnel",label:"Réputationnel",max:15,description:"Exposition politique, médiatique, sectorielle ou parties prenantes."},
  {key:"fenetre_action",label:"Fenêtre d’action",max:20,description:"Temps et marge disponibles pour agir utilement avant le point de bascule."},
  {key:"risque_inaction",label:"Risque de ne pas agir",max:15,description:"Coût, perte d’option ou aggravation probable en cas d’inaction."},
];

function dateValue(item:Watch){const value=item.published_at||item.created_at||"";const time=Date.parse(value);return Number.isFinite(time)?time:0;}
function tone(level:string){const value=level.toLowerCase();if(value.includes("critique"))return styles.critical;if(value.includes("urgent"))return styles.urgent;if(value.includes("action"))return styles.action;if(value.includes("surve"))return styles.watch;return styles.low;}
function priorityFromScore(score:number){return score>=85?"absolument urgent":score>=70?"fort":score>=50?"moyen":"faible";}

export default function UrgencyScoreModule({dossiers,watch,onActions,onOpenRadar,onCreateDeliverable}:{dossiers:Dossier[];watch:Watch[];onActions?:(drafts:ActionDraft[])=>Promise<void>|void;onOpenRadar?:(dossierId:string,watchIds:string[])=>void;onCreateDeliverable?:(dossierId:string,watchIds:string[])=>void}){
  const[dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const[mode,setMode]=useState<Mode>("standard");
  const[selectedIds,setSelectedIds]=useState<string[]|null>(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[saveMessage,setSaveMessage]=useState("");
  const[result,setResult]=useState<UrgencyResult|null>(null);
  const dossier=dossiers.find(item=>item.id===dossierId)||null;
  const currentMode=MODES.find(item=>item.value===mode)||MODES[1];
  const related=useMemo(()=>watch.filter(item=>item.dossier_id===dossierId).sort((a,b)=>dateValue(b)-dateValue(a)),[watch,dossierId]);
  const defaultIds=useMemo(()=>related.slice(0,currentMode.maxItems).map(item=>item.id),[related,currentMode.maxItems]);
  const effectiveIds=selectedIds??defaultIds;
  const selected=related.filter(item=>effectiveIds.includes(item.id)).slice(0,currentMode.maxItems);

  function reset(){setResult(null);setError("");setSaveMessage("");}
  function toggle(id:string){const base=effectiveIds;setSelectedIds(base.includes(id)?base.filter(value=>value!==id):[...base,id]);reset();}

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!selected.length){setError("Ce dossier doit avoir au moins un élément de veille rattaché et sélectionné.");return;}
    if(!supabase){setError("Supabase n’est pas configuré.");return;}
    setLoading(true);setError("");setSaveMessage("");setResult(null);
    try{
      const{data}=await supabase.auth.getSession();const token=String(data.session?.access_token||"");if(!token)throw new Error("Session Myvor expirée. Reconnecte-toi puis réessaie.");
      const response=await fetch("/api/urgency-score",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({dossier,items:selected,mode})});
      const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null;}catch{throw new Error(`Réponse serveur invalide (${response.status}).`);}if(!response.ok)throw new Error(payload?.error||`Calcul impossible (${response.status}).`);
      const next=payload?.result as UrgencyResult|undefined;if(!next||!Number.isFinite(Number(next.score)))throw new Error("Le Score d’urgence n’a pas été retourné.");
      setResult(next);
      const title=`Score d’urgence ${currentMode.label.toLowerCase()} — ${dossier.title}`;
      const saved=await saveProduction({dossier_id:dossier.id,type:"urgency_score",title,content:{score:next.score,level:next.level,decision:next.decision,action_needed:next.action_needed,summary:next.summary,criteria:next.criteria,workstreams:next.workstreams,next_actions:next.next_actions,uncertainties:next.uncertainties,sources:next.sources,mode,engine:next.engine||payload?.engine||null,model:next.model||payload?.model||null,execution_ms:next.execution_ms||payload?.execution_ms||null,watch_ids:selected.map(item=>item.id)}});
      setSaveMessage(saved.error?`Score calculé, mais non enregistré : ${saved.error.message}`:"Score enregistré dans l’historique du dossier.");
      if(onActions&&next.score>=50){await onActions([{dossier_id:dossier.id,type:"score_urgence",title:`Traiter le Score d’urgence — ${dossier.title}`,description:next.summary,priority:priorityFromScore(next.score)}]);}
    }catch(err:any){setError(err?.message||"Calcul impossible.");}finally{setLoading(false);}
  }

  const criteriaTotal=result?CRITERIA.reduce((sum,item)=>sum+Number(result.criteria?.[item.key]?.score||0),0):0;
  const radarIds=selected.map(item=>item.id);

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.kicker}>Décision opérationnelle</div><h1>Score d’urgence</h1><p>Déterminez si une action est nécessaire maintenant, pourquoi elle l’est, et quel chemin opérationnel ouvrir ensuite.</p></div></header>

    <section className={styles.workflow}>
      <div className={styles.card}><div className={styles.step}><span>1</span><div><b>Dossier client</b><small>Le score est calculé par rapport à son objectif, pas à l’importance générale du texte.</small></div></div><label className={styles.field}>Dossier<select value={dossierId} onChange={event=>{setDossierId(event.target.value);setSelectedIds(null);reset();}}><option value="">Sélectionner</option>{dossiers.map(item=><option key={item.id} value={item.id}>{item.client} — {item.title}</option>)}</select></label>{dossier&&<div className={styles.objective}><Target size={17}/><div><b>Objectif client</b><p>{dossier.objective}</p></div></div>}</div>
      <div className={styles.card}><div className={styles.step}><span>2</span><div><b>Veille rattachée</b><small>Seuls les éléments effectivement rattachés au dossier entrent dans le calcul.</small></div></div>{related.length?<div className={styles.watchList}>{related.slice(0,24).map(item=><label key={item.id} className={styles.watchRow}><input type="checkbox" checked={effectiveIds.includes(item.id)} onChange={()=>toggle(item.id)}/><div><span>{item.nature}</span><b>{item.title}</b><small>{item.source_name||item.urgency||"Source institutionnelle"}</small></div></label>)}</div>:<div className={styles.empty}><AlertTriangle size={26}/><b>Aucune veille rattachée</b><span>Rattache d’abord un élément de veille à ce dossier.</span></div>}</div>
    </section>

    <section className={styles.modePanel}><div><b>Niveau d’analyse</b><span>Le barème reste identique dans les trois modes : seul le niveau de justification change.</span></div><div className={styles.modeGrid}>{MODES.map(option=><button key={option.value} type="button" className={mode===option.value?styles.modeActive:""} onClick={()=>{setMode(option.value);setSelectedIds(null);reset();}}><strong>{option.label}</strong><em><Clock3 size={13}/>{option.time}</em><span>{option.description}</span></button>)}</div></section>

    <section className={styles.criteriaPreview}>{CRITERIA.map(item=><article key={item.key}><div><b>{item.label}</b><strong>/{item.max}</strong></div><p>{item.description}</p></article>)}</section>

    <section className={styles.launch}><div><Sparkles size={21}/><div><b>{selected.length} élément(s) de veille prêts</b><span>Myvor calculera six sous-scores puis recalculera le total côté moteur.</span></div></div><button onClick={generate} disabled={loading||!dossier||!selected.length}>{loading?"Calcul en cours…":`Calculer le Score ${currentMode.label}`}</button></section>
    {error&&<div className={styles.error}>{error}</div>}{saveMessage&&<div className={styles.notice}>{saveMessage}</div>}

    {result&&<section className={styles.result}>
      <div className={styles.hero}><div><div className={styles.eyebrow}>Décision Myvor · {currentMode.label}</div><h2>{result.action_needed?"Une action est nécessaire":"Pas d’action immédiate requise"}</h2><p>{result.summary}</p><div className={`${styles.decision} ${tone(result.level)}`}>{result.level.replaceAll("_"," ")} · {result.decision.replaceAll("_"," ")}</div></div><div className={styles.score}><span>Score d’urgence</span><strong>{Math.round(result.score)}</strong><small>/100</small><em>{criteriaTotal===Math.round(result.score)?"6 critères cohérents":"Total recalculé par Myvor"}</em></div></div>

      <div className={styles.criteriaGrid}>{CRITERIA.map(item=>{const criterion=result.criteria?.[item.key];return <article key={item.key} className={styles.criterion}><div className={styles.criterionTop}><div><span>{item.label}</span><b>{criterion?.score??0}<small>/{item.max}</small></b></div><div className={styles.track}><i style={{width:`${Math.max(0,Math.min(100,((criterion?.score||0)/item.max)*100))}%`}}/></div></div><p>{criterion?.justification||"Justification indisponible."}</p>{criterion?.evidence?.length?<div className={styles.evidence}><strong>Éléments utilisés</strong>{criterion.evidence.map((value,index)=><span key={`${item.key}-${index}`}><FileText size={12}/>{value}</span>)}</div>:null}</article>;})}</div>

      {mode!=="express"&&result.workstreams?.length?<section className={styles.section}><h3>Pistes de travail</h3><div className={styles.list}>{result.workstreams.map((item,index)=><div key={index}><span>{index+1}</span><p>{item}</p></div>)}</div></section>:null}
      {result.next_actions?.length?<section className={styles.section}><h3>Actions immédiates</h3><div className={styles.list}>{result.next_actions.map((item,index)=><div key={index}><span>{index+1}</span><p>{item}</p></div>)}</div></section>:null}
      {mode==="deep"&&result.uncertainties?.length?<section className={styles.section}><h3>Points à confirmer</h3><div className={styles.list}>{result.uncertainties.map((item,index)=><div key={index}><span>?</span><p>{item}</p></div>)}</div></section>:null}

      <div className={styles.next}><div><b>Continuer le workflow</b><span>Le score dit s’il faut agir. Le Radar identifie les acteurs ; la War Zone structure la stratégie ; le Builder produit le livrable.</span></div><div>{onOpenRadar&&<button type="button" onClick={()=>dossier&&onOpenRadar(dossier.id,radarIds)}><Radar size={16}/>Radar & War Zone<ArrowRight size={15}/></button>}{onCreateDeliverable&&<button type="button" className={styles.secondary} onClick={()=>dossier&&onCreateDeliverable(dossier.id,radarIds)}><FileText size={16}/>Note Builder</button>}</div></div>
    </section>}
  </div>;
}
