"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function passwordIssue(password:string){
  if(password.length<12)return "Le mot de passe doit contenir au moins 12 caractères.";
  if(!/[a-z]/.test(password))return "Ajoutez au moins une lettre minuscule.";
  if(!/[A-Z]/.test(password))return "Ajoutez au moins une lettre majuscule.";
  if(!/\d/.test(password))return "Ajoutez au moins un chiffre.";
  if(!/[^A-Za-z0-9]/.test(password))return "Ajoutez au moins un symbole.";
  return "";
}

export default function ResetPasswordPage(){
  const [ready,setReady]=useState(false);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [message,setMessage]=useState("Validation du lien de récupération…");
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  useEffect(()=>{
    if(!supabase){setMessage("Supabase n’est pas configuré.");return;}
    let active=true;
    async function init(){
      try{
        const code=new URLSearchParams(window.location.search).get("code");
        if(code){
          const {error}=await supabase!.auth.exchangeCodeForSession(code);
          if(error)throw error;
        }
        const {data}=await supabase!.auth.getSession();
        if(!active)return;
        if(data.session){setReady(true);setMessage("");}
        else setMessage("Lien invalide ou expiré. Demande un nouvel e-mail de récupération.");
      }catch(error:any){if(active)setMessage(error?.message||"Impossible de valider le lien de récupération.");}
    }
    init();
    const {data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      if((event==="PASSWORD_RECOVERY"||event==="SIGNED_IN")&&session){setReady(true);setMessage("");}
    });
    return()=>{active=false;listener.subscription.unsubscribe();};
  },[]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(!supabase||saving)return;
    const issue=passwordIssue(password);
    if(issue){setMessage(issue);return;}
    if(password!==confirm){setMessage("Les deux mots de passe ne correspondent pas.");return;}
    setSaving(true);setMessage("");
    const {error}=await supabase.auth.updateUser({password});
    setSaving(false);
    if(error){setMessage(error.message);return;}
    setDone(true);setMessage("Mot de passe modifié. Tu peux maintenant te connecter à Myvor.");
  }

  return <div className="auth"><div className="authbox"><div className="brand" style={{color:"var(--navy)"}}><div className="logo">M</div>Myvor</div><h1>Nouveau mot de passe</h1><p className="muted">Choisis un nouveau mot de passe pour ton compte Myvor.</p>{message&&<div className="notice">{message}</div>}{ready&&!done&&<form className="form" onSubmit={save}><div className="field"><label>Nouveau mot de passe</label><input type="password" minLength={12} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/><small>12 caractères minimum · majuscule · minuscule · chiffre · symbole.</small></div><div className="field"><label>Confirmer le mot de passe</label><input type="password" minLength={12} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div><button className="btn primary" disabled={saving}>{saving?"Enregistrement…":"Enregistrer le nouveau mot de passe"}</button></form>}{done&&<a className="btn primary" href="/" style={{display:"inline-flex",textDecoration:"none",justifyContent:"center"}}>Retour à Myvor</a>}</div></div>;
}
