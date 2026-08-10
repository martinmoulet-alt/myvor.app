"use client";

import {useEffect,useState} from "react";
import {Check,FileCheck2,RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";

const LEGAL_VERSION="2026-08-10";
type GateState="checking"|"hidden"|"required"|"error";

function openInfo(panel:"cgu"|"privacy"){
  window.dispatchEvent(new CustomEvent("myvor:open-info",{detail:panel}));
}

export default function CommercialConsentGate(){
  const[state,setState]=useState<GateState>("checking");
  const[accepted,setAccepted]=useState(false);
  const[saving,setSaving]=useState(false);
  const[message,setMessage]=useState("");

  async function evaluate(session:any){
    if(!supabase||!session?.user?.id){setState("hidden");return;}
    const{data,error}=await supabase.from("user_profiles").select("terms_accepted_at,privacy_accepted_at,legal_version").eq("user_id",session.user.id).maybeSingle();
    if(error){setMessage("Impossible de vérifier les conditions d’utilisation pour le moment.");setState("error");return;}
    const complete=Boolean(data?.terms_accepted_at&&data?.privacy_accepted_at&&data?.legal_version===LEGAL_VERSION);
    setState(complete?"hidden":"required");
  }

  useEffect(()=>{
    if(!supabase){setState("hidden");return;}
    let active=true;
    supabase.auth.getSession().then(({data})=>{if(active)void evaluate(data.session);});
    const{data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{if(active)void evaluate(session);});
    return()=>{active=false;listener.subscription.unsubscribe();};
  },[]);

  async function accept(){
    if(!supabase||saving||!accepted)return;
    setSaving(true);setMessage("");
    const{data,error}=await supabase.rpc("accept_myvor_legal_terms",{p_version:LEGAL_VERSION});
    setSaving(false);
    if(error||data!==true){setMessage("L’acceptation n’a pas pu être enregistrée. Réessayez.");setState("error");return;}
    setState("hidden");
  }

  async function retry(){
    if(!supabase)return;setState("checking");setMessage("");
    const{data}=await supabase.auth.getSession();await evaluate(data.session);
  }

  if(state==="hidden"||state==="checking")return null;

  return <div className="commercial-consent-backdrop" role="presentation">
    <section className="commercial-consent-card" role="dialog" aria-modal="true" aria-labelledby="commercial-consent-title">
      <div className="commercial-consent-icon"><ShieldCheck size={24}/></div>
      <div className="commercial-consent-kicker">Accès professionnel</div>
      <h2 id="commercial-consent-title">Finalisez votre accès à Myvor</h2>
      <p>Avant d’utiliser votre workspace, confirmez les conditions applicables au service et le traitement des données nécessaires à son fonctionnement.</p>

      <div className="commercial-consent-docs">
        <button type="button" onClick={()=>openInfo("cgu")}><FileCheck2 size={16}/><span><b>Conditions générales d’utilisation</b><small>Règles d’accès, responsabilités et usage professionnel.</small></span></button>
        <button type="button" onClick={()=>openInfo("privacy")}><ShieldCheck size={16}/><span><b>Politique de confidentialité</b><small>Données traitées, finalités, conservation et droits.</small></span></button>
      </div>

      {state==="required"&&<label className="commercial-consent-check"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/><span><Check size={13}/>J’ai lu et j’accepte les CGU et la politique de confidentialité de Myvor.</span></label>}
      {message&&<div className="commercial-consent-error">{message}</div>}

      {state==="required"?<button type="button" className="commercial-consent-primary" disabled={!accepted||saving} onClick={()=>void accept()}>{saving?"Enregistrement…":"Accepter et continuer"}</button>:<button type="button" className="commercial-consent-primary" onClick={()=>void retry()}><RefreshCw size={16}/>Réessayer</button>}
      <small className="commercial-consent-version">Version contractuelle {LEGAL_VERSION} · preuve d’acceptation enregistrée dans votre profil.</small>
    </section>

    <style jsx global>{`
      .commercial-consent-backdrop{position:fixed;inset:0;z-index:155;background:rgba(2,10,23,.78);backdrop-filter:blur(8px);display:grid;place-items:center;padding:18px}.commercial-consent-card{width:min(560px,100%);border:1px solid rgba(255,255,255,.13);border-radius:22px;background:linear-gradient(155deg,#0b2646,#07162c 68%);box-shadow:0 30px 90px rgba(0,0,0,.44);padding:28px;color:#edf4fb}.commercial-consent-icon{width:48px;height:48px;border-radius:15px;border:1px solid rgba(224,183,70,.4);background:rgba(224,183,70,.09);color:#e0b746;display:grid;place-items:center;margin-bottom:15px}.commercial-consent-kicker{font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#e0b746;margin-bottom:6px}.commercial-consent-card h2{margin:0;color:#fff;font-size:26px;letter-spacing:-.025em}.commercial-consent-card>p{margin:9px 0 18px;color:#9fb2c6;line-height:1.55;font-size:13px}.commercial-consent-docs{display:grid;gap:8px}.commercial-consent-docs button{width:100%;border:1px solid #24435f;background:#081d36;color:#eaf1f8;border-radius:12px;padding:12px;text-align:left;display:grid;grid-template-columns:28px 1fr;gap:9px;cursor:pointer}.commercial-consent-docs button:hover{border-color:rgba(224,183,70,.5)}.commercial-consent-docs button>svg{color:#e0b746;margin-top:2px}.commercial-consent-docs b{display:block;font-size:12px}.commercial-consent-docs small{display:block;color:#8499af;font-size:10px;line-height:1.45;margin-top:3px}.commercial-consent-check{margin:16px 0 12px;border:1px solid #25425d;background:#071a31;border-radius:11px;padding:11px 12px;display:flex;align-items:flex-start;gap:9px;color:#c6d4e2;font-size:11px;line-height:1.45}.commercial-consent-check input{margin-top:2px;accent-color:#e0b746}.commercial-consent-check span{display:flex;align-items:flex-start;gap:6px}.commercial-consent-check svg{color:#69d69e;flex:none;margin-top:1px}.commercial-consent-primary{width:100%;min-height:44px;border:1px solid #e0b746;border-radius:11px;background:#e0b746;color:#07162c;font-weight:900;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.commercial-consent-primary:disabled{opacity:.48;cursor:not-allowed}.commercial-consent-error{margin:0 0 12px;border:1px solid rgba(221,83,93,.35);background:rgba(221,83,93,.08);color:#ff9ba2;border-radius:10px;padding:9px 11px;font-size:11px}.commercial-consent-version{display:block;margin-top:10px;color:#71879d;text-align:center;font-size:9px}@media(max-width:620px){.commercial-consent-backdrop{padding:8px;place-items:end center}.commercial-consent-card{border-radius:20px 20px 10px 10px;padding:22px 18px calc(22px + env(safe-area-inset-bottom))}.commercial-consent-card h2{font-size:22px}}
    `}</style>
  </div>;
}
