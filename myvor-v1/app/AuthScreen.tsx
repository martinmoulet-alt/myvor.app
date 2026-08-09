"use client";

import {useState} from "react";
import {ArrowRight,Check,Eye,EyeOff,LockKeyhole,Mail,ShieldCheck,Sparkles} from "lucide-react";
import {supabase} from "@/lib/supabase";
import styles from "./AuthScreen.module.css";

type Mode="login"|"signup";

function passwordIssue(password:string){
  if(password.length<12)return "Le mot de passe doit contenir au moins 12 caractères.";
  if(!/[a-z]/.test(password))return "Ajoutez au moins une lettre minuscule.";
  if(!/[A-Z]/.test(password))return "Ajoutez au moins une lettre majuscule.";
  if(!/\d/.test(password))return "Ajoutez au moins un chiffre.";
  if(!/[^A-Za-z0-9]/.test(password))return "Ajoutez au moins un symbole.";
  return "";
}

export default function AuthScreen(){
  const[mode,setMode]=useState<Mode>("login");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[showPassword,setShowPassword]=useState(false);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");
  const[messageType,setMessageType]=useState<"error"|"success">("error");

  function switchMode(next:Mode){setMode(next);setMessage("");setPassword("");}

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!supabase||busy)return;
    if(mode==="signup"){
      const issue=passwordIssue(password);
      if(issue){setMessageType("error");setMessage(issue);return;}
    }
    setBusy(true);setMessage("");
    try{
      const result=mode==="login"
        ?await supabase.auth.signInWithPassword({email:email.trim(),password})
        :await supabase.auth.signUp({email:email.trim(),password});
      if(result.error)throw result.error;
      if(mode==="signup"){
        setMessageType("success");
        setMessage("Compte créé. Vérifiez votre e-mail si la confirmation est activée.");
      }
    }catch(error:any){
      setMessageType("error");
      const raw=String(error?.message||"Connexion impossible.");
      setMessage(raw.toLowerCase().includes("invalid login")?"E-mail ou mot de passe incorrect.":raw);
    }finally{setBusy(false);}
  }

  async function resetPassword(){
    if(!supabase||busy)return;
    if(!email.trim()){setMessageType("error");setMessage("Saisissez d’abord votre adresse e-mail.");return;}
    setBusy(true);setMessage("");
    try{
      const redirectTo=typeof window!=="undefined"?new URL("/reset-password",window.location.origin).toString():undefined;
      const{error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo});
      if(error)throw error;
      setMessageType("success");setMessage("Un lien de réinitialisation vient de vous être envoyé.");
    }catch(error:any){setMessageType("error");setMessage(error?.message||"Réinitialisation impossible.");}
    finally{setBusy(false);}
  }

  return <main className={styles.page}>
    <section className={styles.brandPanel}>
      <div className={styles.brandTop}><div className={styles.logo}>M</div><span>Myvor</span></div>
      <div className={styles.brandCopy}>
        <div className={styles.kicker}><Sparkles size={15}/> Intelligence d’affaires publiques</div>
        <h1>Anticipez l’impact.<br/><span>Décidez avant les autres.</span></h1>
        <p>Centralisez votre veille institutionnelle, mesurez l’impact sur vos clients et transformez chaque signal en action.</p>
        <div className={styles.benefits}>
          <div><span><Check size={14}/></span><div><b>Note d’impact</b><small>Priorisez les textes selon leurs conséquences réelles.</small></div></div>
          <div><span><Check size={14}/></span><div><b>Radar d’influence</b><small>Identifiez les acteurs, positions et fenêtres d’action.</small></div></div>
          <div><span><Check size={14}/></span><div><b>Note Builder</b><small>Transformez l’analyse en livrables immédiatement exploitables.</small></div></div>
        </div>
      </div>
      <div className={styles.brandFoot}><ShieldCheck size={16}/><span>Espace sécurisé · Données cloisonnées par organisation</span></div>
    </section>

    <section className={styles.formPanel}>
      <div className={styles.mobileBrand}><div className={styles.logo}>M</div><span>Myvor</span></div>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardEyebrow}>{mode==="login"?"Espace professionnel":"Créer votre espace"}</span>
          <h2>{mode==="login"?"Bienvenue sur Myvor":"Commencez avec Myvor"}</h2>
          <p>{mode==="login"?"Connectez-vous pour accéder à vos dossiers et analyses.":"Créez votre compte professionnel en quelques secondes."}</p>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Authentification">
          <button type="button" className={mode==="login"?styles.active:""} onClick={()=>switchMode("login")}>Connexion</button>
          <button type="button" className={mode==="signup"?styles.active:""} onClick={()=>switchMode("signup")}>Créer un compte</button>
        </div>

        <form onSubmit={submit} className={styles.form}>
          <label><span>Adresse e-mail</span><div className={styles.inputWrap}><Mail size={17}/><input type="email" autoComplete="email" inputMode="email" required placeholder="vous@cabinet.fr" value={email} onChange={e=>setEmail(e.target.value)}/></div></label>
          <label><span>Mot de passe</span><div className={styles.inputWrap}><LockKeyhole size={17}/><input type={showPassword?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="signup"?12:1} required placeholder="••••••••••••" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className={styles.eye} onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Masquer le mot de passe":"Afficher le mot de passe"}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>{mode==="signup"&&<small style={{display:"block",marginTop:7,color:"#718096",lineHeight:1.45}}>12 caractères minimum · majuscule · minuscule · chiffre · symbole.</small>}</label>

          {mode==="login"&&<div className={styles.formMeta}><span/><button type="button" onClick={resetPassword} disabled={busy}>Mot de passe oublié ?</button></div>}

          {message&&<div className={`${styles.message} ${messageType==="success"?styles.success:styles.error}`}>{message}</div>}

          <button className={styles.submit} disabled={busy}>{busy?(mode==="login"?"Connexion…":"Création…"):(mode==="login"?"Se connecter":"Créer mon espace")}<ArrowRight size={17}/></button>
        </form>

        <div className={styles.security}><ShieldCheck size={15}/><span>Connexion sécurisée. Vos données ne sont jamais partagées entre organisations.</span></div>
      </div>
      <div className={styles.legal}>Myvor · Anticipez l’impact.</div>
    </section>
  </main>;
}
