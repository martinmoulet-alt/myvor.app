"use client";

import {useEffect,useMemo} from "react";
import {AlertTriangle,RefreshCw} from "lucide-react";
import type {DossierForImpact,WatchForImpact} from "@/lib/impactTypes";
import styles from "./ImpactCorporate.module.css";

export type ImpactAssignment={watch_id:string;dossier_id:string|null;confidence:number;reason:string};
export type ImpactCandidate={item:WatchForImpact;confidence:number|null;reason:string;linked:boolean;source:"linked"|"live"|"persisted";dossierId:string};

const RELEVANCE_THRESHOLD=.60;
const DEFAULT_SELECTION_THRESHOLD=.75;
const WORKFLOW_CONTEXT_KEY="myvor:workflow-context";

function watchTime(item:WatchForImpact){const published=item.published_at?Date.parse(item.published_at):NaN;if(Number.isFinite(published))return published;const created=item.created_at?Date.parse(item.created_at):NaN;return Number.isFinite(created)?created:0;}
function urgencyRank(value:string){return value==="absolument urgent"?4:value==="fort"?3:value==="moyen"?2:1;}

export function buildImpactCandidates(allWatch:WatchForImpact[],dossierId:string,assignments:ImpactAssignment[]){
  const live=new Map(assignments.filter(result=>result.dossier_id===dossierId&&Number(result.confidence)>=RELEVANCE_THRESHOLD).map(result=>[result.watch_id,result]));
  return allWatch.map(item=>{
    const linked=item.dossier_id===dossierId;
    if(item.dossier_id&&item.dossier_id!==dossierId)return null;
    const liveMatch=live.get(item.id);
    const persisted=!item.dossier_id&&item.suggested_dossier_id===dossierId&&Number(item.qualification_confidence)>=RELEVANCE_THRESHOLD;
    if(!linked&&!liveMatch&&!persisted)return null;
    const confidence=liveMatch?Number(liveMatch.confidence):persisted?Number(item.qualification_confidence):null;
    const reason=liveMatch?.reason||item.qualification_reason||(linked?"Évolution déjà rattachée à ce dossier.":"Correspondance détectée par Myvor.");
    return{item,confidence,reason,linked,source:linked?"linked":liveMatch?"live":"persisted",dossierId} as ImpactCandidate;
  }).filter((candidate):candidate is ImpactCandidate=>Boolean(candidate)).sort((a,b)=>{
    const confidence=(b.confidence??(b.linked?1:0))-(a.confidence??(a.linked?1:0));if(confidence)return confidence;
    const urgency=urgencyRank(b.item.urgency)-urgencyRank(a.item.urgency);if(urgency)return urgency;
    return watchTime(b.item)-watchTime(a.item);
  });
}

export function defaultImpactSelection(candidates:ImpactCandidate[]){
  return candidates.filter(candidate=>candidate.linked||Number(candidate.confidence)>=DEFAULT_SELECTION_THRESHOLD).map(candidate=>candidate.item.id);
}

