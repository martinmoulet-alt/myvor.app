"use client";

import {useEffect,useMemo,useState} from "react";
import UrgencyScoreModule from "./UrgencyScoreModule";

type ImpactProps=Parameters<typeof UrgencyScoreModule>[0];
type WorkflowContext={dossierId:string;watchIds:string[]};

const WORKFLOW_CONTEXT_KEY="myvor:workflow-context";

function normalizeWorkflowContext(value:unknown):WorkflowContext|null{
  if(!value||typeof value!=="object")return null;
  const candidate=value as {dossierId?:unknown;watchIds?:unknown};
  const dossierId=String(candidate.dossierId||"");
  if(!dossierId)return null;
  const rawIds=Array.isArray(candidate.watchIds)?candidate.watchIds:[];
  const watchIds=[...new Set(rawIds.map(id=>String(id||"")).filter(Boolean))];
  return{dossierId,watchIds};
}

function readWorkflowContext(){
  if(typeof window==="undefined")return null;
  try{
    const raw=sessionStorage.getItem(WORKFLOW_CONTEXT_KEY);
    return raw?normalizeWorkflowContext(JSON.parse(raw)):null;
  }catch{return null;}
}

export default function ImpactModule(props:ImpactProps){
  const[workflowContext,setWorkflowContext]=useState<WorkflowContext|null>(()=>readWorkflowContext());

  useEffect(()=>{
    const listener=(event:Event)=>setWorkflowContext(normalizeWorkflowContext((event as CustomEvent<unknown>).detail));
    window.addEventListener("myvor:workflow-context",listener);
    return()=>window.removeEventListener("myvor:workflow-context",listener);
  },[]);

  const watch=useMemo(()=>{
    if(!workflowContext?.dossierId||!workflowContext.watchIds.length)return props.watch;
    const focusIds=new Set(workflowContext.watchIds);
    return props.watch.map(item=>focusIds.has(item.id)?{...item,dossier_id:workflowContext.dossierId}:item);
  },[props.watch,workflowContext]);

  return <UrgencyScoreModule {...props} watch={watch}/>;
}
