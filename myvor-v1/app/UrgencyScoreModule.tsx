"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {saveProduction} from "@/lib/productions";
import {supabase} from "@/lib/supabase";
import {belongsToDossier} from "@/lib/watchMembership";
import styles from "./UrgencyScoreModule.module.css";

type CriterionKey="juridique"|"reglementaire"|"operationnel"|"reputationnel"|"fenetre_action"|"risque_inaction";
type TabKey="queue"|"analysis"|"justification"|"history";
type UrgencyBand="faible"|"moyen"|"fort"|"absolument urgent";
type Dossier={id:string;client:string;title:string;objective:string;context?:string;sector?:string|null;activity?:string|null;strategic_issues?:string[];risks_to_avoid?:string[];opportunities?:string[];client_position?:string|null;key_actors?:string[];key_deadlines?:string[];internal_notes?:string|null};
type Watch={id:string;title:string;nature:string;source_url?:string;dossier_id:string|null;dossier_ids?:string[]|null;urgency?:string;source_name?:string|null;published_at?:string|null;created_at?:string;qualification_reason?:string|null};
type ActionDraft={dossier_id:string;type:string;title:string;description?:string;priority:string;due_date?:string|null};
type CriterionResult={score:number;max:number;justification:string;evidence:string[]};
type UrgencySource={title:string;url:string;status:string};
type UrgencyResult={score:number;level:string;decision:string;action_needed:boolean;summary:string;criteria:Record<CriterionKey,CriterionResult>;workstreams:string[];next_actions:string[];uncertainties:string[];sources:UrgencySource[];watch_ids?:string[];mode?:string;engine?:string;model?:string;execution_ms?:number};
type ProductionRow={id:string;dossier_id:string;title:string;content:Record<string,unknown>;created_at:string};

const MODE="deep" as const;
const MAX_ITEMS=12;
const CRITERIA:{key:CriterionKey;label:string;max:number;description:string}[]=[
  {key:"juridique",label:"Juridique",max:15,description:"Effet sur les droits, obligations, responsabilités ou contentieux."},
  {key:"reglementaire",label:"Réglementaire",max:15,description:"Évolution de norme, procédure, conformité ou contrôle."},
  {key:"operationnel",label:"Opérationnel",max:20,description:"Conséquences concrètes sur l’activité et l’organisation du client."},
  {key:"reputationnel",label:"Réputationnel",max:15,description:"Exposition politique, médiatique, sectorielle ou parties prenantes."},
  {key:"fenetre_action",label:"Fenêtre d’action",max:20,description:"Temps et marge disponibles pour agir utilement avant le point de bascule."},
  {key:"risque_inaction",label:"Risque de ne pas agir",max:15,description:"Coût, perte d’option ou aggravation probable en cas d’inaction."},
];

function dateValue(item:Watch){const value=item.published_at||item.created_at||"";const time=Date.parse(value);return Number.isFinite(time)?time:0;}
function scoreBand(score:number):UrgencyBand{return score>=85?"absolument urgent":score>=70?"fort":score>=50?"moyen":"faible";}
function bandClass(band:UrgencyBand){return band==="absolument urgent"?styles.bandCritical:band==="fort"?styles.bandHigh:band==="moyen"?styles.bandMedium:styles.bandLow;}
function actionLabel(score:number){return score>=85?"Traiter immédiatement":score>=70?"Agir maintenant":score>=50?"Préparer et agir":"Surveiller";}
function priorityFromScore(score:number){return scoreBand(score);}
function safeNumber(value:unknown){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(100,Math.round(number))):null;}
function readContent(row:ProductionRow|null):UrgencyResult|null{
  if(!row)return null;
  const raw=row.content as any;
  const score=safeNumber(raw?.score);
  if(score===null)return null;
  return{
    score,
    level:String(raw?.level||scoreBand(score)),
    decision:String(raw?.decision||""),
    action_needed:Boolean(raw?.action_needed??score>=50),
    summary:String(raw?.summary||""),
    criteria:(raw?.criteria||{}) as Record<CriterionKey,CriterionResult>,
    workstreams:Array.isArray(raw?.workstreams)?raw.workstreams.map(String):[],
    next_actions:Array.isArray(raw?.next_actions)?raw.next_actions.map(String):[],
    uncertainties:Array.isArray(raw?.uncertainties)?raw.uncertainties.map(String):[],
    sources:Array.isArray(raw?.sources)?raw.sources.filter((source:any)=>source&&typeof source==="object").map((source:any)=>({title:String(source.title||"Source"),url:String(source.url||""),status:String(source.status||"source")})):[],
    watch_ids:Array.isArray(raw?.watch_ids)?raw.watch_ids.map(String).filter(Boolean):[],
    mode:String(raw?.mode||"deep"),
    engine:String(raw?.engine||""),
    model:String(raw?.model||""),
    execution_ms:Number(raw?.execution_ms)||undefined,
  };
}
function formatDate(value:string){const time=Date.parse(value);if(!Number.isFinite(time))return"Date inconnue";return new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(time));}
function sourceList(items:Watch[]):UrgencySource[]{return items.filter(item=>Boolean(item.source_url)).map(item=>({title:item.title,url:String(item.source_url),status:item.source_name||item.nature||"Source institutionnelle"}));}

