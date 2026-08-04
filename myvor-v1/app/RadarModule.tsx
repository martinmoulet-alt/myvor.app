"use client";

import { useEffect,useMemo,useState } from "react";
import { Building2,CalendarDays,ExternalLink,FileText,Mail,Orbit,Phone,RefreshCw,ShieldCheck,Sparkles,Target,Users,X } from "lucide-react";
import { listProductions,saveProduction } from "@/lib/productions";
import { presentableText } from "@/lib/presentation";
import { fetchJsonWithRetry,isTransientError } from "@/lib/reliability";
import { supabase } from "@/lib/supabase";
import styles from "./RadarCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;sector?:string|null;activity?:string|null;strategic_issues?:string[];risks_to_avoid?:string[];opportunities?:string[];client_position?:string|null;key_actors?:string[];watch_topics?:string[];watch_subtopics?:string[];reference_texts?:string[];key_deadlines?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type ActorEvidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";influence:number;why:string;window:string;action:string;certainty:"confirme"|"probable"|"a_confirmer";evidence:ActorEvidence;contact_email?:string;contact_phone?:string;contact_url?:string;contact_verified?:boolean};
type RadarQuality={status:"grounded"|"review_required"|"insufficient_sources";grounded_actors:number;total_actors:number;grounding_rate:number;verified_contact_pages:number;structured_output?:boolean};
type RadarGrounding={official_sources_requested:number;official_sources_fetched:number;statuses?:Array<{url:string;resolved_url?:string;status:string;read_chars?:number}>};
type RadarPayload={actors?:Actor[];quality?:RadarQuality;grounding?:RadarGrounding;engine?:string;model?:string};
type ActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};

const COLORS={favorable:"#3d9553",inconnue:"#65758a",reserve:"#d76b22",opposition:"#c54a42"};
const ORBIT_RADII:{[key in 1|2|3]:number}={1:145,2:230,3:315};
const ORBIT_DURATIONS:{[key in 1|2|3]:number}={1:25,2:33,3:42};

async function postJson<T>(url:string,body:unknown):Promise<T>{if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");const {data}=await supabase.auth.getSession();const token=data.session?.access_token;if(!token)throw new Error("Session Myvor requise.");return fetchJsonWithRetry<T>(url,{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8",Authorization:`Bearer ${token}`},body:JSON.stringify(body)},{attempts:2,baseDelayMs:450,timeoutMs:32000,shouldRetry:error=>isTransientError(error)});}
function bubbleSize(influence:number){return 72+Math.max(1,Math.min(5,Math.round(Number(influence)||1)))*10;}
function bubbleFontSize(name:string,size:number){const length=String(name||"").length;if(length>54)return 9;if(length>38)return 10;if(length>24)return 11;return Math.min(13,size/8.8);}
function orbitMotion(actor:Actor,actors:Actor[]){const same=actors.filter(item=>item.orbit===actor.orbit);const rank=Math.max(0,same.findIndex(item=>item.id===actor.id));const duration=ORBIT_DURATIONS[actor.orbit];const delay=-(duration*(rank/Math.max(1,same.length)))-(actor.orbit*.7);return{radius:ORBIT_RADII[actor.orbit],duration,delay,direction:actor.orbit===2?"reverse":"normal"};}
function contactText(actor:Actor){return [actor.contact_email?`E-mail : ${actor.contact_email}`:null,actor.contact_phone?`Téléphone : ${actor.contact_phone}`:null,actor.contact_url?`Page officielle : ${actor.contact_url}`:null].filter(Boolean).join("\n");}
function actorsFromProduction(content:Record<string,unknown>){const raw=(content as any)?.actors;return Array.isArray(raw)?raw.filter((actor:any)=>actor?.evidence?.verified) as Actor[]:[];}
function qualityFromProduction(content:Record<string,unknown>){return ((content as any)?.quality||null) as RadarQuality|null;}
function groundingFromProduction(content:Record<string,unknown>){return ((content as any)?.grounding||null) as RadarGrounding|null;}
function positionLabel(value:Actor["position"]){return value==="favorable"?"Favorable":value==="reserve"?"Réserves":value==="opposition"?"Opposition":"Neutre / inconnue";}
function windowLabel(actors:Actor[],selected:Actor|null){const value=presentableText(selected?.window)||presentableText([...actors].sort((a,b)=>b.influence-a.influence)[0]?.window);return value||"À déterminer";}

