"use client";

import { BookOpen, FileText, Scale, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

type Panel = "cgu" | "legal" | "ai-act" | "manual";

const tabs: Array<{ id: Panel; label: string; icon: typeof Scale }> = [
  { id: "cgu", label: "CGU", icon: Scale },
  { id: "legal", label: "Mentions légales", icon: FileText },
  { id: "ai-act", label: "Myvor et l’AI Act", icon: ShieldCheck },
  { id: "manual", label: "Manuel", icon: BookOpen },
];

export default function LegalHelpMenu() {
  const [open, setOpen] = useState<Panel | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="myvor-legal-links" aria-label="Informations Myvor">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setOpen(id)}>
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="myvor-info-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(null);
        }}>
          <section className="myvor-info-modal" role="dialog" aria-modal="true" aria-labelledby="myvor-info-title">
            <header className="myvor-info-head">
              <div>
                <small>Myvor</small>
                <h2 id="myvor-info-title">Informations & aide</h2>
              </div>
              <button type="button" className="myvor-info-close" onClick={() => setOpen(null)} aria-label="Fermer">
                <X size={19} />
              </button>
            </header>

            <nav className="myvor-info-tabs" aria-label="Rubriques d'information">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" className={open === id ? "active" : ""} onClick={() => setOpen(id)}>
                  <Icon size={15} />{label}
                </button>
              ))}
            </nav>

            <div className="myvor-info-content">
              {open === "cgu" && <Cgu />}
              {open === "legal" && <Legal />}
              {open === "ai-act" && <AiAct />}
              {open === "manual" && <Manual />}
            </div>
          </section>
        </div>
      )}

      <style jsx global>{`
        .myvor-legal-links{position:fixed;top:max(11px,env(safe-area-inset-top));right:64px;z-index:95;display:flex;align-items:center;gap:6px}
        .myvor-legal-links button{height:34px;border:1px solid rgba(255,255,255,.14);background:rgba(10,31,59,.86);backdrop-filter:blur(12px);color:#cbd7e7;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:720;cursor:pointer;box-shadow:0 8px 22px rgba(3,12,26,.12)}
        .myvor-legal-links button:hover{color:#fff;border-color:rgba(220,183,80,.42);background:#102d51}
        .myvor-legal-links button:focus-visible,.myvor-info-tabs button:focus-visible,.myvor-info-close:focus-visible{outline:2px solid #d7ad43;outline-offset:2px}
        .myvor-info-backdrop{position:fixed;inset:0;z-index:160;background:rgba(2,10,23,.68);backdrop-filter:blur(7px);display:grid;place-items:center;padding:24px}
        .myvor-info-modal{width:min(880px,calc(100vw - 32px));max-height:min(820px,calc(100vh - 44px));background:linear-gradient(180deg,#0a1d37 0%,#07162c 100%);color:#edf3fb;border:1px solid rgba(255,255,255,.13);border-radius:22px;box-shadow:0 30px 90px rgba(0,0,0,.42);overflow:hidden;display:flex;flex-direction:column}
        .myvor-info-head{display:flex;justify-content:space-between;align-items:center;padding:22px 24px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
        .myvor-info-head small{display:block;color:#d7ad43;text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:10px;margin-bottom:4px}
        .myvor-info-head h2{font-size:22px;line-height:1.2;margin:0;color:#fff}
        .myvor-info-close{width:40px;height:40px;border-radius:11px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:#fff;display:grid;place-items:center;cursor:pointer}
        .myvor-info-tabs{display:flex;gap:7px;padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.08);overflow-x:auto}
        .myvor-info-tabs button{white-space:nowrap;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);color:#aebed2;border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:7px;font-weight:730;cursor:pointer}
        .myvor-info-tabs button.active{background:rgba(215,173,67,.12);border-color:rgba(215,173,67,.42);color:#f5d77d}
        .myvor-info-content{padding:22px 26px 30px;overflow:auto;line-height:1.62;color:#d9e3ef}
        .myvor-info-content h3{color:#fff;font-size:18px;margin:0 0 10px}
        .myvor-info-content h4{color:#f2cf71;font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em}
        .myvor-info-content p{margin:0 0 10px;color:#cbd7e5}
        .myvor-info-content ul,.myvor-info-content ol{margin:7px 0 12px;padding-left:20px;color:#cbd7e5}
        .myvor-info-content li{margin:5px 0}
        .myvor-info-content strong{color:#fff}
        .myvor-info-content a{color:#f2cf71;text-decoration:none;font-weight:760}
        .myvor-info-content a:hover{text-decoration:underline}
        .myvor-legal-warning{margin:0 0 18px;padding:13px 15px;border-radius:12px;background:rgba(215,173,67,.1);border:1px solid rgba(215,173,67,.3);color:#f3d985;font-size:13px}
        .myvor-ai-status{margin:0 0 18px;padding:14px 16px;border-radius:12px;background:rgba(58,166,105,.1);border:1px solid rgba(95,210,147,.28);color:#b8efd0;font-size:13px}
        .myvor-ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0 18px}
        .myvor-ai-grid div{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);border-radius:12px;padding:12px}
        .myvor-ai-grid strong{display:block;font-size:12px;margin-bottom:4px}
        .myvor-ai-grid span{display:block;color:#aebed2;font-size:12px;line-height:1.5}
        .myvor-manual-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin:14px 0 20px}
        .myvor-manual-flow span{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);border-radius:10px;padding:9px;text-align:center;font-size:11px;font-weight:760;color:#e4edf7}
        @media(max-width:850px){.myvor-legal-links{right:58px;top:max(9px,env(safe-area-inset-top));gap:4px}.myvor-legal-links button{width:34px;padding:0;justify-content:center}.myvor-legal-links button span{display:none}.myvor-info-backdrop{padding:8px;place-items:end center}.myvor-info-modal{width:100%;max-height:88vh;border-radius:20px 20px 10px 10px}.myvor-info-head{padding:18px 18px 14px}.myvor-info-tabs{padding:12px 16px}.myvor-info-content{padding:18px 18px 28px}.myvor-ai-grid,.myvor-manual-flow{grid-template-columns:1fr}}
      `}</style>
    </>
  );
}

