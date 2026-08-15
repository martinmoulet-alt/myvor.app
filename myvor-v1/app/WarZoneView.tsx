"use client";

import {useEffect,useMemo,useState,type ReactNode} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,CircleDot,ExternalLink,FileText,Plus,RefreshCw,ShieldCheck,Sparkles,Target,Users} from "lucide-react";
import {listProductions,saveProduction,updateProductionContent,type Production} from "@/lib/productions";
import {supabase} from "@/lib/supabase";
import styles from "./WarZoneView.module.css";

export type WarZoneActor={id:string;name:string;role:string;institution?:string;orbit:1|2|3;position?:string;influence:number;influence_score?:number;why:string;window:string;action:string;certainty?:string};
export type WarZoneDossier={id:string;client:string;title:string;objective:string;context:string;key_deadlines?:string[]};
export type WarZoneWatch={id:string;title:string;nature:string;urgency:string;created_at:string;published_at?:string|null;source_url?:string;source_name?:string|null};
export type WarZoneActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};

type StrategyTarget={actor_id:string;name:string;role:string;institution:string;priority:number;why_this_target:string;institutional_goal:string;precise_subject:string;recommended_channel:string;recommended_format:string;factual_angles:string[];evidence_indexes:number[];timing:string;success_signal:string;fallback:string;do_not_assume:string};
type StrategyStep={order:number;title:string;target_actor_id:string;target_name:string;objective:string;why_now:string;means:string[];deliverable:string;message_frame:string;evidence_indexes:number[];timing:string;dependency:string;success_signal:string;fallback:string;risk:string};
type DetailedStrategy={diagnosis:{objective:string;decision_point:string;current_constraint:string;opportunity_window:string;recommended_path:string};targets:StrategyTarget[];sequence:StrategyStep[];evidence_gaps:string[];stop_rules:string[];review_trigger:string};
type StrategyPayload={strategy?:DetailedStrategy;engine?:string;model?:string;watch_items_used?:number;actors_used?:number;degraded?:boolean;warning?:string;specificity_gate?:string;premium_status?:"premium"|"premium_repaired"|"continuity"};
type StrategyRequest={dossier:WarZoneDossier;actors:WarZoneActor[];watch:WarZoneWatch[]};
type Props={dossier:WarZoneDossier|null;actors:WarZoneActor[];watch:WarZoneWatch[];onOpenActor:(actor:WarZoneActor)=>void;onActions?:(drafts:WarZoneActionDraft[])=>Promise<void>|void;onOpenBuilder?:(dossierId:string)=>void;onOpenActions?:()=>void};

type WarZoneProductionContent={strategy?:DetailedStrategy;watch_ids?:string[];actor_ids?:string[];status?:"draft"|"plan_added";engine?:string|null;model?:string|null;generated_at?:string;plan_added_at?:string;degraded?:boolean;warning?:string|null;specificity_gate?:string|null;premium_status?:"premium"|"premium_repaired"|"continuity"|null};

function score(actor:WarZoneActor){const raw=Number(actor.influence_score);return Number.isFinite(raw)?Math.max(0,Math.min(100,Math.round(raw))):Math.max(20,Math.min(100,Math.round((actor.influence||1)*20)));}
function strategicIndex(actors:WarZoneActor[],watch:WarZoneWatch[]){if(!actors.length)return 20;const actorBase=actors.reduce((sum,actor)=>sum+score(actor),0)/actors.length;const evidence=Math.min(16,watch.length*1.5);return Math.max(18,Math.min(92,Math.round(actorBase*.76+evidence)));}
function evidenceFor(index:number,watch:WarZoneWatch[]){return index>=1&&index<=watch.length?watch[index-1]:null;}
function evidenceLabel(index:number,watch:WarZoneWatch[]){const item=evidenceFor(index,watch);return item?`${item.nature} — ${item.title}`:`Source ${index}`;}
function contentOf(production:Production|null){return (production?.content||{}) as WarZoneProductionContent;}
function sameIds(a:string[],b:string[]){if(a.length!==b.length)return false;const set=new Set(a);return b.every(id=>set.has(id));}
function versionLabel(item:Production,index:number,total:number){const date=new Date(item.created_at);const when=Number.isNaN(date.getTime())?"":date.toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});return `V${total-index}${when?` · ${when}`:""}`;}
function matchesContext(content:WarZoneProductionContent,watchIds:string[],actorIds:string[]){return Boolean(content.strategy&&Array.isArray(content.watch_ids)&&Array.isArray(content.actor_ids)&&sameIds(content.watch_ids,watchIds)&&sameIds(content.actor_ids,actorIds));}
function priorityClass(priority:number){return priority<=1?styles.priorityCritical:priority===2?styles.priorityHigh:priority===3?styles.priorityMedium:styles.priorityLow;}
function stepPriorityClass(order:number){return order<=1?styles.stepCritical:order===2?styles.stepHigh:order===3?styles.stepMedium:styles.stepLow;}

