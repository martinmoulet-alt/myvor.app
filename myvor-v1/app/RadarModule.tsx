"use client";

import { useMemo,useState } from "react";
import { ExternalLink,Mail,Orbit,Phone,Sparkles,X } from "lucide-react";
import { saveProduction } from "@/lib/productions";
import { presentableText } from "@/lib/presentation";
import { supabase } from "@/lib/supabase";
import styles from "./RadarCorporate.module.css";

type Dossier={
  id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;
  sector?:string|null;activity?:string|null;strategic_issues?:string[];risks_to_avoid?:string[];opportunities?:string[];
  client_position?:string|null;key_actors?:string[];watch_topics?:string[];watch_subtopics?:string[];
  reference_texts?:string[];key_deadlines?:string[];
};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type ActorEvidence={source_index:number;source_title:string;source_url:string;excerpt:string;confidence:number;verified:boolean};
type Actor={
  id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";
  influence:number;why:string;window:string;action:string;certainty:"confirme"|"probable"|"a_confirmer";
  evidence:ActorEvidence;contact_email?:string;contact_phone?:string;contact_url?:string;contact_verified?:boolean;
};
type RadarQuality={status:"grounded"|"review_required"|"insufficient_sources";grounded_actors:number;total_actors:number;grounding_rate:number;verified_contact_pages:number;structured_output?:boolean};
type RadarGrounding={official_sources_requested:number;official_sources_fetched:number;statuses?:Array<{url:string;resolved_url?:string;status:string;read_chars?:number}>};
type RadarPayload={actors?:Actor[];quality?:RadarQuality;grounding?:RadarGrounding;engine?:string;model?:string};
type ActionDraft={dossier_id:string;type:string;title:string;description?:string;actor_name?:string;priority:string;due_date?:string|null};

const COLORS={favorable:"#2f8f5b",inconnue:"#d9a514",reserve:"#d97706",opposition:"#b42318"};
const ORBIT_RADII:{[key in 1|2|3]:number}={1:190,2:295,3:400};
const ORBIT_DURATIONS:{[key in 1|2|3]:number}={1:22,2:30,3:38};

async function postJson<T>(url:string,body:unknown):Promise<T>{
  if(!supabase)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  const {data}=await supabase.auth.getSession();
  const token=data.session?.access_token;
  if(!token)throw new Error("Session Myvor requise.");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),38000);
  try{
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json;charset=UTF-8",Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:controller.signal});
    const raw=await response.text();
    let payload:any={};
    try{payload=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok)throw new Error(payload?.error||`Erreur réseau (${response.status})`);
    return payload as T;
  }catch(error:any){
    if(error?.name==="AbortError")throw new Error("Le moteur Radar a mis trop de temps à répondre.");
    throw error;
  }finally{clearTimeout(timer);}
}
function bubbleSize(influence:number){const safe=Math.max(1,Math.min(5,Math.round(Number(influence)||1)));return 114+(safe*14);}
function bubbleFontSize(name:string,size:number){const length=String(name||"").length;if(length>72)return Math.max(9.2,size/18);if(length>54)return Math.max(9.8,size/17);if(length>38)return Math.max(10.5,size/16);if(length>24)return Math.max(11.2,size/15);return Math.max(12,size/14);}
function orbitMotion(actor:Actor,actors:Actor[]){const same=actors.filter(item=>item.orbit===actor.orbit);const rank=Math.max(0,same.findIndex(item=>item.id===actor.id));const duration=ORBIT_DURATIONS[actor.orbit];const delay=-(duration*(rank/Math.max(1,same.length)))-(actor.orbit*0.7);const direction=actor.orbit===2?"reverse":"normal";return{radius:ORBIT_RADII[actor.orbit],duration,delay,direction};}
function contactText(actor:Actor){return [actor.contact_email?`E-mail : ${actor.contact_email}`:null,actor.contact_phone?`Téléphone : ${actor.contact_phone}`:null,actor.contact_url?`Page officielle : ${actor.contact_url}`:null].filter(Boolean).join("\n");}

