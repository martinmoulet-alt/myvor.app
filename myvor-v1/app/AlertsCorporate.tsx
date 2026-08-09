"use client";

import {useEffect,useMemo,useState} from "react";
import {Bell,Check,Clock3,ExternalLink,ShieldAlert,SlidersHorizontal} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Level="essential"|"reactive"|"realtime";
type Frequency="immediate"|"hourly"|"daily";
type Urgency="faible"|"moyen"|"fort"|"absolument urgent";
type Preference={user_id:string;organization_id:string;enabled:boolean;level:Level;min_urgency:Urgency;min_confidence:number;frequency:Frequency;digest_hour:number;customized:boolean};
type AlertEvent={id:string;watch_id:string;dossier_id:string|null;title:string;nature:string|null;source_url:string|null;urgency:Urgency;confidence:number;reason:string|null;delivery_frequency:Frequency;available_at:string;created_at:string;read_at:string|null;dismissed_at:string|null};

const PRESETS:Record<Level,{label:string;help:string;min_urgency:Urgency;min_confidence:number;frequency:Frequency}>={
  essential:{label:"Essentiel",help:"Uniquement les évolutions qui imposent une décision.",min_urgency:"absolument urgent",min_confidence:.95,frequency:"daily"},
  reactive:{label:"Réactif",help:"Les signaux forts liés à vos dossiers remontent rapidement.",min_urgency:"fort",min_confidence:.90,frequency:"hourly"},
  realtime:{label:"Temps réel",help:"Toute évolution suffisamment pertinente remonte dès sa qualification.",min_urgency:"moyen",min_confidence:.75,frequency:"immediate"},
};
const FREQUENCY_LABELS:Record<Frequency,string>={immediate:"Immédiatement",hourly:"Regroupées chaque heure",daily:"Digest quotidien"};
const URGENCY_LABELS:Record<Urgency,string>={faible:"Faible",moyen:"Moyen",fort:"Fort","absolument urgent":"Absolument urgent"};

function timeLabel(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date):"—";}
function urgencyClass(value:string){return value.replaceAll(" ","-");}

