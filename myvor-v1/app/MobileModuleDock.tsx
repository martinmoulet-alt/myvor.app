"use client";

import {useEffect,useState} from "react";
import {AlertTriangle,BarChart3,Bell,BriefcaseBusiness,Radar,Search,Sparkles,Users} from "lucide-react";

const items=[
  {sidebarIndex:0,label:"Accueil",Icon:BarChart3},
  {sidebarIndex:1,label:"Dossiers",Icon:BriefcaseBusiness},
  {sidebarIndex:2,label:"Veille",Icon:Search},
  {sidebarIndex:3,label:"Impact",Icon:AlertTriangle},
  {sidebarIndex:4,label:"Radar",Icon:Radar},
  {sidebarIndex:5,label:"Builder",Icon:Sparkles},
  {sidebarIndex:6,label:"Équipe",Icon:Users},
  {sidebarIndex:7,label:"Alertes",Icon:Bell}
] as const;

export default function MobileModuleDock(){
  const[activeIndex,setActiveIndex]=useState(0);

  useEffect(()=>{
    const sync=()=>{
      const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn"));
      const active=buttons.findIndex(button=>button.classList.contains("active"));
      const mapped=items.findIndex(item=>item.sidebarIndex===active);
      if(mapped>=0)setActiveIndex(mapped);
    };
    sync();
    const sidebar=document.querySelector(".sidebar");
    if(!sidebar)return;
    const observer=new MutationObserver(sync);
    observer.observe(sidebar,{subtree:true,attributes:true,attributeFilter:["class"]});
    return()=>observer.disconnect();
  },[]);

  function go(itemIndex:number){
    const item=items[itemIndex];
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar .navbtn"));
    buttons[item.sidebarIndex]?.click();
    setActiveIndex(itemIndex);
  }

  return <nav className="mobile-module-dock" aria-label="Modules Myvor">
    {items.map(({label,Icon},index)=><button type="button" key={label} className={activeIndex===index?"active":""} onClick={()=>go(index)} aria-label={label}><Icon size={16} strokeWidth={2.1}/><span>{label}</span></button>)}
  </nav>;
}
