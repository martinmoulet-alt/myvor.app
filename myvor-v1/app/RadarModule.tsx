"use client";

import { useMemo,useState } from "react";
import { ExternalLink,Orbit,Sparkles,X } from "lucide-react";

type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Actor={id:string;name:string;role:string;orbit:1|2|3;position:"favorable"|"inconnue"|"reserve"|"opposition";influence:number;why:string;window:string;action:string};

const COLORS={favorable:"#2f8f5b",inconnue:"#d9a514",reserve:"#d97706",opposition:"#b42318"};
const ORBIT_RADII={1:112,2:190,3:268};

export default function RadarModule({dossiers,watch}:{dossiers:Dossier[];watch:Watch[]}){
  const [dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const [actors,setActors]=useState<Actor[]>([]);
  const [selected,setSelected]=useState<Actor|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const dossier=dossiers.find(d=>d.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(w=>w.dossier_id===dossierId),[watch,dossierId]);
  const source=related[0]||null;

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!related.length){setError("Aucun texte n’est rattaché à ce dossier.");return;}
    setLoading(true);setError("");setActors([]);setSelected(null);
    try{
      const response=await fetch("/api/radar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dossier,items:related})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload?.error||"Génération impossible");
      setActors(payload.actors||[]);
    }catch(err:any){setError(err?.message||"Génération impossible");}
    finally{setLoading(false);}
  }

  return <>
    <div className="toolbar"><div><div className="eyebrow">Cartographie stratégique</div><h1 className="h1">Radar d’influence</h1><p className="lead">Plus un acteur est proche du centre, plus il est proche de la décision.</p></div></div>
    <div className="grid two">
      <div className="card"><h2>Dossier analysé</h2><div className="field"><label>Dossier client</label><select value={dossierId} onChange={e=>{setDossierId(e.target.value);setActors([]);setSelected(null);setError("");}}><option value="">Sélectionner un dossier</option>{dossiers.map(d=><option key={d.id} value={d.id}>{d.client} — {d.title}</option>)}</select></div>{dossier&&<div className="notice small"><b>Objectif :</b> {dossier.objective}</div>}</div>
      <div className="card"><h2>Lecture des orbites</h2><div className="list"><div className="row"><b>1re orbite</b><span className="muted small">Décision directe</span></div><div className="row"><b>2e orbite</b><span className="muted small">Influence forte</span></div><div className="row"><b>3e orbite</b><span className="muted small">Influence indirecte</span></div></div></div>
    </div>
    <div className="card" style={{marginTop:16}}><button className="btn primary" onClick={generate} disabled={loading||!dossier||!related.length}><Sparkles size={17}/>{loading?" Cartographie en cours…":" Générer le radar d’influence"}</button>{error&&<div className="notice" style={{marginTop:12}}>{error}</div>}</div>
    <div className="card" style={{marginTop:16,overflow:"hidden"}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}><Legend color={COLORS.favorable} label="Favorable"/><Legend color={COLORS.inconnue} label="Neutre ou inconnue"/><Legend color={COLORS.reserve} label="Réserves"/><Legend color={COLORS.opposition} label="Opposition forte"/></div>
      <div style={{position:"relative",width:"100%",maxWidth:720,aspectRatio:"1 / 1",margin:"0 auto",borderRadius:24,background:"linear-gradient(180deg,#fbfcff,#f4f6fa)"}}>
        {[3,2,1].map(orbit=><div key={orbit} style={{position:"absolute",left:"50%",top:"50%",width:ORBIT_RADII[orbit as 1|2|3]*2,height:ORBIT_RADII[orbit as 1|2|3]*2,transform:"translate(-50%,-50%)",border:"1.5px solid #cfd5df",borderRadius:"50%",boxSizing:"border-box"}}><span style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",background:"#f7f8fb",padding:"2px 7px",fontSize:11,color:"#687080"}}>Orbite {orbit}</span></div>)}
        <svg viewBox="0 0 720 720" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>{actors.map((actor,index)=>{const p=positionFor(actor,index,actors);return <line key={actor.id} x1="360" y1="360" x2={p.x} y2={p.y} stroke="#aeb6c2" strokeWidth="1.4" strokeDasharray={actor.orbit===3?"5 5":"0"}/>;})}</svg>
        <button onClick={()=>source?.source_url&&window.open(source.source_url,"_blank")} style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:150,height:150,borderRadius:"50%",border:"4px solid white",boxShadow:"0 10px 30px rgba(15,25,45,.22)",background:"#111c35",color:"white",padding:16,cursor:source?.source_url?"pointer":"default",display:"grid",placeItems:"center",textAlign:"center",zIndex:3}}><span><Orbit size={24}/><b style={{display:"block",fontSize:13,marginTop:6}}>{dossier?.title||"Dossier"}</b>{source?.source_url&&<small style={{display:"block",marginTop:5,opacity:.8}}>Lire le texte original</small>}</span></button>
        {actors.map((actor,index)=>{const p=positionFor(actor,index,actors);const size=52+actor.influence*8;return <button key={actor.id} onClick={()=>setSelected(actor)} title={actor.name} style={{position:"absolute",left:`${p.x/7.2}%`,top:`${p.y/7.2}%`,transform:"translate(-50%,-50%)",width:size,height:size,borderRadius:"50%",border:"4px solid white",boxShadow:"0 7px 18px rgba(15,25,45,.18)",background:COLORS[actor.position],color:"white",padding:7,cursor:"pointer",zIndex:4,fontSize:11,fontWeight:800,lineHeight:1.1,overflow:"hidden"}}>{actor.name}</button>;})}
      </div>
    </div>
    {selected&&<div className="modal" onClick={()=>setSelected(null)}><div className="modalbox" onClick={e=>e.stopPropagation()}><div className="toolbar" style={{marginTop:0}}><div><div className="eyebrow">Acteur — orbite {selected.orbit}</div><h2>{selected.name}</h2><p className="muted">{selected.role}</p></div><button className="btn ghost" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="grid two"><Info title="Pourquoi il compte" text={selected.why}/><Info title="Fenêtre d’action" text={selected.window}/><Info title="Action recommandée" text={selected.action}/><div className="card"><h3>Lecture stratégique</h3><p><b>Influence :</b> {selected.influence}/5</p><p><b>Proximité décisionnelle :</b> orbite {selected.orbit}</p><p><b>Position :</b> {labelPosition(selected.position)}</p></div></div>{source?.source_url&&<a className="btn dark" style={{marginTop:14,display:"inline-flex"}} href={source.source_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Lire le texte original</a>}</div></div>}
  </>;
}

function positionFor(actor:Actor,index:number,actors:Actor[]){const same=actors.filter(a=>a.orbit===actor.orbit);const rank=same.findIndex(a=>a.id===actor.id);const angle=((Math.PI*2)/Math.max(1,same.length))*rank-(Math.PI/2)+(actor.orbit*0.22);const radius=ORBIT_RADII[actor.orbit];return{x:360+Math.cos(angle)*radius,y:360+Math.sin(angle)*radius};}
function Legend({color,label}:{color:string;label:string}){return <span className="small" style={{display:"inline-flex",alignItems:"center",gap:6}}><i style={{width:10,height:10,borderRadius:"50%",background:color,display:"inline-block"}}/>{label}</span>;}
function Info({title,text}:{title:string;text:string}){return <div className="card"><h3>{title}</h3><p>{text||"À préciser."}</p></div>;}
function labelPosition(value:Actor["position"]){return value==="favorable"?"Favorable":value==="inconnue"?"Neutre ou inconnue":value==="reserve"?"Réserves ou opposition probable":"Opposition forte ou capacité de blocage";}
