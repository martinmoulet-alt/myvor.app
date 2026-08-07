"use client";

import {useEffect} from "react";

export default function MobileDossierTabs(){
  useEffect(()=>{
    let cleanup:undefined|(()=>void);
    const install=()=>{
      if(window.innerWidth>850||document.querySelector("[data-myvor-dossier-tabs]"))return;
      const heading=[...document.querySelectorAll("h1")].find(node=>node.textContent?.trim()==="Dossiers clients");
      if(!heading)return;
      const page=heading.parentElement?.parentElement?.parentElement as HTMLElement|null;
      if(!page)return;
      const sections=[...page.querySelectorAll("section")] as HTMLElement[];
      const dossiersPanel=sections.find(section=>section.querySelector("h2")?.textContent?.trim()==="Dossiers");
      const evolutionsPanel=sections.find(section=>section.querySelector("h2")?.textContent?.trim()==="Évolutions pertinentes");
      if(!dossiersPanel||!evolutionsPanel)return;
      const workspace=dossiersPanel.parentElement as HTMLElement|null;
      if(!workspace||workspace!==evolutionsPanel.parentElement)return;

      const tabs=document.createElement("div");
      tabs.dataset.myvorDossierTabs="true";
      tabs.className="myvor-mobile-dossier-tabs";
      const dossierButton=document.createElement("button");
      const evolutionButton=document.createElement("button");
      dossierButton.type="button"; evolutionButton.type="button";
      dossierButton.textContent="Dossiers";
      evolutionButton.textContent="Évolutions pertinentes";
      tabs.append(dossierButton,evolutionButton);
      workspace.parentElement?.insertBefore(tabs,workspace);

      const activate=(view:"dossiers"|"evolutions")=>{
        const dossiers=view==="dossiers";
        dossiersPanel.style.display=dossiers?"":"none";
        evolutionsPanel.style.display=dossiers?"none":"";
        dossierButton.classList.toggle("active",dossiers);
        evolutionButton.classList.toggle("active",!dossiers);
        tabs.dataset.active=view;
      };
      const showDossiers=()=>activate("dossiers");
      const showEvolutions=()=>activate("evolutions");
      dossierButton.addEventListener("click",showDossiers);
      evolutionButton.addEventListener("click",showEvolutions);
      activate("dossiers");

      cleanup=()=>{
        dossierButton.removeEventListener("click",showDossiers);
        evolutionButton.removeEventListener("click",showEvolutions);
        dossiersPanel.style.display="";
        evolutionsPanel.style.display="";
        tabs.remove();
      };
    };

    const observer=new MutationObserver(()=>install());
    observer.observe(document.body,{childList:true,subtree:true});
    const onResize=()=>{if(window.innerWidth>850){cleanup?.();cleanup=undefined;}else install();};
    window.addEventListener("resize",onResize);
    install();
    return()=>{observer.disconnect();window.removeEventListener("resize",onResize);cleanup?.();};
  },[]);
  return <style jsx global>{`
    .myvor-mobile-dossier-tabs{display:none}
    @media(max-width:850px){
      .myvor-mobile-dossier-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;background:#061326;border:1px solid #173653;border-radius:12px;position:sticky;top:8px;z-index:35;box-shadow:0 8px 24px rgba(0,0,0,.22)}
      .myvor-mobile-dossier-tabs button{border:0;border-radius:9px;background:transparent;color:#91a6bc;padding:11px 9px;font-size:12px;font-weight:850;white-space:nowrap}
      .myvor-mobile-dossier-tabs button.active{background:linear-gradient(135deg,#ffc928,#f3bd3e);color:#07162c;box-shadow:0 5px 16px rgba(243,189,62,.16)}
    }
  `}</style>;
}
