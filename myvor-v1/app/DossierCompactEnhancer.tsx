"use client";

import {useEffect} from "react";

function normalizeTitle(value:string|null|undefined){
  return String(value||"").replace(/\s+/g," ").trim().toLocaleLowerCase("fr-FR");
}

export default function DossierCompactEnhancer(){
  useEffect(()=>{
    let scheduled=false;

    const enhance=()=>{
      scheduled=false;
      const root=document.querySelector(".dossier-detail-page");
      if(!root)return;

      const cards=Array.from(root.querySelectorAll<HTMLElement>(".dossier-detail-card"));

      for(const card of cards){
        if(card.dataset.myvorCompact==="true")continue;
        const heading=card.querySelector("h3");
        const title=normalizeTitle(heading?.textContent);

        if(title.includes("risques à éviter")||title.includes("opportunités")){
          const list=card.querySelector<HTMLUListElement>("ul.dossier-detail-list");
          const items=list?Array.from(list.querySelectorAll<HTMLLIElement>(":scope > li")):[];
          if(items.length>3){
            card.dataset.myvorCompact="true";
            items.slice(3).forEach(item=>{item.hidden=true;});
            let expanded=false;
            const button=document.createElement("button");
            button.type="button";
            button.className="dossier-expand-button";
            const refreshLabel=()=>{button.textContent=expanded?"Réduire":`Voir les ${items.length-3} autres`;};
            refreshLabel();
            button.addEventListener("click",()=>{
              expanded=!expanded;
              items.slice(3).forEach(item=>{item.hidden=!expanded;});
              card.classList.toggle("is-expanded",expanded);
              refreshLabel();
            });
            card.appendChild(button);
          }else{
            card.dataset.myvorCompact="true";
          }
          continue;
        }

        if(title.includes("position client")){
          const paragraph=card.querySelector<HTMLParagraphElement>("p");
          if(paragraph){
            card.dataset.myvorCompact="true";
            card.classList.add("dossier-position-card");
            paragraph.classList.add("dossier-position-preview");
            const button=document.createElement("button");
            button.type="button";
            button.className="dossier-expand-button";
            button.textContent="Voir la position complète";
            let expanded=false;
            button.addEventListener("click",()=>{
              expanded=!expanded;
              card.classList.toggle("is-expanded",expanded);
              button.textContent=expanded?"Réduire":"Voir la position complète";
            });
            card.appendChild(button);
          }else{
            card.dataset.myvorCompact="true";
          }
        }
      }

      const unverified=root.querySelector<HTMLElement>(".dossier-deadline .deadline-unverified");
      if(unverified&&unverified.dataset.myvorDeadlineCopy!=="true"){
        unverified.dataset.myvorDeadlineCopy="true";
        unverified.textContent="Aucune date officielle confirmée";
        const card=unverified.closest(".dossier-deadline");
        const note=card?.querySelector("small");
        if(note)note.textContent="Myvor actualisera cette échéance dès qu’une date institutionnelle précise sera détectée.";
      }
    };

    const schedule=()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(enhance);
    };

    enhance();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener("pageshow",schedule);

    return()=>{
      observer.disconnect();
      window.removeEventListener("pageshow",schedule);
    };
  },[]);

  return <style jsx global>{`
    .dossier-detail-page .dossier-detail-card li[hidden]{display:none!important}
    .dossier-detail-page .dossier-expand-button{
      margin-top:12px;
      border:1px solid #d5e0ec!important;
      background:#f7faff!important;
      color:#17365f!important;
      border-radius:9px!important;
      padding:7px 10px!important;
      font-size:11px!important;
      font-weight:850!important;
      cursor:pointer;
    }
    .dossier-detail-page .dossier-expand-button:hover{
      border-color:#f3bd3e!important;
      color:#8a6300!important;
    }
    .dossier-detail-page .dossier-position-preview{
      display:-webkit-box;
      -webkit-box-orient:vertical;
      -webkit-line-clamp:4;
      overflow:hidden;
    }
    .dossier-detail-page .dossier-position-card.is-expanded .dossier-position-preview{
      display:block;
      overflow:visible;
    }
    body:has(.myvor-exec) .dossier-detail-page .dossier-expand-button{
      background:#0a213d!important;
      border-color:#244765!important;
      color:#f3bd3e!important;
    }
  `}</style>;
}
