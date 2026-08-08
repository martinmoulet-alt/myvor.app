"use client";

import {ArrowRight,BriefcaseBusiness,Check,CheckCircle2,Circle,FileSearch,ShieldCheck,Sparkles,X} from "lucide-react";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Step="welcome"|"profile"|"topics"|"institutions"|"dossier"|"alerts"|"ready";
type AlertLevel="essential"|"reactive"|"realtime";
type CreatedDossier={id:string;client:string;title:string;objective:string;context:string};
type JourneyProgress={watch:boolean;impact:boolean;radar:boolean;builder:boolean};
type Preferences={jobType:string;topics:string[];institutions:string[];alertLevel:AlertLevel};

const AFTER_KEY="myvor:onboarding:after";
const JOURNEY_HIDDEN_KEY="myvor:onboarding:journey-hidden";
const emptyProgress:JourneyProgress={watch:false,impact:false,radar:false,builder:false};
const JOBS=[
  {value:"cabinet",label:"Cabinet d’affaires publiques",help:"Piloter plusieurs dossiers clients en parallèle."},
  {value:"corporate",label:"Direction affaires publiques",help:"Anticiper l’impact institutionnel pour votre organisation."},
  {value:"consultant",label:"Consultant indépendant",help:"Centraliser veille, analyse et livrables clients."},
  {value:"federation",label:"Fédération ou organisation",help:"Suivre les textes et défendre les intérêts de vos membres."},
  {value:"other",label:"Autre profil",help:"Configurer Myvor autour de votre propre façon de travailler."},
];
const TOPICS=["Santé","Énergie","Numérique","Industrie","Transport","Environnement","Agriculture","Défense","Finance","Emploi & social"];
const INSTITUTIONS=["Assemblée nationale","Sénat","Gouvernement","Union européenne","Autorités indépendantes"];
const ALERTS:{value:AlertLevel;label:string;help:string;badge?:string}[]=[
  {value:"essential",label:"Essentiel",help:"Uniquement les évolutions qui changent réellement la décision."},
  {value:"reactive",label:"Réactif",help:"Alerte dès qu’un élément peut affecter un dossier prioritaire.",badge:"Recommandé"},
  {value:"realtime",label:"Temps réel",help:"Toute évolution pertinente remonte immédiatement dans votre flux."},
];

function journeyKey(userId:string){return`myvor:onboarding:journey:${userId}`;}
function jobLabel(value:string){return JOBS.find(item=>item.value===value)?.label||"Profil personnalisé";}
function alertLabel(value:AlertLevel){return ALERTS.find(item=>item.value===value)?.label||"Réactif";}
function clickNavigation(label:string){
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn,.mobile-menu-nav button"));
  const target=buttons.find(button=>(button.textContent||"").trim().includes(label));
  if(target){target.click();window.scrollTo({top:0,behavior:"smooth"});return true;}
  return false;
}
function nextJourney(progress:JourneyProgress){
  if(!progress.watch)return{label:"Configurer la Veille",nav:"Veille",help:"Rattachez au moins une évolution pertinente au dossier."};
  if(!progress.impact)return{label:"Générer la Note d’impact",nav:"Note d’impact",help:"Transformez la veille en conséquences et décisions concrètes."};
  if(!progress.radar)return{label:"Construire le Radar",nav:"Radar",help:"Identifiez les acteurs institutionnels réellement utiles au dossier."};
  return{label:"Créer le premier livrable",nav:"Note Builder",help:"Transformez l’analyse en document directement exploitable."};
}

