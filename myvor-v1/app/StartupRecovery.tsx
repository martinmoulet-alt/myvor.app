"use client";

import {useEffect,useState} from "react";
import {AlertTriangle,LogIn,RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";

const STARTUP_TIMEOUT_MS=10_000;

export default function StartupRecovery(){
  const[stalled,setStalled]=useState(false);
  const[busy,setBusy]=useState(false);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      const bodyText=document.body?.innerText||"";
      if(bodyText.includes("Chargement de Myvor"))setStalled(true);
    },STARTUP_TIMEOUT_MS);
    return()=>window.clearTimeout(timer);
  },[]);

  async function reconnect(){
    if(busy)return;
    setBusy(true);
    try{
      await supabase?.auth.signOut({scope:"local"});
    }catch{
      for(const key of Object.keys(localStorage))if(key.startsWith("sb-")&&key.endsWith("-auth-token"))localStorage.removeItem(key);
    }finally{
      window.location.replace("/");
    }
  }

  if(!stalled)return null;

  return <div role="alertdialog" aria-modal="true" aria-labelledby="startup-recovery-title" style={{position:"fixed",inset:0,zIndex:9999,display:"grid",placeItems:"center",padding:"24px",background:"linear-gradient(180deg,rgba(3,12,28,.96),rgba(7,22,44,.98))",color:"white"}}>
    <div style={{width:"min(100%,440px)",border:"1px solid rgba(255,255,255,.13)",borderRadius:22,padding:"28px",background:"rgba(12,34,65,.94)",boxShadow:"0 28px 80px rgba(0,0,0,.35)"}}>
      <div style={{width:48,height:48,borderRadius:14,display:"grid",placeItems:"center",background:"rgba(243,189,62,.13)",color:"#f3bd3e",marginBottom:18}}><AlertTriangle size={24}/></div>
      <h1 id="startup-recovery-title" style={{fontSize:24,lineHeight:1.2,margin:"0 0 10px"}}>Myvor met trop de temps à démarrer</h1>
      <p style={{margin:"0 0 22px",color:"#b8c8dc",lineHeight:1.55}}>La connexion ou le chargement des données a probablement été interrompu. Tes données ne sont pas supprimées.</p>
      <div style={{display:"grid",gap:10}}>
        <button type="button" onClick={()=>window.location.reload()} style={{minHeight:48,border:0,borderRadius:12,background:"#f3bd3e",color:"#07162c",fontWeight:850,display:"flex",alignItems:"center",justifyContent:"center",gap:9,cursor:"pointer"}}><RefreshCw size={18}/>Réessayer</button>
        <button type="button" onClick={reconnect} disabled={busy} style={{minHeight:48,border:"1px solid rgba(255,255,255,.16)",borderRadius:12,background:"rgba(255,255,255,.06)",color:"white",fontWeight:760,display:"flex",alignItems:"center",justifyContent:"center",gap:9,cursor:"pointer"}}><LogIn size={18}/>{busy?"Déconnexion…":"Se reconnecter"}</button>
      </div>
      <p style={{margin:"16px 0 0",fontSize:12,color:"#8195af"}}>Le bouton « Se reconnecter » ferme uniquement la session locale sur cet appareil.</p>
    </div>
  </div>;
}
