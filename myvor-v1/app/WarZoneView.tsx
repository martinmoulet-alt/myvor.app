"use client";

import {useMemo,useState,type ReactNode} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,CircleDot,ExternalLink,FileText,Plus,RefreshCw,ShieldCheck,Sparkles,Target,Users} from "lucide-react";
import {fetchJsonWithRetry} from "@/lib/reliability";
import {supabase} from "@/lib/supabase";
import styles from "./WarZoneView.module.css";

export type WarZoneActor={id:string;name:string;role:string;institution?:string;orbit:1|2|3;position?:string;influence:number;influence_score?:number;why:string;window:string;action:string;certainty?:string};
export type WarZoneDossier={id:string;client:string;title:string;objective:string;context:string;key_deadlines?:string[]};
export type WarZoneWatch={id:string;title:string;nature:string;urgency:string;created_at:string;published_at?:string|null;source_url?:string;source_name?:string|null};
export type WarZoneActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};

type StrategyTarget={actor_id:string;name:string;role:string;institution:string;priority:number;why_this_target:string;institutional_goal:string;precise_subject:string;recommended_channel:string;recommended_format:string;factual_angles:string[];evidence_indexes:number[];timing:string;success_signal:string;fallback:string;do_not_assume:string};
type StrategyStep={order:number;title:string;target_actor_id:string;target_name:string;objective:string;why_now:string;means:string[];deliverable:string;message_frame:string;evidence_indexes:number[];timing:string;dependency:string;success_signal:string;fallback:string;risk:string};
type DetailedStrategy={diagnosis:{objective:string;decision_point:string;current_constraint:string;opportunity_window:string;recommended_path:string};targets:StrategyTarget[];sequence:StrategyStep[];evidence_gaps:string[];stop_rules:string[];review_trigger:string};
type StrategyPayload={strategy?:DetailedStrategy;engine?:string;model?:string;watch_items_used?:number;actors_used?:number};
type Props={dossier:WarZoneDossier|null;actors:WarZoneActor[];watch:WarZoneWatch[];onOpenActor:(actor:WarZoneActor)=>void;onActions?:(drafts:WarZoneActionDraft[])=>Promise<void>|void};

function score(actor:WarZoneActor){const raw=Number(actor.influence_score);return Number.isFinite(raw)?Math.max(0,Math.min(100,Math.round(raw))):Math.max(20,Math.min(100,Math.round((actor.influence||1)*20)));}
function strategicIndex(actors:WarZoneActor[],watch:WarZoneWatch[]){if(!actors.length)return 20;const actorBase=actors.reduce((sum,actor)=>sum+score(actor),0)/actors.length;const evidence=Math.min(16,watch.length*1.5);return Math.max(18,Math.min(92,Math.round(actorBase*.76+evidence)));}
function evidenceFor(index:number,watch:WarZoneWatch[]){return index>=1&&index<=watch.length?watch[index-1]:null;}
function evidenceLabel(index:number,watch:WarZoneWatch[]){const item=evidenceFor(index,watch);return item?`${item.nature} — ${item.title}`:`Source ${index}`;}

