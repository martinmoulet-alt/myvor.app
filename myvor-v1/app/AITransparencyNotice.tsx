"use client";

import {useEffect} from "react";

const AI_HEADINGS=new Set(["Note d’impact","Radar d’influence","Note Builder"]);

export default function AITransparencyNotice(){
  useEffect(()=>{
    const marker="myvor-ai-transparency-notice";
    const sync=()=>{
      document.querySelectorAll(`.${marker}`).forEach(node=>node.remove());
      const heading=Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find(node=>AI_HEADINGS.has((node.textContent||"").trim()));
      if(!heading)return;
      const host=heading.parentElement;
      if(!host)return;
      const badge=document.createElement("span");
      badge.className=marker;
      badge.textContent="Analyse assistée par IA · vérification humaine requise avant usage externe";
      badge.setAttribute("role","status");
      Object.assign(badge.style,{display:"inline-flex",alignItems:"center",marginTop:"8px",padding:"5px 9px",borderRadius:"999px",border:"1px solid rgba(213,168,62,.38)",background:"rgba(213,168,62,.10)",color:"#9b7418",fontSize:"11px",fontWeight:"800",lineHeight:"1.25",letterSpacing:".01em"});
      host.appendChild(badge);
    };
    sync();
    const observer=new MutationObserver(()=>sync());
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();document.querySelectorAll(`.${marker}`).forEach(node=>node.remove());};
  },[]);
  return null;
}
