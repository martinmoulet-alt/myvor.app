"use client";

import {useEffect} from "react";
import {supabase} from "@/lib/supabase";

type CompletedAction={
  id:string;
  title:string;
  actor_name:string|null;
  priority:string;
  due_date:string|null;
  completed_at:string|null;
};

function actionId(node:Element){
  const raw=String(node.id||"");
  return raw.startsWith("action-")?raw.slice(7):"";
}

function dossierContext(root:Element){
  const title=String(root.querySelector(".corp-head h1")?.textContent||"").replace(/\s+/g," ").trim();
  const meta=String(root.querySelector(".corp-head p")?.textContent||"").replace(/\s+/g," ").trim();
  const client=meta.split(" · ")[0]?.trim()||"";
  return{title,client,key:`${client}|${title}`};
}

function planPanel(root:Element){
  return Array.from(root.querySelectorAll<HTMLElement>("section.corp-panel")).find(section=>{
    const heading=String(section.querySelector("h2")?.textContent||"").toLocaleLowerCase("fr-FR");
    return heading.includes("actions ouvertes");
  })||null;
}

function resetLifecyclePanel(){
  document.querySelectorAll(".myvor-completed-actions").forEach(node=>node.remove());
  document.querySelectorAll<HTMLElement>("section.corp-panel[data-myvor-lifecycle-context]").forEach(node=>{
    delete node.dataset.myvorLifecycleContext;
  });
}

