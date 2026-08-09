"use client";

import {useEffect,useMemo,useState} from "react";
import {Bell,BriefcaseBusiness,Check,Clock3,ExternalLink,ShieldAlert,SlidersHorizontal} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Level="essential"|"reactive"|"realtime";
type Frequency="immediate"|"hourly"|"daily";
type Urgency="faible"|"moyen"|"fort"|"absolument urgent";
type DossierScope="all"|"selected";
type DossierOption={id:string;client:string;title:string;status:string};
type Preference={user_id:string;organization_id:string;enabled:boolean;level:Level;min_urgency:Urgency;min_confidence:number;frequency:Frequency;digest_hour:number;customized:boolean;dossier_scope:DossierScope;dossier_ids:string[]};
type AlertEvent={id:string;watch_id:string;dossier_id:string|null;title:string;nature:string|null;source_url:string|null;urgency:Urgency;confidence:number;reason:string|null;delivery_frequency:Frequency;available_at:string;created_at:string;read_at:string|null;dismissed_at:string|null};

type Preset={label:string;help:string;min_urgency:Urgency;min_confidence:number;frequency:Frequency;recommended?:boolean};
const PRESETS:Record<Level,Preset>={
  essential:{label:"Essentiel",help:"Seulement les évolutions critiques qui imposent une décision.",min_urgency:"absolument urgent",min_confidence:.95,frequency:"daily"},
  reactive:{label:"Réactif",help:"Les signaux forts et fiables remontent rapidement sans bruit inutile.",min_urgency:"fort",min_confidence:.90,frequency:"hourly",recommended:true},
  realtime:{label:"Temps réel",help:"Surveillance large : les signaux moyens et forts remontent dès qualification.",min_urgency:"moyen",min_confidence:.75,frequency:"immediate"},
};
const FREQUENCY_LABELS:Record<Frequency,string>={immediate:"Immédiatement",hourly:"Regroupées chaque heure",daily:"Digest quotidien"};
const URGENCY_LABELS:Record<Urgency,string>={faible:"Faible",moyen:"Moyen",fort:"Fort","absolument urgent":"Absolument urgent"};

function timeLabel(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date):"—";}
function urgencyClass(value:string){return value.replaceAll(" ","-");}

