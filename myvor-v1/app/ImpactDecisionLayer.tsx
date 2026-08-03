"use client";
import {useEffect} from "react";

function text(node:Element|null){return (node?.textContent||"").trim();}
function findByText(selector:string,needle:string){return Array.from(document.querySelectorAll(selector)).find(el=>text(el).toLowerCase().includes(needle.toLowerCase())) as HTMLElement|undefined;}

export default function ImpactDecisionLayer(){
  useEffect(()=>{
    let scheduled=false;
    const enhance=()=>{
      scheduled=false;
      const page=document.querySelector('.main>div[class*="ImpactCorporate"][class*="page"]') as HTMLElement|null;
      if(!page)return;

      const radarTitle=findByText('b','Radar d’impact');
      if(radarTitle&&radarTitle.dataset.myvorRenamed!=="1"){
        radarTitle.textContent='Décomposition du score';
        radarTitle.dataset.myvorRenamed='1';
        const subtitle=radarTitle.parentElement?.querySelector('span');
        if(subtitle)subtitle.textContent='Lecture visuelle des 6 critères du score Myvor';
      }

      const result=page.querySelector('section[class*="result"]') as HTMLElement|null;
      if(!result)return;

      const scoreStrong=result.querySelector('div[class*="scoreCard"] strong') as HTMLElement|null;
      const score=Number(text(scoreStrong));
      const title=result.querySelector('div[class*="resultCopy"] h2') as HTMLElement|null;
      const noteKey=`myvor-impact-score:${text(title)||'current'}`;
      const scoreCard=result.querySelector('div[class*="scoreCard"]') as HTMLElement|null;
      if(scoreCard&&Number.isFinite(score)&&!scoreCard.querySelector('[data-myvor-trend]')){
        const previous=Number(localStorage.getItem(noteKey));
        const trend=document.createElement('div');
        trend.dataset.myvorTrend='1';
        trend.className='myvorImpactTrend';
        if(Number.isFinite(previous)&&previous>0&&previous!==score){
          const delta=Math.round(score-previous);
          trend.textContent=`${delta>0?'↗':delta<0?'↘':'→'} Tendance : ${delta>0?'+':''}${delta} point${Math.abs(delta)>1?'s':''}`;
        }else{
          trend.textContent='→ Tendance : référence initiale';
        }
        scoreCard.appendChild(trend);
        localStorage.setItem(noteKey,String(score));
      }

      if(!result.querySelector('[data-myvor-next-step]')){
        const deadlineCard=findByText('article[class*="impactSection"]','Échéances');
        const recommendationCard=findByText('article[class*="impactSection"]','Recommandations Myvor');
        const deadline=deadlineCard?.querySelector('li');
        const recommendation=recommendationCard?.querySelector('li');
        if(deadline||recommendation){
          const card=document.createElement('section');
          card.dataset.myvorNextStep='1';
          card.className='myvorImpactNextStep';
          const deadlineText=text(deadline)||'Échéance à confirmer';
          const actionText=text(recommendation)||'Préparer la prochaine action sur le dossier.';
          card.innerHTML=`<div class="myvorImpactNextStepEyebrow">⚡ Prochaine étape clé</div><div class="myvorImpactNextStepGrid"><div><b>${deadlineText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</b><span>Fenêtre d’action prioritaire identifiée dans l’analyse.</span></div><div><small>Action recommandée</small><strong>${actionText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</strong></div></div>`;
          const hero=result.querySelector('div[class*="resultHero"]');
          hero?.insertAdjacentElement('afterend',card);
        }
      }

      const toolbar=result.querySelector('div[class*="resultToolbar"]>div:last-child') as HTMLElement|null;
      if(toolbar&&!toolbar.querySelector('[data-myvor-deliverable]')){
        const button=document.createElement('button');
        button.type='button';
        button.dataset.myvorDeliverable='1';
        button.className='myvorImpactDeliverableButton';
        button.textContent='✨ Créer un livrable';
        button.addEventListener('click',()=>{
          const nav=Array.from(document.querySelectorAll('button,a')).find(el=>text(el).toLowerCase().includes('note builder')) as HTMLElement|undefined;
          window.dispatchEvent(new CustomEvent('myvor:create-deliverable',{detail:{source:'impact'}}));
          if(nav)nav.click();
        });
        toolbar.appendChild(button);
      }
    };
    const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);};
    schedule();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}
