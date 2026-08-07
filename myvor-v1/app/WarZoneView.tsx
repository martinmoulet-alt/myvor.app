"use client";

import { useMemo,useState } from "react";
import { ArrowRight,CheckCircle2,CircleDot,Flag,Layers3,Plus,ShieldCheck,Sparkles,Target,Users } from "lucide-react";
import styles from "./WarZoneView.module.css";

export type WarZoneActor={id:string;name:string;role:string;institution?:string;orbit:1|2|3;position?:string;influence:number;influence_score?:number;why:string;window:string;action:string;certainty?:string};
export type WarZoneDossier={id:string;client:string;title:string;objective:string;context:string;key_deadlines?:string[]};
export type WarZoneWatch={id:string;title:string;nature:string;urgency:string;created_at:string;published_at?:string|null};
export type WarZoneActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};

type ScenarioId="institutionnel"|"coalition"|"contribution";
type Scenario={id:ScenarioId;name:string;tagline:string;impact:number;feasibility:number;speed:number;risk:number;summary:string;lever:string};
type PlanStep={id:string;order:number;title:string;actor?:WarZoneActor;purpose:string;deliverable:string;timing:string;priority:"high"|"medium"|"low";expected:string};

type Props={dossier:WarZoneDossier|null;actors:WarZoneActor[];watch:WarZoneWatch[];onOpenActor:(actor:WarZoneActor)=>void;onActions?:(drafts:WarZoneActionDraft[])=>Promise<void>|void};

function score(actor:WarZoneActor){const raw=Number(actor.influence_score);return Number.isFinite(raw)?Math.max(0,Math.min(100,Math.round(raw))):Math.max(20,Math.min(100,Math.round((actor.influence||1)*20)));}
function positionWeight(position?:string){if(position==="favorable")return 1;if(position==="reserve")return .35;if(position==="opposition")return -.7;return 0;}
function urgencyWeight(value?:string){const key=String(value||"").toLowerCase();if(key.includes("absolument"))return 4;if(key.includes("fort"))return 3;if(key.includes("moyen"))return 2;return 1;}
function strategicIndex(actors:WarZoneActor[],watch:WarZoneWatch[]){if(!actors.length)return 20;const actorBase=actors.reduce((sum,actor)=>sum+score(actor)*(1+positionWeight(actor.position)*.2),0)/actors.length;const evidence=Math.min(12,watch.length*1.5);return Math.max(18,Math.min(88,Math.round(actorBase*.72+evidence)));}
function topActors(actors:WarZoneActor[]){return [...actors].sort((a,b)=>score(b)-score(a)).slice(0,4);}
function firstDeadline(dossier:WarZoneDossier|null){return dossier?.key_deadlines?.find(Boolean)||"Prochaine échéance du dossier";}

function buildScenarios(index:number):Scenario[]{return[
  {id:"institutionnel",name:"Institutionnel",tagline:"Sécuriser les décideurs et relais formels",impact:Math.min(94,index+24),feasibility:78,speed:74,risk:26,summary:"Concentrer l’effort sur les acteurs disposant du pouvoir institutionnel le plus direct, avec des prises de contact transparentes et un argumentaire fondé sur les enjeux du dossier.",lever:"Brief décisionnel + rendez-vous institutionnels + suivi des arbitrages"},
  {id:"coalition",name:"Coalition",tagline:"Créer un front d’intérêts convergents",impact:Math.min(90,index+19),feasibility:69,speed:55,risk:31,summary:"Faire émerger des positions convergentes entre organisations concernées afin d’augmenter la crédibilité et la portée de la contribution au débat public.",lever:"Coalition sectorielle + éléments communs + relais publics"},
  {id:"contribution",name:"Expertise & contribution",tagline:"Faire peser la preuve et la rédaction",impact:Math.min(92,index+21),feasibility:84,speed:82,risk:18,summary:"Transformer les enjeux du dossier en contribution formelle : note d’impact, proposition de rédaction, réponse à consultation ou argumentaire technique sourcé.",lever:"Note technique + proposition de rédaction + contribution formelle"},
];}