function Cgu() {
  return <article>
    <h3>Conditions générales d’utilisation</h3>
    <p>Les présentes conditions encadrent l’accès et l’utilisation de Myvor, plateforme professionnelle d’aide à la veille, à l’analyse d’impact, à la cartographie d’influence et à la production de livrables en affaires publiques.</p>
    <h4>1. Accès au service</h4>
    <p>L’accès à Myvor nécessite un compte personnel. L’utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte.</p>
    <h4>2. Usage autorisé</h4>
    <p>Myvor doit être utilisé dans un cadre professionnel et licite. Il est interdit de contourner les mécanismes de sécurité, d’extraire massivement les données, de tenter d’accéder aux données d’un autre utilisateur ou d’utiliser le service à des fins frauduleuses.</p>
    <h4>3. Analyses et intelligence artificielle</h4>
    <p>Les synthèses, scores, recommandations, cartographies et documents générés constituent une aide à la décision. Ils ne remplacent ni la vérification des sources officielles ni l’expertise professionnelle de l’utilisateur. Les éléments signalés « à confirmer » doivent être vérifiés avant diffusion ou action.</p>
    <h4>4. Données et confidentialité</h4>
    <p>L’utilisateur ne doit transmettre que les informations qu’il est autorisé à traiter. Les contenus d’un dossier restent associés au compte qui les a créés. Myvor met en œuvre des contrôles d’accès destinés à isoler les données entre utilisateurs.</p>
    <h4>5. Propriété intellectuelle</h4>
    <p>L’interface, la marque, les composants logiciels et les éléments propres à Myvor restent protégés par les droits applicables. Les documents produits à partir des données de l’utilisateur peuvent être exploités par celui-ci dans le cadre de son activité, sous réserve des droits attachés aux sources tierces.</p>
    <h4>6. Disponibilité</h4>
    <p>Myvor peut connaître des interruptions liées à la maintenance, aux fournisseurs techniques ou à des événements extérieurs. Le service peut évoluer afin d’améliorer la sécurité, la fiabilité ou les fonctionnalités.</p>
    <h4>7. Responsabilité</h4>
    <p>L’utilisateur reste responsable des décisions prises, des communications envoyées et des vérifications nécessaires avant utilisation externe d’un contenu généré par Myvor.</p>
    <h4>8. Droit applicable</h4>
    <p>Les présentes conditions sont soumises au droit français. Toute modification substantielle des présentes conditions pourra être portée à la connaissance des utilisateurs.</p>
  </article>;
}

