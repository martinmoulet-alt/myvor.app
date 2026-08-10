"use client";

import {useEffect,useState} from "react";
import {ArrowRight,CheckCircle2} from "lucide-react";

const RADAR_INDEX=4;
const WORKFLOW_CONTEXT_KEY="myvor:workflow-context";

type WorkflowState={
  visible:boolean;
  currentIndex:number;
  currentLabel:string;
  nextLabel:string;
  step:number;
  total:number;
  warzoneActive:boolean;
  finished:boolean;
};

const EMPTY_STATE:WorkflowState={visible:false,currentIndex:-1,currentLabel:"",nextLabel:"",step:0,total:6,warzoneActive:false,finished:false};

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

function warZoneTab(){
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".main button")).find(button=>button.textContent?.trim()==="War Zone")||null;
}

function isWarZoneActive(){
  const button=warZoneTab();
  if(!button)return false;
  return Array.from(button.classList).some(name=>name.toLowerCase().includes("active"))||button.getAttribute("aria-selected")==="true";
}

function captureDossierContext(){
  const main=document.querySelector(".main");
  if(!main)return;
  const selects=Array.from(main.querySelectorAll<HTMLSelectElement>("select"));
  const dossierSelect=selects.find(select=>{
    const options=Array.from(select.options);
    return options.some(option=>Boolean(option.value)&&String(option.textContent||"").includes(" — "));
  });
  const dossierId=String(dossierSelect?.value||"");
  if(!dossierId)return;
  let watchIds:string[]=[];
  try{
    const previous=JSON.parse(sessionStorage.getItem(WORKFLOW_CONTEXT_KEY)||"null");
    if(String(previous?.dossierId||"")===dossierId&&Array.isArray(previous?.watchIds))watchIds=previous.watchIds.map((id:unknown)=>String(id||"")).filter(Boolean);
  }catch{}
  const context={dossierId,watchIds};
  try{sessionStorage.setItem(WORKFLOW_CONTEXT_KEY,JSON.stringify(context));}catch{}
  window.dispatchEvent(new CustomEvent("myvor:workflow-context",{detail:context}));
}

function stateFor(index:number,warzone:boolean):WorkflowState{
  if(index<1||index>5)return EMPTY_STATE;
  if(index===1)return{visible:true,currentIndex:index,currentLabel:"Dossiers clients",nextLabel:"Veille",step:1,total:6,warzoneActive:false,finished:false};
  if(index===2)return{visible:true,currentIndex:index,currentLabel:"Veille",nextLabel:"Score d’urgence",step:2,total:6,warzoneActive:false,finished:false};
  if(index===3)return{visible:true,currentIndex:index,currentLabel:"Score d’urgence",nextLabel:"Radar d’influence",step:3,total:6,warzoneActive:false,finished:false};
  if(index===4&&!warzone)return{visible:true,currentIndex:index,currentLabel:"Radar d’influence",nextLabel:"War Zone",step:4,total:6,warzoneActive:false,finished:false};
  if(index===4&&warzone)return{visible:true,currentIndex:index,currentLabel:"War Zone",nextLabel:"Note Builder",step:5,total:6,warzoneActive:true,finished:false};
  return{visible:true,currentIndex:index,currentLabel:"Note Builder",nextLabel:"Tableau de bord",step:6,total:6,warzoneActive:false,finished:true};
}

