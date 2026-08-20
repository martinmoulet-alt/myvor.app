"use client";

import {FileText,X} from "lucide-react";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";

export default function LaunchLegalCompliance(){
  const[host,setHost]=useState<HTMLElement|null>(null);
  const[open,setOpen]=useState(false);

  useEffect(()=>{
    const sync=()=>setHost(document.querySelector<HTMLElement>(".myvor-legal-links"));
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open]);

  const trigger=host?createPortal(
    <button type="button" className="myvor-launch-legal-trigger" onClick={()=>setOpen(true)}>
      <FileText size={14}/><span>Mentions & confidentialité</span>
    </button>,host
  ):null;

  return <>
    {trigger}
    {open&&<div className="myvor-launch-legal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <section className="myvor-launch-legal-modal" role="dialog" aria-modal="true" aria-labelledby="myvor-launch-legal-title">
        <header><div><small>Myvor · mise à jour du 20 août 2026</small><h2 id="myvor-launch-legal-title">Mentions légales & confidentialité</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Fermer"><X size={19}/></button></header>
        <div className="myvor-launch-legal-content">
          <article>
            <h3>Mentions légales</h3>
            <p><strong>Éditeur :</strong> Martin Moulet, personne physique, exploitant le service Myvor dans le cadre de sa phase de lancement.</p>
            <p><strong>Adresse :</strong> 7 rue Jacques Ourtal, 11000 Carcassonne, France.</p>
            <p><strong>Téléphone :</strong> 06 45 81 00 18.</p>
            <p><strong>E-mail :</strong> <a href="mailto:martin.moulet@myvor-net.com">martin.moulet@myvor-net.com</a>.</p>
            <p><strong>Site :</strong> myvor.app.</p>
            <p><strong>Directeur de la publication :</strong> Martin Moulet.</p>
            <div className="myvor-launch-legal-note">Myvor est actuellement un nom de service exploité par l’éditeur ci-dessus. Ces mentions seront mises à jour lors de l’immatriculation de la structure appelée à exploiter le service.</div>

            <h4>Hébergement</h4>
            <p>Le site est hébergé par <strong>Netlify, Inc.</strong>, 101 2nd Street, San Francisco, CA 94105, États-Unis. Téléphone : +1 415 691 1573. Contact : support@netlify.com.</p>
            <p>La base de données, l’authentification et certaines fonctions serveur reposent sur <strong>Supabase</strong>. Le projet principal Myvor est déployé dans une région européenne.</p>

            <h4>Propriété intellectuelle</h4>
            <p>Myvor, son identité visuelle, ses interfaces et ses composants logiciels sont protégés par les droits applicables. Les marques, textes institutionnels, bases officielles et contenus de tiers restent soumis aux droits de leurs titulaires respectifs.</p>
          </article>

          <article>
            <h3>Politique de confidentialité</h3>
            <p><strong>Responsable du traitement :</strong> Martin Moulet, coordonnées indiquées dans les mentions légales ci-dessus.</p>

            <h4>Données traitées</h4>
            <p>Myvor peut traiter les données nécessaires à la création et à la sécurisation d’un compte, les informations de profil et de workspace, les contenus ajoutés aux dossiers, les rattachements de veille, les productions générées, ainsi que les données techniques nécessaires au fonctionnement, à la sécurité et au diagnostic du service.</p>

            <h4>Finalités et bases légales</h4>
            <ul>
              <li>Créer et administrer le compte, fournir les fonctionnalités Myvor et conserver les contenus du workspace : exécution des conditions d’utilisation et mesures précontractuelles.</li>
              <li>Assurer la sécurité, prévenir les abus, diagnostiquer les incidents et préserver l’intégrité du service : intérêt légitime de l’éditeur à sécuriser Myvor.</li>
              <li>Respecter les obligations légales applicables et répondre aux demandes des autorités compétentes : obligation légale lorsqu’elle s’applique.</li>
            </ul>

            <h4>Destinataires et sous-traitants techniques</h4>
            <p>Les données sont accessibles aux utilisateurs autorisés du workspace concerné et, dans la mesure nécessaire au fonctionnement du service, aux prestataires techniques utilisés par Myvor, notamment Netlify pour l’hébergement web, Supabase pour la base de données et l’authentification, et OpenAI pour les fonctions d’intelligence artificielle appelées par les modules concernés.</p>
            <p>Les données envoyées via la plateforme API d’OpenAI ne sont pas utilisées par défaut pour entraîner les modèles d’OpenAI. Les contenus transmis à une fonction d’IA doivent néanmoins être limités aux informations nécessaires à l’analyse demandée.</p>

            <h4>Transferts internationaux</h4>
            <p>Certains prestataires techniques sont établis ou peuvent traiter des données en dehors de l’Espace économique européen. Lorsqu’un transfert international intervient, il doit être encadré par les mécanismes prévus par la réglementation applicable et les engagements contractuels du prestataire concerné.</p>

            <h4>Durée de conservation</h4>
            <p>Les données de compte et les contenus métier sont conservés pendant la durée nécessaire à la fourniture du service et tant qu’ils restent présents dans le compte ou le workspace. Après fermeture ou suppression, certaines données techniques peuvent être conservées pendant la durée strictement nécessaire à la sécurité, au traitement d’une demande ou au respect d’une obligation légale.</p>

            <h4>Vos droits</h4>
            <p>Selon la situation et la base légale du traitement, vous pouvez demander l’accès à vos données, leur rectification, leur effacement, la limitation du traitement, vous opposer à certains traitements ou demander la portabilité des données concernées.</p>
            <p>Pour exercer vos droits ou poser une question sur vos données : <a href="mailto:martin.moulet@myvor-net.com">martin.moulet@myvor-net.com</a>. Vous pouvez également introduire une réclamation auprès de la CNIL.</p>

            <h4>Décisions assistées par IA</h4>
            <p>Les analyses, scores, cartographies, recommandations et livrables générés par Myvor sont des aides à la décision. Ils nécessitent une vérification humaine avant diffusion ou action et ne constituent pas, à eux seuls, une décision produisant des effets juridiques à l’égard d’une personne.</p>
          </article>
        </div>
      </section>
    </div>}
    <style jsx global>{`
      .myvor-legal-links>button:nth-child(2){display:none!important}
      .myvor-legal-links>button:nth-child(1){order:1}.myvor-launch-legal-trigger{order:2}.myvor-legal-links>button:nth-child(3){order:3}.myvor-legal-links>button:nth-child(4){order:4}
      .myvor-launch-legal-backdrop{position:fixed;inset:0;z-index:170;background:rgba(2,10,23,.72);backdrop-filter:blur(7px);display:grid;place-items:center;padding:24px}
      .myvor-launch-legal-modal{width:min(900px,calc(100vw - 32px));max-height:min(850px,calc(100vh - 44px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.13);border-radius:22px;background:linear-gradient(180deg,#0a1d37 0%,#07162c 100%);color:#edf3fb;box-shadow:0 30px 90px rgba(0,0,0,.44)}
      .myvor-launch-legal-modal>header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
      .myvor-launch-legal-modal>header small{display:block;color:#d7ad43;text-transform:uppercase;letter-spacing:.11em;font-weight:800;font-size:10px;margin-bottom:4px}.myvor-launch-legal-modal>header h2{margin:0;color:white;font-size:22px}.myvor-launch-legal-modal>header button{width:40px;height:40px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:white;display:grid;place-items:center}
      .myvor-launch-legal-content{padding:22px 26px 30px;overflow:auto;line-height:1.62}.myvor-launch-legal-content article+article{margin-top:28px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1)}.myvor-launch-legal-content h3{margin:0 0 11px;color:#fff;font-size:18px}.myvor-launch-legal-content h4{margin:22px 0 6px;color:#f2cf71;font-size:13px;text-transform:uppercase;letter-spacing:.05em}.myvor-launch-legal-content p{margin:0 0 10px;color:#cbd7e5}.myvor-launch-legal-content ul{margin:8px 0 12px;padding-left:20px;color:#cbd7e5}.myvor-launch-legal-content li{margin:6px 0}.myvor-launch-legal-content strong{color:#fff}.myvor-launch-legal-content a{color:#f2cf71;text-decoration:none;font-weight:760}.myvor-launch-legal-note{margin:16px 0;padding:13px 15px;border-radius:12px;background:rgba(215,173,67,.1);border:1px solid rgba(215,173,67,.3);color:#f3d985;font-size:13px}
      @media(max-width:850px){.myvor-launch-legal-trigger{width:34px!important;padding:0!important;justify-content:center!important}.myvor-launch-legal-trigger span{display:none!important}.myvor-launch-legal-backdrop{padding:8px;place-items:end center}.myvor-launch-legal-modal{width:100%;max-height:88vh;border-radius:20px 20px 10px 10px}.myvor-launch-legal-modal>header{padding:18px 18px 14px}.myvor-launch-legal-content{padding:18px 18px 28px}}
    `}</style>
  </>;
}