function buildPlan(scenario:ScenarioId,dossier:WarZoneDossier|null,actors:WarZoneActor[],watch:WarZoneWatch[]):PlanStep[]{
  const targets=topActors(actors);const deadline=firstDeadline(dossier);const strongest=targets[0];const second=targets[1];const watchCount=watch.length;
  if(scenario==="coalition")return[
    {id:"c1",order:1,title:"Définir le socle commun",purpose:"Identifier 2 à 3 enjeux pouvant être portés publiquement par plusieurs parties prenantes.",deliverable:"Argumentaire commun 1 page",timing:"Immédiat",priority:"high",expected:"Message plus robuste et moins isolé"},
    {id:"c2",order:2,title:"Qualifier les relais sectoriels",actor:second||strongest,purpose:"Prioriser les organisations ou relais institutionnels déjà proches du sujet.",deliverable:"Liste courte des relais + angle commun",timing:`Avant ${deadline}`,priority:"high",expected:"Coalition crédible avant l’échéance"},
    {id:"c3",order:3,title:"Formaliser une contribution commune",purpose:`Transformer les ${watchCount} évolution${watchCount>1?"s":""} du dossier en proposition claire et sourcée.`,deliverable:"Contribution / position commune",timing:`Avant ${deadline}`,priority:"medium",expected:"Capacité accrue à peser dans le débat"},
  ];
  if(scenario==="contribution")return[
    {id:"e1",order:1,title:"Isoler le point à faire évoluer",purpose:"Formuler une demande précise, vérifiable et directement reliée à l’objectif du dossier.",deliverable:"Objectif de rédaction / modification",timing:"Immédiat",priority:"high",expected:"Demande compréhensible en moins d’une minute"},
    {id:"e2",order:2,title:"Construire la preuve",purpose:`Exploiter les ${watchCount} évolution${watchCount>1?"s":""} disponibles et les sources du dossier pour étayer les effets attendus.`,deliverable:"Note technique sourcée",timing:"Sous 48 h",priority:"high",expected:"Argumentaire défendable et vérifiable"},
    {id:"e3",order:3,title:"Porter la contribution",actor:strongest,purpose:"Présenter la proposition via un canal institutionnel ou public adapté au rôle de la cible.",deliverable:"Brief + proposition de rédaction",timing:`Avant ${deadline}`,priority:"high",expected:"Intégration possible dans l’arbitrage"},
  ];
  return[
    {id:"i1",order:1,title:"Sécuriser le décideur prioritaire",actor:strongest,purpose:"Clarifier son rôle, ses contraintes institutionnelles et les éléments du dossier à lui présenter.",deliverable:"Brief décisionnel 1 page",timing:"Immédiat",priority:"high",expected:"Point d’entrée institutionnel clairement établi"},
    {id:"i2",order:2,title:"Créer un relais complémentaire",actor:second,purpose:"Éviter une stratégie mono-acteur en ouvrant un second canal institutionnel cohérent.",deliverable:"Argumentaire adapté au rôle",timing:"Sous 72 h",priority:"high",expected:"Deux points d’appui au lieu d’un"},
    {id:"i3",order:3,title:"Consolider avant l’échéance",purpose:"Mettre à jour l’argumentaire avec les nouvelles évolutions et vérifier les arbitrages intervenus.",deliverable:"Brief de suivi",timing:`Avant ${deadline}`,priority:"medium",expected:"Réduction du risque de décalage stratégique"},
  ];
}

