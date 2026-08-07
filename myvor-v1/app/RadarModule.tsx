"use client";

import { useEffect,useMemo,useState } from "react";
import { Building2,CalendarDays,ExternalLink,FileText,Orbit,RefreshCw,ShieldCheck,Target,Users } from "lucide-react";
import { listProductions,saveProduction } from "@/lib/productions";
import { presentableText } from "@/lib/presentation";
import { fetchJsonWithRetry } from "@/lib/reliability";
import { supabase } from "@/lib/supabase";
import styles from "./RadarCorporate.module.css";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;key_actors?:string[];key_deadlines?:string[]};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type ActorEvidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position?:"favorable"|"inconnue"|"reserve"|"opposition"|string;influence:number;why:string;window:string;action:string;certainty?:"confirme"|"probable"|"a_confirmer"|string;evidence:ActorEvidence};
type RadarPayload={actors?:Actor[];quality?:any;grounding?:any;engine?:string;model?:string};
type RadarView="radar"|"warzone";

const PRIORITY_COLORS={critical:"#f0b429",high:"#d9a62f",medium:"#4d8fbf",low:"#61758b"};
const ORBIT_RADII:{[key in 1|2|3]:number}={1:128,2:220,3:305};

function priorityKey(influence:number){if(influence>=5)return "critical";if(influence>=4)return "high";if(influence>=3)return "medium";return "low";}
function priorityLabel(influence:number){if(influence>=5)return "Critique";if(influence>=4)return "Forte";if(influence>=3)return "Moyenne";return "Faible";}
function certaintyLabel(value?:string){if(value==="confirme")return "Confirmé";if(value==="probable")return "Probable";return "À valider";}
function positionLabel(value?:string){if(value==="favorable")return "Favorable";if(value==="reserve")return "Réservée";if(value==="opposition")return "Opposition";return "Inconnue";}
function actorsFromProduction(content:Record<string,unknown>){const raw=(content as any)?.actors;return Array.isArray(raw)?raw as Actor[]:[];}
function actorColor(actor:Actor){return PRIORITY_COLORS[priorityKey(actor.influence)];}
function actorSize(actor:Actor){return 58+Math.max(1,Math.min(5,Math.round(Number(actor.influence)||1)))*6;}
function actorPosition(actor:Actor,actors:Actor[]){const same=actors.filter(item=>item.orbit===actor.orbit);const index=Math.max(0,same.findIndex(item=>item.id===actor.id));const count=Math.max(1,same.length);const angle=(-90+(360/count)*index+(actor.orbit===2?30:actor.orbit===3?12:0))*Math.PI/180;const radius=ORBIT_RADII[actor.orbit];return{left:`calc(50% + ${Math.cos(angle)*radius}px)`,top:`calc(50% + ${Math.sin(angle)*radius}px)`};}