export default function AlertsCorporate(){
  const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const[userId,setUserId]=useState(""),[organizationId,setOrganizationId]=useState("");
  const[pref,setPref]=useState<Preference|null>(null),[events,setEvents]=useState<AlertEvent[]>([]);

  async function resolveContext(){
    if(!supabase)return null;
    const{data:sessionData}=await supabase.auth.getSession();const uid=String(sessionData.session?.user?.id||"");if(!uid)return null;
    const[{data:profile},{data:memberships}]=await Promise.all([
      supabase.from("user_profiles").select("active_organization_id,alert_level").eq("user_id",uid).maybeSingle(),
      supabase.from("organization_members").select("organization_id").eq("user_id",uid).order("joined_at",{ascending:true}),
    ]);
    const rows=Array.isArray(memberships)?memberships:[];const preferred=String(profile?.active_organization_id||"");const org=String(rows.some(row=>row.organization_id===preferred)?preferred:rows[0]?.organization_id||"");
    return{uid,org,profileLevel:(profile?.alert_level||"reactive") as Level};
  }

  async function load(){
    if(!supabase)return;setLoading(true);setError("");
    const context=await resolveContext();if(!context?.org){setLoading(false);setError("Aucun workspace actif.");return;}
    setUserId(context.uid);setOrganizationId(context.org);
    const[prefRes,eventRes]=await Promise.all([
      supabase.from("alert_preferences").select("user_id,organization_id,enabled,level,min_urgency,min_confidence,frequency,digest_hour,customized").eq("user_id",context.uid).eq("organization_id",context.org).maybeSingle(),
      supabase.from("alert_events").select("id,watch_id,dossier_id,title,nature,source_url,urgency,confidence,reason,delivery_frequency,available_at,created_at,read_at,dismissed_at").eq("user_id",context.uid).eq("organization_id",context.org).is("dismissed_at",null).order("created_at",{ascending:false}).limit(80),
    ]);
    if(prefRes.error||eventRes.error){setError(prefRes.error?.message||eventRes.error?.message||"Impossible de charger les alertes.");setLoading(false);return;}
    if(prefRes.data)setPref({...prefRes.data,min_confidence:Number(prefRes.data.min_confidence)} as Preference);
    else{
      const preset=PRESETS[context.profileLevel]||PRESETS.reactive;
      setPref({user_id:context.uid,organization_id:context.org,enabled:true,level:context.profileLevel,min_urgency:preset.min_urgency,min_confidence:preset.min_confidence,frequency:preset.frequency,digest_hour:8,customized:false});
    }
    setEvents((eventRes.data||[]).map(item=>({...item,confidence:Number(item.confidence)}) as AlertEvent));setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  const visibleEvents=useMemo(()=>events.filter(item=>new Date(item.available_at).getTime()<=Date.now()),[events]);
  const queuedCount=events.length-visibleEvents.length;
  const unreadCount=visibleEvents.filter(item=>!item.read_at).length;

  function applyPreset(level:Level){const preset=PRESETS[level];setPref(current=>current?{...current,level,min_urgency:preset.min_urgency,min_confidence:preset.min_confidence,frequency:preset.frequency,customized:false}:current);}
  function patch(patchValue:Partial<Preference>){setPref(current=>current?{...current,...patchValue,customized:true}:current);}

  async function save(){
    if(!supabase||!pref||!userId||!organizationId)return;setSaving(true);setError("");setMessage("");
    const{error:saveError}=await supabase.from("alert_preferences").upsert({...pref,user_id:userId,organization_id:organizationId,min_confidence:Number(pref.min_confidence),updated_at:new Date().toISOString()},{onConflict:"user_id,organization_id"});
    if(saveError){setError("Impossible d’enregistrer ces règles d’alerte.");setSaving(false);return;}
    await supabase.from("user_profiles").update({alert_level:pref.level,updated_at:new Date().toISOString()}).eq("user_id",userId);
    setMessage("Règles serveur enregistrées.");setSaving(false);
  }

  async function markRead(id:string){if(!supabase)return;const now=new Date().toISOString();const{error:updateError}=await supabase.from("alert_events").update({read_at:now}).eq("id",id).eq("user_id",userId);if(!updateError)setEvents(current=>current.map(item=>item.id===id?{...item,read_at:now}:item));}
  async function dismiss(id:string){if(!supabase)return;const now=new Date().toISOString();const{error:updateError}=await supabase.from("alert_events").update({dismissed_at:now}).eq("id",id).eq("user_id",userId);if(!updateError)setEvents(current=>current.filter(item=>item.id!==id));}
  async function markAllRead(){if(!supabase||!visibleEvents.length)return;const now=new Date().toISOString();const ids=visibleEvents.filter(item=>!item.read_at).map(item=>item.id);if(!ids.length)return;const{error:updateError}=await supabase.from("alert_events").update({read_at:now}).in("id",ids).eq("user_id",userId);if(!updateError)setEvents(current=>current.map(item=>ids.includes(item.id)?{...item,read_at:now}:item));}

  if(loading)return <div className="alerts-page"><div className="alerts-empty">Chargement des règles d’alerte…</div></div>;
  if(!pref)return <div className="alerts-page"><div className="alerts-empty">{error||"Configuration d’alerte indisponible."}</div></div>;

  return <div className="alerts-page">
    <style jsx global>{`
      body:has(.alerts-page),.app:has(.alerts-page){background:#031126}.app:has(.alerts-page) .main{max-width:none;margin:0;padding:24px;background:radial-gradient(circle at 50% -20%,rgba(26,73,124,.18),transparent 38%),linear-gradient(180deg,#031126,#04172b);min-height:calc(100vh - 68px)}
      .alerts-page{max-width:1280px;margin:0 auto;color:#eff5fb;display:grid;gap:16px}.alerts-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.alerts-kicker{color:#e0b746;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:7px}.alerts-head h1{font-size:28px;margin:0;color:#fff;letter-spacing:-.025em}.alerts-head p{margin:7px 0 0;color:#91a6bb;font-size:12px;line-height:1.5}.alerts-stats{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.alerts-stat{border:1px solid #26435f;background:#081c34;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850;color:#b7c8d9}.alerts-stat.gold{border-color:rgba(224,183,70,.42);color:#edca61;background:rgba(224,183,70,.08)}.alerts-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.25fr);gap:14px}.alerts-card{border:1px solid #173552;background:linear-gradient(145deg,#06172c,#081e38);border-radius:15px;overflow:hidden}.alerts-card-head{min-height:54px;padding:0 16px;border-bottom:1px solid #17344f;display:flex;align-items:center;justify-content:space-between;gap:10px}.alerts-card-head h2{font-size:14px;margin:0;display:flex;align-items:center;gap:8px}.alerts-body{padding:16px}.alert-presets{display:grid;gap:8px}.alert-preset{width:100%;border:1px solid #24435f;border-radius:12px;background:#081d36;color:#fff;padding:13px;text-align:left;cursor:pointer;display:grid;grid-template-columns:24px 1fr;gap:10px}.alert-preset.active{border-color:#e0b746;background:rgba(224,183,70,.08)}.alert-radio{width:18px;height:18px;border:1px solid #55708d;border-radius:50%;display:grid;place-items:center;margin-top:1px}.alert-preset.active .alert-radio{border-color:#e0b746;background:#e0b746;color:#07162c}.alert-preset b{font-size:12px}.alert-preset small{display:block;color:#899fb6;font-size:10px;line-height:1.4;margin-top:3px}.alert-advanced{margin-top:16px;padding-top:16px;border-top:1px solid #17334d;display:grid;gap:12px}.alert-advanced-title{display:flex;align-items:center;gap:7px;color:#dce8f3;font-size:11px;font-weight:850}.alert-field{display:grid;gap:6px}.alert-field label{color:#93a8bc;font-size:10px;font-weight:800}.alert-field select,.alert-field input{width:100%;min-height:39px;border:1px solid #294761;background:#06182e;color:#eff5fb;border-radius:9px;padding:0 10px;outline:none}.alert-field select:focus,.alert-field input:focus{border-color:#e0b746}.alert-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #223f5b;background:#071b33;border-radius:10px;padding:10px 12px}.alert-switch span{font-size:11px;font-weight:800}.alert-switch input{accent-color:#e0b746}.alert-save{width:100%;min-height:42px;border:1px solid #e0b746;background:#e0b746;color:#07162c;border-radius:10px;font-weight:900;cursor:pointer;margin-top:4px}.alert-save:disabled{opacity:.6;cursor:not-allowed}.alert-feedback{font-size:10px;line-height:1.4;margin-top:8px;color:#7fd4a4}.alert-error{color:#ff929a}.alert-list{display:grid}.alert-row{border-bottom:1px solid #15314a;padding:14px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px}.alert-row:last-child{border-bottom:0}.alert-row.unread b{color:#fff}.alert-row.read{opacity:.72}.alert-row b{font-size:12px;line-height:1.45;display:block;color:#dbe5ef}.alert-row small{display:block;color:#8096ac;font-size:9px;margin-top:5px;line-height:1.4}.alert-row-reason{margin-top:8px;color:#a9bbcc;font-size:10px;line-height:1.45}.alert-side{display:grid;justify-items:end;align-content:start;gap:7px}.alert-urgency{border-radius:999px;padding:4px 7px;background:#102944;color:#a9bed3;font-size:8px;font-weight:900;text-transform:uppercase}.alert-urgency.fort,.alert-urgency.absolument-urgent{background:rgba(205,55,67,.14);color:#ff858e}.alert-urgency.moyen{background:rgba(224,183,70,.12);color:#e8c358}.alert-actions{display:flex;gap:5px}.alert-mini{border:1px solid #294761;background:#0a213c;color:#c7d6e5;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:800;cursor:pointer}.alert-mini:hover{border-color:#4d7395;color:#fff}.alert-link{color:#e0b746;text-decoration:none;display:inline-flex;align-items:center;gap:4px}.alerts-empty{padding:28px;color:#8197ad;font-size:12px;line-height:1.5}.alerts-info{border:1px solid rgba(224,183,70,.28);background:rgba(224,183,70,.06);border-radius:11px;padding:11px;color:#aebfd0;font-size:10px;line-height:1.5;margin-top:14px}.alerts-info b{color:#ebc95e}.mark-all{border:0;background:transparent;color:#e0b746;font-size:10px;font-weight:850;cursor:pointer}@media(max-width:900px){.alerts-grid{grid-template-columns:1fr}.alerts-head{display:grid}.alerts-stats{justify-content:flex-start}}@media(max-width:650px){.app:has(.alerts-page) .main{padding:15px 12px calc(24px + env(safe-area-inset-bottom))}.alerts-page{gap:12px}.alerts-head h1{font-size:24px}.alert-row{grid-template-columns:1fr}.alert-side{justify-items:start}.alert-actions{flex-wrap:wrap}}
    `}</style>
    <header className="alerts-head"><div><div className="alerts-kicker">Centre d’alertes</div><h1>Des alertes qui obéissent à de vraies règles.</h1><p>Myvor déclenche les alertes côté serveur après qualification de la veille, selon votre urgence minimale, votre seuil de confiance et votre cadence.</p></div><div className="alerts-stats"><span className="alerts-stat gold">{unreadCount} non lue{unreadCount>1?"s":""}</span><span className="alerts-stat">{queuedCount} en attente de cadence</span></div></header>
    <section className="alerts-grid">
      <article className="alerts-card"><div className="alerts-card-head"><h2><SlidersHorizontal size={15}/> Règles de déclenchement</h2></div><div className="alerts-body">
        <div className="alert-presets">{(Object.keys(PRESETS) as Level[]).map(level=>{const item=PRESETS[level];return <button type="button" key={level} className={`alert-preset ${pref.level===level&&!pref.customized?"active":""}`} onClick={()=>applyPreset(level)}><span className="alert-radio">{pref.level===level&&!pref.customized&&<Check size={12}/>}</span><span><b>{item.label}</b><small>{item.help}</small></span></button>;})}</div>
        <div className="alert-advanced"><div className="alert-advanced-title"><ShieldAlert size={14}/> Réglages avancés</div><div className="alert-switch"><span>Alertes actives</span><input type="checkbox" checked={pref.enabled} onChange={event=>patch({enabled:event.target.checked})}/></div><div className="alert-field"><label>Urgence minimale</label><select value={pref.min_urgency} onChange={event=>patch({min_urgency:event.target.value as Urgency})}>{(Object.keys(URGENCY_LABELS) as Urgency[]).map(value=><option key={value} value={value}>{URGENCY_LABELS[value]}</option>)}</select></div><div className="alert-field"><label>Confiance minimale de rattachement</label><select value={String(pref.min_confidence)} onChange={event=>patch({min_confidence:Number(event.target.value)})}><option value="0.75">75 %</option><option value="0.85">85 %</option><option value="0.9">90 %</option><option value="0.95">95 %</option><option value="0.99">99 %</option></select></div><div className="alert-field"><label>Cadence</label><select value={pref.frequency} onChange={event=>patch({frequency:event.target.value as Frequency})}>{(Object.keys(FREQUENCY_LABELS) as Frequency[]).map(value=><option key={value} value={value}>{FREQUENCY_LABELS[value]}</option>)}</select></div>{pref.frequency==="daily"&&<div className="alert-field"><label>Heure du digest · Paris</label><select value={pref.digest_hour} onChange={event=>patch({digest_hour:Number(event.target.value)})}>{[7,8,9,10,12,18].map(hour=><option key={hour} value={hour}>{String(hour).padStart(2,"0")}:00</option>)}</select></div>}<button className="alert-save" type="button" disabled={saving} onClick={()=>void save()}>{saving?"Enregistrement…":"Enregistrer les règles serveur"}</button>{message&&<div className="alert-feedback">{message}</div>}{error&&<div className="alert-feedback alert-error">{error}</div>}</div>
        <div className="alerts-info"><b>Déclenchement réel :</b> un événement n’entre dans ce centre que lorsque la veille a été qualifiée, rattachée à un dossier ou proposée pour rattachement, puis a franchi vos deux seuils serveur.</div>
      </div></article>
      <article className="alerts-card"><div className="alerts-card-head"><h2><Bell size={15}/> Alertes disponibles</h2>{unreadCount>0&&<button type="button" className="mark-all" onClick={()=>void markAllRead()}>Tout marquer comme lu</button>}</div><div className="alerts-body"><div className="alert-list">{visibleEvents.length?visibleEvents.map(item=><div className={`alert-row ${item.read_at?"read":"unread"}`} key={item.id}><div><b>{item.title}</b><small>{[item.nature,timeLabel(item.created_at),`${Math.round(item.confidence*100)} % de confiance`,FREQUENCY_LABELS[item.delivery_frequency]].filter(Boolean).join(" · ")}</small>{item.reason&&<div className="alert-row-reason">{item.reason}</div>}{item.source_url&&<small><a className="alert-link" href={item.source_url} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={10}/></a></small>}</div><div className="alert-side"><span className={`alert-urgency ${urgencyClass(item.urgency)}`}>{item.urgency}</span><div className="alert-actions">{!item.read_at&&<button className="alert-mini" type="button" onClick={()=>void markRead(item.id)}>Lu</button>}<button className="alert-mini" type="button" onClick={()=>void dismiss(item.id)}>Masquer</button></div></div></div>):<div className="alerts-empty"><Clock3 size={18}/><br/><br/>Aucune alerte n’a encore franchi vos seuils. Les prochaines seront créées automatiquement par le moteur de veille.</div>}</div></div></article>
    </section>
  </div>;
}