async function edgeErrorMessage(error:any){
  let message=String(error?.message||"Le moteur Score d’urgence a échoué.");
  const context=error?.context;
  if(context&&typeof context.clone==="function"){
    try{const payload=await context.clone().json();if(payload?.error)message=String(payload.error);}catch{}
  }
  return message;
}

export default function UrgencyScoreModule({
  dossiers,
  watch,
  focusWatchIds=[],
  onActions,
  onOpenDossier,
  onOpenRadar,
  onCreateDeliverable,
}:{
  dossiers:Dossier[];
  watch:Watch[];
  focusWatchIds?:string[];
  onActions?:(drafts:ActionDraft[])=>Promise<void>|void;
  onOpenDossier?:(dossierId:string)=>void;
  onOpenRadar?:(dossierId:string,watchIds:string[])=>void;
  onCreateDeliverable?:(dossierId:string,watchIds:string[])=>void;
}){
  const[dossierId,setDossierId]=useState(dossiers[0]?.id||"");
  const[selectedIds,setSelectedIds]=useState<string[]|null>(focusWatchIds.length?[...new Set(focusWatchIds)]:null);
  const[tab,setTab]=useState<TabKey>(focusWatchIds.length?"analysis":"queue");
  const[loading,setLoading]=useState(false);
  const[historyLoading,setHistoryLoading]=useState(false);
  const[error,setError]=useState("");
  const[historyError,setHistoryError]=useState("");
  const[saveMessage,setSaveMessage]=useState("");
  const[result,setResult]=useState<UrgencyResult|null>(null);
  const[productions,setProductions]=useState<ProductionRow[]>([]);
  const[query,setQuery]=useState("");
  const[bandFilter,setBandFilter]=useState<"all"|UrgencyBand>("all");

  const dossier=dossiers.find(item=>item.id===dossierId)||null;
  const related=useMemo(()=>watch.filter(item=>belongsToDossier(item,dossierId)).sort((a,b)=>dateValue(b)-dateValue(a)),[watch,dossierId]);
  const focusForDossier=useMemo(()=>new Set(focusWatchIds.filter(id=>related.some(item=>item.id===id))),[focusWatchIds,related]);
  const defaultIds=useMemo(()=>focusForDossier.size?[...focusForDossier].slice(0,MAX_ITEMS):related.slice(0,MAX_ITEMS).map(item=>item.id),[focusForDossier,related]);
  const effectiveIds=selectedIds??defaultIds;
  const selected=related.filter(item=>effectiveIds.includes(item.id)).slice(0,MAX_ITEMS);

  const historyForDossier=useMemo(()=>productions.filter(item=>item.dossier_id===dossierId),[productions,dossierId]);
  const latestByDossier=useMemo(()=>{
    const map=new Map<string,ProductionRow>();
    for(const item of productions)if(!map.has(item.dossier_id))map.set(item.dossier_id,item);
    return map;
  },[productions]);
  const latestResult=readContent(historyForDossier[0]||null);
  const activeResult=result||latestResult;

  const queue=useMemo(()=>{
    return dossiers.map(item=>{
      const production=latestByDossier.get(item.id)||null;
      const saved=readContent(production);
      const score=saved?.score??null;
      return{
        dossier:item,
        production,
        score,
        band:score===null?null:scoreBand(score),
        attached:watch.filter(row=>belongsToDossier(row,item.id)).length,
        summary:saved?.summary||"",
        watchIds:saved?.watch_ids?.length?saved.watch_ids:watch.filter(row=>belongsToDossier(row,item.id)).sort((a,b)=>dateValue(b)-dateValue(a)).slice(0,MAX_ITEMS).map(row=>row.id),
      };
    }).filter(row=>{
      const haystack=`${row.dossier.client} ${row.dossier.title}`.toLowerCase();
      if(query.trim()&&!haystack.includes(query.trim().toLowerCase()))return false;
      if(bandFilter!=="all"&&row.band!==bandFilter)return false;
      return true;
    }).sort((a,b)=>{
      if(a.score===null&&b.score===null)return a.dossier.title.localeCompare(b.dossier.title,"fr");
      if(a.score===null)return 1;
      if(b.score===null)return-1;
      return b.score-a.score;
    });
  },[dossiers,latestByDossier,watch,query,bandFilter]);

  const metrics=useMemo(()=>{
    const scores=dossiers.map(item=>readContent(latestByDossier.get(item.id)||null)?.score).filter((value):value is number=>typeof value==="number");
    return{
      followed:dossiers.length,
      action:scores.filter(score=>score>=50).length,
      high:scores.filter(score=>score>=70).length,
      critical:scores.filter(score=>score>=85).length,
    };
  },[dossiers,latestByDossier]);

  useEffect(()=>{
    if(!dossierId&&dossiers[0]?.id)setDossierId(dossiers[0].id);
    if(dossierId&&!dossiers.some(item=>item.id===dossierId))setDossierId(dossiers[0]?.id||"");
  },[dossiers,dossierId]);

  useEffect(()=>{
    if(!focusWatchIds.length)return;
    const valid=focusWatchIds.filter(id=>related.some(item=>item.id===id)).slice(0,MAX_ITEMS);
    if(valid.length)setSelectedIds(valid);
  },[focusWatchIds,related]);

  const loadHistory=useCallback(async()=>{
    if(!supabase||!dossiers.length){setProductions([]);return;}
    setHistoryLoading(true);setHistoryError("");
    try{
      const ids=dossiers.map(item=>item.id);
      const{data,error:readError}=await supabase.from("productions").select("id,dossier_id,title,content,created_at").eq("type","urgency_score").in("dossier_id",ids).order("created_at",{ascending:false}).limit(300);
      if(readError)throw readError;
      setProductions((data||[]) as ProductionRow[]);
    }catch(err:any){setHistoryError(err?.message||"Impossible de charger l’historique des Scores.");}
    finally{setHistoryLoading(false);}
  },[dossiers]);

  useEffect(()=>{void loadHistory();},[loadHistory]);

  function reset(){setResult(null);setError("");setSaveMessage("");}
  function chooseDossier(id:string,nextTab:TabKey="analysis"){
    setDossierId(id);
    setSelectedIds(null);
    reset();
    setTab(nextTab);
  }
  function toggle(id:string){
    const base=effectiveIds;
    setSelectedIds(base.includes(id)?base.filter(value=>value!==id):[...base,id].slice(0,MAX_ITEMS));
    reset();
  }

  async function generate(){
    if(!dossier){setError("Sélectionne un dossier client.");return;}
    if(!selected.length){setError("Ce dossier doit avoir au moins un élément de veille rattaché et sélectionné.");return;}
    if(!supabase){setError("Supabase n’est pas configuré.");return;}
    setLoading(true);setError("");setSaveMessage("");setResult(null);
    try{
      const{data:sessionData}=await supabase.auth.getSession();
      const token=String(sessionData.session?.access_token||"");
      if(!token)throw new Error("Session Myvor expirée. Reconnecte-toi puis réessaie.");

      const{data:payload,error:functionError}=await supabase.functions.invoke("urgency-score-analysis",{
        body:{dossier,items:selected,mode:MODE},
        headers:{Authorization:`Bearer ${token}`},
      });
      if(functionError)throw new Error(await edgeErrorMessage(functionError));

      const next=payload?.result as UrgencyResult|undefined;
      if(!next||!Number.isFinite(Number(next.score)))throw new Error("Le Score d’urgence n’a pas été retourné.");
      const sources=sourceList(selected);
      const completeResult={...next,sources,watch_ids:selected.map(item=>item.id)} as UrgencyResult;
      setResult(completeResult);
      const title=`Score d’urgence — ${dossier.title}`;
      const saved=await saveProduction({
        dossier_id:dossier.id,
        type:"urgency_score",
        title,
        content:{
          score:completeResult.score,
          level:completeResult.level,
          urgency_band:scoreBand(completeResult.score),
          decision:completeResult.decision,
          action_needed:completeResult.action_needed,
          summary:completeResult.summary,
          criteria:completeResult.criteria,
          workstreams:completeResult.workstreams,
          next_actions:completeResult.next_actions,
          uncertainties:completeResult.uncertainties,
          sources,
          mode:MODE,
          engine:completeResult.engine||payload?.engine||null,
          model:completeResult.model||payload?.model||null,
          execution_ms:completeResult.execution_ms||payload?.execution_ms||null,
          watch_ids:selected.map(item=>item.id),
        },
      });
      if(saved.error)setSaveMessage(`Score calculé, mais non enregistré : ${saved.error.message}`);
      else{
        setSaveMessage("Score enregistré dans le dossier.");
        await loadHistory();
      }
      if(onActions&&completeResult.score>=50){
        await onActions([{
          dossier_id:dossier.id,
          type:"score_urgence",
          title:`${actionLabel(completeResult.score)} — ${dossier.title}`,
          description:completeResult.summary,
          priority:priorityFromScore(completeResult.score),
        }]);
      }
      setTab("analysis");
    }catch(err:any){setError(err?.message||"Calcul impossible.");}
    finally{setLoading(false);}
  }

  function exportScore(){
    if(!dossier||!activeResult)return;
    const payload={
      dossier:{id:dossier.id,client:dossier.client,title:dossier.title,objective:dossier.objective},
      score:activeResult.score,
      niveau:scoreBand(activeResult.score),
      decision:activeResult.decision,
      resume:activeResult.summary,
      criteres:activeResult.criteria,
      actions:activeResult.next_actions,
      incertitudes:activeResult.uncertainties,
      sources:activeResult.sources?.length?activeResult.sources:sourceList(selected),
      exported_at:new Date().toISOString(),
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`score-urgence-${dossier.title.toLowerCase().replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")||"dossier"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const criteriaTotal=activeResult?CRITERIA.reduce((sum,item)=>sum+Number(activeResult.criteria?.[item.key]?.score||0),0):0;
  const radarIds=selected.map(item=>item.id);
  const currentBand=activeResult?scoreBand(activeResult.score):null;
  const sourceWatchIds=new Set(activeResult?.watch_ids||[]);
  const currentSources=activeResult?.sources?.length?activeResult.sources:sourceList(sourceWatchIds.size?watch.filter(item=>sourceWatchIds.has(item.id)):result?selected:[]);

  return <div className={styles.page}>
    <header className={styles.head}>
      <div>
        <div className={styles.kicker}>Décision opérationnelle</div>
        <h1>Score d’urgence</h1>
        <p>Priorisez les dossiers qui nécessitent une action, comprenez le score et poursuivez immédiatement vers Radar, War Zone ou Note Builder.</p>
      </div>
      <div className={styles.headActions}>
        <button type="button" onClick={()=>void loadHistory()} disabled={historyLoading}><RefreshCw size={15}/>{historyLoading?"Actualisation…":"Actualiser"}</button>
        <button type="button" onClick={exportScore} disabled={!activeResult}><Download size={15}/>Exporter</button>
        {dossier&&onCreateDeliverable&&<button type="button" className={styles.goldButton} onClick={()=>onCreateDeliverable(dossier.id,radarIds)}><FileText size={15}/>Créer une note</button>}
      </div>
    </header>

    <section className={styles.metrics}>
      <article><span>Dossiers suivis</span><strong>{metrics.followed}</strong></article>
      <article><span>À traiter</span><strong>{metrics.action}</strong></article>
      <article><span>Fort / urgent</span><strong>{metrics.high}</strong></article>
      <article className={styles.criticalMetric}><span>Absolument urgents</span><strong>{metrics.critical}</strong></article>
    </section>

    <nav className={styles.tabs} aria-label="Score d’urgence">
      {([["queue","À traiter"],["analysis","Analyse"],["justification","Justification"],["history","Historique"]] as const).map(([id,label])=>
        <button type="button" key={id} className={tab===id?styles.tabActive:""} onClick={()=>setTab(id)}>{label}</button>
      )}
    </nav>

    {historyError&&<div className={styles.error}>{historyError}</div>}

    {tab==="queue"&&<section className={styles.queuePanel}>
      <div className={styles.filters}>
        <label className={styles.searchField}><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher un dossier ou un client"/></label>
        <label className={styles.filterField}>Niveau
          <select value={bandFilter} onChange={event=>setBandFilter(event.target.value as "all"|UrgencyBand)}>
            <option value="all">Tous</option>
            <option value="faible">Faible</option>
            <option value="moyen">Moyen</option>
            <option value="fort">Fort</option>
            <option value="absolument urgent">Absolument urgent</option>
          </select>
        </label>
      </div>
      <div className={styles.legend} aria-label="Code couleur">
        {(["faible","moyen","fort","absolument urgent"] as UrgencyBand[]).map(band=><span key={band}><i className={bandClass(band)}/>{band}</span>)}
      </div>
      {queue.length?<div className={styles.queueList}>{queue.map(item=>{
        const band=item.band;
        return <article key={item.dossier.id} className={`${styles.queueCard} ${band?bandClass(band):styles.bandUnset}`}>
          <div className={styles.queueMain}>
            <div className={styles.queueTitle}><div><span>{item.dossier.client}</span><h2>{item.dossier.title}</h2></div>{item.score!==null?<div className={`${styles.scoreBadge} ${bandClass(band!)}`}><strong>{item.score}</strong><span>{band}</span></div>:<div className={styles.unscored}>À calculer</div>}</div>
            <p>{item.summary||item.dossier.objective}</p>
            <div className={styles.queueMeta}><span><FileText size={13}/>{item.attached} élément(s) de veille rattaché(s)</span>{item.production&&<span><Clock3 size={13}/>Calculé {formatDate(item.production.created_at)}</span>}</div>
            {item.score!==null&&<div className={styles.recommended}><b>Action recommandée</b><span>{actionLabel(item.score)}</span></div>}
          </div>
          <div className={styles.queueActions}>
            <button type="button" onClick={()=>chooseDossier(item.dossier.id,"analysis")}>Voir l’analyse<ArrowRight size={14}/></button>
            {onOpenDossier&&<button type="button" className={styles.secondaryButton} onClick={()=>onOpenDossier(item.dossier.id)}><BriefcaseBusiness size={14}/>Dossier</button>}
            {onOpenRadar&&item.score!==null&&<button type="button" className={styles.secondaryButton} onClick={()=>onOpenRadar(item.dossier.id,item.watchIds)}><Radar size={14}/>Radar / War Zone</button>}
          </div>
        </article>;
      })}</div>:<div className={styles.empty}><Search size={26}/><b>Aucun dossier correspondant</b><span>Modifie la recherche ou le filtre d’urgence.</span></div>}
    </section>}

    {tab==="analysis"&&<section className={styles.analysisPanel}>
      <section className={styles.workflow}>
        <div className={styles.card}>
          <div className={styles.step}><span>1</span><div><b>Dossier client</b><small>Le score mesure l’urgence par rapport à l’objectif du client, pas l’importance générale du texte.</small></div></div>
          <label className={styles.field}>Dossier
            <select value={dossierId} onChange={event=>chooseDossier(event.target.value,"analysis")}><option value="">Sélectionner</option>{dossiers.map(item=><option key={item.id} value={item.id}>{item.client} — {item.title}</option>)}</select>
          </label>
          {dossier&&<div className={styles.objective}><Target size={17}/><div><b>Objectif client</b><p>{dossier.objective}</p></div></div>}
        </div>
        <div className={styles.card}>
          <div className={styles.step}><span>2</span><div><b>Veille rattachée</b><small>12 éléments maximum. Un contexte reçu depuis la Veille est conservé automatiquement.</small></div></div>
          {related.length?<div className={styles.watchList}>{related.slice(0,24).map(item=><label key={item.id} className={styles.watchRow}><input type="checkbox" checked={effectiveIds.includes(item.id)} onChange={()=>toggle(item.id)}/><div><span>{item.nature}</span><b>{item.title}</b><small>{item.source_name||item.urgency||"Source institutionnelle"}</small></div></label>)}</div>:<div className={styles.empty}><AlertTriangle size={26}/><b>Aucune veille rattachée</b><span>Rattache d’abord un élément de veille à ce dossier.</span></div>}
        </div>
      </section>

      <section className={styles.criteriaPreview}>{CRITERIA.map(item=><article key={item.key}><div><b>{item.label}</b><strong>/{item.max}</strong></div><p>{item.description}</p></article>)}</section>

      <section className={styles.launch}>
        <div><Sparkles size={21}/><div><b>{selected.length} élément(s) de veille prêts</b><span>Myvor calcule les six critères, justifie chaque note et enregistre le résultat.</span></div></div>
        <button type="button" onClick={generate} disabled={loading||!dossier||!selected.length}>{loading?"Analyse approfondie en cours…":"Calculer le Score d’urgence"}</button>
      </section>
      {error&&<div className={styles.error}>{error}</div>}
      {saveMessage&&<div className={styles.notice}>{saveMessage}</div>}

      {activeResult&&<section className={styles.result}>
        <div className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>Décision Myvor</div>
            <h2>{activeResult.action_needed?"Une action est nécessaire":"Pas d’action immédiate requise"}</h2>
            <p>{activeResult.summary}</p>
            <div className={`${styles.decision} ${bandClass(currentBand!)}`}>{currentBand} · {actionLabel(activeResult.score)}</div>
          </div>
          <div className={`${styles.score} ${bandClass(currentBand!)}`}><span>Score d’urgence</span><strong>{Math.round(activeResult.score)}</strong><small>/100</small><em>{criteriaTotal===Math.round(activeResult.score)?"6 critères cohérents":"Total recalculé par Myvor"}</em></div>
        </div>

        <div className={styles.criteriaGrid}>{CRITERIA.map(item=>{const criterion=activeResult.criteria?.[item.key];return <article key={item.key} className={styles.criterion}><div className={styles.criterionTop}><div><span>{item.label}</span><b>{criterion?.score??0}<small>/{item.max}</small></b></div><div className={styles.track}><i style={{width:`${Math.max(0,Math.min(100,((criterion?.score||0)/item.max)*100))}%`}}/></div></div><p>{criterion?.justification||"Justification indisponible."}</p>{criterion?.evidence?.length?<div className={styles.evidence}><strong>Éléments utilisés</strong>{criterion.evidence.map((value,index)=><span key={`${item.key}-${index}`}><FileText size={12}/>{value}</span>)}</div>:null}</article>;})}</div>

        {activeResult.workstreams?.length?<section className={styles.section}><h3>Pistes de travail</h3><div className={styles.list}>{activeResult.workstreams.map((item,index)=><div key={index}><span>{index+1}</span><p>{item}</p></div>)}</div></section>:null}
        {activeResult.next_actions?.length?<section className={styles.section}><h3>Actions immédiates</h3><div className={styles.list}>{activeResult.next_actions.map((item,index)=><div key={index}><span>{index+1}</span><p>{item}</p></div>)}</div></section>:null}
        {activeResult.uncertainties?.length?<section className={styles.section}><h3>Points à confirmer</h3><div className={styles.list}>{activeResult.uncertainties.map((item,index)=><div key={index}><span>?</span><p>{item}</p></div>)}</div></section>:null}

        <div className={styles.next}>
          <div><b>Continuer le workflow</b><span>Radar identifie les acteurs, War Zone structure la stratégie, Note Builder produit le livrable.</span></div>
          <div>{onOpenDossier&&dossier&&<button type="button" className={styles.secondaryButton} onClick={()=>onOpenDossier(dossier.id)}><BriefcaseBusiness size={16}/>Dossier</button>}{onOpenRadar&&dossier&&<button type="button" onClick={()=>onOpenRadar(dossier.id,radarIds)}><Radar size={16}/>Radar & War Zone<ArrowRight size={15}/></button>}{onCreateDeliverable&&dossier&&<button type="button" className={styles.secondaryButton} onClick={()=>onCreateDeliverable(dossier.id,radarIds)}><FileText size={16}/>Note Builder</button>}</div>
        </div>
      </section>}
    </section>}

    {tab==="justification"&&<section className={styles.justificationPanel}>
      <div className={styles.justificationHead}>
        <div><div className={styles.eyebrow}>Explicabilité</div><h2>Pourquoi Myvor considère-t-il ce dossier urgent ?</h2></div>
        <label className={styles.field}>Dossier<select value={dossierId} onChange={event=>chooseDossier(event.target.value,"justification")}><option value="">Sélectionner</option>{dossiers.map(item=><option key={item.id} value={item.id}>{item.client} — {item.title}</option>)}</select></label>
      </div>
      {activeResult&&dossier?<div className={styles.justificationGrid}>
        <article><span>01</span><div><b>Ce qui s’est passé</b><p>{selected.length?`${selected.length} évolution(s) rattachée(s) ont été retenues dans le calcul : ${selected.slice(0,3).map(item=>item.title).join(" ; ")}${selected.length>3?"…":""}`:"Le score enregistré repose sur la veille rattachée lors de son calcul."}</p></div></article>
        <article><span>02</span><div><b>Ce que cela change pour le dossier</b><p>{activeResult.summary||"Résumé indisponible."}</p></div></article>
        <article><span>03</span><div><b>Pourquoi agir maintenant</b><p>{activeResult.next_actions?.[0]||`${actionLabel(activeResult.score)} : le score atteint ${activeResult.score}/100 au regard de l’objectif client.`}</p></div></article>
      </div>:<div className={styles.empty}><AlertTriangle size={26}/><b>Aucun Score disponible</b><span>Calcule d’abord le Score d’urgence de ce dossier.</span></div>}

      {activeResult&&<section className={styles.sourceSection}>
        <h3>Sources utilisées</h3>
        {currentSources.length?<div className={styles.sourceList}>{currentSources.map((source,index)=><a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><div><b>{source.title}</b><span>{source.status}</span></div><ExternalLink size={15}/></a>)}</div>:<p className={styles.muted}>Les sources du calcul précédent ne sont pas disponibles dans cet enregistrement. Relance le Score pour les enregistrer.</p>}
      </section>}
    </section>}

    {tab==="history"&&<section className={styles.historyPanel}>
      <div className={styles.historyHead}>
        <div><div className={styles.eyebrow}>Traçabilité</div><h2>Historique du Score</h2></div>
        <label className={styles.field}>Dossier<select value={dossierId} onChange={event=>chooseDossier(event.target.value,"history")}><option value="">Sélectionner</option>{dossiers.map(item=><option key={item.id} value={item.id}>{item.client} — {item.title}</option>)}</select></label>
      </div>
      {historyLoading?<div className={styles.empty}><RefreshCw size={24}/><b>Chargement des Scores…</b></div>:historyForDossier.length?<div className={styles.timeline}>{historyForDossier.map(row=>{const saved=readContent(row);if(!saved)return null;const band=scoreBand(saved.score);return <article key={row.id}><i className={bandClass(band)}/><div className={styles.timelineCard}><div><time>{formatDate(row.created_at)}</time><span className={`${styles.historyBadge} ${bandClass(band)}`}>{saved.score}/100 · {band}</span></div><p>{saved.summary||row.title}</p><button type="button" onClick={()=>{setResult(saved);setTab("analysis");}}>Ouvrir cette analyse<ArrowRight size={13}/></button></div></article>;})}</div>:<div className={styles.empty}><Clock3 size={26}/><b>Aucun historique</b><span>Le premier calcul apparaîtra ici automatiquement.</span></div>}
    </section>}
  </div>;
}