async function postRadar<T>(body:unknown):Promise<T>{
  if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  const {data}=await supabase.auth.getSession();
  const token=data.session?.access_token;
  if(!token)throw new Error("Session Myvor requise.");
  return fetchJsonWithRetry<T>("/api/radar/fast",{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8",Authorization:`Bearer ${token}`},body:JSON.stringify(body)},{attempts:2,timeoutMs:18000,shouldRetry:status=>status>=500});
}

export default function RadarModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[];onActions?:unknown}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [actors,setActors]=useState<Actor[]>([]);
  const [selected,setSelected]=useState<Actor|null>(null);
  const [quality,setQuality]=useState<any>(null);
  const [generated,setGenerated]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [view,setView]=useState<RadarView>("radar");
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);
  const zones=useMemo(()=>[
    {orbit:1,name:"Décision",subtitle:"Acteurs au plus près de la décision",actors:actors.filter(actor=>actor.orbit===1)},
    {orbit:2,name:"Influence",subtitle:"Relais capables de faire évoluer l’arbitrage",actors:actors.filter(actor=>actor.orbit===2)},
    {orbit:3,name:"Écosystème",subtitle:"Acteurs à surveiller autour du dossier",actors:actors.filter(actor=>actor.orbit===3)},
  ],[actors]);

  useEffect(()=>{let active=true;setSelected(null);setError("");if(!dossierId){setActors([]);setGenerated(false);return()=>{active=false;};}listProductions(dossierId).then(({data})=>{if(!active)return;const latest=data.find(item=>item.type==="radar");if(!latest){setActors([]);setGenerated(false);return;}const saved=actorsFromProduction(latest.content);setActors(saved.slice(0,6));setQuality((latest.content as any)?.quality||null);setGenerated(true);}).catch(()=>undefined);return()=>{active=false;};},[dossierId]);

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    setLoading(true);setError("");setSelected(null);
    try{
      const payload=await postRadar<RadarPayload>({dossier,items:related});
      const visible=(payload.actors||[]).slice(0,6);
      setActors(visible);setQuality(payload.quality||null);setGenerated(true);
      await saveProduction({dossier_id:dossier.id,type:"radar",title:`Radar d’influence — ${dossier.title}`,content:{actors:visible,item_ids:related.map(i=>i.id),quality:payload.quality||null,grounding:payload.grounding||null,engine:payload.engine||null,model:payload.model||null}});
    }catch(err:any){setError(err?.message||"Génération impossible");}
    finally{setLoading(false);}
  }

  const reliability=quality?.status==="grounded"?"Vérifié":quality?.status==="review_required"?"À consolider":quality?.status==="insufficient_context"?"Contexte insuffisant":generated?"Disponible":"Non généré";

  return <div className={styles.page}>
    <header className={styles.head}>
      <div><div className={styles.kicker}>Cartographie stratégique</div><h1>Radar d’influence</h1><p>{dossier?`Dossier actif : ${dossier.title}`:"Sélectionnez un dossier pour afficher son radar."}</p></div>
      <button className={styles.updateButton} onClick={generate} disabled={loading||!dossier}><RefreshCw size={17} className={loading?styles.spin:""}/>{loading?"Mise à jour…":generated?"Actualiser":"Générer"}</button>
    </header>

    <div className={styles.tabs} role="tablist" aria-label="Vues du Radar d’influence">
      <button type="button" className={view==="radar"?styles.tabActive:""} onClick={()=>setView("radar")}>Radar</button>
      <button type="button" className={view==="warzone"?styles.tabActive:""} onClick={()=>setView("warzone")}>War Zone</button>
    </div>

    <section className={styles.contextBar}>
      <label><span>Dossier</span><select value={dossierId} onChange={e=>setDossierId(e.target.value)}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></label>
      <div className={styles.contextMeta}><span><FileText size={14}/>{related.length} évolution{related.length>1?"s":""} liée{related.length>1?"s":""}</span><span><ShieldCheck size={14}/>{reliability}</span></div>
    </section>

    {error&&<div className={styles.error}>{error}</div>}

    <div className={styles.workspace}>
      <main className={styles.radarCard}>
        {view==="radar"?<>
          <div className={styles.radarTop}><div><strong>Acteurs clés</strong><span>{actors.length?"Cliquez sur un acteur pour afficher son détail.":"Le radar se construit à partir du dossier et de ses sources."}</span></div><div className={styles.legend}><Legend color={PRIORITY_COLORS.critical} label="Critique"/><Legend color={PRIORITY_COLORS.high} label="Forte"/><Legend color={PRIORITY_COLORS.medium} label="Moyenne"/></div></div>
          {actors.length?<div className={styles.canvas}>
            {[3,2,1].map(orbit=><div key={orbit} className={styles.orbit} style={{width:ORBIT_RADII[orbit as 1|2|3]*2,height:ORBIT_RADII[orbit as 1|2|3]*2}}><span>{orbit===1?"Décision":orbit===2?"Influence":"Écosystème"}</span></div>)}
            <div className={styles.center}><Orbit size={24}/><b>Myvor</b><small>{dossier?.title||"Dossier"}</small></div>
            {actors.map(actor=>{const size=actorSize(actor);const pos=actorPosition(actor,actors);return <button key={actor.id} type="button" className={`${styles.actor} ${selected?.id===actor.id?styles.actorSelected:""}`} onClick={()=>setSelected(actor)} style={{...pos,width:size,height:size,borderColor:actorColor(actor)}} title={`${actor.name} — ${priorityLabel(actor.influence)}`}><Users size={17}/><span>{actor.name}</span></button>;})}
          </div>:<EmptyRadar generated={generated} quality={quality}/>}</>:
          <div className={styles.zoneView}><div className={styles.radarTop}><div><strong>War Zone</strong><span>Les mêmes acteurs, regroupés par proximité avec la décision.</span></div></div><div className={styles.zoneGrid}>{zones.map(zone=><section key={zone.orbit} className={styles.zoneCard}><div className={styles.zoneHead}><span>Zone {zone.orbit}</span><b>{zone.name}</b><p>{zone.subtitle}</p></div><div className={styles.zoneActors}>{zone.actors.length?zone.actors.map(actor=><button key={actor.id} type="button" onClick={()=>setSelected(actor)} className={selected?.id===actor.id?styles.zoneActorActive:""}><i style={{background:actorColor(actor)}}/><span><b>{actor.name}</b><small>{actor.role}</small></span><em>{actor.influence}/5</em></button>):<div className={styles.zoneEmpty}>Aucun acteur vérifiable dans cette zone.</div>}</div></section>)}</div></div>}
      </main>

      <aside className={styles.actorPanel}>{selected?<ActorDetail actor={selected}/>:<div className={styles.actorEmpty}><Building2 size={34}/><h3>Sélectionnez un acteur</h3><p>Cliquez sur un acteur du Radar ou de la War Zone pour afficher sa fiche.</p></div>}</aside>
    </div>
  </div>;
}