export default function RadarModule({dossiers,watch,onActions}:{dossiers:Dossier[];watch:Watch[];onActions?:(drafts:ActionDraft[])=>Promise<void>|void}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [actors,setActors]=useState<Actor[]>([]);
  const [selected,setSelected]=useState<Actor|null>(null);
  const [generated,setGenerated]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [saveMessage,setSaveMessage]=useState("");
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);
  const source=related[0]||null;

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}
    setLoading(true);setError("");setSaveMessage("");setActors([]);setSelected(null);setGenerated(false);
    try{
      const payload=await postJson<RadarPayload>("/api/radar",{dossier,items:related});
      const rawActors=payload.actors||[];
      const visibleActors=rawActors.filter(actor=>actor.evidence?.verified);
      setActors(visibleActors);setGenerated(true);
      if(rawActors.length){
        const saved=await saveProduction({dossier_id:dossier.id,type:"radar",title:`Radar d’influence — ${dossier.title}`,content:{actors:rawActors,item_ids:related.map(i=>i.id),source_url:source?.source_url||null,quality:payload.quality||null,grounding:payload.grounding||null,engine:payload.engine||null,model:payload.model||null}});
        setSaveMessage(saved.error?`Radar généré, mais non enregistré : ${saved.error.message}`:"Radar enregistré dans l’historique du dossier.");
      }
      if(onActions&&visibleActors.length){
        const priority=(a:Actor)=>a.influence>=5||a.position==="opposition"?"fort":"moyen";
        const drafts=visibleActors
          .filter(a=>(a.influence>=4||a.orbit===1)&&a.certainty!=="a_confirmer")
          .sort((a,b)=>b.influence-a.influence)
          .slice(0,4)
          .map(a=>{const contact=contactText(a),action=presentableText(a.action)||presentableText(a.why);return{dossier_id:dossier.id,type:"contact",title:`Contacter ${a.name}`,description:[action,contact].filter(Boolean).join("\n\n"),actor_name:a.name,priority:priority(a),due_date:null};});
        await onActions(drafts);
      }
    }catch(err:any){setError(err?.message||"Génération impossible");setGenerated(true);}
    finally{setLoading(false);}
  }

  return <div className={styles.page}>
    <div className={styles.head}><div><div className={styles.kicker}>Cartographie stratégique</div><h1>Radar d’influence</h1><p>Visualisez les acteurs, leur proximité avec la décision, leur influence et leur position face à l’objectif client.</p></div></div>
    <div className={styles.setup}>
      <section className={styles.panel}><h2>Dossier analysé</h2><div className={styles.field}><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setActors([]);setSelected(null);setGenerated(false);setError("");setSaveMessage("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<div className={styles.objective}><b>Objectif client :</b><br/>{dossier.objective}</div>}</section>
      <section className={styles.panel}><h2>Lecture des orbites</h2><div className={styles.orbitList}><div className={styles.orbitRow}><b>1re orbite</b><span>Décision directe</span></div><div className={styles.orbitRow}><b>2e orbite</b><span>Influence forte</span></div><div className={styles.orbitRow}><b>3e orbite</b><span>Influence indirecte</span></div></div></section>
    </div>
    <div className={styles.generate}><div><h3>Prêt à cartographier</h3><p>{related.length} texte(s) lié(s) au dossier sélectionné.</p></div><button onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?"Cartographie en cours…":"Générer le radar d’influence"}</button></div>
    {error&&<div className={styles.error}>{error}</div>}
    {saveMessage&&<div className={styles.error}>{saveMessage}</div>}
    {(!generated||actors.length>0)&&<section className={styles.radarCard}>
      <div className={styles.legend}><Legend color={COLORS.favorable} label="Favorable"/><Legend color={COLORS.inconnue} label="Neutre ou inconnue"/><Legend color={COLORS.reserve} label="Réserves"/><Legend color={COLORS.opposition} label="Opposition forte"/></div>
      {actors.length?<div className={styles.canvas}>
        {[3,2,1].map(orbit=><div key={orbit} className={styles.orbit} style={{width:ORBIT_RADII[orbit as 1|2|3]*2,height:ORBIT_RADII[orbit as 1|2|3]*2}}><span className={styles.orbitLabel}>Orbite {orbit}</span></div>)}
        <button className={styles.center} onClick={()=>source?.source_url&&window.open(source.source_url,"_blank")} style={{cursor:source?.source_url?"pointer":"default"}}><span><Orbit size={26}/><b>{dossier?.title||"Dossier"}</b>{source?.source_url&&<small>Ouvrir une source du dossier</small>}</span></button>
        {actors.map(actor=>{const motion=orbitMotion(actor,actors);const size=bubbleSize(actor.influence);const fontSize=bubbleFontSize(actor.name,size);const animationStyle={animationDuration:`${motion.duration}s`,animationDelay:`${motion.delay}s`,animationDirection:motion.direction as "normal"|"reverse"};return <div key={actor.id} className={styles.actorOrbit} style={animationStyle}><div className={styles.actorTravel} style={{transform:`translateX(${motion.radius}px)`}}><div className={styles.actorCounter} style={animationStyle}><button className={styles.actor} onClick={()=>setSelected(actor)} title={actor.name} style={{width:size,height:size,background:COLORS[actor.position],fontSize}}><span>{actor.name}</span></button></div></div></div>;})}
      </div>:<div className={styles.empty}><Orbit size={36}/><h3>Le radar est prêt</h3><p>Sélectionnez un dossier puis générez la cartographie des acteurs.</p></div>}
    </section>}
    {selected&&<div className={styles.modal} onClick={()=>setSelected(null)}><div className={styles.modalBox} onClick={e=>e.stopPropagation()}>
      <div className={styles.modalHead}><div><div className={styles.eyebrow}>Acteur — orbite {selected.orbit}</div><h2>{selected.name}</h2><p>{selected.role}</p></div><button className={styles.close} onClick={()=>setSelected(null)}><X size={18}/></button></div>
      <div className={styles.infoGrid}>
        <Info title="Pourquoi il compte" text={selected.why}/>
        <EvidenceInfo actor={selected}/>
        <Info title="Fenêtre d’action" text={selected.window}/>
        <Info title="Action recommandée" text={selected.action}/>
        {selected.contact_verified&&(selected.contact_email||selected.contact_phone||selected.contact_url)&&<div className={styles.info}><h3>Coordonnées officielles</h3><p>{selected.contact_email&&<><Mail size={14}/> <a href={`mailto:${selected.contact_email}`}>{selected.contact_email}</a><br/></>}{selected.contact_phone&&<><Phone size={14}/> <a href={`tel:${selected.contact_phone}`}>{selected.contact_phone}</a><br/></>}{selected.contact_url&&<><ExternalLink size={14}/> <a href={selected.contact_url} target="_blank" rel="noreferrer">Page officielle</a></>}</p></div>}
        <div className={styles.info}><h3>Lecture stratégique</h3><p><b>Influence :</b> {selected.influence}/5<br/><b>Proximité décisionnelle :</b> orbite {selected.orbit}<br/><b>Position :</b> {labelPosition(selected.position)}{selected.certainty!=="a_confirmer"&&<><br/><b>Certitude :</b> {labelCertainty(selected.certainty)}</>}</p></div>
      </div>
      {selected.evidence?.source_url&&<a className={styles.source} href={selected.evidence.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Lire la source officielle de cet acteur</a>}
    </div></div>}
  </div>;
}
function Legend({color,label}:{color:string;label:string}){return <span className={styles.legendItem}><i className={styles.legendDot} style={{background:color}}/>{label}</span>;}
function Info({title,text}:{title:string;text:string}){const visible=presentableText(text);if(!visible)return null;return <div className={styles.info}><h3>{title}</h3><p>{visible}</p></div>;}
function EvidenceInfo({actor}:{actor:Actor}){const evidence=actor.evidence;if(!evidence?.verified||!presentableText(evidence.excerpt))return null;return <div className={styles.info}><h3>Source institutionnelle</h3><blockquote className={styles.evidenceQuote}>{evidence.excerpt}</blockquote><p className={styles.evidenceMeta}>Source {evidence.source_index} · {evidence.source_title}</p></div>;}
function labelPosition(value:Actor["position"]){return value==="favorable"?"Favorable":value==="inconnue"?"Neutre ou inconnue":value==="reserve"?"Réserves":"Opposition forte ou capacité de blocage";}
function labelCertainty(value:Actor["certainty"]){return value==="confirme"?"Confirmé":"Probable";}
