"use client";

import {useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";

type WatchLike={id:string;created_at:string;published_at?:string|null};
export type SemanticWatchRank={id:string;score:number;semantic_similarity:number;reason:string};
type Status="idle"|"loading"|"ready"|"fallback";

const CACHE_TTL=5*60*1000;

function safeTime(value:string|null|undefined){const time=value?Date.parse(value):0;return Number.isFinite(time)?time:0;}
function cleanList(value:string[]|null|undefined){return Array.isArray(value)?value.filter(Boolean):[];}

export function useSemanticWatchFeed({watch,currentUserId,activeOrganizationId,pinnedDossierId,topics,institutions}:{watch:WatchLike[];currentUserId:string;activeOrganizationId:string;pinnedDossierId:string;topics:string[]|null|undefined;institutions:string[]|null|undefined}){
  const[ranks,setRanks]=useState<SemanticWatchRank[]>([]);
  const[status,setStatus]=useState<Status>("idle");
  const watchVersion=useMemo(()=>Math.max(0,...watch.map(item=>safeTime(item.published_at||item.created_at))),[watch]);
  const profileKey=useMemo(()=>[...cleanList(topics),"|",...cleanList(institutions)].join("~").slice(0,500),[topics,institutions]);

  useEffect(()=>{
    if(!supabase||!currentUserId||!activeOrganizationId||!watch.length){setRanks([]);setStatus("idle");return;}
    let active=true;
    const cacheKey=`myvor:semantic-feed:v1:${activeOrganizationId}:${pinnedDossierId||"auto"}:${profileKey}`;
    try{
      const cached=JSON.parse(sessionStorage.getItem(cacheKey)||"null");
      const rows=Array.isArray(cached?.ranks)?cached.ranks:[];
      if(cached&&Date.now()-Number(cached.at||0)<CACHE_TTL&&rows.some((row:SemanticWatchRank)=>watch.some(item=>item.id===row.id))){setRanks(rows);setStatus("ready");return()=>{active=false;};}
    }catch{}
    setStatus("loading");
    async function load(){
      const{data,error}=await supabase!.functions.invoke("personalized-feed",{body:{limit:6}});
      if(!active)return;
      const rows=Array.isArray(data?.items)?data.items.filter((item:any)=>item&&typeof item.id==="string").map((item:any)=>({id:item.id,score:Number(item.score)||0,semantic_similarity:Number(item.semantic_similarity)||0,reason:String(item.reason||"")})):[];
      if(error||!rows.length){setRanks([]);setStatus("fallback");return;}
      setRanks(rows);setStatus("ready");
      try{sessionStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),ranks:rows}));}catch{}
    }
    void load();
    return()=>{active=false;};
  },[currentUserId,activeOrganizationId,pinnedDossierId,profileKey,watch.length,watchVersion]);

  const metaById=useMemo(()=>new Map(ranks.map(item=>[item.id,item])),[ranks]);
  return{ranks,status,metaById};
}
