"use client";

import { useEffect,useMemo,useState } from "react";
import { Building2,CalendarDays,ExternalLink,FileText,Orbit,RefreshCw,Sparkles,Target,Users,X } from "lucide-react";
import { listProductions,saveProduction } from "@/lib/productions";
import { presentableText } from "@/lib/presentation";
import { fetchJsonWithRetry } from "@/lib/reliability";
import { supabase } from "@/lib/supabase";
import styles from "./RadarCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;key_actors?:string[];key_deadlines?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type ActorEvidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position?:string;influence:number;why:string;window:string;action:string;certainty?:string;evidence:ActorEvidence};
type RadarPayload={actors?:Actor[];quality?:any;grounding?:any;engine?:string;model?:string};
type ActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};

const PRIORITY_COLORS={critical:"#c54a42",high:"#d76b22",medium:"#3d9553",low:"#65758a"};
const ORBIT_RADII:{[key in 1|2|3]:number}={1:145,2:230,3:315};
const ORBIT_DURATIONS:{[key in 1|2|3]:number}={1:25,2:33,3:42};

function priorityKey(influence:number){if(influence>=5)return "critical";if(influence>=4)return "high";if(influence>=3)return "medium";return "low";}
function priorityLabel(influence:number){if(influence>=5)return "Influence critique";if(influence>=4)return "Influence forte";if(influence>=3)return "Influence moyenne";return "Influence faible";}
function actorColor(actor:Actor){return PRIORITY_COLORS[priorityKey(actor.influence)];}
function bubbleSize(influence:number){return 72+Math.max(1,Math.min(5,Math.round(Number(influence)||1)))*10;}
function bubbleFontSize(name:string,size:number){const length=String(name||"").length;if(length>54)return 9;if(length>38)return 10;if(length>24)return 11;return Math.min(13,size/8.8);}
function orbitMotion(actor:Actor,actors:Actor[]){const same=actors.filter(item=>item.orbit===actor.orbit);const rank=Math.max(0,same.findIndex(item=>item.id===actor.id));const duration=ORBIT_DURATIONS[actor.orbit];const delay=-(duration*(rank/Math.max(1,same.length)))-(actor.orbit*.7);return{radius:ORBIT_RADII[actor.orbit],duration,delay,direction:actor.orbit===2?"reverse":"normal"};}
function actorsFromProduction(content:Record<string,unknown>){const raw=(content as any)?.actors;return Array.isArray(raw)?raw as Actor[]:[];}
function windowLabel(actors:Actor[],selected:Actor|null){const value=presentableText(selected?.window)||presentableText([...actors].sort((a,b)=>b.influence-a.influence)[0]?.window);return value||"À déterminer";}

