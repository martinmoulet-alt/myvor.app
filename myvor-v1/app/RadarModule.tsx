"use client";

import {useEffect,useMemo,useState,type CSSProperties,type ReactNode} from "react";
import {Building2,CalendarDays,ExternalLink,FileText,Orbit,RefreshCw,ShieldCheck,Target,Users} from "lucide-react";
import {listProductions,saveProduction,updateProductionContent} from "@/lib/productions";
import {presentableText} from "@/lib/presentation";
import {fetchJsonWithRetry} from "@/lib/reliability";
import {supabase} from "@/lib/supabase";
import {belongsToDossier} from "@/lib/watchMembership";
import WarZoneView,{type WarZoneActor,type WarZoneActionDraft} from "./WarZoneView";
import styles from "./RadarCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;key_actors?:string[];key_deadlines?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;dossier_ids?:string[]|null;urgency:string;created_at:string;source_name?:string|null;published_at?:string|null};
type ActorEvidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type ActorSignal={title:string;nature:string;date:string;url:string;source_name?:string;urgency?:string};
type ScoreBreakdown={institutional_power:number;dossier_relevance:number;timing:number;accessibility:number};
type Actor={id:string;name:string;role:string;institution?:string;orbit:1|2|3;position?:"favorable"|"inconnue"|"reserve"|"opposition"|string;position_reason?:string;influence:number;influence_score?:number;score_breakdown?:ScoreBreakdown;why:string;window:string;action:string;certainty?:"confirme"|"probable"|"a_confirmer"|string;signals?:ActorSignal[];source_count?:number;evidence:ActorEvidence;detail_status?:string};
type RadarPayload={actors?:Actor[];quality?:any;grounding?:any;engine?:string;model?:string};
type ActorDetailPayload={actor?:Actor;enrichment?:any;engine?:string;model?:string};
type RadarView="radar"|"warzone";
type ActionDraft=WarZoneActionDraft;
type WorkflowContext={dossierId:string;watchIds:string[]};
type Props={dossiers:Dossier[];watch:Watch[];onActions?:(drafts:ActionDraft[])=>Promise<void>|void;onOpenBuilder?:(dossierId:string)=>void;onOpenActions?:()=>void};

const WORKFLOW_CONTEXT_KEY="myvor:workflow-context";
const PRIORITY_COLORS={critical:"#d6574f",high:"#e69b35",medium:"#4b9b6a",low:"#61758b"};
const POSITION_COLORS={favorable:"#39a86b",reserve:"#e69b35",opposition:"#d6574f",inconnue:"#71869e"};
const ORBIT_RADII:{[key in 1|2|3]:number}={1:128,2:220,3:305};
const ORBIT_DURATIONS:{[key in 1|2|3]:number}={1:24,2:34,3:44};