export default function RadarModule({dossiers,watch,onActions}:{dossiers:Dossier[];watch:Watch[];onActions?:(drafts:ActionDraft[])=>Promise<void>|void}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [actors,setActors]=useState<Actor[]>([]);
  const [selected,setSelected]=useState<Actor|null>(null);
  const [quality,setQuality]=useState<RadarQuality|null>(null);
  const [grounding,setGrounding]=useState<RadarGrounding|null>(null);
  const [generated,setGenerated]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);
  const source=related[0]||null;
  const influenceAverage=actors.length?Math.round(actors.reduce((sum,a)=>sum+a.influence,0)/actors.length*20):0;
  const verifiedContacts=actors.filter(a=>a.contact_verified&&(a.contact_email||a.contact_phone||a.contact_url)).length;
  const strongest=actors.filter(a=>a.influence>=4).length;

  useEffect(()=>{let active=true;setSelected(null);setError("");if(!dossierId){setActors([]);setQuality(null);setGrounding(null);setGenerated(false);return()=>{active=false;};}listProductions(dossierId).then(({data})=>{if(!active)return;const latest=data.find(item=>item.type==="radar");if(!latest){setActors([]);setQuality(null);setGrounding(null);setGenerated(false);return;}const savedActors=actorsFromProduction(latest.content);setActors(savedActors);setQuality(qualityFromProduction(latest.content));setGrounding(groundingFromProduction(latest.content));setGenerated(true);setSelected(savedActors[0]||null);}).catch(()=>undefined);return()=>{active=false;};},[dossierId]);

  async function generate(){if(!dossier){setError("Sélectionne un dossier client.");return;}if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}setLoading(true);setError("");try{const payload=await postJson<RadarPayload>("/api/radar",{dossier,items:related});const rawActors=payload.actors||[];const visibleActors=rawActors.filter(actor=>actor.evidence?.verified);setActors(visibleActors);setQuality(payload.quality||null);setGrounding(payload.grounding||null);setGenerated(true);setSelected(visibleActors[0]||null);if(rawActors.length){await saveProduction({dossier_id:dossier.id,type:"radar",title:`Radar d’influence — ${dossier.title}`,content:{actors:visibleActors,raw_actors:rawActors,item_ids:related.map(i=>i.id),source_url:source?.source_url||null,quality:payload.quality||null,grounding:payload.grounding||null,engine:payload.engine||null,model:payload.model||null}});}if(onActions&&visibleActors.length){const priority=(a:Actor)=>a.influence>=5||a.position==="opposition"?"fort":"moyen";const drafts=visibleActors.filter(a=>(a.influence>=4||a.orbit===1)&&a.certainty!=="a_confirmer").sort((a,b)=>b.influence-a.influence).slice(0,4).map(a=>{const contact=contactText(a),action=presentableText(a.action)||presentableText(a.why);return{dossier_id:dossier.id,type:"contact",title:`Contacter ${a.name}`,description:[action,contact].filter(Boolean).join("\n\n"),actor_name:a.name,priority:priority(a),due_date:null};});await onActions(drafts);}}catch(err:any){setError(err?.message||"Génération impossible");setGenerated(actors.length>0||generated);}finally{setLoading(false);}}

  return <div className={styles.page}>
    <header className={styles.head}>
      <div><div className={styles.kicker}>Cartographie stratégique</div><h1>Radar d’influence</h1><p>Visualisez les décideurs, leurs cercles d’influence, leurs positions et les actions recommandées autour de votre dossier client.</p></div>
      <button className={styles.updateButton} onClick={generate} disabled={loading||!dossier||!related.length}><RefreshCw size={17} className={loading?styles.spin:""}/>{loading?"Mise à jour…":generated?"Mettre à jour le radar":"Générer le radar"}</button>
    </header>

    <section className={styles.kpis}>
      <Metric icon={<Users size={20}/>} label="Acteurs clés" value={String(actors.length)} detail={actors.length?`${strongest} à forte influence`:"Radar à générer"}/>
      <Metric icon={<Target size={20}/>} label="Influence moyenne" value={actors.length?`${influenceAverage}/100`:"—"} detail="Ensemble du radar"/>
      <Metric icon={<CalendarDays size={20}/>} label="Fenêtre d’action" value={windowLabel(actors,selected)} detail="Lecture prioritaire" compact/>
      <Metric icon={<ShieldCheck size={20}/>} label="Contacts vérifiés" value={String(verifiedContacts)} detail={actors.length?`Sur ${actors.length} acteurs`:"Coordonnées officielles"}/>
    </section>

    <div className={styles.workspace}>
      <aside className={styles.dossierPanel}>
        <div className={styles.panelLabel}>Dossier sélectionné</div>
        <div className={styles.field}><select value={dossierId} onChange={e=>setDossierId(e.target.value)}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>
        {dossier&&<><div className={styles.dossierTitle}><FileText size={18}/><b>{dossier.title}</b></div><div className={styles.section}><span>Objectif</span><p>{dossier.objective}</p></div><div className={styles.section}><span>Textes liés</span><strong>{related.length} texte{related.length>1?"s":""} officiel{related.length>1?"s":""}</strong><p>{[...new Set(related.map(item=>item.nature))].slice(0,4).join(", ")||"Aucun texte rattaché"}</p></div></>}
        <button className={styles.generateButton} onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Cartographie…":"Générer le radar d’influence"}</button>
        <button className={styles.resetButton} onClick={()=>setSelected(null)} disabled={!selected}><X size={15}/>Fermer la fiche acteur</button>
        {error&&<div className={styles.error}>{error}</div>}
      </aside>

      <main className={styles.radarCard}>
        <div className={styles.legend}><Legend color={COLORS.favorable} label="Favorable"/><Legend color={COLORS.inconnue} label="Neutre / inconnue"/><Legend color={COLORS.reserve} label="Réserves"/><Legend color={COLORS.opposition} label="Opposition"/></div>
        {actors.length?<div className={styles.canvas}>
          {[3,2,1].map(orbit=><div key={orbit} className={styles.orbit} style={{width:ORBIT_RADII[orbit as 1|2|3]*2,height:ORBIT_RADII[orbit as 1|2|3]*2}}><span className={styles.orbitLabel}>{orbit===1?"1re":`${orbit}e`} orbite</span></div>)}
          <button className={styles.center} onClick={()=>source?.source_url&&window.open(source.source_url,"_blank")}><Orbit size={24}/><b>{dossier?.title||"Dossier"}</b></button>
          {actors.map(actor=>{const motion=orbitMotion(actor,actors);const size=bubbleSize(actor.influence);const fontSize=bubbleFontSize(actor.name,size);const animationStyle={animationDuration:`${motion.duration}s`,animationDelay:`${motion.delay}s`,animationDirection:motion.direction as "normal"|"reverse"};return <div key={actor.id} className={styles.actorOrbit} style={animationStyle}><div className={styles.actorTravel} style={{transform:`translateX(${motion.radius}px)`}}><div className={styles.actorCounter} style={animationStyle}><button className={`${styles.actor} ${selected?.id===actor.id?styles.actorSelected:""}`} onClick={()=>setSelected(actor)} title={actor.name} style={{width:size,height:size,background:COLORS[actor.position],fontSize}}><span>{actor.name}</span></button></div></div></div>;})}
        </div>:<div className={styles.empty}><Orbit size={42}/><h3>Le radar est prêt</h3><p>Sélectionnez un dossier avec des textes liés puis générez la cartographie.</p></div>}
        <div className={styles.radarFooter}><span>La taille des acteurs reflète leur niveau d’influence.</span></div>
      </main>

      <aside className={styles.actorPanel}>
        {selected?<>
          <div className={styles.actorPanelHead}><div><div className={styles.panelLabel}>Acteur sélectionné</div><div className={styles.actorIdentity}><span className={styles.actorIcon}><Building2 size={20}/></span><div><h2>{selected.name}</h2><p>{selected.role}</p><em className={`${styles.position} ${styles[selected.position]}`}>{positionLabel(selected.position)}</em></div></div></div><button className={styles.close} onClick={()=>setSelected(null)}><X size={17}/></button></div>
          <Detail title="Pourquoi il compte" text={selected.why}/>
          {selected.evidence?.verified&&presentableText(selected.evidence.excerpt)&&<section className={styles.detail}><span>Source institutionnelle</span><p>{selected.evidence.source_title}</p><blockquote>{selected.evidence.excerpt}</blockquote>{selected.evidence.source_url&&<a href={selected.evidence.source_url} target="_blank" rel="noreferrer">Lire la source officielle <ExternalLink size={13}/></a>}</section>}
          <Detail title="Fenêtre d’action" text={selected.window} icon={<CalendarDays size={16}/>}/>
          <Detail title="Action recommandée" text={selected.action} icon={<Target size={16}/>}/>
          {selected.contact_verified&&(selected.contact_email||selected.contact_phone||selected.contact_url)&&<section className={styles.detail}><span>Coordonnées officielles</span><div className={styles.contacts}>{selected.contact_email&&<a href={`mailto:${selected.contact_email}`}><Mail size={14}/>{selected.contact_email}</a>}{selected.contact_phone&&<a href={`tel:${selected.contact_phone}`}><Phone size={14}/>{selected.contact_phone}</a>}{selected.contact_url&&<a href={selected.contact_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Page officielle</a>}</div></section>}
          <section className={styles.detail}><span>Lecture stratégique</span><p><b>Influence :</b> {selected.influence}/5<br/><b>Proximité décisionnelle :</b> orbite {selected.orbit}<br/><b>Position :</b> {positionLabel(selected.position)}</p></section>
        </>:<div className={styles.actorEmpty}><Building2 size={34}/><h3>Sélectionnez un acteur</h3><p>Cliquez sur une bulle du radar pour ouvrir sa fiche stratégique.</p></div>}
      </aside>
    </div>

    <section className={styles.groundingStrip}>
      <Grounding icon={<Building2 size={20}/>} label="Sources officielles analysées" value={String(grounding?.official_sources_fetched??0)} detail={grounding?.official_sources_requested?`Sur ${grounding.official_sources_requested} sources ciblées`:"Sources institutionnelles"}/>
      <Grounding icon={<Users size={20}/>} label="Acteurs étayés" value={`${quality?.grounded_actors??actors.length}/${quality?.total_actors??actors.length}`} detail="Acteurs affichés avec source vérifiée"/>
      <Grounding icon={<ShieldCheck size={20}/>} label="Pages contacts vérifiées" value={String(quality?.verified_contact_pages??verifiedContacts)} detail="Coordonnées officielles validées"/>
    </section>
  </div>;
}

function Metric({icon,label,value,detail,compact=false}:{icon:React.ReactNode;label:string;value:string;detail:string;compact?:boolean}){return <div className={styles.metric}><span className={styles.metricIcon}>{icon}</span><div><small>{label}</small><strong className={compact?styles.compactValue:""}>{value}</strong><em>{detail}</em></div></div>;}
function Grounding({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <div className={styles.grounding}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></div>;}
function Legend({color,label}:{color:string;label:string}){return <span className={styles.legendItem}><i style={{background:color}}/>{label}</span>;}
function Detail({title,text,icon}:{title:string;text:string;icon?:React.ReactNode}){const visible=presentableText(text);if(!visible)return null;return <section className={styles.detail}><span>{icon}{title}</span><p>{visible}</p></section>;}