function Legal() {
  return <article>
    <h3>Mentions légales</h3>
    <div className="myvor-legal-warning">Les informations d’immatriculation ci-dessous doivent être complétées avec les données officielles de la SASU avant l’ouverture commerciale publique.</div>
    <p><strong>Éditeur :</strong> Myvor, société par actions simplifiée unipersonnelle (SASU).</p>
    <p><strong>Site :</strong> myvor.app</p>
    <p><strong>Siège social :</strong> à compléter.</p>
    <p><strong>Capital social :</strong> à compléter.</p>
    <p><strong>SIREN / RCS :</strong> à compléter.</p>
    <p><strong>Directeur de la publication :</strong> à compléter.</p>
    <p><strong>Contact :</strong> à compléter avec l’adresse e-mail professionnelle Myvor.</p>
    <h4>Hébergement</h4>
    <p>Le service web Myvor est déployé au moyen de l’infrastructure Netlify. Les services de données et d’authentification reposent notamment sur Supabase.</p>
    <h4>Données personnelles</h4>
    <p>Myvor traite les données nécessaires à l’authentification, au fonctionnement des dossiers et aux fonctionnalités de la plateforme. Les utilisateurs disposent des droits prévus par la réglementation applicable en matière de protection des données. Les modalités détaillées devront être complétées dans une politique de confidentialité dédiée avant ouverture commerciale.</p>
    <h4>Propriété intellectuelle</h4>
    <p>Myvor, son identité visuelle, ses interfaces et ses composants sont protégés. Les marques, textes institutionnels et contenus tiers restent la propriété de leurs titulaires respectifs.</p>
  </article>;
}

function AiAct() {
  return <article>
    <h3>Myvor et l’AI Act</h3>
    <div className="myvor-ai-status">Mise à jour : 8 août 2026. Myvor intègre des garde-fous de transparence, de traçabilité et de validation humaine dans ses modules utilisant l’intelligence artificielle.</div>
    <p>L’AI Act européen suit une approche fondée sur les risques. Les obligations de transparence prévues notamment par son article 50 sont applicables depuis le <strong>2 août 2026</strong>. Myvor est conçu comme un outil professionnel d’assistance à l’analyse et à la rédaction : il prépare des analyses, des cartographies et des livrables, mais la décision finale reste humaine.</p>

    <h4>1. Où l’intelligence artificielle intervient</h4>
    <div className="myvor-ai-grid">
      <div><strong>Note d’impact</strong><span>L’IA analyse le corpus rattaché au dossier et propose une synthèse, des impacts, des risques, des opportunités et des recommandations.</span></div>
      <div><strong>Radar d’influence</strong><span>L’IA peut enrichir la fiche d’un acteur, mais une position politique ne doit pas être attribuée sans source publique vérifiable.</span></div>
      <div><strong>War Zone</strong><span>L’IA transforme le dossier, la veille et les acteurs qualifiés en stratégie opérationnelle structurée et vérifiable.</span></div>
      <div><strong>Note Builder</strong><span>L’IA produit ou réécrit des livrables à partir du contexte du dossier et des analyses déjà disponibles dans Myvor.</span></div>
    </div>

    <h4>2. Transparence pour l’utilisateur</h4>
    <p>Les modules concernés affichent un indicateur précisant que l’analyse est assistée par IA et qu’une vérification humaine est requise avant usage externe. Cette information permet à l’utilisateur d’identifier immédiatement les contenus produits ou enrichis avec l’aide d’un système d’IA.</p>

    <h4>3. Validation humaine</h4>
    <p>Myvor ne considère pas un contenu généré comme automatiquement prêt à être diffusé. Les Notes d’impact et les documents du Note Builder suivent un processus de vérification et de validation humaine. L’utilisateur doit contrôler les faits, les sources, les dates, les acteurs et les recommandations avant toute communication externe ou décision professionnelle.</p>

    <h4>4. Traçabilité des générations</h4>
    <p>Les productions Myvor conservent des informations de provenance telles que la date de génération, le moteur ou modèle disponible, le statut de revue humaine et, lorsqu’une validation intervient, sa date et son auteur. Les exports génératifs peuvent également embarquer des informations de provenance destinées à rendre l’origine assistée par IA identifiable.</p>

    <h4>5. Acteurs, positions et données sensibles</h4>
    <p>Le Radar est conçu pour distinguer les fonctions institutionnelles, les informations publiques et les inférences. Une position favorable, réservée ou opposée ne doit être affichée que lorsqu’elle est appuyée par une source publique vérifiable ; à défaut, Myvor affiche la position comme <strong>« Inconnue »</strong>. Myvor n’utilise pas de reconnaissance des émotions, de catégorisation biométrique ou de profilage politique fondé sur des données privées.</p>

    <h4>6. Sources et limites</h4>
    <p>Myvor privilégie les sources institutionnelles et officielles rattachées aux dossiers. Une génération peut néanmoins contenir une erreur, une information incomplète ou une inférence qui doit être contrôlée. Les mentions « à confirmer », les niveaux de confiance et les preuves associées font partie du dispositif de vérification et ne doivent pas être ignorés.</p>

    <h4>7. Maîtrise de l’IA</h4>
    <p>Myvor documente les usages prévus de ses fonctions d’IA et leurs limites afin que les utilisateurs comprennent quand l’IA intervient, quelles vérifications sont attendues et quelles informations ne doivent pas être considérées comme établies sans source. Cette démarche participe à la maîtrise de l’IA attendue par le cadre européen.</p>

    <h4>8. Références officielles</h4>
    <ul>
      <li><a href="https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems" target="_blank" rel="noreferrer">Commission européenne — lignes directrices sur les obligations de transparence de l’article 50</a></li>
      <li><a href="https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act" target="_blank" rel="noreferrer">Commission européenne — questions-réponses sur l’article 50</a></li>
      <li><a href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj" target="_blank" rel="noreferrer">EUR-Lex — règlement (UE) 2024/1689 sur l’intelligence artificielle</a></li>
    </ul>

    <div className="myvor-legal-warning">Cette rubrique présente l’approche produit et les garde-fous mis en œuvre par Myvor. Elle ne constitue pas un avis juridique ni une certification de conformité réglementaire.</div>
  </article>;
}