export default function WarZoneView({dossier,actors,watch,onOpenActor,onActions}:Props){
  const [generated,setGenerated]=useState(false);const [scenarioId,setScenarioId]=useState<ScenarioId>("institutionnel");const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(false);
  const index=useMemo(()=>strategicIndex(actors,watch),[actors,watch]);const target=Math.min(95,index+18);const scenarios=useMemo(()=>buildScenarios(index),[index]);const targets=useMemo(()=>topActors(actors),[actors]);const active=scenarios.find(item=>item.id===scenarioId)||scenarios[0];const plan=useMemo(()=>buildPlan(scenarioId,dossier,actors,watch),[scenarioId,dossier,actors,watch]);
  async function addPlan(){if(!dossier||!onActions)return;setSaving(true);setSaved(false);try{await onActions(plan.map(step=>({dossier_id:dossier.id,type:"influence",title:step.title,description:`${step.purpose} Livrable : ${step.deliverable}. Effet attendu : ${step.expected}.`,actor_name:step.actor?.name,priority:step.priority,due_date:null})));setSaved(true);}finally{setSaving(false);}}
  if(!dossier)return <div className={styles.empty}><Target size={38}/><h3>Sélectionnez un dossier</h3><p>La War Zone construit la stratégie à partir de l’objectif, du Radar et de la veille.</p></div>;
  if(!actors.length)return <div className={styles.empty}><Users size={38}/><h3>Générez d’abord le Radar</h3><p>La War Zone utilise les acteurs qualifiés du Radar pour construire une stratégie exploitable.</p></div>;
  return <div className={styles.page}>
    <section className={styles.objectiveCard}>
      <div><span className={styles.eyebrow}>Objectif stratégique</span><h2>{dossier.objective||dossier.title}</h2><p>La stratégie est construite à partir des acteurs, échéances et évolutions rattachés au dossier.</p></div>
      <div className={styles.indexBox}><span>Indice stratégique</span><div><strong>{index}</strong><em>/100</em><ArrowRight size={18}/><strong>{target}</strong><em>cible</em></div><small>Indice de configuration, pas une probabilité de succès.</small></div>
    </section>

    {!generated?<section className={styles.launchCard}><Sparkles size={30}/><h3>Construire la stratégie d’influence</h3><p>Myvor va organiser les cibles, leviers et actions autour de l’objectif du dossier, sans utiliser de profilage personnel ni de techniques de manipulation.</p><button onClick={()=>setGenerated(true)}><Sparkles size={16}/>Générer la stratégie</button></section>:<>
      <section className={styles.section}><div className={styles.sectionTitle}><div><span>01</span><div><h3>Cibles prioritaires</h3><p>Acteurs à traiter en premier selon leur poids institutionnel et leur proximité avec le dossier.</p></div></div></div><div className={styles.targetGrid}>{targets.map((actor,indexTarget)=><button key={actor.id} className={styles.targetCard} onClick={()=>onOpenActor(actor)}><div className={styles.targetRank}>0{indexTarget+1}</div><div className={styles.targetMain}><b>{actor.name}</b><span>{actor.role}</span><small>{actor.institution||"Institution à préciser"}</small></div><div className={styles.targetScore}><strong>{score(actor)}</strong><span>/100</span></div></button>)}</div></section>

      <section className={styles.section}><div className={styles.sectionTitle}><div><span>02</span><div><h3>Scénarios stratégiques</h3><p>Sélectionnez une voie d’action. Les scores sont comparatifs et explicables.</p></div></div></div><div className={styles.scenarioGrid}>{scenarios.map(item=><button key={item.id} onClick={()=>setScenarioId(item.id)} className={`${styles.scenarioCard} ${scenarioId===item.id?styles.scenarioActive:""}`}><div className={styles.scenarioTop}><span>{item.name}</span>{scenarioId===item.id&&<CheckCircle2 size={17}/>}</div><h4>{item.tagline}</h4><p>{item.summary}</p><div className={styles.metrics}><Metric label="Impact" value={item.impact}/><Metric label="Faisabilité" value={item.feasibility}/><Metric label="Vitesse" value={item.speed}/><Metric label="Risque" value={item.risk} inverse/></div><div className={styles.lever}><Layers3 size={14}/>{item.lever}</div></button>)}</div></section>

      <section className={styles.section}><div className={styles.sectionTitle}><div><span>03</span><div><h3>Plan d’action — {active.name}</h3><p>Une séquence courte, orientée décision et échéance.</p></div></div><button className={styles.addPlan} onClick={()=>void addPlan()} disabled={!onActions||saving}>{saved?<CheckCircle2 size={15}/>:<Plus size={15}/>} {saving?"Ajout…":saved?"Plan ajouté":"Ajouter aux actions"}</button></div><div className={styles.plan}>{plan.map(step=><article key={step.id} className={styles.step}><div className={styles.stepOrder}>{step.order}</div><div className={styles.stepBody}><div className={styles.stepHead}><div><b>{step.title}</b>{step.actor&&<button onClick={()=>onOpenActor(step.actor)}>{step.actor.name}</button>}</div><span className={styles[step.priority]}>{step.timing}</span></div><p>{step.purpose}</p><div className={styles.stepMeta}><span><Flag size={13}/>Livrable : {step.deliverable}</span><span><CircleDot size={13}/>Effet attendu : {step.expected}</span></div></div></article>)}</div></section>

      <section className={styles.guardrail}><ShieldCheck size={17}/><div><b>Cadre Myvor</b><span>La War Zone recommande des actions transparentes d’affaires publiques fondées sur les enjeux, les sources et les fonctions institutionnelles. Elle n’utilise pas de vulnérabilités personnelles, de données privées ou de profilage psychologique.</span></div></section>
    </>}
  </div>;
}

function Metric({label,value,inverse=false}:{label:string;value:number;inverse?:boolean}){const display=inverse?100-value:value;return <div className={styles.metric}><div><span>{label}</span><b>{value}</b></div><div><i style={{width:`${Math.max(4,Math.min(100,display))}%`}}/></div></div>;}