export default function ActionLifecycleEnhancer(){
  useEffect(()=>{
    const client=supabase;
    if(!client)return;
    let disposed=false;
    let scheduled=false;
    const busy=new Set<string>();

    const refresh=()=>{
      resetLifecyclePanel();
      window.dispatchEvent(new Event("pageshow"));
    };

    async function setStatus(id:string,status:"a_faire"|"termine",control:HTMLElement){
      if(!id||busy.has(id))return;
      busy.add(id);
      const previous=control.textContent||"";
      control.textContent=status==="termine"?"Validation…":"Réouverture…";
      control.setAttribute("aria-disabled","true");
      try{
        const{error}=await client.from("actions").update({status}).eq("id",id);
        if(error)throw error;
        refresh();
      }catch(error:any){
        control.textContent=previous;
        control.removeAttribute("aria-disabled");
        control.title=String(error?.message||"Impossible de modifier cette action.");
      }finally{
        busy.delete(id);
      }
    }

    async function resolveDossierId(root:Element,openButtons:HTMLButtonElement[]){
      const firstId=openButtons.map(actionId).find(Boolean)||"";
      if(firstId){
        const{data}=await client.from("actions").select("dossier_id").eq("id",firstId).maybeSingle();
        if(data?.dossier_id)return String(data.dossier_id);
      }
      const context=dossierContext(root);
      if(!context.title||!context.client)return"";
      const{data}=await client.from("dossiers").select("id").eq("title",context.title).eq("client",context.client).limit(1).maybeSingle();
      return String(data?.id||"");
    }

    function addCompleteControl(button:HTMLButtonElement){
      if(button.dataset.myvorLifecycle==="true")return;
      const id=actionId(button);
      if(!id)return;
      button.dataset.myvorLifecycle="true";
      button.classList.add("myvor-action-lifecycle-row");
      const control=document.createElement("span");
      control.className="myvor-action-status-control";
      control.setAttribute("role","button");
      control.setAttribute("tabindex","0");
      control.setAttribute("aria-label","Marquer cette action comme terminée");
      control.textContent="Terminer ✓";
      const execute=(event:Event)=>{
        event.preventDefault();
        event.stopPropagation();
        void setStatus(id,"termine",control);
      };
      control.addEventListener("click",execute);
      control.addEventListener("keydown",event=>{
        const key=(event as KeyboardEvent).key;
        if(key==="Enter"||key===" ")execute(event);
      });
      button.appendChild(control);
    }

    async function renderCompleted(root:Element,panel:HTMLElement,openButtons:HTMLButtonElement[]){
      const context=dossierContext(root);
      if(panel.dataset.myvorLifecycleContext===context.key)return;
      panel.dataset.myvorLifecycleContext=context.key;
      const dossierId=await resolveDossierId(root,openButtons);
      if(disposed||!dossierId)return;

      const{data,count,error}=await client.from("actions")
        .select("id,title,actor_name,priority,due_date,completed_at",{count:"exact"})
        .eq("dossier_id",dossierId)
        .eq("status","termine")
        .is("superseded_by",null)
        .not("completed_at","is",null)
        .order("completed_at",{ascending:false})
        .limit(8);
      if(disposed||error||!data?.length)return;

      panel.querySelector(".myvor-completed-actions")?.remove();
      const details=document.createElement("details");
      details.className="myvor-completed-actions";
      const summary=document.createElement("summary");
      summary.textContent=`Actions terminées · ${count??data.length}`;
      details.appendChild(summary);

      const list=document.createElement("div");
      list.className="myvor-completed-list";
      for(const action of data as CompletedAction[]){
        const row=document.createElement("div");
        row.className="myvor-completed-row";
        const copy=document.createElement("div");
        const title=document.createElement("b");
        title.textContent=action.title;
        const meta=document.createElement("small");
        const completed=action.completed_at?new Date(action.completed_at).toLocaleDateString("fr-FR"):"";
        meta.textContent=[action.actor_name,action.priority,completed?`Terminée le ${completed}`:null].filter(Boolean).join(" · ");
        copy.append(title,meta);
        const reopen=document.createElement("button");
        reopen.type="button";
        reopen.className="myvor-action-reopen";
        reopen.textContent="Réouvrir";
        reopen.addEventListener("click",event=>{
          event.preventDefault();
          event.stopPropagation();
          void setStatus(action.id,"a_faire",reopen);
        });
        row.append(copy,reopen);
        list.appendChild(row);
      }
      details.appendChild(list);
      panel.appendChild(details);
    }

    async function enhance(){
      scheduled=false;
      const root=document.querySelector(".dossier-detail-page");
      if(!root)return;
      const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('button[id^="action-"]'));
      buttons.forEach(addCompleteControl);
      const panel=planPanel(root);
      if(panel)await renderCompleted(root,panel,buttons);
    }

    const schedule=()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{void enhance();});
    };

    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener("pageshow",schedule);
    window.addEventListener("myvor:action-lifecycle-refresh",schedule);

    return()=>{
      disposed=true;
      observer.disconnect();
      window.removeEventListener("pageshow",schedule);
      window.removeEventListener("myvor:action-lifecycle-refresh",schedule);
    };
  },[]);

  return <style jsx global>{`
    .dossier-detail-page .myvor-action-lifecycle-row{
      position:relative!important;
      padding-right:104px!important;
    }
    .dossier-detail-page .myvor-action-status-control{
      position:absolute;
      right:10px;
      top:50%;
      transform:translateY(-50%);
      border:1px solid #cfdcea;
      background:#fff;
      color:#275073;
      border-radius:8px;
      padding:6px 8px;
      font-size:10px;
      line-height:1;
      font-weight:900;
      cursor:pointer;
      white-space:nowrap;
      z-index:2;
    }
    .dossier-detail-page .myvor-action-status-control:hover,
    .dossier-detail-page .myvor-action-status-control:focus-visible{
      border-color:#f3bd3e;
      color:#8a6300;
      outline:none;
    }
    .dossier-detail-page .myvor-action-status-control[aria-disabled="true"]{
      opacity:.6;
      cursor:wait;
    }
    .dossier-detail-page .myvor-completed-actions{
      margin-top:12px;
      border-top:1px solid #e3eaf2;
      padding-top:10px;
    }
    .dossier-detail-page .myvor-completed-actions summary{
      cursor:pointer;
      color:#60758e;
      font-size:11px;
      font-weight:900;
      user-select:none;
    }
    .dossier-detail-page .myvor-completed-list{
      display:grid;
      gap:7px;
      margin-top:9px;
    }
    .dossier-detail-page .myvor-completed-row{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:10px;
      align-items:center;
      border:1px solid #e2e9f1;
      background:#f9fbfd;
      border-radius:10px;
      padding:9px 10px;
    }
    .dossier-detail-page .myvor-completed-row b{
      display:block;
      color:#425873;
      font-size:11px;
      line-height:1.35;
    }
    .dossier-detail-page .myvor-completed-row small{
      display:block;
      margin-top:3px;
      color:#8594a6;
      font-size:9px;
    }
    .dossier-detail-page .myvor-action-reopen{
      border:1px solid #d4dfeb!important;
      background:#fff!important;
      color:#375879!important;
      border-radius:8px!important;
      padding:6px 8px!important;
      font-size:10px!important;
      font-weight:900!important;
      cursor:pointer;
    }
    body:has(.myvor-exec) .dossier-detail-page .myvor-action-status-control,
    body:has(.myvor-exec) .dossier-detail-page .myvor-action-reopen{
      background:#0b213d!important;
      border-color:#254968!important;
      color:#f3bd3e!important;
    }
    body:has(.myvor-exec) .dossier-detail-page .myvor-completed-actions{
      border-top-color:#1f3c59;
    }
    body:has(.myvor-exec) .dossier-detail-page .myvor-completed-row{
      background:#071b33;
      border-color:#1d3b57;
    }
    body:has(.myvor-exec) .dossier-detail-page .myvor-completed-row b{color:#dce8f5}
    body:has(.myvor-exec) .dossier-detail-page .myvor-completed-row small{color:#879db4}
    @media(max-width:700px){
      .dossier-detail-page .myvor-action-lifecycle-row{padding-right:92px!important}
      .dossier-detail-page .myvor-action-status-control{right:7px;padding:6px;font-size:9px}
    }
  `}</style>;
}
