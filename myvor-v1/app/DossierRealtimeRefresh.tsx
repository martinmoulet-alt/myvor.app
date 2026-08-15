"use client";

import {useEffect,useRef} from "react";
import {supabase} from "@/lib/supabase";

export default function DossierRealtimeRefresh(){
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>{
    if(!supabase)return;
    const channel=supabase
      .channel("myvor:dossiers-refresh")
      .on("postgres_changes",{event:"*",schema:"public",table:"dossiers"},()=>{
        if(timer.current)clearTimeout(timer.current);
        timer.current=setTimeout(()=>window.dispatchEvent(new Event("pageshow")),180);
      })
      .subscribe();

    return()=>{
      if(timer.current)clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  },[]);

  return null;
}