async function postStrategy<T>(body:StrategyRequest):Promise<T>{
  if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  const {data:sessionData}=await supabase.auth.getSession();
  if(!sessionData.session?.access_token)throw new Error("Session Myvor requise.");
  const {data,error}=await supabase.functions.invoke("warzone-strategy",{body});
  if(error)throw new Error(error.message||"La stratégie détaillée est indisponible.");
  if(!data)throw new Error("La War Zone n’a retourné aucune donnée.");
  return data as T;
}

export default function WarZoneView({dossier,actors,watch,onOpenActor,onActions,onOpenBuilder,onOpenActions}:Props){
  const [strategy,setStrategy]=useState<DetailedStrategy|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [versions,setVersions]=useState<Production[]>([]);
  const [productionId,setProductionId]=useState<string|null>(null);

  const strategyActors=useMemo(()=>[...actors].sort((a,b)=>score(b)-score(a)).slice(0,4),[actors]);
  const strategyWatch=useMemo(()=>watch.slice(0,8),[watch]);
  const index=useMemo(()=>strategicIndex(strategyActors,strategyWatch),[strategyActors,strategyWatch]);
  const actorMap=useMemo(()=>new Map(actors.map(actor=>[actor.id,actor])),[actors]);
  const currentProduction=useMemo(()=>versions.find(item=>item.id===productionId)||null,[versions,productionId]);
  const currentContent=contentOf(currentProduction);
  const currentWatchIds=useMemo(()=>strategyWatch.map(item=>item.id),[strategyWatch]);
  const currentActorIds=useMemo(()=>strategyActors.map(actor=>actor.id),[strategyActors]);
  const currentContextMatches=Boolean(currentProduction&&matchesContext(currentContent,currentWatchIds,currentActorIds));
  const contextChanged=Boolean(strategy&&!currentContextMatches);
  const executionStatus=currentContent.status==="plan_added"?"Plan ajouté aux actions":currentContextMatches&&currentContent.degraded?"Plan de continuité":currentContextMatches?"Stratégie premium prête":"Contexte différent";
  const contextKey=useMemo(()=>`${dossier?.id||""}|${[...currentWatchIds].sort().join(",")}|${[...currentActorIds].sort().join(",")}`,[dossier?.id,currentWatchIds,currentActorIds]);

  useEffect(()=>{
    let active=true;
    setStrategy(null);setVersions([]);setProductionId(null);setSaved(false);setError("");
    if(!dossier?.id)return()=>{active=false;};
    listProductions(dossier.id).then(({data})=>{
      if(!active)return;
      const history=data.filter(item=>item.type==="warzone");
      setVersions(history);
      const compatible=history.find(item=>matchesContext(contentOf(item),currentWatchIds,currentActorIds))||null;
      if(compatible){const content=contentOf(compatible);setStrategy(content.strategy||null);setProductionId(compatible.id);setSaved(content.status==="plan_added");}
    }).catch(()=>undefined);
    return()=>{active=false;};
  },[contextKey]);

  function selectVersion(id:string){
    if(!id){setProductionId(null);setStrategy(null);setSaved(false);setError("");return;}
    const selected=versions.find(item=>item.id===id)||null;
    const content=contentOf(selected);
    setProductionId(id);setStrategy(content.strategy||null);setSaved(content.status==="plan_added");setError("");
  }

  async function generate(){
    if(!dossier||!strategyActors.length)return;
    if(!strategyWatch.length){setError("La War Zone a besoin d’au moins un signal de veille pour produire une stratégie documentée.");return;}
    setLoading(true);setError("");setSaved(false);
    try{
      const payload=await postStrategy<StrategyPayload>({dossier,actors:strategyActors,watch:strategyWatch});
      if(!payload.strategy)throw new Error("La War Zone n’a pas retourné de stratégie exploitable.");
      const generatedAt=new Date().toISOString();
      const content:WarZoneProductionContent={strategy:payload.strategy,watch_ids:currentWatchIds,actor_ids:currentActorIds,status:"draft",engine:payload.engine||null,model:payload.model||null,generated_at:generatedAt,degraded:Boolean(payload.degraded),warning:payload.warning||null,specificity_gate:payload.specificity_gate||null,premium_status:payload.premium_status||null};
      const result=await saveProduction({dossier_id:dossier.id,type:"warzone",title:`War Zone — ${dossier.title}`,content:content as unknown as Record<string,unknown>});
      if(result.error)throw result.error;
      setStrategy(payload.strategy);
      if(result.data){setVersions(current=>[result.data!,...current.filter(item=>item.id!==result.data!.id)]);setProductionId(result.data.id);}
    }catch(err:any){setError(err?.message||"Impossible de générer la stratégie détaillée.");}
    finally{setLoading(false);}
  }

  async function addPlan(){
    if(!dossier||!strategy||!onActions)return;
    if(!currentContextMatches){setError("Cette version de War Zone ne correspond plus au Radar et à la veille actuels. Recalcule la stratégie avant de l’ajouter aux actions.");return;}
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
      if(productionId&&currentProduction){
        const nextContent={...currentContent,status:"plan_added" as const,plan_added_at:new Date().toISOString()};
        const updated=await updateProductionContent(productionId,nextContent as unknown as Record<string,unknown>);
        if(!updated.error&&updated.data)setVersions(current=>current.map(item=>item.id===productionId?updated.data!:item));
      }
    }catch(err:any){setError(err?.message||"Impossible d’ajouter le plan aux actions.");}
    finally{setSaving(false);}
  }

  if(!dossier)return <Empty icon={<Target size={38}/>} title="Sélectionnez un dossier" text="La War Zone construit sa stratégie à partir de l’objectif, du Radar et de la veille."/>;
  if(!strategyActors.length)return <Empty icon={<Users size={38}/>} title="Générez d’abord le Radar" text="La War Zone a besoin d’acteurs qualifiés avant de construire un ciblage institutionnel exploitable."/>;

  return <div className={styles.page}>
    <section className={styles.objectiveCard}>
      <div><span className={styles.eyebrow}>Objectif stratégique</span><h2>{dossier.objective||dossier.title}</h2><p>{dossier.context||"Contexte du dossier à préciser."}</p></div>
      <div className={styles.indexBox}><span>Préparation du dossier</span><div><strong>{index}</strong><em>/100</em></div><small>{strategyActors.length} acteur(s) prioritaire(s) · {strategyWatch.length} signal(aux) utilisé(s)</small></div>
    </section>

    {versions.length>0&&<section className={styles.versionBar}>
      <b>Versions War Zone · {versions.length}</b>
      <select aria-label="Version de la War Zone" value={productionId||""} onChange={event=>selectVersion(event.target.value)}><option value="">Contexte actuel — nouvelle stratégie</option>{versions.map((item,versionIndex)=><option key={item.id} value={item.id}>{versionLabel(item,versionIndex,versions.length)}</option>)}</select>
      <span className={currentContent.status==="plan_added"&&currentContextMatches?styles.statusDone:styles.statusNeutral}>{executionStatus}</span>
      {currentContent.degraded&&currentContextMatches&&<span className={styles.statusDegraded}>Mode continuité · à consolider</span>}
      {contextChanged&&<span className={styles.statusChanged}>Radar ou veille modifié · recalcul requis avant exécution</span>}
    </section>}

    {!strategy?<section className={styles.launchCard}>
      <Sparkles size={31}/><h3>Construire le plan de ciblage opérationnel</h3>
      <p>Myvor utilise les quatre acteurs Radar les plus prioritaires et jusqu’à huit signaux de veille du contexte courant pour déterminer les cibles, le sujet précis, le canal, le livrable, le timing, les preuves et le signal de réussite.</p>
      {error&&<div className={styles.error}>{error}</div>}
      <button onClick={()=>void generate()} disabled={loading||!strategyWatch.length}>{loading?<RefreshCw size={16} className={styles.spin}/>:<Sparkles size={16}/>} {loading?"Analyse stratégique…":"Générer la stratégie détaillée"}</button>
    </section>:<>
      {currentContent.degraded&&currentContextMatches&&<div className={styles.degradedBanner}><AlertTriangle size={16}/><div><b>Plan de continuité à consolider</b><span>{currentContent.warning||"Le moteur premium n’a pas abouti. Cette version reste fondée sur les acteurs Radar et les preuves de veille disponibles, sans invention de faits."}</span></div></div>}
      <div className={styles.topActions}>
        <button className={styles.secondary} onClick={()=>void generate()} disabled={loading}><RefreshCw size={14} className={loading?styles.spin:""}/>{contextChanged?"Recalculer avec le contexte actuel":"Recalculer"}</button>
        {onOpenBuilder&&<button className={styles.secondary} onClick={()=>onOpenBuilder(dossier.id)}><FileText size={14}/>Créer un livrable</button>}
        {onOpenActions&&<button className={styles.secondary} onClick={onOpenActions}><ArrowRight size={14}/>Voir les actions</button>}
        <button className={styles.primary} onClick={()=>void addPlan()} disabled={!onActions||saving||!currentContextMatches}>{saved&&currentContextMatches?<CheckCircle2 size={14}/>:<Plus size={14}/>} {saving?"Ajout…":saved&&currentContextMatches?"Plan ajouté":contextChanged?"Recalcul requis":"Ajouter le plan aux actions"}</button>
      </div>
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
          const actor=actorMap.get(target.actor_id);return <article key={`${target.actor_id}-${target.priority}`} className={`${styles.targetDetail} ${priorityClass(target.priority)}`}>
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
              <div className={styles.subCard}><span>Preuves à mobiliser</span>{target.evidence_indexes.length?<ul>{target.evidence_indexes.map(sourceIndex=><li key={sourceIndex}>{evidenceLabel(sourceIndex,strategyWatch)}</li>)}</ul>:<p>Aucune source directe suffisante : commencer par consolider la preuve.</p>}</div>
            </div>
            <div className={styles.outcomes}><div className={styles.outcomeSuccess}><CheckCircle2 size={14}/><span><b>Signal de réussite</b>{target.success_signal}</span></div><div className={styles.outcomeFallback}><ArrowRight size={14}/><span><b>Fallback</b>{target.fallback}</span></div><div className={styles.outcomeRisk}><AlertTriangle size={14}/><span><b>Ne pas supposer</b>{target.do_not_assume}</span></div></div>
          </article>;})}</div>
      </section>

      <section className={styles.section}>
        <SectionTitle number="03" title="Séquence d’influence" subtitle="L’ordre des mouvements, leurs moyens concrets, leurs dépendances et leurs critères de sortie."/>
        <div className={styles.sequence}>{strategy.sequence.map(step=>{
          const actor=actorMap.get(step.target_actor_id);return <article key={`${step.order}-${step.title}`} className={`${styles.step} ${stepPriorityClass(step.order)}`}>
            <div className={styles.stepOrder}>{step.order}</div><div className={styles.stepBody}>
              <div className={styles.stepHead}><div><span>Mouvement {step.order}</span><h4>{step.title}</h4>{step.target_name&&<p>Cible : {step.target_name}</p>}</div><em>{step.timing}</em></div>
              <div className={styles.stepGrid}><TargetField label="Objectif" value={step.objective}/><TargetField label="Pourquoi maintenant" value={step.why_now}/><TargetField label="Livrable" value={step.deliverable}/><TargetField label="Dépendance" value={step.dependency}/></div>
              <div className={styles.twoCols}><div className={styles.subCard}><span>Moyens</span><ul>{step.means.map((mean,i)=><li key={i}>{mean}</li>)}</ul></div><div className={styles.subCard}><span>Cadre du message</span><p>{step.message_frame}</p></div></div>
              {step.evidence_indexes.length>0&&<div className={styles.evidenceLine}><FileText size={14}/><span>{step.evidence_indexes.map(sourceIndex=>evidenceLabel(sourceIndex,strategyWatch)).join(" · ")}</span></div>}
              <div className={styles.outcomes}><div className={styles.outcomeSuccess}><CheckCircle2 size={14}/><span><b>Réussite</b>{step.success_signal}</span></div><div className={styles.outcomeFallback}><ArrowRight size={14}/><span><b>Si ça ne marche pas</b>{step.fallback}</span></div><div className={styles.outcomeRisk}><AlertTriangle size={14}/><span><b>Risque</b>{step.risk}</span></div></div>
              {actor&&<button className={styles.actorLink} onClick={()=>onOpenActor(actor)}>Ouvrir la fiche de {actor.name} <ExternalLink size={12}/></button>}
            </div>
          </article>;})}</div>
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

function Empty({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <div className={styles.empty}>{icon}<h3>{title}</h3><p>{text}</p></div>;}
function SectionTitle({number,title,subtitle}:{number:string;title:string;subtitle:string}){return <div className={styles.sectionTitle}><span>{number}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div>;}
function Diagnostic({label,value}:{label:string;value:string}){return <div className={styles.diagnostic}><span>{label}</span><p>{value}</p></div>;}
function TargetField({label,value}:{label:string;value:string}){return <div className={styles.targetField}><span>{label}</span><p>{value||"À préciser"}</p></div>;}