function actorScore(actor:Actor){const raw=Number(actor.influence_score);return Number.isFinite(raw)?Math.max(0,Math.min(100,Math.round(raw))):Math.max(20,Math.min(100,Math.round(Number(actor.influence||1)*20)));}
function priorityKey(actor:Actor){const value=actorScore(actor);if(value>=80)return "critical";if(value>=65)return "high";if(value>=45)return "medium";return "low";}
function priorityLabel(actor:Actor){const key=priorityKey(actor);return key==="critical"?"Critique":key==="high"?"Forte":key==="medium"?"Moyenne":"Faible";}
function priorityColor(actor:Actor){return PRIORITY_COLORS[priorityKey(actor)];}
function positionKey(value?:string):keyof typeof POSITION_COLORS{return value==="favorable"||value==="reserve"||value==="opposition"?value:"inconnue";}
function positionColor(actor:Actor){return POSITION_COLORS[positionKey(actor.position)];}
function certaintyLabel(value?:string){if(value==="confirme")return "Confirmé";if(value==="probable")return "Probable";return "À valider";}
function positionLabel(value?:string){if(value==="favorable")return "Favorable";if(value==="reserve")return "Réservée";if(value==="opposition")return "Opposition";return "Inconnue";}
function actorHasVerifiedPositionEvidence(actor:Actor){return actor.evidence?.verified===true&&Boolean(presentableText(actor.evidence?.source_title))&&Boolean(presentableText(actor.evidence?.source_url));}
function sanitizeActorPosition(actor:Actor):Actor{if(positionKey(actor.position)==="inconnue"||actorHasVerifiedPositionEvidence(actor))return actor;return{...actor,position:"inconnue",position_reason:"Position non attribuée : aucune source publique vérifiée ne l’établit.",certainty:"a_confirmer"};}
function sanitizeActors(actors:Actor[]){return actors.map(sanitizeActorPosition);}
function actorsFromProduction(content:Record<string,unknown>){const raw=(content as any)?.actors;return Array.isArray(raw)?sanitizeActors(raw as Actor[]):[];}
function productionItemIds(content:Record<string,unknown>){const raw=(content as any)?.item_ids;return Array.isArray(raw)?raw.map(String).filter(Boolean):[];}
function sameIds(a:string[],b:string[]){if(a.length!==b.length)return false;const set=new Set(a);return b.every(id=>set.has(id));}
function actorSize(actor:Actor){return 62+Math.max(0,Math.min(5,Math.ceil(actorScore(actor)/20)))*5;}
function orbitMotion(actor:Actor,actors:Actor[]){const same=actors.filter(item=>item.orbit===actor.orbit);const rank=Math.max(0,same.findIndex(item=>item.id===actor.id));const duration=ORBIT_DURATIONS[actor.orbit];const delay=-(duration*(rank/Math.max(1,same.length)))-(actor.orbit*.6);return{radius:ORBIT_RADII[actor.orbit],duration,delay,direction:(actor.orbit===2?"reverse":"normal") as "normal"|"reverse"};}
function formatSignalDate(value:string){if(!value)return "Date non disponible";const date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",year:"numeric"}).format(date);}
function navigateShell(index:number){if(typeof document==="undefined")return;const desktop=Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn"));const mobile=Array.from(document.querySelectorAll<HTMLButtonElement>(".mobile-menu-nav button"));(desktop[index]||mobile[index])?.click();window.scrollTo({top:0,behavior:"smooth"});}
function normalizeWorkflowContext(value:unknown):WorkflowContext|null{if(!value||typeof value!=="object")return null;const candidate=value as {dossierId?:unknown;watchIds?:unknown};const dossierId=String(candidate.dossierId||"");if(!dossierId)return null;const rawIds=Array.isArray(candidate.watchIds)?candidate.watchIds:[];return{dossierId,watchIds:[...new Set(rawIds.map(id=>String(id||"")).filter(Boolean))]};}
function readWorkflowContext(){if(typeof window==="undefined")return null;try{const raw=sessionStorage.getItem(WORKFLOW_CONTEXT_KEY);return raw?normalizeWorkflowContext(JSON.parse(raw)):null;}catch{return null;}}

async function authedPost<T>(url:string,body:unknown,timeoutMs:number):Promise<T>{
  if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  const {data}=await supabase.auth.getSession();
  const token=data.session?.access_token;
  if(!token)throw new Error("Session Myvor requise.");
  return fetchJsonWithRetry<T>(url,{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8",Authorization:`Bearer ${token}`},body:JSON.stringify(body)},{attempts:1,timeoutMs});
}
async function postRadar<T extends RadarPayload>(body:unknown):Promise<T>{
  try{return await authedPost<T>("/api/radar",body,29000);}
  catch{
    const fallback=await authedPost<T>("/api/radar/fast",body,18000);
    return{...fallback,quality:{...(fallback.quality||{}),fallback_used:true}} as T;
  }
}
function postRadarEnrich<T>(body:unknown){return authedPost<T>("/api/radar/enrich",body,55000);}

export default function RadarModule({dossiers,watch,onActions,onOpenBuilder,onOpenActions}:Props){
  const [workflowContext,setWorkflowContext]=useState<WorkflowContext|null>(()=>readWorkflowContext());
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [actors,setActors]=useState<Actor[]>([]);
  const [selected,setSelected]=useState<Actor|null>(null);
  const [quality,setQuality]=useState<any>(null);
  const [grounding,setGrounding]=useState<any>(null);
  const [productionId,setProductionId]=useState<string|null>(null);
  const [generated,setGenerated]=useState(false);
  const [staleRadar,setStaleRadar]=useState(false);
  const [loading,setLoading]=useState(false);
  const [enrichingId,setEnrichingId]=useState<string|null>(null);
  const [detailError,setDetailError]=useState("");
  const [error,setError]=useState("");
  const [view,setView]=useState<RadarView>("radar");

  useEffect(()=>{const listener=(event:Event)=>setWorkflowContext(normalizeWorkflowContext((event as CustomEvent<unknown>).detail));window.addEventListener("myvor:workflow-context",listener);return()=>window.removeEventListener("myvor:workflow-context",listener);},[]);
  useEffect(()=>{if(workflowContext?.dossierId&&dossiers.some(item=>item.id===workflowContext.dossierId))setDossierId(workflowContext.dossierId);},[workflowContext?.dossierId,dossiers]);

  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const relatedAll=useMemo(()=>watch.filter(w=>belongsToDossier(w,dossierId)),[watch,dossierId]);
  const workflowIds=useMemo(()=>workflowContext?.dossierId===dossierId&&workflowContext.watchIds.length?new Set(workflowContext.watchIds):null,[workflowContext,dossierId]);
  const related=useMemo(()=>workflowIds?relatedAll.filter(item=>workflowIds.has(item.id)):relatedAll,[relatedAll,workflowIds]);
  const relatedIds=useMemo(()=>related.map(item=>item.id),[related]);
  const relatedKey=useMemo(()=>[...relatedIds].sort().join("|"),[relatedIds]);
  const scopedFromScore=Boolean(workflowIds);
  const openBuilder=onOpenBuilder||(()=>navigateShell(5));
  const openActions=onOpenActions||(()=>navigateShell(0));

  useEffect(()=>{let active=true;setSelected(null);setError("");setDetailError("");setEnrichingId(null);setProductionId(null);if(!dossierId){setActors([]);setGenerated(false);setStaleRadar(false);return()=>{active=false;};}listProductions(dossierId).then(({data})=>{if(!active)return;const history=data.filter(item=>item.type==="radar");const compatible=history.find(item=>sameIds(productionItemIds(item.content),relatedIds))||null;if(!compatible){setActors([]);setQuality(null);setGrounding(null);setGenerated(false);setStaleRadar(history.length>0);return;}const saved=actorsFromProduction(compatible.content).sort((a,b)=>actorScore(b)-actorScore(a));setActors(saved.slice(0,6));setQuality((compatible.content as any)?.quality||null);setGrounding((compatible.content as any)?.grounding||null);setProductionId(compatible.id);setGenerated(true);setStaleRadar(false);}).catch(()=>undefined);return()=>{active=false;};},[dossierId,relatedKey]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!related.length){setError("Rattache au moins un élément de veille à ce dossier avant de générer le Radar.");return;}
    setLoading(true);setError("");setDetailError("");setSelected(null);
    try{
      const payload=await postRadar<RadarPayload>({dossier,items:related});
      const visible=sanitizeActors((payload.actors||[]).slice(0,6)).sort((a,b)=>actorScore(b)-actorScore(a));
      if(!visible.length)throw new Error("Aucun acteur suffisamment documenté n’a été identifié pour ce contexte.");
      setActors(visible);setQuality(payload.quality||null);setGrounding(payload.grounding||null);setGenerated(true);setStaleRadar(false);
      const saved=await saveProduction({dossier_id:dossier.id,type:"radar",title:`Radar d’influence — ${dossier.title}`,content:{actors:visible,item_ids:relatedIds,quality:payload.quality||null,grounding:payload.grounding||null,engine:payload.engine||null,model:payload.model||null,context_source:scopedFromScore?"urgency_score":"dossier"}});
      if(saved.error)throw saved.error;
      setProductionId(saved.data?.id||null);
    }catch(err:any){setError(err?.message||"Génération impossible");}
    finally{setLoading(false);}
  }

  async function openActor(actor:Actor){
    setSelected(actor);setDetailError("");
    if(!dossier||actor.detail_status==="enriched"||enrichingId===actor.id)return;
    setEnrichingId(actor.id);
    try{
      const payload=await postRadarEnrich<ActorDetailPayload>({dossier,items:related,actors:[actor]});
      const detailed=payload.actor?sanitizeActorPosition(payload.actor):null;
      if(!detailed)throw new Error("La fiche détaillée de cet acteur n’a pas été retournée.");
      const nextActors=actors.map(item=>item.id===actor.id?detailed:item).sort((a,b)=>actorScore(b)-actorScore(a));
      setActors(nextActors);setSelected(current=>current?.id===actor.id?detailed:current);
      const content={actors:nextActors,item_ids:relatedIds,quality,grounding,detail_engine:payload.engine||null,detail_model:payload.model||null,context_source:scopedFromScore?"urgency_score":"dossier"};
      if(productionId){const updated=await updateProductionContent(productionId,content);if(updated.error)throw updated.error;}
      else{const saved=await saveProduction({dossier_id:dossier.id,type:"radar",title:`Radar d’influence — ${dossier.title}`,content});if(saved.error)throw saved.error;setProductionId(saved.data?.id||null);}
    }catch(err:any){setDetailError(err?.message||"Impossible d’enrichir cet acteur pour le moment.");}
    finally{setEnrichingId(null);}
  }

  function openFromWarZone(actor:WarZoneActor){setView("radar");void openActor(actor as Actor);}

  const reliability=quality?.status==="grounded"?"Vérifié":quality?.status==="review_required"?"À consolider":quality?.status==="insufficient_context"?"Contexte insuffisant":generated?"Disponible":"Non généré";
  const strategyActors=useMemo(()=>[...actors].sort((a,b)=>actorScore(b)-actorScore(a)),[actors]);

  return <div className={styles.page}>
    <header className={styles.head}>
      <div><div className={styles.kicker}>Cartographie stratégique</div><h1>Radar d’influence</h1><p>{dossier?`Dossier actif : ${dossier.title}`:"Sélectionnez un dossier pour afficher son radar."}</p></div>
      <button className={styles.updateButton} onClick={generate} disabled={loading||!dossier||!related.length}><RefreshCw size={17} className={loading?styles.spin:""}/>{loading?"Qualification…":generated?"Actualiser":"Générer"}</button>
    </header>

    <div className={styles.tabs} role="tablist" aria-label="Vues du Radar d’influence et de la War Zone">
      <button type="button" className={view==="radar"?styles.tabActive:""} onClick={()=>setView("radar")}>Radar</button>
      <button type="button" className={view==="warzone"?styles.tabActive:""} onClick={()=>setView("warzone")}>War Zone</button>
    </div>

    <section className={styles.contextBar}>
      <label><span>Dossier</span><select value={dossierId} onChange={e=>setDossierId(e.target.value)}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></label>
      <div className={styles.contextMeta}><span><FileText size={14}/>{related.length} signal{related.length>1?"aux":""} utilisé{related.length>1?"s":""}</span><span><ShieldCheck size={14}/>{reliability}</span><span><Target size={14}/>{scopedFromScore?"Contexte du Score":"Dossier complet"}</span></div>
    </section>

    {staleRadar&&<div className={styles.error}>Le contexte de veille a changé depuis le dernier Radar. Myvor n’affiche pas une ancienne cartographie comme si elle était encore actuelle : régénère le Radar pour ce périmètre.</div>}
    {error&&<div className={styles.error}>{error}</div>}

    {view==="warzone"?<main className={styles.radarCard}>
      <WarZoneView dossier={dossier} actors={strategyActors} watch={related} onOpenActor={openFromWarZone} onActions={onActions} onOpenBuilder={openBuilder} onOpenActions={openActions}/>
    </main>:<div className={styles.workspace}>
      <main className={styles.radarCard}>
        <div className={styles.radarTop}><div><strong>Acteurs clés</strong><span>{actors.length?"Cliquez sur un acteur : Myvor vérifie son rôle, son influence et sa position avant toute recommandation.":"Le Radar privilégie les acteurs nommés et sourcés ; un mode de continuité institutionnel prend le relais si les sources ne suffisent pas."}</span></div><div className={styles.legend}><Legend color={POSITION_COLORS.favorable} label="Favorable"/><Legend color={POSITION_COLORS.reserve} label="Réservée"/><Legend color={POSITION_COLORS.opposition} label="Opposition"/><Legend color={POSITION_COLORS.inconnue} label="Inconnue"/></div></div>
        {actors.length?<div className={styles.canvas}>
          {[3,2,1].map(orbit=><div key={orbit} className={styles.orbit} style={{width:ORBIT_RADII[orbit as 1|2|3]*2,height:ORBIT_RADII[orbit as 1|2|3]*2}}><span>{orbit===1?"Décision":orbit===2?"Influence":"Écosystème"}</span></div>)}
          <div className={styles.center}><Orbit size={24}/><b>Myvor</b><small>{dossier?.title||"Dossier"}</small></div>
          {actors.map(actor=>{const size=actorSize(actor);const motion=orbitMotion(actor,actors);const animationStyle:CSSProperties={animationDuration:`${motion.duration}s`,animationDelay:`${motion.delay}s`,animationDirection:motion.direction};const actorStyle={width:size,height:size,"--position-color":positionColor(actor),"--priority-color":priorityColor(actor)} as CSSProperties;return <div key={actor.id} className={`${styles.actorOrbit} ${selected?.id===actor.id?styles.actorOrbitPaused:""}`} style={animationStyle}><div className={styles.actorTravel} style={{transform:`translateX(${motion.radius}px)`}}><div className={styles.actorCounter} style={animationStyle}><button type="button" className={`${styles.actor} ${selected?.id===actor.id?styles.actorSelected:""}`} onClick={()=>void openActor(actor)} style={actorStyle} title={`${actor.name} — ${actorScore(actor)}/100`}><Users size={17}/><span>{actor.name}</span><small>{actorScore(actor)}</small></button></div></div></div>;})}
        </div>:<EmptyRadar generated={generated} quality={quality}/>}<div className={styles.radarHint}><span>Couleur = position sourcée</span><span>Halo / taille = priorité</span><span>Rotation : 24–44 s selon l’orbite</span></div>
      </main>

      <aside className={styles.actorPanel}>{selected?<ActorDetail actor={selected} loading={enrichingId===selected.id} error={detailError}/>:<div className={styles.actorEmpty}><Building2 size={34}/><h3>Sélectionnez un acteur</h3><p>Cliquez sur un acteur du Radar pour afficher sa fiche détaillée.</p></div>}</aside>
    </div>}
  </div>;
}

function EmptyRadar({generated,quality}:{generated:boolean;quality:any}){return <div className={styles.empty}><Orbit size={42}/><h3>{generated?"Aucun acteur vérifiable":"Le radar est prêt"}</h3><p>{generated&&quality?.status==="insufficient_context"?"Ajoutez des acteurs clés au dossier ou rattachez des sources institutionnelles. Myvor n’invente pas d’acteur.":"Sélectionnez un dossier puis générez le radar."}</p></div>;}
function Legend({color,label}:{color:string;label:string}){return <span className={styles.legendItem}><i style={{background:color}}/>{label}</span>;}
function ActorDetail({actor,loading,error}:{actor:Actor;loading:boolean;error:string}){const sourceTitle=presentableText(actor.evidence?.source_title);const sourceUrl=presentableText(actor.evidence?.source_url);const signals=Array.isArray(actor.signals)?actor.signals.slice(0,3):[];const value=actorScore(actor);return <div className={styles.actorDetail}>
  <div className={styles.actorPanelHead}><div><div className={styles.panelLabel}>Acteur sélectionné</div><h2>{actor.name}</h2><p>{actor.role}</p>{actor.institution&&<small className={styles.institution}>{actor.institution}</small>}</div><div className={styles.score}><strong>{value}</strong><span>/100</span><small>{priorityLabel(actor)}</small></div></div>
  {loading&&<section className={styles.detail}><span><RefreshCw size={15}/>Enrichissement de la fiche</span><p>Myvor vérifie le rôle, le contexte stratégique et les sources pertinentes de cet acteur.</p></section>}
  {error&&<section className={styles.detail}><span><ShieldCheck size={15}/>Enrichissement indisponible</span><p>{error}</p></section>}
  <div className={styles.quickFacts}><div><span>Position</span><b style={{color:positionColor(actor)}}>{positionLabel(actor.position)}</b></div><div><span>Fiabilité</span><b>{certaintyLabel(actor.certainty)}</b></div><div><span>Orbite</span><b>{actor.orbit}</b></div><div><span>Sources liées</span><b>{actor.source_count??(actor.evidence?.source_url?1:0)}</b></div></div>
  {actor.score_breakdown&&<ScoreDetail detail={actor.score_breakdown}/>} 
  <Detail title="Pourquoi cet acteur compte" text={actor.why}/>
  {actor.position_reason&&<Detail title="Lecture de position" text={actor.position_reason}/>} 
  <Detail title="Fenêtre d’action" text={actor.window} icon={<CalendarDays size={15}/>}/>
  <Detail title="Action recommandée" text={actor.action} icon={<Target size={15}/>}/>
  {signals.length>0&&<section className={styles.detail}><span><FileText size={15}/>Signaux récents</span><div className={styles.signalList}>{signals.map((signal,index)=><div className={styles.signal} key={`${signal.url}-${index}`}><div><b>{signal.nature}</b><small>{formatSignalDate(signal.date)}</small></div><p>{signal.title}</p>{signal.url&&<a href={signal.url} target="_blank" rel="noreferrer">Source <ExternalLink size={12}/></a>}</div>)}</div></section>}
  {(sourceTitle||sourceUrl)&&<section className={styles.detail}><span><ShieldCheck size={15}/>Source de qualification</span>{sourceTitle&&<p>{sourceTitle}</p>}{actor.evidence?.excerpt&&<small>{actor.evidence.excerpt}</small>}{sourceUrl&&<a href={sourceUrl} target="_blank" rel="noreferrer">Ouvrir la source <ExternalLink size={13}/></a>}<div className={styles.confidence}>Confiance source : {Math.round((Number(actor.evidence?.confidence)||0)*100)} %</div></section>}
</div>;}
function ScoreDetail({detail}:{detail:ScoreBreakdown}){const rows=[{label:"Pouvoir institutionnel",value:detail.institutional_power,max:35},{label:"Pertinence dossier",value:detail.dossier_relevance,max:30},{label:"Temporalité",value:detail.timing,max:20},{label:"Accessibilité",value:detail.accessibility,max:15}];return <section className={styles.detail}><span><Target size={15}/>Décomposition du score Myvor</span><div className={styles.scoreBreakdown}>{rows.map(row=><div key={row.label} className={styles.scoreRow}><div><b>{row.label}</b><em>{row.value}/{row.max}</em></div><div className={styles.scoreTrack}><i style={{width:`${Math.max(0,Math.min(100,row.value/row.max*100))}%`}}/></div></div>)}</div><small>Score indicatif calculé à partir des informations rattachées au dossier et de la qualification de l’acteur.</small></section>;}
function Detail({title,text,icon}:{title:string;text:string;icon?:ReactNode}){const visible=presentableText(text);if(!visible)return null;return <section className={styles.detail}><span>{icon}{title}</span><p>{visible}</p></section>;}
