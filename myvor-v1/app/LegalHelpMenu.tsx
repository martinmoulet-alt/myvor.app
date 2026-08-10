"use client";

import {BookOpen,FileText,Scale,ShieldCheck,UserRoundCheck,X} from "lucide-react";
import {useEffect,useState} from "react";
import {MYVOR_LEGAL_VERSION} from "@/lib/legal";

type Panel="cgu"|"privacy"|"legal"|"ai-act"|"manual";
const tabs:Array<{id:Panel;label:string;icon:typeof Scale}>=[
  {id:"cgu",label:"CGU",icon:Scale},
  {id:"privacy",label:"Confidentialité",icon:UserRoundCheck},
  {id:"legal",label:"Mentions légales",icon:FileText},
  {id:"ai-act",label:"Myvor et l’AI Act",icon:ShieldCheck},
  {id:"manual",label:"Manuel",icon:BookOpen},
];

function isPanel(value:unknown):value is Panel{return tabs.some(tab=>tab.id===value);}

export default function LegalHelpMenu(){
  const[open,setOpen]=useState<Panel|null>(null);

  useEffect(()=>{
    const onOpen=(event:Event)=>{const value=(event as CustomEvent).detail;if(isPanel(value))setOpen(value);};
    window.addEventListener("myvor:open-info",onOpen);
    return()=>window.removeEventListener("myvor:open-info",onOpen);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(null);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[open]);

  return <>
    <div className="myvor-legal-links" aria-label="Informations Myvor">
      {tabs.map(({id,label,icon:Icon})=><button key={id} type="button" onClick={()=>setOpen(id)}><Icon size={14}/><span>{label}</span></button>)}
    </div>

    {open&&<div className="myvor-info-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(null);}}>
      <section className="myvor-info-modal" role="dialog" aria-modal="true" aria-labelledby="myvor-info-title">
        <header className="myvor-info-head"><div><small>Myvor · version {MYVOR_LEGAL_VERSION}</small><h2 id="myvor-info-title">Informations & aide</h2></div><button type="button" className="myvor-info-close" onClick={()=>setOpen(null)} aria-label="Fermer"><X size={19}/></button></header>
        <nav className="myvor-info-tabs" aria-label="Rubriques d'information">{tabs.map(({id,label,icon:Icon})=><button key={id} type="button" className={open===id?"active":""} onClick={()=>setOpen(id)}><Icon size={15}/>{label}</button>)}</nav>
        <div className="myvor-info-content">{open==="cgu"&&<Cgu/>}{open==="privacy"&&<Privacy/>}{open==="legal"&&<Legal/>}{open==="ai-act"&&<AiAct/>}{open==="manual"&&<Manual/>}</div>
      </section>
    </div>}

    <style jsx global>{`
      .myvor-legal-links{position:fixed;top:max(11px,env(safe-area-inset-top));right:64px;z-index:95;display:flex;align-items:center;gap:6px}.myvor-legal-links button{height:34px;border:1px solid rgba(255,255,255,.14);background:rgba(10,31,59,.86);backdrop-filter:blur(12px);color:#cbd7e7;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:720;cursor:pointer;box-shadow:0 8px 22px rgba(3,12,26,.12)}.myvor-legal-links button:hover{color:#fff;border-color:rgba(220,183,80,.42);background:#102d51}.myvor-legal-links button:focus-visible,.myvor-info-tabs button:focus-visible,.myvor-info-close:focus-visible{outline:2px solid #d7ad43;outline-offset:2px}.myvor-info-backdrop{position:fixed;inset:0;z-index:160;background:rgba(2,10,23,.68);backdrop-filter:blur(7px);display:grid;place-items:center;padding:24px}.myvor-info-modal{width:min(900px,calc(100vw - 32px));max-height:min(840px,calc(100vh - 44px));background:linear-gradient(180deg,#0a1d37 0%,#07162c 100%);color:#edf3fb;border:1px solid rgba(255,255,255,.13);border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.42);overflow:hidden;display:flex;flex-direction:column}.myvor-info-head{display:flex;justify-content:space-between;align-items:center;padding:22px 24px 16px;border-bottom:1px solid rgba(255,255,255,.1)}.myvor-info-head small{display:block;color:#d7ad43;text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:10px;margin-bottom:4px}.myvor-info-head h2{font-size:22px;line-height:1.2;margin:0;color:#fff}.myvor-info-close{width:40px;height:40px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:#fff;display:grid;place-items:center;cursor:pointer}.myvor-info-tabs{display:flex;gap:7px;padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.08);overflow-x:auto}.myvor-info-tabs button{white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);color:#aebed2;border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:7px;font-weight:730;cursor:pointer}.myvor-info-tabs button.active{background:rgba(215,173,67,.12);border-color:rgba(215,173,67,.42);color:#f5d77d}.myvor-info-content{padding:22px 26px 30px;overflow:auto;line-height:1.62;color:#d9e3ef}.myvor-info-content h3{color:#fff;font-size:18px;margin:0 0 10px}.myvor-info-content h4{color:#f2cf71;font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em}.myvor-info-content p{margin:0 0 10px;color:#cbd7e5}.myvor-info-content ul,.myvor-info-content ol{margin:7px 0 12px;padding-left:20px;color:#cbd7e5}.myvor-info-content li{margin:5px 0}.myvor-info-content strong{color:#fff}.myvor-info-content a{color:#f2cf71;text-decoration:none;font-weight:760}.myvor-info-content a:hover{text-decoration:underline}.myvor-legal-warning{margin:0 0 18px;padding:13px 15px;border-radius:12px;background:rgba(215,173,67,.1);border:1px solid rgba(215,173,67,.3);color:#f3d985;font-size:13px}.myvor-ai-status{margin:0 0 18px;padding:14px 16px;border-radius:12px;background:rgba(58,166,105,.1);border:1px solid rgba(95,210,147,.28);color:#b8efd0;font-size:13px}.myvor-ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0 18px}.myvor-ai-grid div{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);border-radius:12px;padding:12px}.myvor-ai-grid strong{display:block;font-size:12px;margin-bottom:4px}.myvor-ai-grid span{display:block;color:#aebed2;font-size:12px;line-height:1.5}.myvor-manual-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:14px 0 20px}.myvor-manual-flow span{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);border-radius:10px;padding:9px;text-align:center;font-size:11px;font-weight:760;color:#e4edf7}@media(max-width:850px){.myvor-legal-links{right:58px;top:max(9px,env(safe-area-inset-top));gap:4px}.myvor-legal-links button{width:34px;padding:0;justify-content:center}.myvor-legal-links button span{display:none}.myvor-info-backdrop{padding:8px;place-items:end center}.myvor-info-modal{width:100%;max-height:88vh;border-radius:20px 20px 10px 10px}.myvor-info-head{padding:18px 18px 14px}.myvor-info-tabs{padding:12px 16px}.myvor-info-content{padding:18px 18px 28px}.myvor-ai-grid,.myvor-manual-flow{grid-template-columns:1fr}}
    `}</style>
  </>;
}

function Cgu(){return <article>
  <h3>Conditions générales d’utilisation</h3>
  <p>Version applicable : <strong>{MYVOR_LEGAL_VERSION}</strong>. Les présentes conditions encadrent l’accès et l’utilisation de Myvor, plateforme professionnelle d’aide à la veille, à l’analyse d’impact, à la cartographie d’influence et à la production de livrables en affaires publiques.</p>
  <h4>1. Accès au service</h4><p>L’accès nécessite un compte personnel. Les identifiants ne doivent pas être partagés. L’utilisateur est responsable de l’usage réalisé depuis son compte et de la gestion des accès accordés à son organisation.</p>
  <h4>2. Usage autorisé</h4><p>Myvor doit être utilisé dans un cadre professionnel et licite. Sont interdits le contournement des protections, l’accès aux données d’un autre workspace, l’extraction automatisée non autorisée, l’introduction volontaire de contenus malveillants et tout usage frauduleux.</p>
  <h4>3. Sources, IA et validation humaine</h4><p>Les synthèses, scores, recommandations, cartographies et documents générés sont des aides à la décision. Les sources officielles, faits, dates, acteurs, citations et recommandations doivent être contrôlés avant toute diffusion externe ou décision professionnelle.</p>
  <h4>4. Données de l’utilisateur</h4><p>L’utilisateur s’engage à ne charger dans Myvor que les informations qu’il est autorisé à traiter et à respecter ses propres obligations lorsqu’un dossier contient des données relatives à des tiers.</p>
  <h4>5. Propriété intellectuelle</h4><p>L’interface, la marque, le logiciel et les éléments propres à Myvor restent protégés. Les contenus et données sources de tiers demeurent soumis aux droits de leurs titulaires. Les livrables générés à partir des données de l’utilisateur peuvent être exploités dans le cadre de son activité sous réserve de ces droits.</p>
  <h4>6. Disponibilité</h4><p>Le service peut être interrompu pour maintenance, sécurité, incident fournisseur ou événement extérieur. Myvor peut faire évoluer ses fonctionnalités et mesures de protection afin d’améliorer la fiabilité et le service.</p>
  <h4>7. Responsabilité</h4><p>L’utilisateur conserve la décision finale et la responsabilité de ses communications, analyses, démarches d’influence et livrables. Myvor ne remplace pas un conseil juridique, réglementaire ou déontologique.</p>
  <h4>8. Droit applicable</h4><p>Les présentes conditions sont soumises au droit français. Une évolution substantielle pourra donner lieu à une nouvelle acceptation dans l’application.</p>
</article>;}

function Privacy(){return <article>
  <h3>Politique de confidentialité</h3>
  <p>Version applicable : <strong>{MYVOR_LEGAL_VERSION}</strong>. Cette politique décrit les traitements nécessaires au fonctionnement du service Myvor. Elle concerne les utilisateurs de la plateforme ; les données de tiers éventuellement intégrées dans un dossier restent également sous la responsabilité de l’organisation qui les renseigne.</p>
  <h4>1. Responsable du traitement</h4><p>Le responsable du traitement est <strong>Myvor, SASU</strong>. L’identité administrative complète et le point de contact doivent figurer dans la rubrique « Mentions légales » avant ouverture commerciale publique.</p>
  <h4>2. Données traitées</h4><ul><li>Données de compte : adresse e-mail, identifiant technique, informations de profil et appartenance aux workspaces.</li><li>Données métier : dossiers clients, objectifs, contexte, règles de veille, actions, productions, préférences et contenus saisis par les utilisateurs.</li><li>Données de fonctionnement : journaux techniques, erreurs, dates de connexion, paramètres de sécurité et preuve d’acceptation des conditions.</li><li>Données traitées par les fonctions d’IA : contexte strictement nécessaire à la génération ou à la qualification demandée.</li></ul>
  <h4>3. Finalités</h4><ul><li>Créer et sécuriser le compte, isoler les workspaces et gérer les droits.</li><li>Fournir la veille, les analyses, alertes, cartographies et livrables demandés.</li><li>Assurer la continuité, la prévention des abus, le diagnostic d’incidents et la protection du service.</li><li>Conserver les preuves nécessaires au suivi contractuel et à la sécurité.</li></ul>
  <h4>4. Bases juridiques</h4><p>Les traitements strictement nécessaires au compte et au service sont mis en œuvre pour fournir la prestation demandée. Les mesures de sécurité et de prévention des abus répondent aux nécessités de protection du service et des utilisateurs. Les traitements imposés par une obligation légale sont réalisés lorsqu’elle s’applique. Une fonctionnalité facultative nécessitant un consentement distinct devra le demander séparément.</p>
  <h4>5. Destinataires</h4><p>Les données sont accessibles aux membres autorisés du workspace concerné et, dans la stricte mesure nécessaire au service, aux prestataires techniques utilisés pour l’hébergement, l’authentification, le stockage, l’envoi d’e-mails ou les fonctions d’intelligence artificielle. Les accès internes doivent rester limités aux besoins de support, sécurité et exploitation.</p>
  <h4>6. Conservation</h4><p>Les données de compte et de workspace sont conservées tant que le compte ou la relation de service reste active, puis supprimées ou archivées selon les obligations applicables et les délais techniques de sauvegarde. Les journaux et traces de sécurité sont conservés pendant une durée proportionnée à leur finalité. Les preuves d’acceptation peuvent être conservées afin d’établir la version contractuelle acceptée.</p>
  <h4>7. Sécurité</h4><p>Myvor met en œuvre une séparation par organisation, des contrôles d’accès, des politiques RLS, des fonctions serveur protégées, des restrictions de sources et des mécanismes de journalisation. Aucun mécanisme ne dispense néanmoins l’utilisateur de protéger son compte et de limiter les données déposées au nécessaire.</p>
  <h4>8. Vos droits</h4><p>Selon le traitement et sa base juridique, les personnes concernées peuvent disposer notamment de droits d’accès, de rectification, d’effacement, de limitation, d’opposition ou de portabilité. Elles peuvent également saisir la CNIL. Les demandes doivent être adressées au point de contact qui figurera dans les mentions légales.</p>
  <h4>9. Intelligence artificielle</h4><p>Myvor utilise l’IA comme outil d’assistance. Les données métier ne doivent pas être considérées comme donnant lieu à une décision professionnelle finale entièrement automatisée : l’utilisateur doit valider les résultats avant usage externe.</p>
  <h4>10. Évolution</h4><p>Une modification substantielle de cette politique peut entraîner l’affichage d’une nouvelle demande d’acceptation dans l’application.</p>
  <div className="myvor-legal-warning">Avant ouverture publique, complétez impérativement le point de contact et les informations administratives de Myvor dans les mentions légales.</div>
</article>;}

function Legal(){return <article>
  <h3>Mentions légales</h3>
  <div className="myvor-legal-warning">Bloc administratif à compléter avec les informations officielles de la SASU avant l’ouverture commerciale publique.</div>
  <p><strong>Éditeur :</strong> Myvor, société par actions simplifiée unipersonnelle (SASU).</p><p><strong>Site :</strong> myvor.app</p><p><strong>Siège social :</strong> à compléter.</p><p><strong>Capital social :</strong> à compléter.</p><p><strong>SIREN / RCS :</strong> à compléter.</p><p><strong>Directeur de la publication :</strong> à compléter.</p><p><strong>Contact :</strong> à compléter avec l’adresse e-mail professionnelle Myvor.</p>
  <h4>Hébergement</h4><p>Le service web Myvor est déployé au moyen de l’infrastructure Netlify. Les services de données et d’authentification reposent notamment sur Supabase.</p>
  <h4>Données personnelles</h4><p>La politique de confidentialité dédiée décrit les catégories de données, finalités, destinataires, conservation, sécurité et droits applicables.</p>
  <h4>Propriété intellectuelle</h4><p>Myvor, son identité visuelle, ses interfaces et ses composants sont protégés. Les marques, textes institutionnels et contenus tiers restent la propriété de leurs titulaires respectifs.</p>
</article>;}

function AiAct(){return <article>
  <h3>Myvor et l’AI Act</h3><div className="myvor-ai-status">Mise à jour : 10 août 2026. Myvor intègre des garde-fous de transparence, de traçabilité et de validation humaine dans ses modules utilisant l’intelligence artificielle.</div>
  <p>Myvor est conçu comme un outil professionnel d’assistance à l’analyse et à la rédaction. Il prépare des analyses, cartographies et livrables, tandis que la décision finale reste humaine.</p>
  <h4>1. Où l’IA intervient</h4><div className="myvor-ai-grid"><div><strong>Veille</strong><span>Qualification de pertinence et urgence après un filtrage déterministe.</span></div><div><strong>Note d’impact</strong><span>Synthèse, impacts, risques, opportunités et recommandations à partir du corpus rattaché.</span></div><div><strong>Radar & War Zone</strong><span>Enrichissement d’acteurs et structuration de stratégie avec obligation de source pour les faits sensibles.</span></div><div><strong>Note Builder</strong><span>Production et réécriture de livrables depuis le contexte validé du dossier.</span></div></div>
  <h4>2. Validation humaine</h4><p>Un contenu généré n’est pas considéré comme automatiquement prêt à être diffusé. Les utilisateurs doivent contrôler les faits, sources, dates, acteurs, positions et recommandations avant usage externe.</p>
  <h4>3. Traçabilité</h4><p>Les productions peuvent conserver des informations de provenance telles que la date de génération, le moteur disponible, les sources utilisées et les éléments de validation humaine.</p>
  <h4>4. Positions et données sensibles</h4><p>Une position politique ou institutionnelle ne doit pas être attribuée sans source publique vérifiable. À défaut, elle doit rester inconnue ou à confirmer. Myvor n’est pas conçu pour la reconnaissance des émotions, la catégorisation biométrique ou le profilage politique fondé sur des données privées.</p>
  <h4>5. Références officielles</h4><ul><li><a href="https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems" target="_blank" rel="noreferrer">Commission européenne — transparence des systèmes d’IA</a></li><li><a href="https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act" target="_blank" rel="noreferrer">Commission européenne — article 50</a></li><li><a href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj" target="_blank" rel="noreferrer">EUR-Lex — règlement (UE) 2024/1689</a></li></ul>
  <div className="myvor-legal-warning">Cette rubrique décrit l’approche produit de Myvor ; elle ne constitue pas une certification juridique de conformité.</div>
</article>;}

function Manual(){return <article>
  <h3>Manuel d’utilisation Myvor</h3><p>Myvor suit un parcours continu : partir du dossier client, capter les signaux institutionnels, mesurer leur impact, identifier les acteurs puis produire un livrable exploitable.</p><div className="myvor-manual-flow"><span>Dossier client</span><span>Veille</span><span>Note d’impact</span><span>Radar</span><span>Note Builder</span></div>
  <h4>1. Tableau de bord</h4><p>Repérez les dossiers actifs, les évolutions importantes, les échéances et les actions prioritaires.</p>
  <h4>2. Dossiers clients</h4><p>Créez un dossier par sujet client et renseignez précisément objectif, contexte, thèmes, exclusions, acteurs et échéances.</p>
  <h4>3. Veille</h4><p>Consultez les sources institutionnelles, vérifiez les suggestions et rattachez uniquement les évolutions réellement pertinentes au bon dossier.</p>
  <h4>4. Note d’impact</h4><p>Choisissez le niveau d’analyse, contrôlez le score, les impacts, risques, opportunités, échéances, recommandations et éléments à confirmer.</p>
  <h4>5. Radar & War Zone</h4><p>Positionnez les acteurs utiles au dossier, vérifiez les positions et transformez la cartographie en séquence d’action.</p>
  <h4>6. Note Builder</h4><p>Transformez le dossier et les analyses validées en note client, argumentaire, e-mail, préparation de rendez-vous ou autre livrable opérationnel.</p>
  <h4>7. Règle d’usage</h4><ul><li>Commencez par un dossier bien renseigné.</li><li>Ne rattachez que les sources pertinentes.</li><li>Traitez « à confirmer » comme une consigne de vérification.</li><li>Validez tout contenu assisté par IA avant diffusion.</li></ul>
</article>;}
