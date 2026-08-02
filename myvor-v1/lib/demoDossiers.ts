export type DemoDossier={
  client:string;
  title:string;
  objective:string;
  context:string;
  status:string;
  watch_keywords:string[];
  watch_priority_phrases:string[];
  watch_excluded_keywords:string[];
};

export const DEMO_DOSSIERS:DemoDossier[]=[
  {
    client:"NovaRide",
    title:"Mobilité urbaine et plateformes VTC",
    objective:"Préserver un cadre réglementaire permettant le développement des plateformes de mobilité tout en limitant les nouvelles contraintes pesant sur les chauffeurs et les opérateurs.",
    context:"Acteur national de la mobilité urbaine opérant une plateforme de mise en relation entre chauffeurs VTC et passagers. Le dossier couvre la régulation des plateformes, le statut des chauffeurs, l’accès aux centres-villes, les ZFE, la décarbonation des flottes, la tarification et les obligations sociales applicables aux opérateurs numériques.",
    status:"Actif",
    watch_keywords:["mobilité","transport","VTC","chauffeur","plateforme","covoiturage","ZFE","transport de personnes","mobilité urbaine","véhicule"],
    watch_priority_phrases:["voiture de transport avec chauffeur","plateforme de mobilité","transport de personnes","zone à faibles émissions"],
    watch_excluded_keywords:["transport maritime","transport aérien","sport automobile"]
  },
  {
    client:"HexaPower",
    title:"Électricité, réseaux et prix de l’énergie",
    objective:"Anticiper les évolutions du marché de l’électricité et défendre un cadre favorable aux investissements dans les infrastructures énergétiques.",
    context:"Groupe énergétique présent dans la production, la fourniture et les services énergétiques. Le dossier suit les prix de l’électricité, l’ARENH et ses mécanismes successeurs, la régulation des réseaux, les certificats d’économies d’énergie, le marché européen de l’énergie et les obligations de décarbonation.",
    status:"Actif",
    watch_keywords:["électricité","énergie","réseau","énergétique","CRE","tarif","fourniture","production électrique","décarbonation","CEE"],
    watch_priority_phrases:["prix de l’électricité","marché de l’électricité","commission de régulation de l’énergie","certificats d’économies d’énergie"],
    watch_excluded_keywords:["carburant aviation","pêche maritime"]
  },
  {
    client:"MediNova",
    title:"Accès au marché des médicaments innovants",
    objective:"Accélérer l’accès des patients aux traitements innovants et sécuriser les conditions de remboursement et de fixation des prix.",
    context:"Laboratoire pharmaceutique développant des médicaments innovants. Le dossier porte sur la HAS, le CEPS, les autorisations d’accès précoce, les négociations de prix, le financement de l’innovation thérapeutique et les dispositions du PLFSS relatives au médicament.",
    status:"Actif",
    watch_keywords:["médicament","pharmaceutique","HAS","CEPS","remboursement","prix","accès précoce","PLFSS","innovation thérapeutique","santé"],
    watch_priority_phrases:["accès précoce","prix des médicaments","comité économique des produits de santé","projet de loi de financement de la sécurité sociale"],
    watch_excluded_keywords:["médecine vétérinaire","cosmétique"]
  },
  {
    client:"CloudAxis",
    title:"Cloud, souveraineté numérique et commande publique",
    objective:"Favoriser l’accès des fournisseurs européens de cloud aux marchés publics et limiter les exigences réglementaires disproportionnées.",
    context:"Fournisseur européen de services cloud et cybersécurité. Le dossier suit la doctrine cloud de l’État, SecNumCloud, la souveraineté numérique, la commande publique, NIS2, DORA, la protection des données et les règles européennes applicables aux services numériques.",
    status:"Actif",
    watch_keywords:["cloud","numérique","cybersécurité","SecNumCloud","NIS2","DORA","données","commande publique","souveraineté numérique","hébergement"],
    watch_priority_phrases:["cloud de confiance","souveraineté numérique","services cloud","sécurité des systèmes d’information"],
    watch_excluded_keywords:["nuage météorologique"]
  },
  {
    client:"Finora",
    title:"Paiements, fintech et services financiers numériques",
    objective:"Préserver la capacité d’innovation des fintech tout en anticipant les nouvelles exigences prudentielles et de protection du consommateur.",
    context:"Fintech française spécialisée dans les paiements et services financiers numériques. Le dossier couvre DSP3, PSR, lutte contre la fraude, authentification forte, open banking, monnaie numérique, crypto-actifs, supervision ACPR et obligations de conformité.",
    status:"Actif",
    watch_keywords:["paiement","fintech","DSP3","PSR","banque","ACPR","fraude","open banking","crypto-actifs","services financiers"],
    watch_priority_phrases:["services de paiement","prestataire de services de paiement","authentification forte","finance numérique"],
    watch_excluded_keywords:["paiement des agriculteurs"]
  },
  {
    client:"GreenBuild",
    title:"Rénovation énergétique des bâtiments",
    objective:"Maintenir des dispositifs d’aide lisibles et stables pour accélérer la rénovation énergétique du parc immobilier.",
    context:"Entreprise spécialisée dans la rénovation énergétique et l’efficacité des bâtiments. Le dossier suit MaPrimeRénov’, les CEE, le DPE, les obligations des propriétaires, la rénovation des copropriétés, le financement des travaux et les normes de performance énergétique.",
    status:"Actif",
    watch_keywords:["rénovation","bâtiment","DPE","MaPrimeRénov","logement","performance énergétique","isolation","copropriété","CEE","passoire thermique"],
    watch_priority_phrases:["rénovation énergétique","diagnostic de performance énergétique","MaPrimeRénov","passoires thermiques"],
    watch_excluded_keywords:["rénovation du patrimoine militaire"]
  },
  {
    client:"AgriPulse",
    title:"Agriculture, intrants et transition agroécologique",
    objective:"Sécuriser l’accès aux solutions agronomiques nécessaires aux exploitations tout en accompagnant la transition environnementale.",
    context:"Entreprise fournissant des solutions agronomiques aux exploitations agricoles. Le dossier couvre les produits phytosanitaires, biocontrôle, engrais, PAC, Ecophyto, souveraineté alimentaire, compétitivité agricole et réglementation européenne des intrants.",
    status:"Actif",
    watch_keywords:["agriculture","agricole","phytosanitaire","biocontrôle","engrais","PAC","Ecophyto","intrants","agroécologie","souveraineté alimentaire"],
    watch_priority_phrases:["produits phytopharmaceutiques","plan Ecophyto","politique agricole commune","souveraineté alimentaire"],
    watch_excluded_keywords:["agriculture urbaine décorative"]
  },
  {
    client:"RetailOne",
    title:"Commerce, promotions et relations fournisseurs-distributeurs",
    objective:"Préserver la compétitivité du commerce de détail et la capacité promotionnelle des enseignes.",
    context:"Groupe de distribution multicanal. Le dossier suit les lois Egalim, les négociations commerciales, l’encadrement des promotions, la revente à perte, les relations fournisseurs-distributeurs, l’inflation alimentaire et les obligations environnementales des enseignes.",
    status:"Actif",
    watch_keywords:["commerce","distribution","Egalim","promotion","fournisseur","enseigne","négociation commerciale","revente à perte","retail","prix alimentaires"],
    watch_priority_phrases:["négociations commerciales","relations commerciales","encadrement des promotions","seuil de revente à perte"],
    watch_excluded_keywords:["commerce extérieur militaire"]
  },
  {
    client:"Telora",
    title:"Télécoms, fibre et régulation des réseaux",
    objective:"Assurer un cadre stable pour les investissements dans les réseaux très haut débit et simplifier les obligations opérationnelles des opérateurs.",
    context:"Opérateur télécom national. Le dossier suit la fibre optique, la fermeture du cuivre, la 5G, les fréquences, l’ARCEP, la couverture mobile, le service universel, les infrastructures numériques et la résilience des réseaux.",
    status:"Actif",
    watch_keywords:["télécom","fibre","5G","ARCEP","réseau mobile","fréquence","cuivre","très haut débit","opérateur","connectivité"],
    watch_priority_phrases:["fibre optique","fermeture du réseau cuivre","couverture mobile","réseaux de communications électroniques"],
    watch_excluded_keywords:["fibre textile"]
  },
  {
    client:"EcoPack",
    title:"Emballages, recyclage et économie circulaire",
    objective:"Obtenir une trajectoire réglementaire réaliste pour la réduction des emballages et développer les filières de recyclage.",
    context:"Industriel de l’emballage et des matériaux recyclables. Le dossier couvre la loi AGEC, REP emballages, consigne, recyclabilité, réduction du plastique, réemploi, éco-conception et règlement européen sur les emballages.",
    status:"Actif",
    watch_keywords:["emballage","recyclage","plastique","AGEC","REP","consigne","réemploi","économie circulaire","déchet","écoconception"],
    watch_priority_phrases:["responsabilité élargie du producteur","emballages et déchets d’emballages","réduction du plastique","économie circulaire"],
    watch_excluded_keywords:["emballage cadeau"]
  },
  {
    client:"Homea",
    title:"Logement locatif et régulation des loyers",
    objective:"Préserver l’investissement locatif privé tout en anticipant les nouvelles obligations applicables aux bailleurs.",
    context:"Gestionnaire d’actifs immobiliers résidentiels. Le dossier suit l’encadrement des loyers, la fiscalité locative, les meublés, le DPE, les obligations de rénovation, la construction de logements et les politiques de soutien à l’offre locative.",
    status:"Actif",
    watch_keywords:["logement","loyer","bailleur","location","immobilier","DPE","meublé","construction","habitat","investissement locatif"],
    watch_priority_phrases:["encadrement des loyers","investissement locatif","location meublée","offre de logements"],
    watch_excluded_keywords:["logement étudiant à l’étranger"]
  },
  {
    client:"DataSphere",
    title:"Intelligence artificielle, données et régulation numérique",
    objective:"Permettre le déploiement de solutions d’IA en France et en Europe avec des obligations proportionnées au niveau de risque.",
    context:"Entreprise technologique développant des solutions d’intelligence artificielle pour les professionnels. Le dossier suit l’AI Act, la CNIL, les données d’entraînement, les modèles à usage général, la responsabilité algorithmique, les obligations de transparence et la régulation des plateformes numériques.",
    status:"Actif",
    watch_keywords:["intelligence artificielle","IA","AI Act","CNIL","algorithme","données","modèle","plateforme numérique","transparence","automatisation"],
    watch_priority_phrases:["règlement sur l’intelligence artificielle","modèles d’intelligence artificielle","systèmes d’intelligence artificielle","données d’entraînement"],
    watch_excluded_keywords:["intelligence artificielle militaire classifiée"]
  },
  {
    client:"BioCycle",
    title:"Déchets organiques et valorisation énergétique",
    objective:"Accélérer le développement des filières de méthanisation et de valorisation des biodéchets.",
    context:"Opérateur de collecte et de valorisation des biodéchets. Le dossier suit le tri à la source, la méthanisation, le biogaz, les digestats, les installations classées, les aides à l’investissement et les objectifs de production de gaz renouvelable.",
    status:"Actif",
    watch_keywords:["biodéchet","méthanisation","biogaz","déchet organique","digestat","gaz renouvelable","tri à la source","valorisation","ICPE","biométhane"],
    watch_priority_phrases:["tri à la source des biodéchets","production de biométhane","gaz renouvelable","méthanisation agricole"],
    watch_excluded_keywords:["déchet nucléaire"]
  },
  {
    client:"WorkFlex",
    title:"Travail indépendant et plateformes numériques",
    objective:"Défendre un cadre social adapté aux travailleurs indépendants utilisant des plateformes sans requalification automatique en salariat.",
    context:"Plateforme de services mettant en relation indépendants et clients. Le dossier couvre la directive européenne sur le travail de plateforme, le statut des indépendants, le dialogue social, la présomption de salariat, la protection sociale et les obligations algorithmiques des plateformes.",
    status:"Actif",
    watch_keywords:["travailleur indépendant","plateforme","salariat","indépendant","travail","algorithme","dialogue social","requalification","protection sociale","emploi"],
    watch_priority_phrases:["travail via une plateforme","présomption de salariat","travailleurs de plateformes","travail indépendant"],
    watch_excluded_keywords:["plateforme pétrolière","plateforme ferroviaire"]
  },
  {
    client:"AeroLink",
    title:"Aviation, décarbonation et carburants durables",
    objective:"Soutenir la compétitivité du transport aérien français tout en sécurisant une trajectoire réaliste de décarbonation.",
    context:"Compagnie aérienne européenne. Le dossier suit les taxes sur l’aérien, les carburants d’aviation durables, ReFuelEU Aviation, quotas carbone, infrastructures aéroportuaires, nuisances sonores et politiques de décarbonation du transport aérien.",
    status:"Actif",
    watch_keywords:["aviation","aérien","aéroport","SAF","carburant durable","ReFuelEU","compagnie aérienne","taxe aérienne","décarbonation","transport aérien"],
    watch_priority_phrases:["carburants d’aviation durables","transport aérien","ReFuelEU Aviation","taxe sur le transport aérien"],
    watch_excluded_keywords:["aéromodélisme"]
  },
  {
    client:"RailNova",
    title:"Ferroviaire, concurrence et infrastructures",
    objective:"Favoriser l’ouverture du marché ferroviaire et l’accès non discriminatoire aux infrastructures et capacités de circulation.",
    context:"Opérateur ferroviaire privé. Le dossier suit l’ouverture à la concurrence, les péages ferroviaires, les sillons, les gares, l’Autorité de régulation des transports, les contrats de service public et les investissements dans le réseau ferré.",
    status:"Actif",
    watch_keywords:["ferroviaire","train","rail","ART","péage ferroviaire","sillon","gare","SNCF Réseau","concurrence","transport ferroviaire"],
    watch_priority_phrases:["ouverture à la concurrence ferroviaire","péages ferroviaires","réseau ferré national","services ferroviaires"],
    watch_excluded_keywords:["train touristique miniature"]
  },
  {
    client:"IndusFab",
    title:"Réindustrialisation, aides d’État et compétitivité",
    objective:"Accroître l’attractivité industrielle française et sécuriser l’accès aux dispositifs de soutien à l’investissement productif.",
    context:"Groupe industriel implantant de nouvelles capacités de production en France. Le dossier suit France 2030, aides d’État, décarbonation industrielle, fiscalité de production, foncier industriel, simplification administrative et politique européenne de compétitivité.",
    status:"Actif",
    watch_keywords:["industrie","réindustrialisation","France 2030","usine","aide d’État","compétitivité","décarbonation industrielle","foncier industriel","investissement productif","fiscalité de production"],
    watch_priority_phrases:["réindustrialisation de la France","France 2030","aides d’État","décarbonation de l’industrie"],
    watch_excluded_keywords:["industrie cinématographique"]
  },
  {
    client:"Wateria",
    title:"Eau, sécheresse et réutilisation des eaux usées",
    objective:"Développer les solutions de réutilisation de l’eau et obtenir un cadre plus simple pour les projets industriels d’économie d’eau.",
    context:"Entreprise spécialisée dans le traitement et la réutilisation de l’eau. Le dossier suit le plan Eau, la REUT, les restrictions sécheresse, les prélèvements industriels, la qualité de l’eau, les agences de l’eau et les investissements de sobriété hydrique.",
    status:"Actif",
    watch_keywords:["eau","sécheresse","REUT","réutilisation","prélèvement","agence de l’eau","sobriété hydrique","traitement de l’eau","ressource en eau","restriction"],
    watch_priority_phrases:["réutilisation des eaux usées traitées","plan Eau","sobriété hydrique","gestion quantitative de l’eau"],
    watch_excluded_keywords:["eaux territoriales maritimes"]
  },
  {
    client:"FoodNext",
    title:"Nutrition, étiquetage et réglementation alimentaire",
    objective:"Anticiper les nouvelles obligations d’information nutritionnelle et préserver la capacité d’innovation des industriels alimentaires.",
    context:"Groupe agroalimentaire commercialisant des produits transformés en France et en Europe. Le dossier suit le Nutri-Score, l’étiquetage, les allégations nutritionnelles, la publicité alimentaire, les additifs, la composition des produits et les politiques de santé publique liées à l’alimentation.",
    status:"Actif",
    watch_keywords:["alimentaire","nutrition","Nutri-Score","étiquetage","aliment","additif","publicité alimentaire","santé publique","agroalimentaire","consommateur"],
    watch_priority_phrases:["information nutritionnelle","Nutri-Score","étiquetage des denrées alimentaires","publicité pour les produits alimentaires"],
    watch_excluded_keywords:["alimentation animale"]
  },
  {
    client:"CityFlow",
    title:"Collectivités, stationnement et mobilité locale",
    objective:"Accompagner les collectivités dans la modernisation des politiques de stationnement et de mobilité sans multiplier les contraintes techniques.",
    context:"Prestataire de solutions numériques pour collectivités locales. Le dossier suit le stationnement, les ZFE, les mobilités partagées, les données de mobilité, les appels d’offres publics, la voirie, les pouvoirs des maires et les politiques locales de circulation.",
    status:"Actif",
    watch_keywords:["collectivité","stationnement","maire","voirie","mobilité locale","ZFE","commune","appel d’offres","circulation","données de mobilité"],
    watch_priority_phrases:["stationnement payant","zone à faibles émissions","autorité organisatrice de la mobilité","mobilité des collectivités"],
    watch_excluded_keywords:["stationnement aéronautique"]
  }
];