export default function WorkflowGuide(){
  const[state,setState]=useState<WorkflowState>(EMPTY_STATE);

  useEffect(()=>{
    let lastActive=0;

    const sync=()=>{
      const groups=navGroups();
      const desktop=groups[0];
      if(!desktop.length)return;

      const active=desktop.findIndex(button=>button.classList.contains("active"));
      if(active>=0)lastActive=active;
      const current=active>=0?active:lastActive;
      const warzone=current===RADAR_INDEX&&isWarZoneActive();
      const next=current===1?2:current===2?3:current===3?4:current===4&&warzone?5:current===5?0:-1;

      for(const group of groups){
        group.forEach((button,index)=>{
          exposeWarZone(button,index);
          const recommended=index===next&&!(current===RADAR_INDEX&&!warzone);
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

      const warTab=warZoneTab();
      if(warTab)warTab.classList.toggle("myvor-flow-tab-next",current===RADAR_INDEX&&!warzone);
      setState(stateFor(current,warzone));
    };

    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","aria-selected"]});
    return()=>observer.disconnect();
  },[]);

  function goNext(){
    captureDossierContext();

    if(state.currentIndex===RADAR_INDEX&&!state.warzoneActive){
      const button=warZoneTab();
      if(button){button.click();window.scrollTo({top:0,behavior:"smooth"});}
      return;
    }

    const desktop=navGroups()[0];
    const nextIndex=state.currentIndex===1?2:state.currentIndex===2?3:state.currentIndex===3?4:state.currentIndex===4?5:state.currentIndex===5?0:-1;
    const button=desktop[nextIndex];
    if(button){button.click();window.scrollTo({top:0,behavior:"smooth"});}
  }

  return <>
    <style jsx global>{`
      .sidebar .navbtn.myvor-flow-next{position:relative;border-color:rgba(243,189,62,.34)}
      .sidebar .navbtn.myvor-flow-next::before{content:"";position:absolute;left:5px;top:50%;width:5px;height:5px;border-radius:50%;background:#f3bd3e;transform:translateY(-50%);box-shadow:0 0 0 4px rgba(243,189,62,.10)}
      .sidebar .navbtn.myvor-flow-next::after{content:attr(data-flow-label);margin-left:auto;color:#f3bd3e;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .mobile-menu-nav button.myvor-flow-next{border-color:rgba(243,189,62,.32);position:relative}
      .mobile-menu-nav button.myvor-flow-next::after{content:"Suite";margin-left:auto;color:#f3bd3e;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .mobile-nav button.myvor-flow-next{position:relative}
      .mobile-nav button.myvor-flow-next::after{content:"";position:absolute;top:6px;right:18%;width:6px;height:6px;border-radius:50%;background:#f3bd3e;box-shadow:0 0 0 3px rgba(243,189,62,.12)}
      .myvor-flow-tab-next{box-shadow:0 0 0 2px rgba(243,189,62,.45)!important;border-color:#f3bd3e!important}
      .myvor-workflow-next{position:fixed;right:24px;bottom:22px;z-index:72;display:flex;align-items:center;gap:14px;padding:11px 12px 11px 16px;border:1px solid rgba(243,189,62,.34);border-radius:16px;background:rgba(7,22,44,.96);box-shadow:0 18px 46px rgba(0,0,0,.30);backdrop-filter:blur(14px);color:white;max-width:min(620px,calc(100vw - 48px))}
      .myvor-workflow-copy{min-width:0}.myvor-workflow-copy small{display:block;color:#8ea5c1;font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}.myvor-workflow-copy b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.myvor-workflow-copy b span{color:#f3bd3e}
      .myvor-workflow-next button{border:0;border-radius:12px;background:#ffc62a;color:#07162c;min-height:42px;padding:0 15px;font-weight:950;display:flex;align-items:center;gap:8px;white-space:nowrap;cursor:pointer;box-shadow:0 8px 22px rgba(243,189,62,.18)}
      .myvor-workflow-next button:hover{transform:translateY(-1px)}
      @media(max-width:850px){.myvor-workflow-next{left:10px;right:10px;bottom:calc(76px + env(safe-area-inset-bottom));max-width:none;padding:10px 10px 10px 13px;border-radius:14px}.myvor-workflow-copy small{font-size:9px}.myvor-workflow-copy b{font-size:11px}.myvor-workflow-next button{min-height:40px;padding:0 11px;font-size:11px}.myvor-workflow-next button span{display:none}}
    `}</style>
    {state.visible&&<div className="myvor-workflow-next" role="navigation" aria-label="Workflow Myvor">
      <div className="myvor-workflow-copy"><small>Workflow · étape {state.step}/{state.total}</small><b>{state.currentLabel} <span>→ {state.nextLabel}</span></b></div>
      <button type="button" onClick={goNext}>{state.finished?<CheckCircle2 size={16}/>:<ArrowRight size={16}/>}<span>{state.finished?"Terminer":"Étape suivante"}</span></button>
    </div>}
  </>;
}