export default function FirstRunOnboarding(){
  const[visible,setVisible]=useState(false);
  const[journeyVisible,setJourneyVisible]=useState(false);
  const[step,setStep]=useState<Step>("welcome");
  const[checking,setChecking]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const[profileEnriched,setProfileEnriched]=useState(false);
  const[created,setCreated]=useState<CreatedDossier|null>(null);
  const[progress,setProgress]=useState<JourneyProgress>(emptyProgress);
  const[userId,setUserId]=useState("");
  const[displayName,setDisplayName]=useState("");
  const[preferences,setPreferences]=useState<Preferences>({jobType:"",topics:[],institutions:[],alertLevel:"reactive"});
  const[form,setForm]=useState({client:"",title:"",objective:"",context:""});

  async function refreshJourney(activeUserId:string){
    if(!supabase||!activeUserId)return;
    const[watchResult,productionResult]=await Promise.all([
      supabase.from("watch_items").select("id").not("dossier_id","is",null).limit(1),
      supabase.from("productions").select("type").in("type",["impact","radar","builder"]).limit(50),
    ]);
    if(watchResult.error||productionResult.error)return;
    const types=new Set((productionResult.data||[]).map(item=>String(item.type)));
    const next={watch:Boolean(watchResult.data?.length),impact:types.has("impact"),radar:types.has("radar"),builder:types.has("builder")};
    setProgress(next);
    if(next.builder){localStorage.setItem(journeyKey(activeUserId),"complete");setJourneyVisible(false);}
  }

  useEffect(()=>{
    if(!supabase){setChecking(false);return;}
    let active=true;
    async function evaluate(session:any){
      if(!active)return;
      const id=String(session?.user?.id||"");setUserId(id);
      const rawName=String(session?.user?.user_metadata?.full_name||session?.user?.user_metadata?.name||"").trim();
      const emailName=String(session?.user?.email||"").split("@")[0].split(/[._-]/)[0];
      setDisplayName((rawName||emailName).split(" ")[0]||"");
      if(!id){setVisible(false);setJourneyVisible(false);setChecking(false);return;}
      const after=sessionStorage.getItem(AFTER_KEY);
      const[ dossierResult,profileResult ]=await Promise.all([
        supabase!.from("dossiers").select("id").limit(1),
        supabase!.from("user_profiles").select("job_type,topics,institutions,alert_level,onboarding_completed").eq("user_id",id).maybeSingle(),
      ]);
      if(!active)return;
      if(profileResult.data){
        setPreferences({
          jobType:String(profileResult.data.job_type||""),
          topics:Array.isArray(profileResult.data.topics)?profileResult.data.topics:[],
          institutions:Array.isArray(profileResult.data.institutions)?profileResult.data.institutions:[],
          alertLevel:(profileResult.data.alert_level||"reactive") as AlertLevel,
        });
      }
      if(dossierResult.error){setChecking(false);return;}
      const hasDossier=Boolean(dossierResult.data?.length);
      if(hasDossier){
        setVisible(false);
        const journeyState=localStorage.getItem(journeyKey(id));
        const hidden=sessionStorage.getItem(JOURNEY_HIDDEN_KEY)==="1";
        if(journeyState==="active"){
          await refreshJourney(id);
          if(!hidden&&localStorage.getItem(journeyKey(id))!=="complete")setJourneyVisible(true);
        }
        if(after){sessionStorage.removeItem(AFTER_KEY);window.setTimeout(()=>{if(!clickNavigation(after))window.setTimeout(()=>clickNavigation(after),700);},350);}
        setChecking(false);return;
      }
      setJourneyVisible(false);
      const snoozed=sessionStorage.getItem(`myvor:onboarding:snooze:${id}`)==="1";
      setVisible(!snoozed);setChecking(false);
    }
    supabase.auth.getSession().then(({data})=>void evaluate(data.session));
    const{data:subscription}=supabase.auth.onAuthStateChange((_event,session)=>void evaluate(session));
    return()=>{active=false;subscription.subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!journeyVisible||!userId)return;
    const timer=window.setInterval(()=>void refreshJourney(userId),10000);
    return()=>window.clearInterval(timer);
  },[journeyVisible,userId]);

  function updateField(field:keyof typeof form,value:string){setForm(current=>({...current,[field]:value}));}
  function updatePreferences(patch:Partial<Preferences>){setPreferences(current=>({...current,...patch}));}
  function toggleList(field:"topics"|"institutions",value:string){
    setPreferences(current=>{
      const values=current[field];
      return{...current,[field]:values.includes(value)?values.filter(item=>item!==value):[...values,value]};
    });
  }
  function postpone(){
    if(!supabase){setVisible(false);return;}
    supabase.auth.getSession().then(({data})=>{
      if(data.session?.user?.id)sessionStorage.setItem(`myvor:onboarding:snooze:${data.session.user.id}`,"1");
      setVisible(false);
    });
  }
  function hideJourney(){sessionStorage.setItem(JOURNEY_HIDDEN_KEY,"1");setJourneyVisible(false);}

  async function saveProfile(patch:Partial<Preferences>={},completed=false){
    if(!supabase||!userId)return false;
    const next={...preferences,...patch};
    const{error:profileError}=await supabase.from("user_profiles").upsert({
      user_id:userId,
      job_type:next.jobType||null,
      topics:next.topics,
      institutions:next.institutions,
      alert_level:next.alertLevel,
      onboarding_completed:completed,
      updated_at:new Date().toISOString(),
    },{onConflict:"user_id"});
    if(profileError){setError("Impossible d’enregistrer vos préférences pour le moment.");return false;}
    setPreferences(next);setError("");return true;
  }

  async function continueProfile(){
    if(!preferences.jobType){setError("Choisissez le profil qui correspond le mieux à votre activité.");return;}
    setSaving(true);if(await saveProfile())setStep("topics");setSaving(false);
  }
  async function continueTopics(){
    if(!preferences.topics.length){setError("Sélectionnez au moins un sujet à suivre.");return;}
    setSaving(true);if(await saveProfile())setStep("institutions");setSaving(false);
  }
  async function continueInstitutions(){
    if(!preferences.institutions.length){setError("Sélectionnez au moins une institution à surveiller.");return;}
    setSaving(true);if(await saveProfile())setStep("dossier");setSaving(false);
  }

  async function createFirstDossier(){
    if(!supabase)return;
    const client=form.client.trim(),title=form.title.trim(),objective=form.objective.trim(),context=form.context.trim();
    if(!client||!title||!objective){setError("Renseignez le client, le sujet du dossier et l’objectif à atteindre.");return;}
    setSaving(true);setError("");setProfileEnriched(false);
    try{
      const{data,error:insertError}=await supabase.from("dossiers").insert({client,title,objective,context}).select("id,client,title,objective,context").single();
      if(insertError)throw insertError;
      const dossier=data as CreatedDossier;setCreated(dossier);
      const{data:sessionData}=await supabase.auth.getSession();const activeUserId=String(sessionData.session?.user?.id||userId);
      if(activeUserId)localStorage.setItem(journeyKey(activeUserId),"active");
      try{
        const{data:profilePayload,error:profileError}=await supabase.functions.invoke("dossier-profile",{body:{dossier,items:[]}});
        const profile=profilePayload?.profile;
        if(!profileError&&profile){const{error:updateError}=await supabase.from("dossiers").update(profile).eq("id",dossier.id);if(!updateError)setProfileEnriched(true);}
      }catch{
        // Le dossier reste utilisable même si l'enrichissement automatique est temporairement indisponible.
      }
      setStep("alerts");
    }catch(err:any){setError(err?.message||"Impossible de créer le dossier pour le moment.");}
    finally{setSaving(false);}
  }

  async function completePersonalization(){
    setSaving(true);
    if(await saveProfile({},true))setStep("ready");
    setSaving(false);
  }

  function finish(destination:"Veille"|"Tableau de bord"){
    sessionStorage.setItem(AFTER_KEY,destination);sessionStorage.removeItem(JOURNEY_HIDDEN_KEY);setVisible(false);window.location.reload();
  }

  if(checking)return null;
  if(!visible&&journeyVisible&&!progress.builder){const next=nextJourney(progress);return <aside className="myvor-onboarding-journey" aria-label="Progression de prise en main Myvor">
    <button className="journey-close" type="button" onClick={hideJourney} aria-label="Masquer le guide"><X size={14}/></button>
    <div className="journey-kicker">Prise en main</div><strong>Votre premier flux Myvor</strong>
    <div className="journey-steps"><JourneyStep done label="Dossier créé"/><JourneyStep done={progress.watch} label="Veille pertinente"/><JourneyStep done={progress.impact} label="Note d’impact"/><JourneyStep done={progress.radar} label="Radar"/><JourneyStep done={progress.builder} label="Livrable"/></div>
    <p>{next.help}</p><button className="journey-next" type="button" onClick={()=>clickNavigation(next.nav)}>{next.label}<ArrowRight size={14}/></button>
    <style jsx global>{`
      .myvor-onboarding-journey{position:fixed;right:18px;bottom:18px;z-index:92;width:min(320px,calc(100vw - 24px));border:1px solid rgba(255,255,255,.13);border-radius:17px;background:linear-gradient(150deg,#0c294a,#07162c);box-shadow:0 22px 55px rgba(1,10,24,.32);padding:17px;color:#e9f1fa}.journey-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.06);color:#9fb1c6;display:grid;place-items:center;cursor:pointer}.journey-kicker{color:#e0b746;text-transform:uppercase;letter-spacing:.12em;font-size:9px;font-weight:900;margin-bottom:3px}.myvor-onboarding-journey>strong{display:block;font-size:15px}.journey-steps{display:grid;gap:6px;margin:13px 0}.journey-step{display:flex;align-items:center;gap:7px;color:#8196ae;font-size:11px;font-weight:750}.journey-step.done{color:#c8d7e7}.journey-step.done svg{color:#68d39c}.journey-step:not(.done) svg{color:#536b84}.myvor-onboarding-journey p{font-size:11px;line-height:1.45;color:#9fb1c6;margin:10px 0}.journey-next{width:100%;min-height:38px;border:1px solid #e0b746;border-radius:10px;background:#e0b746;color:#07162c;font-weight:900;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}@media(max-width:680px){.myvor-onboarding-journey{right:12px;bottom:calc(12px + env(safe-area-inset-bottom));width:calc(100vw - 24px)}}
    `}</style>
  </aside>;}
  if(!visible)return null;

  const activeStep=step==="profile"?1:step==="topics"?2:step==="institutions"?3:step==="dossier"?4:step==="alerts"?5:step==="ready"?6:0;
  return <div className="myvor-onboarding-backdrop" role="presentation">
    <section className="myvor-onboarding" role="dialog" aria-modal="true" aria-labelledby="myvor-onboarding-title">
      <button type="button" className="myvor-onboarding-close" onClick={postpone} aria-label="Fermer l’onboarding"><X size={18}/></button>
      {activeStep>0&&step!=="ready"&&<div className="myvor-onboarding-progress" aria-label={`Étape ${activeStep} sur 5`}><span style={{width:`${Math.min(activeStep,5)*20}%`}}/></div>}

      {step==="welcome"&&<>
        <div className="myvor-onboarding-brand"><span>M</span><div><b>MYVOR</b><small>Anticipez l’impact.</small></div></div>
        <div className="myvor-onboarding-kicker">Configuration personnalisée</div>
        <h1 id="myvor-onboarding-title">{displayName?`Bienvenue ${displayName}. `:""}Construisons votre espace Myvor.</h1>
        <p className="myvor-onboarding-lead">En moins de deux minutes, Myvor adapte votre veille, vos priorités institutionnelles et votre premier dossier à votre façon de travailler.</p>
        <div className="myvor-onboarding-flow"><div><BriefcaseBusiness size={19}/><b>Votre métier</b><span>Adapter le vocabulaire et les priorités à votre activité.</span></div><div><FileSearch size={19}/><b>Votre périmètre</b><span>Choisir les sujets et institutions qui méritent votre attention.</span></div><div><Sparkles size={19}/><b>Votre premier dossier</b><span>Arriver dans Myvor avec un espace déjà exploitable.</span></div></div>
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>{setError("");setStep("profile");}}>Personnaliser mon espace <ArrowRight size={16}/></button><button className="ghost" onClick={postpone}>Plus tard</button></div>
      </>}

      {step==="profile"&&<>
        <div className="myvor-onboarding-kicker">Étape 1 · Votre profil</div><h1 id="myvor-onboarding-title">Quel est votre métier ?</h1>
        <p className="myvor-onboarding-lead compact">Myvor utilisera ce choix pour présenter les informations avec le bon niveau de contexte et les bonnes actions.</p>
        <div className="myvor-choice-grid">{JOBS.map(job=><button key={job.value} type="button" className={`myvor-choice-card ${preferences.jobType===job.value?"selected":""}`} onClick={()=>{updatePreferences({jobType:job.value});setError("");}}><span className="choice-check">{preferences.jobType===job.value?<Check size={15}/>:<Circle size={15}/>}</span><b>{job.label}</b><small>{job.help}</small></button>)}</div>
        {error&&<div className="myvor-onboarding-error">{error}</div>}
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>void continueProfile()} disabled={saving}>{saving?"Enregistrement…":"Continuer"} {!saving&&<ArrowRight size={16}/>}</button><button className="ghost" onClick={()=>{setError("");setStep("welcome");}}>Retour</button></div>
      </>}

      {step==="topics"&&<>
        <div className="myvor-onboarding-kicker">Étape 2 · Vos sujets</div><h1 id="myvor-onboarding-title">Quels sujets suivez-vous ?</h1>
        <p className="myvor-onboarding-lead compact">Sélectionnez vos champs de veille. Vous pourrez les modifier ensuite depuis vos paramètres.</p>
        <div className="myvor-chip-grid">{TOPICS.map(topic=><button key={topic} type="button" className={`myvor-chip ${preferences.topics.includes(topic)?"selected":""}`} onClick={()=>{toggleList("topics",topic);setError("");}}>{preferences.topics.includes(topic)&&<Check size={14}/>}<span>{topic}</span></button>)}</div>
        {error&&<div className="myvor-onboarding-error">{error}</div>}
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>void continueTopics()} disabled={saving}>{saving?"Enregistrement…":"Continuer"} {!saving&&<ArrowRight size={16}/>}</button><button className="ghost" onClick={()=>{setError("");setStep("profile");}}>Retour</button></div>
      </>}

      {step==="institutions"&&<>
        <div className="myvor-onboarding-kicker">Étape 3 · Votre périmètre institutionnel</div><h1 id="myvor-onboarding-title">Où devez-vous être vigilant ?</h1>
        <p className="myvor-onboarding-lead compact">Myvor mettra en avant ces sources lorsque plusieurs évolutions se produisent au même moment.</p>
        <div className="myvor-choice-grid institutions">{INSTITUTIONS.map(institution=><button key={institution} type="button" className={`myvor-choice-card compact-card ${preferences.institutions.includes(institution)?"selected":""}`} onClick={()=>{toggleList("institutions",institution);setError("");}}><span className="choice-check">{preferences.institutions.includes(institution)?<Check size={15}/>:<Circle size={15}/>}</span><b>{institution}</b></button>)}</div>
        <button type="button" className="myvor-select-all" onClick={()=>{updatePreferences({institutions:preferences.institutions.length===INSTITUTIONS.length?[]:[...INSTITUTIONS]});setError("");}}>{preferences.institutions.length===INSTITUTIONS.length?"Tout désélectionner":"Tout surveiller"}</button>
        {error&&<div className="myvor-onboarding-error">{error}</div>}
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>void continueInstitutions()} disabled={saving}>{saving?"Enregistrement…":"Continuer"} {!saving&&<ArrowRight size={16}/>}</button><button className="ghost" onClick={()=>{setError("");setStep("topics");}}>Retour</button></div>
      </>}

      {step==="dossier"&&<>
        <div className="myvor-onboarding-kicker">Étape 4 · Premier dossier</div><h1 id="myvor-onboarding-title">Quel dossier est prioritaire ?</h1>
        <p className="myvor-onboarding-lead compact">Donnez à Myvor un dossier réel : toute la prise en main suivante sera construite autour de ce contexte.</p>
        <div className="myvor-onboarding-form"><label><span>Client ou organisation</span><input autoFocus value={form.client} onChange={e=>updateField("client",e.target.value)} placeholder="Ex. Nexora AI" maxLength={160}/></label><label><span>Sujet du dossier</span><input value={form.title} onChange={e=>updateField("title",e.target.value)} placeholder="Ex. Mise en conformité avec l’AI Act" maxLength={240}/></label><label className="full"><span>Objectif concret</span><textarea value={form.objective} onChange={e=>updateField("objective",e.target.value)} placeholder="Ex. Identifier les obligations applicables et préparer les décisions à prendre avant la prochaine échéance réglementaire." maxLength={1200}/></label><label className="full"><span>Contexte utile <em>optionnel</em></span><textarea value={form.context} onChange={e=>updateField("context",e.target.value)} placeholder="Activité concernée, contraintes, périmètre géographique, état du dossier…" maxLength={1800}/></label></div>
        {error&&<div className="myvor-onboarding-error">{error}</div>}
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>void createFirstDossier()} disabled={saving}>{saving?"Préparation du dossier…":"Créer mon dossier"} {!saving&&<ArrowRight size={16}/>}</button><button className="ghost" onClick={()=>{setError("");setStep("institutions");}}>Retour</button></div>
      </>}

      {step==="alerts"&&created&&<>
        <div className="myvor-onboarding-kicker">Étape 5 · Vos alertes</div><h1 id="myvor-onboarding-title">Quand voulez-vous être alerté ?</h1>
        <p className="myvor-onboarding-lead compact">Le niveau choisi guidera la façon dont Myvor hiérarchise les changements autour de <strong>{created.title}</strong>.</p>
        <div className="myvor-alert-grid">{ALERTS.map(alert=><button key={alert.value} type="button" className={`myvor-alert-card ${preferences.alertLevel===alert.value?"selected":""}`} onClick={()=>updatePreferences({alertLevel:alert.value})}>{alert.badge&&<span className="alert-badge">{alert.badge}</span>}<span className="choice-check">{preferences.alertLevel===alert.value?<Check size={15}/>:<Circle size={15}/>}</span><b>{alert.label}</b><small>{alert.help}</small></button>)}</div>
        {error&&<div className="myvor-onboarding-error">{error}</div>}
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>void completePersonalization()} disabled={saving}>{saving?"Finalisation…":"Finaliser mon espace"} {!saving&&<ArrowRight size={16}/>}</button><button className="ghost" onClick={()=>setStep("dossier")}>Retour</button></div>
      </>}

      {step==="ready"&&created&&<>
        <div className="myvor-onboarding-success"><CheckCircle2 size={27}/></div><div className="myvor-onboarding-kicker">Configuration terminée</div><h1 id="myvor-onboarding-title">{displayName?`${displayName}, votre espace Myvor est prêt.`:"Votre espace Myvor est prêt."}</h1>
        <p className="myvor-onboarding-lead compact">Myvor est maintenant configuré autour de votre activité et de votre dossier <strong>{created.title}</strong>. {profileEnriched?"Sa fiche stratégique a également été pré-remplie.":"Vous pourrez enrichir sa fiche stratégique à tout moment."}</p>
        <div className="myvor-summary-grid"><div><small>Profil</small><b>{jobLabel(preferences.jobType)}</b></div><div><small>Sujets suivis</small><b>{preferences.topics.slice(0,3).join(" · ")}{preferences.topics.length>3?` +${preferences.topics.length-3}`:""}</b></div><div><small>Institutions</small><b>{preferences.institutions.length} source{preferences.institutions.length>1?"s":""} prioritaire{preferences.institutions.length>1?"s":""}</b></div><div><small>Alertes</small><b>{alertLabel(preferences.alertLevel)}</b></div></div>
        <div className="myvor-onboarding-ready"><div><ShieldCheck size={18}/><span><b>Priorisation personnalisée</b> Les informations liées à vos sujets et institutions pourront être mises en avant dans votre expérience.</span></div><div><FileSearch size={18}/><span><b>Prochaine action</b> Lancez la Veille sur votre premier dossier pour faire remonter les évolutions réellement pertinentes.</span></div></div>
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>finish("Tableau de bord")}>Entrer dans Myvor <ArrowRight size={16}/></button><button className="ghost" onClick={()=>finish("Veille")}>Lancer directement la Veille</button></div>
      </>}
    </section>
    <style jsx global>{`
      .myvor-onboarding-backdrop{position:fixed;inset:0;z-index:210;background:rgba(2,10,23,.78);backdrop-filter:blur(9px);display:grid;place-items:center;padding:22px}.myvor-onboarding{position:relative;width:min(780px,calc(100vw - 28px));max-height:calc(100vh - 36px);overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(150deg,#0b2342 0%,#07162c 62%,#091d35 100%);box-shadow:0 34px 100px rgba(0,0,0,.5);padding:34px;color:#edf4fb}.myvor-onboarding-close{position:absolute;right:18px;top:18px;width:38px;height:38px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#d7e2ef;display:grid;place-items:center;cursor:pointer}.myvor-onboarding-progress{height:3px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin:-5px 54px 26px 0}.myvor-onboarding-progress span{display:block;height:100%;border-radius:999px;background:#e0b746;transition:width .25s ease}.myvor-onboarding-brand{display:flex;align-items:center;gap:10px;margin-bottom:28px}.myvor-onboarding-brand>span{width:38px;height:38px;border-radius:11px;background:#d9ad3b;color:#07162c;display:grid;place-items:center;font-size:21px;font-weight:950}.myvor-onboarding-brand b{display:block;font-size:16px;letter-spacing:.08em}.myvor-onboarding-brand small{display:block;color:#8fa5bf;font-size:10px;margin-top:2px}.myvor-onboarding-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#e1bb52;font-weight:900;margin-bottom:7px}.myvor-onboarding h1{margin:0;max-width:680px;color:#fff;font-size:clamp(27px,4vw,42px);line-height:1.08;letter-spacing:-.035em}.myvor-onboarding-lead{max-width:670px;margin:15px 0 0;color:#c5d4e5;font-size:15px;line-height:1.65}.myvor-onboarding-lead.compact{font-size:14px}.myvor-onboarding-lead strong{color:#fff}.myvor-onboarding-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:26px 0}.myvor-onboarding-flow div{display:grid;gap:6px;min-height:126px;padding:17px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(255,255,255,.035)}.myvor-onboarding-flow svg{color:#e1bb52}.myvor-onboarding-flow b{font-size:13px;color:#fff}.myvor-onboarding-flow span{color:#9eb1c8;font-size:12px;line-height:1.45}.myvor-onboarding-actions{display:flex;align-items:center;gap:9px;margin-top:25px;flex-wrap:wrap}.myvor-onboarding-actions button{min-height:44px;border-radius:12px;padding:0 16px;font-weight:850;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.myvor-onboarding-actions .primary{border:1px solid #e0b746;background:#e0b746;color:#07162c}.myvor-onboarding-actions .primary:hover{background:#edc65e}.myvor-onboarding-actions .primary:disabled{opacity:.55;cursor:not-allowed}.myvor-onboarding-actions .ghost{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.045);color:#c8d6e6}.myvor-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:24px}.myvor-choice-card,.myvor-alert-card{position:relative;text-align:left;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(255,255,255,.035);color:#fff;padding:16px 16px 15px 44px;min-height:96px;cursor:pointer;transition:border-color .15s ease,background .15s ease,transform .15s ease}.myvor-choice-card:hover,.myvor-alert-card:hover{border-color:rgba(224,183,70,.5);transform:translateY(-1px)}.myvor-choice-card.selected,.myvor-alert-card.selected{border-color:#e0b746;background:rgba(224,183,70,.08);box-shadow:0 0 0 1px rgba(224,183,70,.12) inset}.myvor-choice-card .choice-check,.myvor-alert-card .choice-check{position:absolute;left:16px;top:17px;color:#6f859d}.myvor-choice-card.selected .choice-check,.myvor-alert-card.selected .choice-check{color:#e0b746}.myvor-choice-card b,.myvor-alert-card b{display:block;font-size:13px;margin-bottom:5px}.myvor-choice-card small,.myvor-alert-card small{display:block;color:#94a9c1;font-size:11px;line-height:1.5}.myvor-choice-grid.institutions{grid-template-columns:repeat(2,1fr)}.myvor-choice-card.compact-card{min-height:58px;display:flex;align-items:center;padding-top:14px;padding-bottom:14px}.myvor-choice-card.compact-card b{margin:0}.myvor-select-all{margin-top:10px;border:0;background:transparent;color:#e1bb52;font-size:11px;font-weight:850;cursor:pointer;padding:4px 0}.myvor-chip-grid{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}.myvor-chip{min-height:40px;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.035);color:#b7c7d8;padding:0 14px;display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;cursor:pointer}.myvor-chip.selected{border-color:#e0b746;background:rgba(224,183,70,.1);color:#fff}.myvor-chip.selected svg{color:#e0b746}.myvor-alert-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px}.myvor-alert-card{padding:20px 16px 16px 44px;min-height:138px}.myvor-alert-card .choice-check{top:21px}.alert-badge{position:absolute;right:11px;top:10px;border:1px solid rgba(224,183,70,.28);border-radius:999px;background:rgba(224,183,70,.1);color:#e9c65e;padding:3px 7px;font-size:8px;text-transform:uppercase;letter-spacing:.08em;font-weight:900}.myvor-onboarding-form{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:24px}.myvor-onboarding-form label{display:grid;gap:7px}.myvor-onboarding-form label.full{grid-column:1/-1}.myvor-onboarding-form label>span{font-size:11px;color:#9fb1c7;font-weight:800}.myvor-onboarding-form label em{font-style:normal;color:#667e99;font-weight:650;margin-left:4px}.myvor-onboarding-form input,.myvor-onboarding-form textarea{width:100%;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:#0a203b;color:#fff;padding:12px 13px;font:inherit;outline:none}.myvor-onboarding-form textarea{min-height:94px;resize:vertical;line-height:1.5}.myvor-onboarding-form input:focus,.myvor-onboarding-form textarea:focus{border-color:#d9ad3b;box-shadow:0 0 0 3px rgba(217,173,59,.1)}.myvor-onboarding-form input::placeholder,.myvor-onboarding-form textarea::placeholder{color:#637994}.myvor-onboarding-error{margin-top:13px;border:1px solid rgba(217,90,90,.3);background:rgba(217,90,90,.08);color:#ffb4b4;border-radius:11px;padding:10px 12px;font-size:12px}.myvor-onboarding-success{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:rgba(86,202,139,.12);border:1px solid rgba(86,202,139,.3);color:#76dda6;margin-bottom:18px}.myvor-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:22px}.myvor-summary-grid>div{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.035);padding:12px 13px}.myvor-summary-grid small{display:block;color:#7f96af;font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:850;margin-bottom:5px}.myvor-summary-grid b{display:block;color:#fff;font-size:12px;line-height:1.45}.myvor-onboarding-ready{display:grid;gap:9px;margin-top:16px}.myvor-onboarding-ready>div{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);color:#b9c9db;font-size:13px;line-height:1.5}.myvor-onboarding-ready svg{flex:none;color:#e1bb52;margin-top:1px}.myvor-onboarding-ready b{display:block;color:#fff;margin-bottom:2px}@media(max-width:680px){.myvor-onboarding-backdrop{padding:7px;place-items:end center}.myvor-onboarding{width:100%;max-height:92vh;border-radius:22px 22px 10px 10px;padding:27px 19px calc(25px + env(safe-area-inset-bottom))}.myvor-onboarding-progress{margin-right:52px}.myvor-onboarding-flow,.myvor-choice-grid,.myvor-choice-grid.institutions,.myvor-alert-grid,.myvor-summary-grid{grid-template-columns:1fr}.myvor-onboarding-flow div{min-height:0}.myvor-choice-card,.myvor-alert-card{min-height:74px}.myvor-onboarding-form{grid-template-columns:1fr}.myvor-onboarding-form label.full{grid-column:auto}.myvor-onboarding-actions{display:grid;grid-template-columns:1fr;width:100%}.myvor-onboarding-actions button{width:100%}}
    `}</style>
  </div>;
}

function JourneyStep({done,label}:{done:boolean;label:string}){return <div className={`journey-step ${done?"done":""}`}>{done?<Check size={13}/>:<Circle size={13}/>}<span>{label}</span></div>;}
