type ImpactDepth="express"|"standard"|"deep";
type PreparedLike={
  depth?:ImpactDepth;
  dossier?:{title?:string;objective?:string;key_deadlines?:string[]};
  items?:Array<{id?:string;title?:string;nature?:string;urgency?:string;source_url?:string}>;
  traces?:Array<{url?:string;resolved_url?:string;status?:string;read_chars?:number;format?:string;fetched_at?:string;content_hash?:string}>;
  official_sources_requested?:number;
  official_sources_fetched?:number;
  profile?:{fields?:string[]};
  selection?:{requested_ids?:string[];analyzed_ids?:string[];omitted_ids?:string[];max_items?:number;max_urls?:number};
};

function text(value:unknown,max=500){return typeof value==="string"?value.replace(/\s+/g," ").trim().slice(0,max):"";}
function finite(value:unknown){const n=Number(value);return Number.isFinite(n)?Math.max(0,n):0;}
function urgencyLevel(items:PreparedLike["items"]){
  const values=(items||[]).map(item=>text(item?.urgency,80).toLowerCase());
  if(values.includes("absolument urgent"))return"immediate";
  if(values.includes("fort"))return"urgente";
  if(values.includes("moyen"))return"a_surveille";
  return"faible";
}

export function buildContinuityImpact(prepared:PreparedLike,reason="Analyse IA indisponible"){
  if(!prepared||typeof prepared!=="object"||!prepared.dossier||!Array.isArray(prepared.items))throw new Error("Préparation de Note invalide pour le mode continuité.");
  const depth:ImpactDepth=["express","standard","deep"].includes(String(prepared.depth))?prepared.depth as ImpactDepth:"standard";
  const items=prepared.items.slice(0,12);
  const traces=Array.isArray(prepared.traces)?prepared.traces:[];
  const requested=finite(prepared.official_sources_requested);
  const fetched=finite(prepared.official_sources_fetched);
  const sourceCoverage=requested>0?Math.min(1,fetched/requested):0;
  const missing=items.filter((_,index)=>traces[index]?.status!=="fetched").map(item=>text(item?.title,220)).filter(Boolean).slice(0,5);
  const dossierTitle=text(prepared.dossier.title,300)||"Dossier";
  const objective=text(prepared.dossier.objective,900)||"Objectif client non renseigné";
  const reasonText=text(reason,500)||"Analyse IA indisponible";
  const deadlines=Array.isArray(prepared.dossier.key_deadlines)?prepared.dossier.key_deadlines.map(value=>text(value,300)).filter(Boolean).slice(0,4):[];
  const sources=items.map((item,index)=>({title:text(item?.title,300)||`Source ${index+1}`,...(traces[index]||{url:text(item?.source_url,900),status:item?.source_url?"not_requested":"missing_url",read_chars:0})}));
  const recommendations=[
    "Relancer l’analyse IA complète avant toute diffusion client ou décision fondée sur le score.",
    fetched<requested?"Vérifier les sources institutionnelles que Myvor n’a pas pu lire pendant cette génération.":"Contrôler manuellement les dispositions et les effets client avant validation.",
    "Conserver ce livrable comme note de continuité : il garantit l’accès au dossier et aux sources, mais ne remplace pas l’analyse complète.",
  ];
  const confirmations=[
    "Score d’impact complet à recalculer : le mode continuité n’attribue volontairement aucun score analytique.",
    "Risques, opportunités et dispositions concernées à confirmer par l’analyse IA complète ou une revue humaine.",
    ...missing.map(title=>`Contenu à vérifier manuellement : ${title}.`),
  ];
  const zeroDetail={juridique:0,economique_operationnel:0,urgence:0,probabilite:0,politique_reputation:0,capacite_action:0};
  const unavailable="Non calculé en mode continuité : aucune inférence n’est produite sans analyse IA complète.";
  const scoreJustifications={juridique:unavailable,economique_operationnel:unavailable,urgence:unavailable,probabilite:unavailable,politique_reputation:unavailable,capacite_action:unavailable};
  const quality={
    status:"insufficient_sources" as const,
    label:"Mode continuité — analyse IA à relancer",
    can_validate:false,
    source_coverage:sourceCoverage,
    score_evidence_coverage:0,
    disposition_coverage:0,
    overall_coverage:Math.round(sourceCoverage*.45*100)/100,
    reasons:[`Génération IA non finalisée : ${reasonText}`,"Myvor a produit un livrable de continuité sans inventer de score ni de conclusions."],
  };
  return{
    note:{
      title:`Note d’impact ${depth==="deep"?"approfondie":depth} — ${dossierTitle} · mode continuité`,
      executive_summary:`Mode continuité activé. L’analyse IA complète n’a pas pu être finalisée (${reasonText}). Myvor conserve néanmoins ${items.length} texte(s) sélectionné(s) et ${fetched} source(s) officielle(s) effectivement lue(s) sur ${requested}. Objectif du client : ${objective}. Aucun score, risque ou opportunité n’est inventé dans ce mode.`,
      score:0,
      score_available:false,
      continuity_mode:true,
      degraded_reason:reasonText,
      impact_level:"à confirmer",
      urgency_level:urgencyLevel(items),
      level:"à confirmer",
      rationale:"Score non calculé. La valeur technique 0 ne signifie pas un impact faible : elle indique que l’analyse complète doit être relancée.",
      risks:[],opportunities:[],deadlines,recommendations,sources_used:sources,
      score_detail:zeroDetail,score_detail_proposed:zeroDetail,score_adjustments:[],score_justifications:scoreJustifications,score_evidence:{},
      dispositions_concernees:[],informations_a_confirmer:confirmations,quality,
      section_kinds:{risks:"unavailable",opportunities:"unavailable",deadlines:"dossier_fact",recommendations:"continuity"},depth,
    },
    engine:"myvor-impact-continuity-v1",model:"none",depth,
    grounding:{official_sources_requested:requested,official_sources_fetched:fetched,statuses:traces,strategic_profile_used:Array.isArray(prepared.profile?.fields)&&prepared.profile!.fields!.length>0,strategic_profile_fields:prepared.profile?.fields||[],execution_mode:"deterministic_continuity_fallback",quality,selection:prepared.selection||null},
    selection:prepared.selection||null,
    continuity:{active:true,reason:reasonText},
  };
}
