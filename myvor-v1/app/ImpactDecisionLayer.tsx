"use client";
import {useEffect} from "react";

function text(node:Element|null){return (node?.textContent||"").trim();}
function findByText(selector:string,needle:string){return Array.from(document.querySelectorAll(selector)).find(el=>text(el).toLowerCase().includes(needle.toLowerCase())) as HTMLElement|undefined;}
function clamp(value:number){return Math.max(0,Math.min(100,Math.round(value)));}
function escapeHtml(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

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
        }else trend.textContent='→ Tendance : référence initiale';
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
          card.innerHTML=`<div class="myvorImpactNextStepEyebrow">⚡ Prochaine étape clé</div><div class="myvorImpactNextStepGrid"><div><b>${escapeHtml(deadlineText)}</b><span>Fenêtre d’action prioritaire identifiée dans l’analyse.</span></div><div><small>Action recommandée</small><strong>${escapeHtml(actionText)}</strong></div></div>`;
          const hero=result.querySelector('div[class*="resultHero"]');
          hero?.insertAdjacentElement('afterend',card);
        }
      }

      if(!result.querySelector('[data-myvor-thematic-radar]')){
        const metrics=Array.from(result.querySelectorAll('article[class*="scoreMetric"]')).map(card=>{
          const label=text(card.querySelector('div[class*="scoreMetricTop"]>span')).toLowerCase();
          const raw=text(card.querySelector('div[class*="scoreMetricTop"] strong'));
          const match=raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?)/);
          const value=match?Number(match[1].replace(',','.')):0;const max=match?Number(match[2].replace(',','.')):100;
          return{label,pct:max?clamp(value/max*100):0};
        });
        if(metrics.length>=6){
          const get=(needle:string)=>metrics.find(item=>item.label.includes(needle))?.pct||0;
          const juridique=get('juridique'),eco=get('économique')||get('economique'),urgence=get('urgence'),probabilite=get('probabilité')||get('probabilite'),politique=get('politique'),capacite=get('capacité')||get('capacite');
          const themes=[
            {label:'Réglementaire',value:juridique},
            {label:'Économique',value:eco},
            {label:'Opérationnel',value:clamp((eco+capacite)/2)},
            {label:'Politique',value:politique},
            {label:'Réputation',value:clamp((politique+probabilite)/2)},
            {label:'Stratégique',value:clamp((capacite+probabilite+urgence)/3)},
          ];
          const points=themes.map((theme,index)=>{const angle=-Math.PI/2+index*Math.PI/3;const radius=76*(theme.value/100);return`${100+Math.cos(angle)*radius},${100+Math.sin(angle)*radius}`}).join(' ');
          const section=document.createElement('section');section.dataset.myvorThematicRadar='1';section.className='myvorImpactThematic';
          section.innerHTML=`<div class="myvorImpactThematicHead"><div><span>Lecture client</span><b>Impact par thématique</b><small>Vue de synthèse dérivée de la grille Myvor. Les six valeurs sont calculées à partir des critères déjà justifiés et sourcés de la note.</small></div></div><div class="myvorImpactThematicGrid"><div class="myvorImpactThematicRadar"><svg viewBox="0 0 200 200" role="img" aria-label="Radar d’impact par thématique"><polygon points="100,20 169,60 169,140 100,180 31,140 31,60" class="myvorImpactRadarGrid"/><polygon points="100,46 146,73 146,127 100,154 54,127 54,73" class="myvorImpactRadarGrid"/><line x1="100" y1="100" x2="100" y2="20"/><line x1="100" y1="100" x2="169" y2="60"/><line x1="100" y1="100" x2="169" y2="140"/><line x1="100" y1="100" x2="100" y2="180"/><line x1="100" y1="100" x2="31" y2="140"/><line x1="100" y1="100" x2="31" y2="60"/><polygon points="${points}" class="myvorImpactRadarFill"/></svg></div><div class="myvorImpactThemeList">${themes.map(theme=>`<div title="${escapeHtml(theme.label)}: ${theme.value}/100"><span>${escapeHtml(theme.label)}</span><div><i style="width:${theme.value}%"></i></div><b>${theme.value}</b></div>`).join('')}</div></div>`;
          const nextStep=result.querySelector('[data-myvor-next-step]');
          (nextStep||result.querySelector('div[class*="resultHero"]'))?.insertAdjacentElement('afterend',section);
        }
      }

      const toolbar=result.querySelector('div[class*="resultToolbar"]>div:last-child') as HTMLElement|null;
      if(toolbar&&!toolbar.querySelector('[data-myvor-deliverable]')){
        const button=document.createElement('button');
        button.type='button';button.dataset.myvorDeliverable='1';button.className='myvorImpactDeliverableButton';button.textContent='✨ Créer un livrable';
        button.addEventListener('click',()=>{
          const nav=Array.from(document.querySelectorAll('button,a')).find(el=>text(el).toLowerCase().includes('note builder')) as HTMLElement|undefined;
          window.dispatchEvent(new CustomEvent('myvor:create-deliverable',{detail:{source:'impact'}}));
          if(nav)nav.click();
        });
        toolbar.appendChild(button);
      }
    };
    const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(enhance);};
    schedule();const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,characterData:true});return()=>observer.disconnect();
  },[]);
  return null;
}
