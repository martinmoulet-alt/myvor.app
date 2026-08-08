"use client";

import {useEffect} from "react";

const FLOW_LENGTH=6;
const RADAR_INDEX=4;

function navGroups(){
  return [
    Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn")),
    Array.from(document.querySelectorAll<HTMLButtonElement>(".mobile-menu-nav button")),
    Array.from(document.querySelectorAll<HTMLButtonElement>(".mobile-nav button"))
  ];
}

function exposeWarZone(button:HTMLButtonElement,index:number){
  if(index!==RADAR_INDEX)return;
  const node=Array.from(button.childNodes).find(child=>child.nodeType===Node.TEXT_NODE&&String(child.textContent||"").trim().length>0);
  if(node&&node.textContent?.trim()!=="Radar & War Zone")node.textContent="Radar & War Zone";
  button.setAttribute("aria-label","Radar d’influence et War Zone");
}

export default function WorkflowGuide(){
  useEffect(()=>{
    let lastActive=0;

    const sync=()=>{
      const groups=navGroups();
      const desktop=groups[0];
      if(!desktop.length)return;

      const active=desktop.findIndex(button=>button.classList.contains("active"));
      if(active>=0)lastActive=active;
      const current=active>=0?active:lastActive;
      const next=current<FLOW_LENGTH-1?current+1:-1;

      for(const group of groups){
        group.forEach((button,index)=>{
          exposeWarZone(button,index);
          const recommended=index===next;
          button.classList.toggle("myvor-flow-next",recommended);
          if(recommended){
            button.setAttribute("data-flow-label","Suite");
            button.setAttribute("title","Étape suivante recommandée");
          }else{
            button.removeAttribute("data-flow-label");
            if(button.getAttribute("title")==="Étape suivante recommandée")button.removeAttribute("title");
          }
        });
      }
    };

    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    return()=>observer.disconnect();
  },[]);

  return <style jsx global>{`
    .sidebar .navbtn.myvor-flow-next{position:relative;border-color:rgba(243,189,62,.34)}
    .sidebar .navbtn.myvor-flow-next::before{content:"";position:absolute;left:5px;top:50%;width:5px;height:5px;border-radius:50%;background:#f3bd3e;transform:translateY(-50%);box-shadow:0 0 0 4px rgba(243,189,62,.10)}
    .sidebar .navbtn.myvor-flow-next::after{content:attr(data-flow-label);margin-left:auto;color:#f3bd3e;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .mobile-menu-nav button.myvor-flow-next{border-color:rgba(243,189,62,.32);position:relative}
    .mobile-menu-nav button.myvor-flow-next::after{content:"Suite";margin-left:auto;color:#f3bd3e;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .mobile-nav button.myvor-flow-next{position:relative}
    .mobile-nav button.myvor-flow-next::after{content:"";position:absolute;top:6px;right:18%;width:6px;height:6px;border-radius:50%;background:#f3bd3e;box-shadow:0 0 0 3px rgba(243,189,62,.12)}
  `}</style>;
}