function EmptyRadar({generated,quality}:{generated:boolean;quality:any}){return <div className={styles.empty}><Orbit size={42}/><h3>{generated?"Aucun acteur vérifiable":"Le radar est prêt"}</h3><p>{generated&&quality?.status==="insufficient_context"?"Ajoutez des acteurs clés au dossier ou rattachez des sources institutionnelles. Myvor n’invente pas d’acteur.":"Sélectionnez un dossier puis générez le radar."}</p></div>;}
function Legend({color,label}:{color:string;label:string}){return <span className={styles.legendItem}><i style={{background:color}}/>{label}</span>;}
function ActorDetail({actor}:{actor:Actor}){const sourceTitle=presentableText(actor.evidence?.source_title);const sourceUrl=presentableText(actor.evidence?.source_url);return <div className={styles.actorDetail}>
  <div className={styles.actorPanelHead}><div><div className={styles.panelLabel}>Acteur sélectionné</div><h2>{actor.name}</h2><p>{actor.role}</p></div><div className={styles.score}><strong>{actor.influence}</strong><span>/5</span><small>{priorityLabel(actor.influence)}</small></div></div>
  <div className={styles.quickFacts}><div><span>Position</span><b>{positionLabel(actor.position)}</b></div><div><span>Fiabilité</span><b>{certaintyLabel(actor.certainty)}</b></div><div><span>Orbite</span><b>{actor.orbit}</b></div></div>
  <Detail title="Pourquoi cet acteur compte" text={actor.why}/>
  <Detail title="Fenêtre d’action" text={actor.window} icon={<CalendarDays size={15}/>}/>
  <Detail title="Action recommandée" text={actor.action} icon={<Target size={15}/>}/>
  {(sourceTitle||sourceUrl)&&<section className={styles.detail}><span><ShieldCheck size={15}/>Source</span>{sourceTitle&&<p>{sourceTitle}</p>}{actor.evidence?.excerpt&&<small>{actor.evidence.excerpt}</small>}{sourceUrl&&<a href={sourceUrl} target="_blank" rel="noreferrer">Ouvrir la source <ExternalLink size={13}/></a>}</section>}
</div>;}
function Detail({title,text,icon}:{title:string;text:string;icon?:React.ReactNode}){const visible=presentableText(text);if(!visible)return null;return <section className={styles.detail}><span>{icon}{title}</span><p>{visible}</p></section>;}
