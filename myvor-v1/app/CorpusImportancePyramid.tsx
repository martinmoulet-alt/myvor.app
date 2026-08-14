"use client";

import {useMemo,useState} from "react";
import {ChevronDown,ChevronUp,FileText} from "lucide-react";

type ImportanceLevel="Critique"|"Majeur"|"Secondaire"|"Contexte";

type CorpusItem={
  id:string;
  title:string;
  nature?:string|null;
  source_name?:string|null;
  published_at?:string|null;
  created_at?:string|null;
  confidence:number;
  reason:string;
  linkedToCurrent:boolean;
  linkedElsewhere:boolean;
};

type Classified=CorpusItem&{
  importance:ImportanceLevel;
  rank:number;
  importanceReason:string;
};

const LEVELS:[ImportanceLevel,number,string][]=[
  ["Critique",4,"Textes qui structurent ou modifient directement le cadre applicable"],
  ["Majeur",3,"Textes d’application ou évolutions à fort impact opérationnel"],
  ["Secondaire",2,"Textes pertinents mais non structurants à eux seuls"],
  ["Contexte",1,"Éléments utiles à la compréhension de l’environnement du dossier"],
];

function norm(value:unknown){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function dateOf(item:CorpusItem){const d=new Date(item.published_at||item.created_at||"");return Number.isFinite(d.getTime())?d.toLocaleDateString("fr-FR"):"";}

export function classifyCorpusImportance(item:CorpusItem):Pick<Classified,"importance"|"rank"|"importanceReason">{
  const text=norm(`${item.title} ${item.nature||""} ${item.reason||""}`);
  const structural=/\b(loi|reglement|directive|ordonnance|socle initial|texte socle|texte de reference)\b/.test(text);
  const directChange=/\b(modification directe|modifie|abroge|abrogation|remplace|nouvelle obligation|interdiction|echeance|seuil)\b/.test(text);
  const implementing=/\b(decret|arrete|decision d execution|acte d execution|acte delegue|application|precision)\b/.test(text);
  if((structural&&item.confidence>=.72)||directChange)return{importance:"Critique",rank:4,importanceReason:directChange?"Modifie directement une règle, une obligation, une échéance ou le texte de référence.":"Norme structurante directement liée au cœur du dossier."};
  if(implementing||item.confidence>=.82)return{importance:"Majeur",rank:3,importanceReason:implementing?"Met en œuvre ou précise concrètement le cadre applicable.":"Très forte proximité avec le dossier et impact opérationnel probable."};
  if(item.confidence>=.62)return{importance:"Secondaire",rank:2,importanceReason:"Pertinent pour le dossier, sans modification structurante identifiée."};
  return{importance:"Contexte",rank:1,importanceReason:"Utile pour comprendre l’environnement du dossier, sans effet juridique direct identifié."};
}

export default function CorpusImportancePyramid({items,onOpen}:{items:CorpusItem[];onOpen:(item:CorpusItem)=>void}){
  const classified=useMemo(()=>items.map(item=>({...item,...classifyCorpusImportance(item)})).sort((a,b)=>b.rank-a.rank||b.confidence-a.confidence),[items]);
  const [open,setOpen]=useState<ImportanceLevel>("Critique");
  const grouped=useMemo(()=>new Map(LEVELS.map(([level])=>[level,classified.filter(item=>item.importance===level)])),[classified]);

  return <div className="corpus-pyramid-wrap">
    <div className="corpus-pyramid" aria-label="Pyramide d’importance du corpus applicable">
      {LEVELS.map(([level,rank,description],index)=>{const rows=grouped.get(level)||[];const active=open===level;return <div key={level} className={`corpus-pyramid-tier tier-${rank} ${active?"active":""}`} style={{width:`${54+index*15}%`}}>
        <button type="button" onClick={()=>setOpen(active?level:level)} aria-expanded={active}>
          <span><b>{level}</b><small>{description}</small></span><strong>{rows.length}</strong>{active?<ChevronUp size={16}/>:<ChevronDown size={16}/>} 
        </button>
        {active&&<div className="corpus-pyramid-items">{rows.length?rows.map(item=><article key={item.id}>
          <div className="corpus-pyramid-item-main"><span className="corpus-pyramid-icon"><FileText size={15}/></span><div><div className="corpus-pyramid-meta">{[item.nature,dateOf(item),item.source_name].filter(Boolean).join(" · ")}</div><h3>{item.title}</h3><p>{item.importanceReason}</p><small>{item.reason}</small></div></div>
          <div className="corpus-pyramid-item-side"><strong>{Math.round(item.confidence*100)} %</strong><span>{item.linkedToCurrent?"Rattaché":item.linkedElsewhere?"Déjà lié ailleurs":"Détecté"}</span><button type="button" onClick={()=>onOpen(item)}>Voir le texte</button></div>
        </article>):<div className="corpus-pyramid-empty">Aucun texte dans ce niveau.</div>}</div>}
      </div>})}
    </div>
    <style jsx>{`
      .corpus-pyramid-wrap{padding:8px 0 2px}.corpus-pyramid{display:flex;flex-direction:column;align-items:center;gap:8px}.corpus-pyramid-tier{max-width:100%;transition:width .2s ease}.corpus-pyramid-tier>button{width:100%;border:0;border-radius:12px;padding:12px 15px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;text-align:left;cursor:pointer}.corpus-pyramid-tier>button span{min-width:0}.corpus-pyramid-tier>button b{display:block;font-size:12px;letter-spacing:.07em;text-transform:uppercase}.corpus-pyramid-tier>button small{display:block;margin-top:3px;font-size:10px;line-height:1.3;opacity:.76}.corpus-pyramid-tier>button strong{font-size:20px}.tier-4>button{background:#4d1020;color:#fff}.tier-3>button{background:#9c3a20;color:#fff}.tier-2>button{background:#d59523;color:#17263a}.tier-1>button{background:#e8eef6;color:#29425e}.corpus-pyramid-items{display:grid;gap:8px;margin:8px auto 2px;width:min(100%,980px)}.corpus-pyramid-items article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;background:white;border:1px solid #dfe7f0;border-radius:12px;padding:13px;box-shadow:0 5px 18px rgba(22,45,74,.05)}.corpus-pyramid-item-main{display:flex;gap:10px;min-width:0}.corpus-pyramid-icon{width:30px;height:30px;border-radius:9px;background:#eef4fb;display:grid;place-items:center;color:#173b67;flex:0 0 auto}.corpus-pyramid-meta{font-size:10px;color:#718198}.corpus-pyramid-items h3{margin:4px 0;font-size:13px;color:#15365d}.corpus-pyramid-items p{margin:0;color:#263f5e;font-size:11px;font-weight:800;line-height:1.4}.corpus-pyramid-items small{display:block;margin-top:5px;color:#6c7e93;font-size:10px;line-height:1.4}.corpus-pyramid-item-side{display:grid;justify-items:end;align-content:start;gap:6px}.corpus-pyramid-item-side>strong{font-size:18px;color:#0d396e}.corpus-pyramid-item-side>span{font-size:9px;font-weight:850;background:#eef5ff;color:#244f80;border-radius:999px;padding:5px 7px}.corpus-pyramid-item-side>button{border:1px solid #d4deeb;background:#fff;color:#17365f;border-radius:8px;padding:6px 8px;font-size:10px;font-weight:800;cursor:pointer}.corpus-pyramid-empty{padding:14px;text-align:center;color:#718198;background:#f8fbff;border-radius:10px}@media(max-width:700px){.corpus-pyramid-tier{width:100%!important}.corpus-pyramid-tier>button small{display:none}.corpus-pyramid-items article{grid-template-columns:1fr}.corpus-pyramid-item-side{justify-items:start}}
    `}</style>
  </div>;
}