export default function AlertsCorporate({dossiers}:{dossiers:DossierOption[]}){
  const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const[userId,setUserId]=useState(""),[organizationId,setOrganizationId]=useState("");
  const[pref,setPref]=useState<Preference|null>(null),[events,setEvents]=useState<AlertEvent[]>([]),[eventFilter,setEventFilter]=useState("all");

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
      supabase.from("alert_preferences").select("user_id,organization_id,enabled,level,min_urgency,min_confidence,frequency,digest_hour,customized,dossier_scope,dossier_ids").eq("user_id",context.uid).eq("organization_id",context.org).maybeSingle(),
      supabase.from("alert_events").select("id,watch_id,dossier_id,title,nature,source_url,urgency,confidence,reason,delivery_frequency,available_at,created_at,read_at,dismissed_at").eq("user_id",context.uid).eq("organization_id",context.org).is("dismissed_at",null).order("created_at",{ascending:false}).limit(80),
    ]);
    if(prefRes.error||eventRes.error){setError(prefRes.error?.message||eventRes.error?.message||"Impossible de charger les alertes.");setLoading(false);return;}
    if(prefRes.data)setPref({...prefRes.data,min_confidence:Number(prefRes.data.min_confidence),dossier_scope:(prefRes.data.dossier_scope||"all") as DossierScope,dossier_ids:Array.isArray(prefRes.data.dossier_ids)?prefRes.data.dossier_ids:[]} as Preference);
    else{
      const preset=PRESETS[context.profileLevel]||PRESETS.reactive;
      setPref({user_id:context.uid,organization_id:context.org,enabled:true,level:context.profileLevel,min_urgency:preset.min_urgency,min_confidence:preset.min_confidence,frequency:preset.frequency,digest_hour:8,customized:false,dossier_scope:"all",dossier_ids:[]});
    }
    setEvents((eventRes.data||[]).map(item=>({...item,confidence:Number(item.confidence)}) as AlertEvent));setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  const dossierMap=useMemo(()=>new Map(dossiers.map(dossier=>[dossier.id,dossier])),[dossiers]);
  const availableEvents=useMemo(()=>events.filter(item=>new Date(item.available_at).getTime()<=Date.now()),[events]);
  const visibleEvents=useMemo(()=>availableEvents.filter(item=>eventFilter==="all"||item.dossier_id===eventFilter),[availableEvents,eventFilter]);
  const queuedCount=events.length-availableEvents.length;
  const unreadCount=availableEvents.filter(item=>!item.read_at).length;
  const selectedDossiers=pref?.dossier_scope==="selected"?dossiers.filter(item=>pref.dossier_ids.includes(item.id)):dossiers;
  const scopeLabel=pref?.dossier_scope==="selected"?`${selectedDossiers.length} dossier${selectedDossiers.length>1?"s":""} sélectionné${selectedDossiers.length>1?"s":""}`:`Tous les dossiers (${dossiers.length})`;
  const ruleSummary=!pref?"":!pref.enabled?"Alertes suspendues.":`Alerter sur ${scopeLabel.toLowerCase()}, dès le niveau ${URGENCY_LABELS[pref.min_urgency].toLowerCase()}, avec au moins ${Math.round(pref.min_confidence*100)} % de pertinence · ${FREQUENCY_LABELS[pref.frequency].toLowerCase()}${pref.frequency==="daily"?` à ${String(pref.digest_hour).padStart(2,"0")}:00`:""}.`;
  const invalidScope=Boolean(pref?.enabled&&pref.dossier_scope==="selected"&&!pref.dossier_ids.length);

  function applyPreset(level:Level){const preset=PRESETS[level];setPref(current=>current?{...current,level,min_urgency:preset.min_urgency,min_confidence:preset.min_confidence,frequency:preset.frequency,customized:false}:current);}
  function patch(patchValue:Partial<Preference>){setPref(current=>current?{...current,...patchValue,customized:true}:current);}
  function toggleDossier(id:string){setPref(current=>{if(!current)return current;const exists=current.dossier_ids.includes(id);return{...current,dossier_ids:exists?current.dossier_ids.filter(value=>value!==id):[...current.dossier_ids,id],customized:true};});}

  async function save(){
    if(!supabase||!pref||!userId||!organizationId)return;if(invalidScope){setError("Sélectionne au moins un dossier ou repasse sur Tous les dossiers.");return;}setSaving(true);setError("");setMessage("");
    const payload={...pref,user_id:userId,organization_id:organizationId,min_confidence:Number(pref.min_confidence),dossier_ids:pref.dossier_scope==="selected"?pref.dossier_ids:[],updated_at:new Date().toISOString()};
    const{error:saveError}=await supabase.from("alert_preferences").upsert(payload,{onConflict:"user_id,organization_id"});
    if(saveError){setError("Impossible d’enregistrer ces règles d’alerte.");setSaving(false);return;}
    await supabase.from("user_profiles").update({alert_level:pref.level,updated_at:new Date().toISOString()}).eq("user_id",userId);
    setPref(current=>current?{...current,dossier_ids:payload.dossier_ids}:current);setMessage("Règle serveur active et enregistrée.");setSaving(false);
  }

  async function markRead(id:string){if(!supabase)return;const now=new Date().toISOString();const{error:updateError}=await supabase.from("alert_events").update({read_at:now}).eq("id",id).eq("user_id",userId);if(!updateError)setEvents(current=>current.map(item=>item.id===id?{...item,read_at:now}:item));}
  async function dismiss(id:string){if(!supabase)return;const now=new Date().toISOString();const{error:updateError}=await supabase.from("alert_events").update({dismissed_at:now}).eq("id",id).eq("user_id",userId);if(!updateError)setEvents(current=>current.filter(item=>item.id!==id));}
  async function markAllRead(){if(!supabase||!visibleEvents.length)return;const now=new Date().toISOString();const ids=visibleEvents.filter(item=>!item.read_at).map(item=>item.id);if(!ids.length)return;const{error:updateError}=await supabase.from("alert_events").update({read_at:now}).in("id",ids).eq("user_id",userId);if(!updateError)setEvents(current=>current.map(item=>ids.includes(item.id)?{...item,read_at:now}:item));}

  if(loading)return <div className="alerts-page"><div className="alerts-empty">Chargement des règles d’alerte…</div></div>;
  if(!pref)return <div className="alerts-page"><div className="alerts-empty">{error||"Configuration d’alerte indisponible."}</div></div>;

  return <div className="alerts-page">
    <style jsx global>{`
      body:has(.alerts-page),.app:has(.alerts-page){background:#031126}.app:has(.alerts-page) .main{max-width:none;margin:0;padding:24px;background:radial-gradient(circle at 50% -20%,rgba(26,73,124,.18),transparent 38%),linear-gradient(180deg,#031126,#04172b);min-height:calc(100vh - 68px)}
      .alerts-page{max-width:1280px;margin:0 auto;color:#eff5fb;display:grid;gap:16px}.alerts-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.alerts-kicker{color:#e0b746;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:7px}.alerts-head h1{font-size:28px;margin:0;color:#fff;letter-spacing:-.025em}.alerts-head p{margin:7px 0 0;color:#91a6bb;font-size:12px;line-height:1.5}.alerts-stats{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.alerts-stat{border:1px solid #26435f;background:#081c34;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850;color:#b7c8d9}.alerts-stat.gold{border-color:rgba(224,183,70,.42);color:#edca61;background:rgba(224,183,70,.08)}
      .alert-rule-summary{border:1px solid rgba(224,183,70,.36);background:linear-gradient(135deg,rgba(224,183,70,.11),rgba(10,36,66,.7));border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:11px}.alert-rule-summary svg{color:#e0b746;flex:none}.alert-rule-summary div{display:grid;gap:3px}.alert-rule-summary b{font-size:11px;color:#f2d77e;text-transform:uppercase;letter-spacing:.08em}.alert-rule-summary span{font-size:12px;color:#d7e2ec;line-height:1.45}
      .alerts-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.25fr);gap:14px}.alerts-card{border:1px solid #173552;background:linear-gradient(145deg,#06172c,#081e38);border-radius:15px;overflow:hidden}.alerts-card-head{min-height:54px;padding:0 16px;border-bottom:1px solid #17344f;display:flex;align-items:center;justify-content:space-between;gap:10px}.alerts-card-head h2{font-size:14px;margin:0;display:flex;align-items:center;gap:8px}.alerts-body{padding:16px}.alert-presets{display:grid;gap:8px}.alert-preset{width:100%;border:1px solid #24435f;border-radius:12px;background:#081d36;color:#fff;padding:13px;text-align:left;cursor:pointer;display:grid;grid-template-columns:24px 1fr;gap:10px}.alert-preset.active{border-color:#e0b746;background:rgba(224,183,70,.08)}.alert-radio{width:18px;height:18px;border:1px solid #55708d;border-radius:50%;display:grid;place-items:center;margin-top:1px}.alert-preset.active .alert-radio{border-color:#e0b746;background:#e0b746;color:#07162c}.alert-preset b{font-size:12px}.alert-preset small{display:block;color:#899fb6;font-size:10px;line-height:1.4;margin-top:3px}.recommended{margin-left:7px;color:#e0b746;font-size:8px;text-transform:uppercase;letter-spacing:.07em}
      .alert-config{margin-top:16px;padding-top:16px;border-top:1px solid #17334d;display:grid;gap:13px}.alert-config-title{display:flex;align-items:center;gap:7px;color:#dce8f3;font-size:11px;font-weight:850}.alert-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #223f5b;background:#071b33;border-radius:10px;padding:10px 12px}.alert-switch span{font-size:11px;font-weight:800}.alert-switch input{accent-color:#e0b746}.alert-field{display:grid;gap:6px}.alert-field label{color:#93a8bc;font-size:10px;font-weight:800}.alert-field select{width:100%;min-height:39px;border:1px solid #294761;background:#06182e;color:#eff5fb;border-radius:9px;padding:0 10px;outline:none}.alert-field select:focus{border-color:#e0b746}.scope-switch{display:grid;grid-template-columns:1fr 1fr;gap:7px}.scope-switch button{border:1px solid #294761;background:#071b33;color:#aebfd0;border-radius:9px;padding:9px;font-size:10px;font-weight:850}.scope-switch button.active{border-color:#e0b746;color:#f2d77e;background:rgba(224,183,70,.08)}.dossier-picker{display:grid;gap:6px;max-height:210px;overflow:auto;padding-right:2px}.dossier-check{border:1px solid #203e5a;background:#071a31;border-radius:9px;padding:9px 10px;display:flex;align-items:flex-start;gap:9px;cursor:pointer}.dossier-check input{margin-top:2px;accent-color:#e0b746}.dossier-check b{display:block;font-size:10px;color:#e4edf5}.dossier-check small{display:block;font-size:9px;color:#8298ae;margin-top:2px}.alert-save{width:100%;min-height:42px;border:1px solid #e0b746;background:#e0b746;color:#07162c;border-radius:10px;font-weight:900;cursor:pointer}.alert-save:disabled{opacity:.55;cursor:not-allowed}.alert-feedback{font-size:10px;line-height:1.4;color:#7fd4a4}.alert-error{color:#ff929a}.alerts-info{border:1px solid rgba(224,183,70,.25);background:rgba(224,183,70,.05);border-radius:11px;padding:11px;color:#aebfd0;font-size:10px;line-height:1.5}.alerts-info b{color:#ebc95e}
      .event-filter{border:1px solid #294761;background:#071b33;color:#dbe5ef;border-radius:8px;padding:6px 9px;font-size:9px;max-width:210px}.alert-list{display:grid}.alert-row{border-bottom:1px solid #15314a;padding:14px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px}.alert-row:last-child{border-bottom:0}.alert-row.unread b{color:#fff}.alert-row.read{opacity:.72}.alert-row b{font-size:12px;line-height:1.45;display:block;color:#dbe5ef}.alert-row small{display:block;color:#8096ac;font-size:9px;margin-top:5px;line-height:1.4}.alert-dossier{display:inline-flex;margin-bottom:6px;border:1px solid #274762;background:#0a213b;border-radius:999px;padding:4px 7px;color:#aec2d4;font-size:8px;font-weight:850}.alert-row-reason{margin-top:8px;color:#a9bbcc;font-size:10px;line-height:1.45}.alert-side{display:grid;justify-items:end;align-content:start;gap:7px}.alert-urgency{border-radius:999px;padding:4px 7px;background:#102944;color:#a9bed3;font-size:8px;font-weight:900;text-transform:uppercase}.alert-urgency.fort,.alert-urgency.absolument-urgent{background:rgba(205,55,67,.14);color:#ff858e}.alert-urgency.moyen{background:rgba(224,183,70,.12);color:#e8c358}.alert-actions{display:flex;gap:5px}.alert-mini{border:1px solid #294761;background:#0a213c;color:#c7d6e5;border-radius:8px;padding:6px 8px;font-size:9px;font-weight:800;cursor:pointer}.alert-mini:hover{border-color:#4d7395;color:#fff}.alert-link{color:#e0b746;text-decoration:none;display:inline-flex;align-items:center;gap:4px}.alerts-empty{padding:28px;color:#8197ad;font-size:12px;line-height:1.5}.mark-all{border:0;background:transparent;color:#e0b746;font-size:10px;font-weight:850;cursor:pointer}
      @media(max-width:900px){.alerts-grid{grid-template-columns:1fr}.alerts-head{display:grid}.alerts-stats{justify-content:flex-start}}@media(max-width:650px){.app:has(.alerts-page) .main{padding:15px 12px calc(24px + env(safe-area-inset-bottom))}.alerts-page{gap:12px}.alerts-head h1{font-size:24px}.alert-rule-summary{align-items:flex-start}.scope-switch{grid-template-columns:1fr}.alert-row{grid-template-columns:1fr}.alert-side{justify-items:start}.alert-actions{flex-wrap:wrap}.alerts-card-head{align-items:flex-start;padding-top:13px;padding-bottom:13px;flex-wrap:wrap}}
    `}</style>

    <header className="alerts-head"><div><div className="alerts-kicker">Centre d’alertes</div><h1>Décidez exactement quand Myvor doit vous interrompre.</h1><p>Le moteur serveur filtre la veille selon le dossier, l’urgence, la pertinence et la cadence choisies.</p></div><div className="alerts-stats"><span className="alerts-stat gold">{unreadCount} non lue{unreadCount>1?"s":""}</span><span className="alerts-stat">{queuedCount} en attente</span></div></header>

    <div className="alert-rule-summary"><ShieldAlert size={19}/><div><b>Règle active</b><span>{ruleSummary}</span></div></div>

    <section className="alerts-grid">
      <article className="alerts-card"><div className="alerts-card-head"><h2><SlidersHorizontal size={15}/> Configuration</h2></div><div className="alerts-body">
        <div className="alert-presets">{(Object.keys(PRESETS) as Level[]).map(level=>{const item=PRESETS[level];return <button type="button" key={level} className={`alert-preset ${pref.level===level&&!pref.customized?"active":""}`} onClick={()=>applyPreset(level)}><span className="alert-radio">{pref.level===level&&!pref.customized&&<Check size={12}/>}</span><span><b>{item.label}{item.recommended&&<em className="recommended">Recommandé</em>}</b><small>{item.help}</small></span></button>;})}</div>

        <div className="alert-config"><div className="alert-config-title"><BriefcaseBusiness size={14}/> Périmètre et déclenchement</div>
          <div className="alert-switch"><span>Alertes actives</span><input type="checkbox" checked={pref.enabled} onChange={event=>patch({enabled:event.target.checked})}/></div>
          <div className="alert-field"><label>Dossiers surveillés</label><div className="scope-switch"><button type="button" className={pref.dossier_scope==="all"?"active":""} onClick={()=>patch({dossier_scope:"all"})}>Tous les dossiers</button><button type="button" className={pref.dossier_scope==="selected"?"active":""} onClick={()=>patch({dossier_scope:"selected"})}>Choisir les dossiers</button></div></div>
          {pref.dossier_scope==="selected"&&<div className="dossier-picker">{dossiers.length?dossiers.map(dossier=><label className="dossier-check" key={dossier.id}><input type="checkbox" checked={pref.dossier_ids.includes(dossier.id)} onChange={()=>toggleDossier(dossier.id)}/><span><b>{dossier.title}</b><small>{dossier.client}</small></span></label>):<div className="alerts-empty">Aucun dossier disponible.</div>}</div>}
          <div className="alert-field"><label>Urgence minimale</label><select value={pref.min_urgency} onChange={event=>patch({min_urgency:event.target.value as Urgency})}>{(Object.keys(URGENCY_LABELS) as Urgency[]).map(value=><option key={value} value={value}>{URGENCY_LABELS[value]}</option>)}</select></div>
          <div className="alert-field"><label>Pertinence minimale avec le dossier</label><select value={String(pref.min_confidence)} onChange={event=>patch({min_confidence:Number(event.target.value)})}><option value="0.75">75 % — large</option><option value="0.85">85 %</option><option value="0.9">90 % — recommandé</option><option value="0.95">95 % — très strict</option><option value="0.99">99 % — quasi certain</option></select></div>
          <div className="alert-field"><label>Cadence de remontée</label><select value={pref.frequency} onChange={event=>patch({frequency:event.target.value as Frequency})}>{(Object.keys(FREQUENCY_LABELS) as Frequency[]).map(value=><option key={value} value={value}>{FREQUENCY_LABELS[value]}</option>)}</select></div>
          {pref.frequency==="daily"&&<div className="alert-field"><label>Heure du digest · Paris</label><select value={pref.digest_hour} onChange={event=>patch({digest_hour:Number(event.target.value)})}>{[7,8,9,10,12,18].map(hour=><option key={hour} value={hour}>{String(hour).padStart(2,"0")}:00</option>)}</select></div>}
          {invalidScope&&<div className="alert-feedback alert-error">Sélectionne au moins un dossier pour activer ce périmètre.</div>}
          <button className="alert-save" type="button" disabled={saving||invalidScope} onClick={()=>void save()}>{saving?"Enregistrement…":"Enregistrer cette règle"}</button>{message&&<div className="alert-feedback">{message}</div>}{error&&<div className="alert-feedback alert-error">{error}</div>}
          <div className="alerts-info"><b>Ce réglage est appliqué côté serveur.</b> Une publication qui ne correspond pas au périmètre ou aux seuils choisis ne crée pas d’alerte pour cet utilisateur.</div>
        </div>
      </div></article>

      <article className="alerts-card"><div className="alerts-card-head"><h2><Bell size={15}/> Alertes disponibles</h2><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><select className="event-filter" value={eventFilter} onChange={event=>setEventFilter(event.target.value)}><option value="all">Tous les dossiers</option>{dossiers.map(dossier=><option key={dossier.id} value={dossier.id}>{dossier.title}</option>)}</select>{visibleEvents.some(item=>!item.read_at)&&<button type="button" className="mark-all" onClick={()=>void markAllRead()}>Tout marquer comme lu</button>}</div></div><div className="alerts-body"><div className="alert-list">{visibleEvents.length?visibleEvents.map(item=>{const dossier=item.dossier_id?dossierMap.get(item.dossier_id):null;return <div className={`alert-row ${item.read_at?"read":"unread"}`} key={item.id}><div>{dossier&&<span className="alert-dossier">{dossier.client} · {dossier.title}</span>}<b>{item.title}</b><small>{[item.nature,timeLabel(item.created_at),`${Math.round(item.confidence*100)} % de pertinence`,FREQUENCY_LABELS[item.delivery_frequency]].filter(Boolean).join(" · ")}</small>{item.reason&&<div className="alert-row-reason">{item.reason}</div>}{item.source_url&&<small><a className="alert-link" href={item.source_url} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={10}/></a></small>}</div><div className="alert-side"><span className={`alert-urgency ${urgencyClass(item.urgency)}`}>{item.urgency}</span><div className="alert-actions">{!item.read_at&&<button className="alert-mini" type="button" onClick={()=>void markRead(item.id)}>Lu</button>}<button className="alert-mini" type="button" onClick={()=>void dismiss(item.id)}>Masquer</button></div></div></div>}):<div className="alerts-empty"><Clock3 size={18}/><br/><br/>Aucune alerte disponible pour ce périmètre. Le moteur de veille continuera de vérifier les nouvelles évolutions côté serveur.</div>}</div></div></article>
    </section>
  </div>;
}