export function useImpactRelevance({dossier,allWatch,onResults,onLoading,onMessage,revision}:{dossier:DossierForImpact|null;allWatch:WatchForImpact[];onResults:(results:ImpactAssignment[])=>void;onLoading:(value:boolean)=>void;onMessage:(value:string)=>void;revision:number}){
  const key=useMemo(()=>dossier?`${dossier.id}|${allWatch.length}|${revision}`:"",[dossier?.id,allWatch.length,revision]);
  useEffect(()=>{
    if(!dossier){onResults([]);onMessage("");onLoading(false);return;}
    let cancelled=false;
    const timer=setTimeout(async()=>{
      const candidates=[...allWatch].filter(item=>!item.dossier_id||item.dossier_id===dossier.id).sort((a,b)=>watchTime(b)-watchTime(a)).slice(0,40);
      if(!candidates.length){if(!cancelled){onResults([]);onMessage("Aucune publication disponible à comparer avec ce dossier.");onLoading(false);}return;}
      onLoading(true);onMessage("Myvor recherche les évolutions réellement pertinentes pour ce dossier…");
      try{
        const dossierAny=dossier as DossierForImpact&{watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[]};
        const payloadDossier={id:dossier.id,title:dossier.title,objective:dossier.objective,context:dossier.context||"",watch_keywords:dossierAny.watch_keywords||[],watch_priority_phrases:dossierAny.watch_priority_phrases||[],watch_excluded_keywords:dossierAny.watch_excluded_keywords||[]};
        const results:ImpactAssignment[]=[];
        for(let start=0;start<candidates.length;start+=20){
          const batch=candidates.slice(start,start+20);
          const response=await fetch("/api/veille/assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:batch.map(item=>({id:item.id,title:item.title,nature:item.nature,source_url:item.source_url})),dossiers:[payloadDossier]})});
          const payload=await response.json();
          if(!response.ok)throw new Error(payload?.error||"Analyse de pertinence impossible");
          if(Array.isArray(payload.assignments))results.push(...payload.assignments as ImpactAssignment[]);
        }
        const matches=results.filter(result=>result.dossier_id===dossier.id&&Number(result.confidence)>=RELEVANCE_THRESHOLD);
        if(!cancelled){onResults(matches);onMessage(matches.length?`${matches.length} évolution(s) pertinente(s) détectée(s). Les plus fortes sont présélectionnées pour l’analyse.`:"Aucune évolution récente n’atteint 60 % de pertinence pour ce dossier.");}
      }catch(error:any){if(!cancelled){onResults([]);onMessage(`Détection indisponible : ${error?.message||"erreur inconnue"}. Les textes déjà rattachés restent utilisables.`);}}
      finally{if(!cancelled)onLoading(false);}
    },250);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[key]);
}

export default function ImpactWatchSelector({candidates,effectiveIds,loading,message,toggle,recalculate}:{candidates:ImpactCandidate[];effectiveIds:string[];loading:boolean;message:string;toggle:(id:string)=>void;recalculate:()=>void}){
  const dossierId=candidates[0]?.dossierId||"";
  const contextKey=`${dossierId}|${effectiveIds.join("|")}`;
  useEffect(()=>{
    if(!dossierId)return;
    const detail={dossierId,watchIds:[...new Set(effectiveIds)]};
    sessionStorage.setItem(WORKFLOW_CONTEXT_KEY,JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent("myvor:workflow-context",{detail}));
  },[contextKey]);

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:10}}><div style={{fontSize:12,color:"#526278",lineHeight:1.45}}>{message}</div><button type="button" onClick={recalculate} disabled={loading} style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #d9e2ee",background:"white",color:"#17324f",borderRadius:9,padding:"7px 9px",fontWeight:800,fontSize:11,cursor:loading?"wait":"pointer"}}><RefreshCw size={13} className={loading?"impact-relevance-spin":""}/>{loading?"Analyse…":"Recalculer"}</button></div>
    {candidates.length?<div className={styles.watchList}>{candidates.map(candidate=>{const item=candidate.item;const score=candidate.confidence!=null?Math.round(candidate.confidence*100):null;return <label key={item.id} className={styles.watchItem}><input type="checkbox" checked={effectiveIds.includes(item.id)} onChange={()=>toggle(item.id)}/><div className={styles.watchCopy}><div><span className={styles.nature}>{item.nature}</span><span className={`${styles.impact} ${styles[item.urgency.replaceAll(" ","-") as keyof typeof styles]||""}`}>{item.urgency}</span><span style={{fontSize:10,fontWeight:850,color:candidate.linked?"#16714e":"#725a00",background:candidate.linked?"#eaf8f1":"#fff7d8",borderRadius:999,padding:"3px 7px"}}>{candidate.linked?"Rattachée au dossier":`Pertinence ${score??"—"} %`}</span></div><b>{item.title}</b><small style={{display:"block",marginTop:5,color:"#6a788b",lineHeight:1.4}}>{candidate.reason}</small></div></label>})}</div>:<div className={styles.empty}><AlertTriangle size={28}/><b>{loading?"Recherche des évolutions pertinentes…":"Aucune évolution pertinente"}</b><span>{loading?"Myvor compare les publications récentes avec l’objectif et les paramètres du dossier.":"Aucune publication récente n’atteint actuellement le seuil de pertinence requis."}</span></div>}
    <style jsx global>{`.impact-relevance-spin{animation:impact-relevance-spin 1s linear infinite}@keyframes impact-relevance-spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}
