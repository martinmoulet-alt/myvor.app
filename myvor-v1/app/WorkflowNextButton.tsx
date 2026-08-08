"use client";

import {ArrowRight} from "lucide-react";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";

const steps=["Tableau de bord","Dossiers clients","Veille","Note d’impact","Radar d’influence","Note Builder"] as const;

function getDesktopNavButtons(){
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn"));
}

export default function WorkflowNextButton(){
  const[currentIndex,setCurrentIndex]=useState(0);
  const[visible,setVisible]=useState(false);
  const[target,setTarget]=useState<HTMLElement|null>(null);

  useEffect(()=>{
    let previousIndex=0;
    const sync=()=>{
      const buttons=getDesktopNavButtons();
      setTarget(document.querySelector<HTMLElement>(".main"));
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

  if(!visible||!target)return null;
  const nextLabel=steps[(currentIndex+1)%steps.length];

  return createPortal(<section className="workflow-next-wrap" aria-label="Navigation du parcours Myvor">
    <div className="workflow-next-copy">
      <small>Étape suivante</small>
      <strong>{nextLabel}</strong>
    </div>
    <button type="button" className="workflow-next-button" onClick={goNext} aria-label={`Passer à l’étape suivante : ${nextLabel}`}>
      Passer à l’étape suivante
      <ArrowRight size={19}/>
    </button>
    <style jsx>{`
      .workflow-next-wrap{width:100%;margin-top:30px;padding:22px 0 8px;border-top:1px solid rgba(122,145,174,.2);display:flex;align-items:center;justify-content:flex-end;gap:18px}
      .workflow-next-copy{display:grid;gap:3px;text-align:right;min-width:0}
      .workflow-next-copy small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#8090a6;font-weight:900}
      .workflow-next-copy strong{font-size:12px;color:#526278;font-weight:850;white-space:nowrap}
      .workflow-next-button{border:1px solid rgba(255,214,58,.86);background:linear-gradient(180deg,#ffd83d 0%,#f4c928 100%);color:#07162c;border-radius:14px;padding:13px 16px 13px 18px;display:flex;align-items:center;justify-content:center;gap:14px;box-shadow:0 10px 24px rgba(2,13,31,.16),inset 0 1px 0 rgba(255,255,255,.55);font:inherit;font-size:13px;font-weight:900;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}
      .workflow-next-button:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(2,13,31,.22),inset 0 1px 0 rgba(255,255,255,.62);filter:saturate(1.04)}
      .workflow-next-button:active{transform:translateY(0) scale(.985)}
      .workflow-next-button:focus-visible{outline:3px solid #fff;outline-offset:3px}
      @media(max-width:850px){.workflow-next-wrap{margin-top:22px;padding:18px 0 calc(92px + env(safe-area-inset-bottom));display:grid;gap:10px}.workflow-next-copy{text-align:left}.workflow-next-copy strong{font-size:11px}.workflow-next-button{width:100%;min-height:48px;border-radius:13px}}
    `}</style>
  </section>,target);
}
