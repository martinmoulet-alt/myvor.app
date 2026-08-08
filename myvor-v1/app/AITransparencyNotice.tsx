"use client";

import {useEffect} from "react";

const AI_HEADINGS=new Set(["Note d’impact","Radar d’influence","Note Builder"]);

export default function AITransparencyNotice(){
  useEffect(()=>{
    const marker="myvor-ai-transparency-notice";
    const sync=()=>{
      const heading=Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find(node=>AI_HEADINGS.has((node.textContent||"").trim()));
      const host=heading?.parentElement||null;
      const badges=Array.from(document.querySelectorAll<HTMLElement>(`.${marker}`));
      if(!host){for(const node of badges)node.remove();return;}
      const current=badges.find(node=>node.parentElement===host);
      for(const node of badges)if(node!==current)node.remove();
      if(current)return;
      const badge=document.createElement("span");
      badge.className=marker;
      badge.textContent="Analyse assistée par IA · vérification humaine requise avant usage externe";
      badge.setAttribute("role","status");
      Object.assign(badge.style,{display:"inline-flex",alignItems:"center",marginTop:"8px",padding:"5px 9px",borderRadius:"999px",border:"1px solid rgba(213,168,62,.38)",background:"rgba(213,168,62,.10)",color:"#9b7418",fontSize:"11px",fontWeight:"800",lineHeight:"1.25",letterSpacing:".01em"});
      host.appendChild(badge);
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();document.querySelectorAll(`.${marker}`).forEach(node=>node.remove());};
  },[]);
  return null;
}
