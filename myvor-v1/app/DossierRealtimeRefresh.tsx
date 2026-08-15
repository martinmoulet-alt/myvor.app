"use client";

import {useEffect,useRef} from "react";
import {supabase} from "@/lib/supabase";

export default function DossierRealtimeRefresh(){
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const scanned=useRef(new Set<string>());

  useEffect(()=>{
    const client=supabase;
    if(!client)return;

    const refresh=()=>{
      if(timer.current)clearTimeout(timer.current);
      timer.current=setTimeout(()=>window.dispatchEvent(new Event("pageshow")),180);
    };

    const buildCorpus=(payload:any)=>{
      const dossierId=String(payload?.new?.id||"");
      if(!dossierId||scanned.current.has(dossierId))return;
      scanned.current.add(dossierId);
      void client.functions.invoke("scan-dossier-history",{body:{dossier_id:dossierId}}).then(()=>refresh()).catch(()=>{});
    };

    const channel=client
      .channel("myvor:dossiers-refresh")
      .on("postgres_changes",{event:"*",schema:"public",table:"dossiers"},refresh)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"dossiers"},buildCorpus)
      .subscribe();

    return()=>{
      if(timer.current)clearTimeout(timer.current);
      void client.removeChannel(channel);
    };
  },[]);

  return null;
}
