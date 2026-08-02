"use client";

import { useEffect } from "react";

export default function PwaRegister(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;

    let refreshing=false;
    let registration:ServiceWorkerRegistration|null=null;

    const handleControllerChange=()=>{
      if(refreshing)return;
      refreshing=true;
      window.location.reload();
    };

    const checkForUpdate=()=>{
      if(document.visibilityState!=="visible")return;
      registration?.update().catch(()=>{});
    };

    navigator.serviceWorker.addEventListener("controllerchange",handleControllerChange);

    navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"})
      .then(reg=>{
        registration=reg;
        return reg.update().catch(()=>{});
      })
      .catch(()=>{});

    document.addEventListener("visibilitychange",checkForUpdate);
    window.addEventListener("pageshow",checkForUpdate);

    return()=>{
      navigator.serviceWorker.removeEventListener("controllerchange",handleControllerChange);
      document.removeEventListener("visibilitychange",checkForUpdate);
      window.removeEventListener("pageshow",checkForUpdate);
    };
  },[]);

  useEffect(()=>{
    const targets:Record<string,string>={
      "Textes liés":"Textes du dossier",
      "Risques forts":"Textes du dossier",
      "Actions ouvertes":"Actions ouvertes",
      "Productions IA":"Productions IA",
    };

    const scrollToSection=(label:string)=>{
      const heading=[...document.querySelectorAll("h2")].find(node=>node.textContent?.trim()===targets[label]);
      const section=heading?.closest("section")||heading;
      section?.scrollIntoView({behavior:"smooth",block:"start"});
    };

    const enhanceCards=()=>{
      document.querySelectorAll<HTMLElement>(".corp-kpis .corp-kpi").forEach(card=>{
        const label=card.querySelector("span")?.textContent?.trim()||"";
        if(!targets[label]||card.dataset.myvorInteractive==="1")return;
        card.dataset.myvorInteractive="1";
        card.tabIndex=0;
        card.setAttribute("role","button");
        card.setAttribute("aria-label",`Ouvrir ${label}`);
        card.style.cursor="pointer";
        card.style.touchAction="manipulation";
        card.style.transition="transform .16s ease, box-shadow .16s ease";
        const activate=()=>scrollToSection(label);
        card.addEventListener("click",activate);
        card.addEventListener("keydown",event=>{
          if(event.key==="Enter"||event.key===" "){
            event.preventDefault();
            activate();
          }
        });
      });
    };

    enhanceCards();
    const observer=new MutationObserver(enhanceCards);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  return null;
}
