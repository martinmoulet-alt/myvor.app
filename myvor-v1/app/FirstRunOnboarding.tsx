"use client";

import {ArrowRight,BriefcaseBusiness,CheckCircle2,FileSearch,ShieldCheck,Sparkles,X} from "lucide-react";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Step="welcome"|"dossier"|"ready";
type CreatedDossier={id:string;client:string;title:string;objective:string;context:string};

const AFTER_KEY="myvor:onboarding:after";

function clickNavigation(label:string){
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn,.mobile-menu-nav button"));
  const target=buttons.find(button=>(button.textContent||"").trim().includes(label));
  if(target){target.click();window.scrollTo({top:0,behavior:"smooth"});return true;}
  return false;
}

export default function FirstRunOnboarding(){
  const[visible,setVisible]=useState(false);
  const[step,setStep]=useState<Step>("welcome");
  const[checking,setChecking]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const[profileEnriched,setProfileEnriched]=useState(false);
  const[created,setCreated]=useState<CreatedDossier|null>(null);
  const[form,setForm]=useState({client:"",title:"",objective:"",context:""});

  useEffect(()=>{
    if(!supabase){setChecking(false);return;}
    let active=true;
    async function evaluate(session:any){
      if(!active)return;
      if(!session?.user?.id){setVisible(false);setChecking(false);return;}
      const after=sessionStorage.getItem(AFTER_KEY);
      const{data,error}=await supabase!.from("dossiers").select("id").limit(1);
      if(!active)return;
      if(error){setChecking(false);return;}
      const hasDossier=Boolean(data?.length);
      if(after&&hasDossier){
        sessionStorage.removeItem(AFTER_KEY);
        setVisible(false);setChecking(false);
        window.setTimeout(()=>{if(!clickNavigation(after))window.setTimeout(()=>clickNavigation(after),700);},350);
        return;
      }
      const snoozed=sessionStorage.getItem(`myvor:onboarding:snooze:${session.user.id}`)==="1";
      setVisible(!hasDossier&&!snoozed);
      setChecking(false);
    }
    supabase.auth.getSession().then(({data})=>void evaluate(data.session));
    const{data:subscription}=supabase.auth.onAuthStateChange((_event,session)=>void evaluate(session));
    return()=>{active=false;subscription.subscription.unsubscribe();};
  },[]);

  function updateField(field:keyof typeof form,value:string){setForm(current=>({...current,[field]:value}));}
  function postpone(){
    if(!supabase){setVisible(false);return;}
    supabase.auth.getSession().then(({data})=>{
      if(data.session?.user?.id)sessionStorage.setItem(`myvor:onboarding:snooze:${data.session.user.id}`,"1");
      setVisible(false);
    });
  }

  async function createFirstDossier(){
    if(!supabase)return;
    const client=form.client.trim(),title=form.title.trim(),objective=form.objective.trim(),context=form.context.trim();
    if(!client||!title||!objective){setError("Renseigne le client, le sujet du dossier et l’objectif à atteindre.");return;}
    setSaving(true);setError("");setProfileEnriched(false);
    try{
      const{data,error:insertError}=await supabase.from("dossiers").insert({client,title,objective,context}).select("id,client,title,objective,context").single();
      if(insertError)throw insertError;
      const dossier=data as CreatedDossier;
      setCreated(dossier);
      try{
        const{data:profilePayload,error:profileError}=await supabase.functions.invoke("dossier-profile",{body:{dossier,items:[]}});
        const profile=profilePayload?.profile;
        if(!profileError&&profile){
          const{error:updateError}=await supabase.from("dossiers").update(profile).eq("id",dossier.id);
          if(!updateError)setProfileEnriched(true);
        }
      }catch{
        // Le dossier reste utilisable même si l'enrichissement automatique est temporairement indisponible.
      }
      setStep("ready");
    }catch(err:any){setError(err?.message||"Impossible de créer le dossier pour le moment.");}
    finally{setSaving(false);}
  }

  function finish(destination:"Veille"|"Tableau de bord"){
    sessionStorage.setItem(AFTER_KEY,destination);
    setVisible(false);
    window.location.reload();
  }

  if(checking||!visible)return null;

  return <div className="myvor-onboarding-backdrop" role="presentation">
    <section className="myvor-onboarding" role="dialog" aria-modal="true" aria-labelledby="myvor-onboarding-title">
      <button type="button" className="myvor-onboarding-close" onClick={postpone} aria-label="Fermer l’onboarding"><X size={18}/></button>

      {step==="welcome"&&<>
        <div className="myvor-onboarding-brand"><span>M</span><div><b>MYVOR</b><small>Anticipez l’impact.</small></div></div>
        <div className="myvor-onboarding-kicker">Première utilisation</div>
        <h1 id="myvor-onboarding-title">Transformez un sujet client en plan d’action.</h1>
        <p className="myvor-onboarding-lead">Myvor part toujours d’un dossier précis. En quelques minutes, vous posez l’objectif du client, puis la Veille, la Note d’impact, le Radar et le Note Builder travaillent sur ce même contexte.</p>
        <div className="myvor-onboarding-flow">
          <div><BriefcaseBusiness size={19}/><b>1. Dossier</b><span>Définir le sujet et l’objectif client.</span></div>
          <div><FileSearch size={19}/><b>2. Veille</b><span>Détecter les évolutions réellement pertinentes.</span></div>
          <div><Sparkles size={19}/><b>3. Décision</b><span>Mesurer l’impact et produire l’action suivante.</span></div>
        </div>
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>setStep("dossier")}>Créer mon premier dossier <ArrowRight size={16}/></button><button className="ghost" onClick={postpone}>Plus tard</button></div>
      </>}

      {step==="dossier"&&<>
        <div className="myvor-onboarding-kicker">Étape 1 · Dossier client</div>
        <h1 id="myvor-onboarding-title">Quel sujet voulez-vous piloter ?</h1>
        <p className="myvor-onboarding-lead compact">Renseignez uniquement ce qui est utile à la décision. Myvor pourra ensuite compléter la fiche stratégique sans inventer d’information.</p>
        <div className="myvor-onboarding-form">
          <label><span>Client</span><input autoFocus value={form.client} onChange={e=>updateField("client",e.target.value)} placeholder="Ex. Nexora AI" maxLength={160}/></label>
          <label><span>Sujet du dossier</span><input value={form.title} onChange={e=>updateField("title",e.target.value)} placeholder="Ex. Mise en conformité avec l’AI Act" maxLength={240}/></label>
          <label className="full"><span>Objectif concret du client</span><textarea value={form.objective} onChange={e=>updateField("objective",e.target.value)} placeholder="Ex. Identifier les obligations applicables et préparer les décisions internes à prendre avant la prochaine échéance réglementaire." maxLength={1200}/></label>
          <label className="full"><span>Contexte utile <em>optionnel</em></span><textarea value={form.context} onChange={e=>updateField("context",e.target.value)} placeholder="Activité concernée, contraintes, périmètre géographique, état du dossier…" maxLength={1800}/></label>
        </div>
        {error&&<div className="myvor-onboarding-error">{error}</div>}
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>void createFirstDossier()} disabled={saving}>{saving?"Création du dossier…":"Créer et préparer le dossier"} {!saving&&<ArrowRight size={16}/>}</button><button className="ghost" onClick={()=>{setError("");setStep("welcome");}}>Retour</button></div>
      </>}

      {step==="ready"&&created&&<>
        <div className="myvor-onboarding-success"><CheckCircle2 size={27}/></div>
        <div className="myvor-onboarding-kicker">Dossier prêt</div>
        <h1 id="myvor-onboarding-title">{created.title}</h1>
        <p className="myvor-onboarding-lead compact"><strong>{created.client}</strong> est maintenant enregistré dans Myvor. {profileEnriched?"La fiche stratégique a également été pré-remplie à partir de votre objectif.":"Vous pourrez compléter la fiche stratégique depuis le dossier."}</p>
        <div className="myvor-onboarding-ready">
          <div><ShieldCheck size={18}/><span><b>Objectif conservé</b> Toutes les analyses suivantes resteront rattachées à cet objectif.</span></div>
          <div><FileSearch size={18}/><span><b>Prochaine étape</b> Lancez la Veille pour faire remonter les textes pertinents avant de générer une Note d’impact.</span></div>
        </div>
        <div className="myvor-onboarding-actions"><button className="primary" onClick={()=>finish("Veille")}>Passer à la Veille <ArrowRight size={16}/></button><button className="ghost" onClick={()=>finish("Tableau de bord")}>Voir le tableau de bord</button></div>
      </>}
    </section>

    <style jsx global>{`
      .myvor-onboarding-backdrop{position:fixed;inset:0;z-index:210;background:rgba(2,10,23,.78);backdrop-filter:blur(9px);display:grid;place-items:center;padding:22px}
      .myvor-onboarding{position:relative;width:min(760px,calc(100vw - 28px));max-height:calc(100vh - 36px);overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(150deg,#0b2342 0%,#07162c 62%,#091d35 100%);box-shadow:0 34px 100px rgba(0,0,0,.5);padding:34px;color:#edf4fb}
      .myvor-onboarding-close{position:absolute;right:18px;top:18px;width:38px;height:38px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#d7e2ef;display:grid;place-items:center;cursor:pointer}
      .myvor-onboarding-brand{display:flex;align-items:center;gap:10px;margin-bottom:28px}.myvor-onboarding-brand>span{width:38px;height:38px;border-radius:11px;background:#d9ad3b;color:#07162c;display:grid;place-items:center;font-size:21px;font-weight:950}.myvor-onboarding-brand b{display:block;font-size:16px;letter-spacing:.08em}.myvor-onboarding-brand small{display:block;color:#8fa5bf;font-size:10px;margin-top:2px}
      .myvor-onboarding-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#e1bb52;font-weight:900;margin-bottom:7px}.myvor-onboarding h1{margin:0;max-width:650px;color:#fff;font-size:clamp(27px,4vw,42px);line-height:1.08;letter-spacing:-.035em}.myvor-onboarding-lead{max-width:650px;margin:15px 0 0;color:#c5d4e5;font-size:15px;line-height:1.65}.myvor-onboarding-lead.compact{font-size:14px}.myvor-onboarding-lead strong{color:#fff}
      .myvor-onboarding-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:26px 0}.myvor-onboarding-flow div{display:grid;gap:6px;min-height:126px;padding:17px;border:1px solid rgba(255,255,255,.1);border-radius:15px;background:rgba(255,255,255,.035)}.myvor-onboarding-flow svg{color:#e1bb52}.myvor-onboarding-flow b{font-size:13px;color:#fff}.myvor-onboarding-flow span{color:#9eb1c8;font-size:12px;line-height:1.45}
      .myvor-onboarding-actions{display:flex;align-items:center;gap:9px;margin-top:25px;flex-wrap:wrap}.myvor-onboarding-actions button{min-height:44px;border-radius:12px;padding:0 16px;font-weight:850;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.myvor-onboarding-actions .primary{border:1px solid #e0b746;background:#e0b746;color:#07162c}.myvor-onboarding-actions .primary:hover{background:#edc65e}.myvor-onboarding-actions .primary:disabled{opacity:.55;cursor:not-allowed}.myvor-onboarding-actions .ghost{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.045);color:#c8d6e6}
      .myvor-onboarding-form{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:24px}.myvor-onboarding-form label{display:grid;gap:7px}.myvor-onboarding-form label.full{grid-column:1/-1}.myvor-onboarding-form label>span{font-size:11px;color:#9fb1c7;font-weight:800}.myvor-onboarding-form label em{font-style:normal;color:#667e99;font-weight:650;margin-left:4px}.myvor-onboarding-form input,.myvor-onboarding-form textarea{width:100%;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:#0a203b;color:#fff;padding:12px 13px;font:inherit;outline:none}.myvor-onboarding-form textarea{min-height:94px;resize:vertical;line-height:1.5}.myvor-onboarding-form input:focus,.myvor-onboarding-form textarea:focus{border-color:#d9ad3b;box-shadow:0 0 0 3px rgba(217,173,59,.1)}.myvor-onboarding-form input::placeholder,.myvor-onboarding-form textarea::placeholder{color:#637994}.myvor-onboarding-error{margin-top:13px;border:1px solid rgba(217,90,90,.3);background:rgba(217,90,90,.08);color:#ffb4b4;border-radius:11px;padding:10px 12px;font-size:12px}
      .myvor-onboarding-success{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:rgba(86,202,139,.12);border:1px solid rgba(86,202,139,.3);color:#76dda6;margin-bottom:18px}.myvor-onboarding-ready{display:grid;gap:9px;margin-top:24px}.myvor-onboarding-ready>div{display:flex;gap:11px;align-items:flex-start;padding:13px 14px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);color:#b9c9db;font-size:13px;line-height:1.5}.myvor-onboarding-ready svg{flex:none;color:#e1bb52;margin-top:1px}.myvor-onboarding-ready b{display:block;color:#fff;margin-bottom:2px}
      @media(max-width:680px){.myvor-onboarding-backdrop{padding:7px;place-items:end center}.myvor-onboarding{width:100%;max-height:92vh;border-radius:22px 22px 10px 10px;padding:27px 19px calc(25px + env(safe-area-inset-bottom))}.myvor-onboarding-flow{grid-template-columns:1fr}.myvor-onboarding-flow div{min-height:0}.myvor-onboarding-form{grid-template-columns:1fr}.myvor-onboarding-form label.full{grid-column:auto}.myvor-onboarding-actions{display:grid;grid-template-columns:1fr;width:100%}.myvor-onboarding-actions button{width:100%}}
    `}</style>
  </div>;
}
