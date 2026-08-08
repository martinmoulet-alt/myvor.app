"use client";

import {ArrowRight} from "lucide-react";
import {useEffect,useState} from "react";

const steps=["Tableau de bord","Dossiers clients","Veille","Note d’impact","Radar d’influence","Note Builder"] as const;

function getDesktopNavButtons(){
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn"));
}

export default function WorkflowNextButton(){
  const[currentIndex,setCurrentIndex]=useState(0);
  const[visible,setVisible]=useState(false);

  useEffect(()=>{
    let previousIndex=0;
    const sync=()=>{
      const buttons=getDesktopNavButtons();
      setVisible(buttons.length>=steps.length);
      if(!buttons.length)return;
      const activeIndex=buttons.findIndex(button=>button.classList.contains("active"));
      if(activeIndex>=0){previousIndex=activeIndex;setCurrentIndex(activeIndex);}
      else setCurrentIndex(previousIndex);
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    window.addEventListener("popstate",sync);
    return()=>{observer.disconnect();window.removeEventListener("popstate",sync);};
  },[]);

  function goNext(){
    const buttons=getDesktopNavButtons();
    if(!buttons.length)return;
    const nextIndex=(currentIndex+1)%Math.min(buttons.length,steps.length);
    buttons[nextIndex]?.click();
    setCurrentIndex(nextIndex);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  if(!visible)return null;
  const nextLabel=steps[(currentIndex+1)%steps.length];

  return <div className="workflow-next-wrap" aria-live="polite">
    <button type="button" className="workflow-next-button" onClick={goNext} aria-label={`Passer à l’étape suivante : ${nextLabel}`}>
      <span><small>Étape suivante</small>Passer à l’étape suivante</span>
      <ArrowRight size={19}/>
    </button>
    <div className="workflow-next-target">{nextLabel}</div>
    <style jsx>{`
      .workflow-next-wrap{position:fixed;right:24px;bottom:24px;z-index:60;display:grid;justify-items:end;gap:7px;pointer-events:none}
      .workflow-next-button{pointer-events:auto;border:1px solid rgba(255,214,58,.82);background:linear-gradient(180deg,#ffd83d 0%,#f4c928 100%);color:#07162c;min-width:246px;border-radius:16px;padding:13px 15px 13px 17px;display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 14px 34px rgba(2,13,31,.24),inset 0 1px 0 rgba(255,255,255,.55);font:inherit;font-weight:900;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}
      .workflow-next-button span{display:grid;text-align:left;line-height:1.08}
      .workflow-next-button small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.64;margin-bottom:4px;font-weight:900}
      .workflow-next-button:hover{transform:translateY(-2px);box-shadow:0 18px 40px rgba(2,13,31,.3),inset 0 1px 0 rgba(255,255,255,.62);filter:saturate(1.04)}
      .workflow-next-button:active{transform:translateY(0) scale(.985)}
      .workflow-next-button:focus-visible{outline:3px solid #fff;outline-offset:3px}
      .workflow-next-target{pointer-events:none;background:rgba(7,22,44,.92);color:#dbe7f7;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:6px 10px;font-size:10px;font-weight:800;box-shadow:0 7px 20px rgba(2,13,31,.15)}
      @media(max-width:850px){.workflow-next-wrap{right:12px;left:12px;bottom:calc(82px + env(safe-area-inset-bottom));justify-items:stretch}.workflow-next-button{width:100%;min-width:0;border-radius:14px;padding:12px 14px}.workflow-next-target{justify-self:end;margin-right:4px}}
    `}</style>
  </div>;
}