async function postStrategy<T>(body:unknown):Promise<T>{
  if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  const {data}=await supabase.auth.getSession();
  const token=data.session?.access_token;
  if(!token)throw new Error("Session Myvor requise.");
  return fetchJsonWithRetry<T>("/api/warzone/strategy",{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8",Authorization:`Bearer ${token}`},body:JSON.stringify(body)},{attempts:1,timeoutMs:58000});
}

export default function WarZoneView({dossier,actors,watch,onOpenActor,onActions}:Props){
  const [strategy,setStrategy]=useState<DetailedStrategy|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const index=useMemo(()=>strategicIndex(actors,watch),[actors,watch]);
  const actorMap=useMemo(()=>new Map(actors.map(actor=>[actor.id,actor])),[actors]);

  async function generate(){
    if(!dossier||!actors.length)return;
    setLoading(true);setError("");setSaved(false);
    try{
      const payload=await postStrategy<StrategyPayload>({dossier,actors,watch});
      if(!payload.strategy)throw new Error("La War Zone n’a pas retourné de stratégie exploitable.");
      setStrategy(payload.strategy);
    }catch(err:any){setError(err?.message||"Impossible de générer la stratégie détaillée.");}
    finally{setLoading(false);}
  }

  async function addPlan(){
    if(!dossier||!strategy||!onActions)return;
    setSaving(true);setSaved(false);
    try{
      const drafts:WarZoneActionDraft[]=strategy.sequence.map(step=>({
        dossier_id:dossier.id,
        type:"influence",
        title:step.title,
        actor_name:step.target_name||undefined,
        priority:step.order<=2?"high":step.order<=4?"medium":"low",
        due_date:null,
        description:[`Objectif : ${step.objective}`,`Pourquoi maintenant : ${step.why_now}`,`Moyens : ${step.means.join(" ; ")}`,`Livrable : ${step.deliverable}`,`Cadre factuel : ${step.message_frame}`,`Dépendance : ${step.dependency}`,`Signal de réussite : ${step.success_signal}`,`Fallback : ${step.fallback}`,`Risque : ${step.risk}`].join("\n"),
      }));
      await onActions(drafts);setSaved(true);
    }finally{setSaving(false);}
  }

  if(!dossier)return <Empty icon={<Target size={38}/>} title="Sélectionnez un dossier" text="La War Zone construit sa stratégie à partir de l’objectif, du Radar et de la veille."/>;
  if(!actors.length)return <Empty icon={<Users size={38}/>} title="Générez d’abord le Radar" text="La War Zone a besoin d’acteurs qualifiés avant de construire un ciblage institutionnel exploitable."/>;

  return <div className={styles.page}>
    <section className={styles.objectiveCard}>
      <div><span className={styles.eyebrow}>Objectif stratégique</span><h2>{dossier.objective||dossier.title}</h2><p>{dossier.context||"Contexte du dossier à préciser."}</p></div>
      <div className={styles.indexBox}><span>Préparation du dossier</span><div><strong>{index}</strong><em>/100</em></div><small>{actors.length} acteur(s) Radar · {watch.length} évolution(s) liée(s)</small></div>
    </section>

    {!strategy?<section className={styles.launchCard}>
      <Sparkles size={31}/><h3>Construire le plan de ciblage opérationnel</h3>
      <p>Myvor va déterminer précisément les cibles institutionnelles, le sujet à traiter avec chacune, la raison du ciblage, le canal recommandé, les moyens documentaires, le timing, les preuves à mobiliser et le signal de réussite.</p>
      {error&&<div className={styles.error}>{error}</div>}
      <button onClick={()=>void generate()} disabled={loading}>{loading?<RefreshCw size={16} className={styles.spin}/>:<Sparkles size={16}/>} {loading?"Analyse stratégique…":"Générer la stratégie détaillée"}</button>
    </section>:<>
      <div className={styles.topActions}><button className={styles.secondary} onClick={()=>void generate()} disabled={loading}><RefreshCw size={14} className={loading?styles.spin:""}/>Recalculer</button><button className={styles.primary} onClick={()=>void addPlan()} disabled={!onActions||saving}>{saved?<CheckCircle2 size={14}/>:<Plus size={14}/>} {saving?"Ajout…":saved?"Plan ajouté":"Ajouter le plan aux actions"}</button></div>
      {error&&<div className={styles.error}>{error}</div>}

      <section className={styles.section}>
        <SectionTitle number="01" title="Diagnostic de situation" subtitle="Le point de décision concret que la War Zone cherche à faire progresser."/>
        <div className={styles.diagnosisGrid}>
          <Diagnostic label="Décision à obtenir / clarifier" value={strategy.diagnosis.decision_point}/>
          <Diagnostic label="Contrainte actuelle" value={strategy.diagnosis.current_constraint}/>
          <Diagnostic label="Fenêtre d’opportunité" value={strategy.diagnosis.opportunity_window}/>
          <Diagnostic label="Chemin recommandé" value={strategy.diagnosis.recommended_path}/>
        </div>
      </section>

      <section className={styles.section}>
        <SectionTitle number="02" title="Cibles institutionnelles" subtitle="Pour chaque cible : qui, quoi, pourquoi, comment, avec quels moyens et quel signal de réussite."/>
        <div className={styles.targets}>{strategy.targets.map(target=>{
          const actor=actorMap.get(target.actor_id);return <article key={`${target.actor_id}-${target.priority}`} className={styles.targetDetail}>
            <header><div className={styles.rank}>0{target.priority}</div><div><span className={styles.targetKicker}>Cible prioritaire</span><h3>{target.name}</h3><p>{target.role}{target.institution?` · ${target.institution}`:""}</p></div>{actor&&<button className={styles.openActor} onClick={()=>onOpenActor(actor)}>Voir dans le Radar <ArrowRight size={13}/></button>}</header>
            <div className={styles.targetMatrix}>
              <TargetField label="Pourquoi cette cible ?" value={target.why_this_target}/>
              <TargetField label="Sujet précis à traiter" value={target.precise_subject}/>
              <TargetField label="Objectif institutionnel" value={target.institutional_goal}/>
              <TargetField label="Canal recommandé" value={target.recommended_channel}/>
              <TargetField label="Format / moyen" value={target.recommended_format}/>
              <TargetField label="Quand agir" value={target.timing}/>
            </div>
            <div className={styles.twoCols}>
              <div className={styles.subCard}><span>Angles factuels à porter</span><ul>{target.factual_angles.map((angle,i)=><li key={i}>{angle}</li>)}</ul></div>
              <div className={styles.subCard}><span>Preuves à mobiliser</span>{target.evidence_indexes.length?<ul>{target.evidence_indexes.map(index=><li key={index}>{evidenceLabel(index,watch)}</li>)}</ul>:<p>Aucune source directe suffisante : commencer par consolider la preuve.</p>}</div>
            </div>
            <div className={styles.outcomes}><div><CheckCircle2 size={14}/><span><b>Signal de réussite</b>{target.success_signal}</span></div><div><ArrowRight size={14}/><span><b>Fallback</b>{target.fallback}</span></div><div><AlertTriangle size={14}/><span><b>Ne pas supposer</b>{target.do_not_assume}</span></div></div>
          </article>})}</div>
      </section>

      <section className={styles.section}>
        <SectionTitle number="03" title="Séquence d’influence" subtitle="L’ordre des mouvements, leurs moyens concrets, leurs dépendances et leurs critères de sortie."/>
        <div className={styles.sequence}>{strategy.sequence.map(step=>{
          const actor=actorMap.get(step.target_actor_id);return <article key={`${step.order}-${step.title}`} className={styles.step}>
            <div className={styles.stepOrder}>{step.order}</div><div className={styles.stepBody}>
              <div className={styles.stepHead}><div><span>Mouvement {step.order}</span><h4>{step.title}</h4>{step.target_name&&<p>Cible : {step.target_name}</p>}</div><em>{step.timing}</em></div>
              <div className={styles.stepGrid}><TargetField label="Objectif" value={step.objective}/><TargetField label="Pourquoi maintenant" value={step.why_now}/><TargetField label="Livrable" value={step.deliverable}/><TargetField label="Dépendance" value={step.dependency}/></div>
              <div className={styles.twoCols}><div className={styles.subCard}><span>Moyens</span><ul>{step.means.map((mean,i)=><li key={i}>{mean}</li>)}</ul></div><div className={styles.subCard}><span>Cadre du message</span><p>{step.message_frame}</p></div></div>
              {step.evidence_indexes.length>0&&<div className={styles.evidenceLine}><FileText size={14}/><span>{step.evidence_indexes.map(index=>evidenceLabel(index,watch)).join(" · ")}</span></div>}
              <div className={styles.outcomes}><div><CheckCircle2 size={14}/><span><b>Réussite</b>{step.success_signal}</span></div><div><ArrowRight size={14}/><span><b>Si ça ne marche pas</b>{step.fallback}</span></div><div><AlertTriangle size={14}/><span><b>Risque</b>{step.risk}</span></div></div>
              {actor&&<button className={styles.actorLink} onClick={()=>onOpenActor(actor)}>Ouvrir la fiche de {actor.name} <ExternalLink size={12}/></button>}
            </div>
          </article>})}</div>
      </section>

      <section className={styles.section}>
        <SectionTitle number="04" title="Garde-fous et points à vérifier" subtitle="Ce qui doit déclencher une correction de trajectoire plutôt qu’une recommandation inventée."/>
        <div className={styles.guardGrid}><div className={styles.guardBox}><span>Données manquantes</span>{strategy.evidence_gaps.length?<ul>{strategy.evidence_gaps.map((item,i)=><li key={i}>{item}</li>)}</ul>:<p>Aucun manque critique identifié par le moteur.</p>}</div><div className={styles.guardBox}><span>Règles d’arrêt / changement</span><ul>{strategy.stop_rules.map((item,i)=><li key={i}>{item}</li>)}</ul></div></div>
        <div className={styles.review}><CircleDot size={15}/><div><b>Déclencheur de révision</b><span>{strategy.review_trigger}</span></div></div>
      </section>

      <section className={styles.guardrail}><ShieldCheck size={17}/><div><b>Cadre Myvor</b><span>Le ciblage repose sur la fonction institutionnelle, le rôle dans le dossier et des arguments factuels. Aucune donnée privée, vulnérabilité personnelle, manipulation ou microciblage politique individuel n’est utilisé.</span></div></section>
    </>}
  </div>;
}

function Empty({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <div className={styles.empty}>{icon}<h3>{title}</h3><p>{text}</p></div>}
function SectionTitle({number,title,subtitle}:{number:string;title:string;subtitle:string}){return <div className={styles.sectionTitle}><span>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div>}
function Diagnostic({label,value}:{label:string;value:string}){return <div className={styles.diagnostic}><span>{label}</span><p>{value}</p></div>}
function TargetField({label,value}:{label:string;value:string}){return <div className={styles.targetField}><span>{label}</span><p>{value||"À préciser"}</p></div>}