function Manual() {
  return <article>
    <h3>Manuel d’utilisation Myvor</h3>
    <p>Myvor suit un parcours simple : partir du dossier client, capter les signaux institutionnels, mesurer leur impact, identifier les acteurs puis produire un livrable directement exploitable.</p>
    <div className="myvor-manual-flow"><span>Dossier client</span><span>Veille</span><span>Note d’impact</span><span>Radar</span><span>Note Builder</span></div>
    <h4>1. Tableau de bord</h4>
    <p>Utilisez le tableau de bord pour repérer immédiatement les dossiers actifs, les évolutions importantes et les actions à traiter en priorité.</p>
    <h4>2. Dossiers clients</h4>
    <p>Créez un dossier par sujet client. Renseignez l’objectif, le contexte et la fiche stratégique : secteur, enjeux, risques, opportunités, acteurs clés, thèmes de veille et échéances. Plus ce profil est précis, plus les modules suivants sont pertinents.</p>
    <h4>3. Veille</h4>
    <p>Synchronisez les sources puis rattachez les textes utiles au bon dossier. Myvor peut suggérer des rattachements ; vérifiez toujours les rapprochements lorsque le niveau de confiance est intermédiaire.</p>
    <h4>4. Note d’impact</h4>
    <p>Sélectionnez un dossier et les textes liés, puis choisissez le niveau d’analyse Express, Standard ou Approfondie. Contrôlez le score, les risques, opportunités, échéances, recommandations et éléments à confirmer avant validation.</p>
    <h4>5. Radar d’influence</h4>
    <p>Le Radar stable positionne les acteurs clés déjà renseignés dans la fiche stratégique. L’option d’enrichissement IA améliore leur lecture stratégique sans remplacer la vérification des positions, compétences ou faits non établis par une source.</p>
    <h4>6. Note Builder</h4>
    <p>Transformez le contexte du dossier, la veille, la Note d’impact et le Radar en note stratégique, synthèse, e-mail client, brief rendez-vous, argumentaire ou éléments de langage. Relisez et validez toujours le document avant diffusion.</p>
    <h4>7. Bon réflexe</h4>
    <ul><li>Commencez toujours par un dossier bien renseigné.</li><li>Rattachez uniquement les sources réellement pertinentes.</li><li>Traitez « à confirmer » comme une consigne de vérification.</li><li>Validez les analyses avant de les utiliser dans un livrable client.</li></ul>
  </article>;
}