async function postRadar<T>(body:unknown):Promise<T>{
  if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  const {data}=await supabase.auth.getSession();
  const token=data.session?.access_token;
  if(!token)throw new Error("Session Myvor requise.");
  return fetchJsonWithRetry<T>("/api/radar/fast",{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8",Authorization:`Bearer ${token}`},body:JSON.stringify(body)},{attempts:1,timeoutMs:18000,shouldRetry:()=>false});
}

export default function RadarModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[];onActions?:(drafts:ActionDraft[])=>Promise<void>|void}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [actors,setActors]=useState<Actor[]>([]);
  const [selected,setSelected]=useState<Actor|null>(null);
  const [grounding,setGrounding]=useState<any>(null);
  const [quality,setQuality]=useState<any>(null);
  const [generated,setGenerated]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);
  const source=related[0]||null;
  const influenceAverage=actors.length?Math.round(actors.reduce((sum,a)=>sum+a.influence,0)/actors.length*20):0;
  const strongest=actors.filter(a=>a.influence>=4).length;

  useEffect(()=>{let active=true;setSelected(null);setError("");if(!dossierId){setActors([]);setGenerated(false);return()=>{active=false;};}listProductions(dossierId).then(({data})=>{if(!active)return;const latest=data.find(item=>item.type==="radar");if(!latest){setActors([]);setGenerated(false);return;}const saved=actorsFromProduction(latest.content);setActors(saved);setQuality((latest.content as any)?.quality||null);setGrounding((latest.content as any)?.grounding||null);setGenerated(true);setSelected(saved[0]||null);}).catch(()=>undefined);return()=>{active=false;};},[dossierId]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}
    setLoading(true);setError("");
    try{
      const payload=await postRadar<RadarPayload>({dossier,items:related});
      const visible=(payload.actors||[]).slice(0,6);
      setActors(visible);setSelected(visible[0]||null);setGrounding(payload.grounding||null);setQuality(payload.quality||null);setGenerated(true);
      await saveProduction({dossier_id:dossier.id,type:"radar",title:`Radar d’influence — ${dossier.title}`,content:{actors:visible,item_ids:related.map(i=>i.id),source_url:source?.source_url||null,quality:payload.quality||null,grounding:payload.grounding||null,engine:payload.engine||null,model:payload.model||null}});
    }catch(err:any){setError(err?.message||"Génération impossible");}
    finally{setLoading(false);}
  }

  return <div className={styles.page}>
    <header className={styles.head}><div><div className={styles.kicker}>Cartographie stratégique</div><h1>Radar d’influence</h1><p>Une lecture simple des acteurs clés : orbite, influence et priorité d’action.</p></div><button className={styles.updateButton} onClick={generate} disabled={loading||!dossier||!related.length}><RefreshCw size={17} className={loading?styles.spin:""}/>{loading?"Mise à jour…":generated?"Mettre à jour le radar":"Générer le radar"}</button></header>
    <section className={styles.kpis}><Metric icon={<Users size={20}/>} label="Acteurs clés" value={String(actors.length)} detail={actors.length?`${strongest} à forte influence`:"Radar à générer"}/><Metric icon={<Target size={20}/>} label="Influence moyenne" value={actors.length?`${influenceAverage}/100`:"—"} detail="Ensemble du radar"/><Metric icon={<CalendarDays size={20}/>} label="Fenêtre d’action" value={windowLabel(actors,selected)} detail="Lecture prioritaire" compact/></section>
    <div className={styles.workspace}>
      <aside className={styles.dossierPanel}><div className={styles.panelLabel}>Dossier sélectionné</div><div className={styles.field}><select value={dossierId} onChange={e=>setDossierId(e.target.value)}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<><div className={styles.dossierTitle}><FileText size={18}/><b>{dossier.title}</b></div><div className={styles.section}><span>Objectif</span><p>{dossier.objective}</p></div><div className={styles.section}><span>Textes liés</span><strong>{related.length} texte{related.length>1?"s":""}</strong></div></>}<button className={styles.generateButton} onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Cartographie…":"Générer le radar d’influence"}</button><button className={styles.resetButton} onClick={()=>setSelected(null)} disabled={!selected}><X size={15}/>Fermer la fiche acteur</button>{error&&<div className={styles.error}>{error}</div>}</aside>
      <main className={styles.radarCard}><div className={styles.legend}><Legend color={PRIORITY_COLORS.critical} label="Critique"/><Legend color={PRIORITY_COLORS.high} label="Forte"/><Legend color={PRIORITY_COLORS.medium} label="Moyenne"/><Legend color={PRIORITY_COLORS.low} label="Faible"/></div>{actors.length?<div className={styles.canvas}>{[3,2,1].map(orbit=><div key={orbit} className={styles.orbit} style={{width:ORBIT_RADII[orbit as 1|2|3]*2,height:ORBIT_RADII[orbit as 1|2|3]*2}}><span className={styles.orbitLabel}>{orbit===1?"1re":`${orbit}e`} orbite</span></div>)}<button className={styles.center} onClick={()=>source?.source_url&&window.open(source.source_url,"_blank")}><Orbit size={24}/><b>{dossier?.title||"Dossier"}</b></button>{actors.map(actor=>{const motion=orbitMotion(actor,actors);const size=bubbleSize(actor.influence);const fontSize=bubbleFontSize(actor.name,size);const animationStyle={animationDuration:`${motion.duration}s`,animationDelay:`${motion.delay}s`,animationDirection:motion.direction as "normal"|"reverse"};return <div key={actor.id} className={styles.actorOrbit} style={animationStyle}><div className={styles.actorTravel} style={{transform:`translateX(${motion.radius}px)`}}><div className={styles.actorCounter} style={animationStyle}><button className={`${styles.actor} ${selected?.id===actor.id?styles.actorSelected:""}`} onClick={()=>setSelected(actor)} title={actor.name} style={{width:size,height:size,background:actorColor(actor),fontSize}}><span>{actor.name}</span></button></div></div></div>;})}</div>:<div className={styles.empty}><Orbit size={42}/><h3>Le radar est prêt</h3><p>Sélectionnez un dossier puis générez la cartographie.</p></div>}<div className={styles.radarFooter}><span>Couleur = niveau d’influence. Taille = intensité de l’influence.</span></div></main>
      <aside className={styles.actorPanel}>{selected?<><div className={styles.actorPanelHead}><div><div className={styles.panelLabel}>Acteur sélectionné</div><div className={styles.actorIdentity}><span className={styles.actorIcon}><Building2 size={20}/></span><div><h2>{selected.name}</h2><p>{selected.role}</p><em className={styles.position}>{priorityLabel(selected.influence)}</em></div></div></div><button className={styles.close} onClick={()=>setSelected(null)}><X size={17}/></button></div><Detail title="Pourquoi il compte" text={selected.why}/>{selected.evidence?.source_url&&<section className={styles.detail}><span>Source</span><p>{selected.evidence.source_title}</p><a href={selected.evidence.source_url} target="_blank" rel="noreferrer">Lire la source <ExternalLink size={13}/></a></section>}<Detail title="Fenêtre d’action" text={selected.window} icon={<CalendarDays size={16}/>}/><Detail title="Action recommandée" text={selected.action} icon={<Target size={16}/>}/><section className={styles.detail}><span>Lecture simple</span><p><b>Influence :</b> {selected.influence}/5<br/><b>Orbite :</b> {selected.orbit}<br/><b>Priorité :</b> {priorityLabel(selected.influence)}</p></section></>:<div className={styles.actorEmpty}><Building2 size={34}/><h3>Sélectionnez un acteur</h3><p>Cliquez sur une bulle du radar pour ouvrir sa fiche.</p></div>}</aside>
    </div>
    <section className={styles.groundingStrip}><Grounding icon={<Building2 size={20}/>} label="Sources ciblées" value={String(grounding?.official_sources_requested??related.length)} detail="Textes liés au dossier"/><Grounding icon={<Users size={20}/>} label="Acteurs affichés" value={String(actors.length)} detail="Maximum 6 acteurs"/></section>
  </div>;
}

function Metric({icon,label,value,detail,compact=false}:{icon:React.ReactNode;label:string;value:string;detail:string;compact?:boolean}){return <div className={styles.metric}><span className={styles.metricIcon}>{icon}</span><div><small>{label}</small><strong className={compact?styles.compactValue:""}>{value}</strong><em>{detail}</em></div></div>;}
function Grounding({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <div className={styles.grounding}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></div>;}
function Legend({color,label}:{color:string;label:string}){return <span className={styles.legendItem}><i style={{background:color}}/>{label}</span>;}
function Detail({title,text,icon}:{title:string;text:string;icon?:React.ReactNode}){const visible=presentableText(text);if(!visible)return null;return <section className={styles.detail}><span>{icon}{title}</span><p>{visible}</p></section>;}
