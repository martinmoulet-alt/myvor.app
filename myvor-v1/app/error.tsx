"use client";

import {AlertTriangle,RefreshCw} from "lucide-react";

export default function Error({reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <main className="myvor-error-page">
    <section className="myvor-error-card" role="alert">
      <div className="myvor-error-icon"><AlertTriangle size={24}/></div>
      <div className="myvor-error-kicker">Myvor</div>
      <h1>Une erreur a interrompu l’affichage</h1>
      <p>Les données ne sont pas supprimées. Relance simplement cet écran pour reprendre ton travail.</p>
      <button type="button" onClick={reset}><RefreshCw size={18}/>Réessayer</button>
    </section>
  </main>;
}
