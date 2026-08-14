"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {BriefcaseBusiness,Building2,CalendarDays,Folder,MoreHorizontal,Search,Sparkles,Target,Trash2,Users,ShieldAlert,TrendingUp,BookOpen} from "lucide-react";
import {supabase} from "@/lib/supabase";

type ModuleTarget="impact"|"radar"|"builder";
type Dossier={
  id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string;
  watch_keywords?:string[];watch_priority_phrases?:string[];watch_excluded_keywords?:string[];
  sector?:string|null;activity?:string|null;strategic_issues?:string[]|null;risks_to_avoid?:string[]|null;
  opportunities?:string[]|null;client_position?:string|null;key_actors?:string[]|null;watch_topics?:string[]|null;
  watch_subtopics?:string[]|null;reference_texts?:string[]|null;key_deadlines?:string[]|null;internal_notes?:string|null;
};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string};
type Props={items:Dossier[];watch:Watch[];add:()=>void;search:(d:Dossier)=>void;searching:string|null;messages:Record<string,string>;open:(d:Dossier)=>void;launch:(target:ModuleTarget,dossier:Dossier,watchIds?:string|string[])=>void};

type EditDraft={client:string;title:string;objective:string;context:string;status:string};

function list(value?:string[]|null){return Array.isArray(value)?value.filter(Boolean):[];}
function profileEmpty(d:Dossier){return !d.sector&&!d.activity&&!list(d.strategic_issues).length&&!list(d.risks_to_avoid).length&&!list(d.opportunities).length&&!d.client_position&&!list(d.key_actors).length&&!list(d.watch_topics).length&&!list(d.watch_subtopics).length&&!list(d.reference_texts).length&&!list(d.key_deadlines).length&&!d.internal_notes;}
function statusClass(status:string){const value=status.toLocaleLowerCase("fr-FR");return value==="actif"?"active":value==="archivé"?"archived":"paused";}

export default function DossiersCorporate({items,watch,add,open,launch}:Props){
  const [query,setQuery]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [menuId,setMenuId]=useState<string|null>(null);
  const [generating,setGenerating]=useState(false);
  const [generationMessage,setGenerationMessage]=useState("");
  const [revision,setRevision]=useState(0);
  const [editing,setEditing]=useState<Dossier|null>(null);
  const [saving,setSaving]=useState(false);
  const [editMessage,setEditMessage]=useState("");
  const [deleting,setDeleting]=useState<string|null>(null);
  const [draft,setDraft]=useState<EditDraft>({client:"",title:"",objective:"",context:"",status:"Actif"});
  const attempted=useRef(new Set<string>());

  const filtered=useMemo(()=>items.filter(d=>{const q=query.trim().toLocaleLowerCase("fr-FR");return !q||`${d.client} ${d.title} ${d.objective} ${d.context||""}`.toLocaleLowerCase("fr-FR").includes(q);}).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()),[items,query,revision]);
  const selected=items.find(d=>d.id===selectedId)||filtered[0]||null;
  const related=useMemo(()=>selected?watch.filter(w=>w.dossier_id===selected.id):[],[selected?.id,watch]);

  useEffect(()=>{if(!filtered.length){setSelectedId(null);return;}if(!selectedId||!filtered.some(d=>d.id===selectedId))setSelectedId(filtered[0].id);},[filtered,selectedId]);
  useEffect(()=>{if(!selected||!profileEmpty(selected)||attempted.current.has(selected.id))return;attempted.current.add(selected.id);const timer=setTimeout(()=>void generateStrategy(selected,true),350);return()=>clearTimeout(timer);},[selected?.id,revision]);

  async function generateStrategy(dossier:Dossier,automatic=false){
    if(!supabase||generating)return;
    setGenerating(true);setGenerationMessage(automatic?"Myvor génère automatiquement la fiche stratégique…":"Régénération de la fiche stratégique…");
    try{
      const dossierWatch=watch.filter(item=>item.dossier_id===dossier.id).slice(0,20).map(item=>({title:item.title,nature:item.nature,urgency:item.urgency,source_url:item.source_url}));
      const {data,error}=await supabase.functions.invoke("dossier-profile",{body:{dossier:{client:dossier.client,title:dossier.title,objective:dossier.objective,context:dossier.context,watch_keywords:dossier.watch_keywords||[],watch_priority_phrases:dossier.watch_priority_phrases||[],watch_excluded_keywords:dossier.watch_excluded_keywords||[]},items:dossierWatch}});
      if(error||!data?.profile)throw error||new Error("Profil stratégique indisponible");
      const p=data.profile;
      const payload={sector:p.sector||null,activity:p.activity||null,strategic_issues:list(p.strategic_issues),risks_to_avoid:list(p.risks_to_avoid),opportunities:list(p.opportunities),client_position:p.client_position||null,key_actors:list(p.key_actors),watch_topics:list(p.watch_topics),watch_subtopics:list(p.watch_subtopics),reference_texts:list(p.reference_texts),key_deadlines:list(p.key_deadlines),internal_notes:p.internal_notes||null};
      const {data:updated,error:saveError}=await supabase.from("dossiers").update(payload).eq("id",dossier.id).select("*").single();
      if(saveError)throw saveError;
      Object.assign(dossier,updated as Dossier);setRevision(v=>v+1);setGenerationMessage("Fiche stratégique générée et enregistrée automatiquement.");
      window.dispatchEvent(new Event("pageshow"));
    }catch(error:any){setGenerationMessage(`Fiche stratégique non générée : ${error?.message||"erreur inconnue"}`);}finally{setGenerating(false);}
  }

  function beginEdit(dossier:Dossier){setMenuId(null);setEditMessage("");setEditing(dossier);setDraft({client:dossier.client,title:dossier.title,objective:dossier.objective,context:dossier.context||"",status:dossier.status||"Actif"});}
  async function saveDossier(e:React.FormEvent){e.preventDefault();if(!supabase||!editing||saving)return;setSaving(true);setEditMessage("");try{const payload={client:draft.client.trim(),title:draft.title.trim(),objective:draft.objective.trim(),context:draft.context.trim(),status:draft.status};if(!payload.client||!payload.title||!payload.objective)throw new Error("Client, intitulé et objectif sont obligatoires.");const{data,error}=await supabase.from("dossiers").update(payload).eq("id",editing.id).select("*").single();if(error)throw error;Object.assign(editing,data as Dossier);attempted.current.delete(editing.id);setEditing(null);setRevision(v=>v+1);window.dispatchEvent(new Event("pageshow"));}catch(error:any){setEditMessage(error?.message||"Enregistrement impossible");}finally{setSaving(false);}}
  async function removeDossier(dossier:Dossier){if(!supabase||deleting)return;if(!window.confirm(`Supprimer définitivement le dossier « ${dossier.title} » ?`))return;setDeleting(dossier.id);try{await supabase.from("productions").delete().eq("dossier_id",dossier.id);await supabase.from("actions").delete().eq("dossier_id",dossier.id);const{error}=await supabase.from("dossiers").delete().eq("id",dossier.id);if(error)throw error;window.dispatchEvent(new Event("pageshow"));if(selectedId===dossier.id)setSelectedId(null);}catch(error:any){setGenerationMessage(`Suppression impossible : ${error?.message||"erreur inconnue"}`);}finally{setDeleting(null);}}

  const chipList=(values?:string[]|null)=>list(values).length?<div className="strategy-chips">{list(values).map((v,i)=><span key={`${v}-${i}`}>{v}</span>)}</div>:<p className="strategy-empty">Non renseigné.</p>;

  return <div className="dossiers-workspace">
    <style jsx>{`
      .dossiers-workspace{display:grid;gap:16px;color:#102f57}.dossiers-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}.dossiers-head h1{margin:0;font-size:28px;color:#102f57}.dossiers-head p{margin:6px 0 0;color:#718198}.primary{border:0;border-radius:11px;background:linear-gradient(135deg,#ffc928,#f3bd3e);color:#0a213a;padding:11px 15px;font-weight:900;cursor:pointer}.search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #dfe7f0;border-radius:12px;padding:10px 12px;max-width:420px}.search input{border:0;outline:0;background:transparent;width:100%;font:inherit}.workspace{display:grid;grid-template-columns:minmax(280px,34%) minmax(0,1fr);gap:16px;align-items:start}.panel{background:#fff;border:1px solid #dfe7f0;border-radius:18px;box-shadow:0 12px 30px rgba(16,47,87,.06);overflow:hidden}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 17px;border-bottom:1px solid #e6edf5}.panel-head span{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#8493a6;font-weight:900}.panel-head h2{margin:4px 0 0;font-size:19px}.portfolio{display:grid;gap:8px;padding:10px;max-height:72vh;overflow:auto}.dossier-card{border:1px solid #e1e8f1;background:#fbfdff;border-radius:13px;padding:13px;text-align:left;cursor:pointer;transition:.16s ease}.dossier-card:hover{transform:translateY(-1px);border-color:#bfcfe0}.dossier-card.selected{background:#0a2347;color:#fff;border-color:#173d6a;box-shadow:0 10px 24px rgba(4,25,54,.16)}.dossier-top{display:flex;justify-content:space-between;gap:10px}.identity{display:flex;gap:10px;min-width:0}.folder{width:32px;height:32px;border-radius:9px;background:#eef4fb;color:#173b67;display:grid;place-items:center;flex:0 0 auto}.selected .folder{background:rgba(255,255,255,.1);color:#f3bd3e}.identity small{display:block;color:#7a8b9f;font-size:10px;font-weight:800}.selected .identity small{color:#9fb4ce}.identity h3{margin:3px 0 0;font-size:13px;color:inherit}.dossier-card p{margin:9px 0;color:#5f7187;font-size:11px;line-height:1.45}.selected p{color:#c1cede}.meta{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.status{font-size:9px;font-weight:900;border-radius:999px;padding:5px 7px;background:#eef4fb;color:#35516f}.selected .status{background:rgba(255,255,255,.1);color:#dbe8f7}.status.active{background:#eaf7ef;color:#207044}.selected .status.active{background:rgba(70,190,120,.18);color:#9be4b8}.menu-wrap{position:relative}.menu-button{border:0;background:transparent;color:inherit;cursor:pointer}.menu{position:absolute;right:0;top:28px;z-index:10;width:190px;background:#fff;border:1px solid #dfe7f0;border-radius:10px;box-shadow:0 14px 34px rgba(8,29,56,.15);padding:6px;display:grid}.menu button{border:0;background:transparent;text-align:left;padding:8px;border-radius:7px;font-size:11px;cursor:pointer}.menu button:hover{background:#f3f6fa}.menu .danger{color:#a52b2b}.strategy{padding:18px;display:grid;gap:14px}.strategy-hero{background:linear-gradient(145deg,#071936,#0b2e68);color:#fff;border-radius:16px;padding:18px;display:flex;justify-content:space-between;gap:16px}.strategy-hero small{color:#8facd0;text-transform:uppercase;letter-spacing:.08em;font-weight:850}.strategy-hero h2{margin:5px 0 4px}.strategy-hero p{margin:0;color:#c2d0e1;font-size:12px}.strategy-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;justify-content:flex-end}.strategy-actions button{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:850;cursor:pointer}.strategy-actions .gold{background:#f3bd3e;color:#10213a;border-color:#f3bd3e}.message{padding:10px 12px;border-radius:10px;background:#f5f8fc;color:#34506f;font-size:11px}.strategy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.strategy-card{border:1px solid #e0e8f2;border-radius:13px;padding:13px;background:#fbfdff;min-height:96px}.strategy-card.wide{grid-column:1/-1}.strategy-card h3{margin:0 0 8px;font-size:12px;color:#17365f;display:flex;align-items:center;gap:7px}.strategy-card p{margin:0;color:#53677e;font-size:11px;line-height:1.5}.strategy-chips{display:flex;gap:6px;flex-wrap:wrap}.strategy-chips span{display:inline-flex;background:#eef5ff;color:#294f78;border:1px solid #d9e6f5;border-radius:999px;padding:5px 7px;font-size:9px;font-weight:780}.strategy-empty{color:#8a98a9!important;font-style:italic}.no-selection{padding:36px;text-align:center;color:#75869b}.modal-backdrop{position:fixed;inset:0;z-index:100;background:rgba(4,15,31,.65);display:grid;place-items:center;padding:18px}.modal{width:min(600px,100%);background:#fff;border-radius:16px;padding:18px;display:grid;gap:12px}.modal-head{display:flex;justify-content:space-between}.modal-head h2{margin:0}.modal-head button{border:0;background:transparent;font-size:24px}.modal label{display:grid;gap:5px;font-size:11px;font-weight:800}.modal input,.modal textarea,.modal select{border:1px solid #d7e1ec;border-radius:9px;padding:9px;font:inherit}.modal textarea{min-height:70px;resize:vertical}.modal-actions{display:flex;justify-content:flex-end;gap:8px}.modal-actions button{border:1px solid #d7e1ec;background:#fff;border-radius:9px;padding:9px 12px;font-weight:800}.modal-actions .save{background:#102f57;color:#fff;border-color:#102f57}@media(max-width:900px){.workspace{grid-template-columns:1fr}.portfolio{max-height:360px}.strategy-grid{grid-template-columns:1fr}.strategy-card.wide{grid-column:auto}.strategy-hero{display:grid}}@media(max-width:600px){.dossiers-head{align-items:flex-start;display:grid}.primary{width:100%}.search{max-width:none}.strategy-actions{justify-content:flex-start}}
    `}</style>

    <div className="dossiers-head"><div><h1>Dossiers clients</h1><p>Un portefeuille à gauche. La fiche stratégique du dossier sélectionné à droite.</p></div><button className="primary" onClick={add}>+ Nouveau dossier</button></div>
    <label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un dossier ou un client…"/></label>

    <div className="workspace">
      <section className="panel"><div className="panel-head"><div><span>Portefeuille</span><h2>Dossiers</h2></div><strong>{filtered.length}</strong></div><div className="portfolio">{filtered.length?filtered.map(dossier=><article key={dossier.id} className={`dossier-card ${selected?.id===dossier.id?"selected":""}`} onClick={()=>{setSelectedId(dossier.id);setGenerationMessage("");}}><div className="dossier-top"><div className="identity"><span className="folder"><Folder size={17}/></span><div><small>{dossier.client}</small><h3>{dossier.title}</h3></div></div><div className="menu-wrap"><button className="menu-button" onClick={e=>{e.stopPropagation();setMenuId(menuId===dossier.id?null:dossier.id);}}><MoreHorizontal size={18}/></button>{menuId===dossier.id&&<div className="menu" onClick={e=>e.stopPropagation()}><button onClick={()=>open(dossier)}>Ouvrir le dossier complet</button><button onClick={()=>beginEdit(dossier)}>Modifier</button><button onClick={()=>launch("impact",dossier)}>Score d’urgence</button><button className="danger" disabled={deleting===dossier.id} onClick={()=>void removeDossier(dossier)}><Trash2 size={12}/> {deleting===dossier.id?"Suppression…":"Supprimer"}</button></div>}</div></div><p>{dossier.objective||"Objectif à préciser"}</p><div className="meta"><span className={`status ${statusClass(dossier.status)}`}>{dossier.status}</span><span style={{fontSize:9}}>{list(dossier.strategic_issues).length?"Fiche stratégique prête":"Fiche à générer"}</span></div></article>):<div className="no-selection"><BriefcaseBusiness size={32}/><h3>Aucun dossier</h3><p>Créez votre premier dossier client.</p></div>}</div></section>

      <section className="panel">{selected?<div className="strategy"><div className="strategy-hero"><div><small>Fiche stratégique</small><h2>{selected.title}</h2><p>{selected.client} · {selected.status}</p></div><div className="strategy-actions"><button className="gold" onClick={()=>void generateStrategy(selected,false)} disabled={generating}><Sparkles size={13}/> {generating?"Génération…":"Régénérer avec Myvor"}</button><button onClick={()=>open(selected)}>Ouvrir le dossier complet</button></div></div>{generationMessage&&<div className="message">{generationMessage}</div>}
        <div className="strategy-grid">
          <div className="strategy-card"><h3><Target size={15}/> Objectif client</h3><p>{selected.objective||"Non renseigné."}</p></div>
          <div className="strategy-card"><h3><Building2 size={15}/> Secteur & activité</h3><p><b>{selected.sector||"Secteur à préciser"}</b><br/>{selected.activity||"Activité à préciser"}</p></div>
          <div className="strategy-card wide"><h3><BriefcaseBusiness size={15}/> Enjeux stratégiques</h3>{chipList(selected.strategic_issues)}</div>
          <div className="strategy-card"><h3><ShieldAlert size={15}/> Risques à éviter</h3>{chipList(selected.risks_to_avoid)}</div>
          <div className="strategy-card"><h3><TrendingUp size={15}/> Opportunités</h3>{chipList(selected.opportunities)}</div>
          <div className="strategy-card"><h3><Users size={15}/> Acteurs clés</h3>{chipList(selected.key_actors)}</div>
          <div className="strategy-card"><h3><Search size={15}/> Thèmes de veille</h3>{chipList([...(selected.watch_topics||[]),...(selected.watch_subtopics||[])])}</div>
          <div className="strategy-card"><h3><BookOpen size={15}/> Textes de référence</h3>{chipList(selected.reference_texts)}</div>
          <div className="strategy-card"><h3><CalendarDays size={15}/> Échéances clés</h3>{chipList(selected.key_deadlines)}</div>
          <div className="strategy-card wide"><h3><Target size={15}/> Position du client</h3><p>{selected.client_position||"Position à préciser."}</p></div>
          {selected.internal_notes&&<div className="strategy-card wide"><h3>Notes stratégiques</h3><p>{selected.internal_notes}</p></div>}
        </div>
      </div>:<div className="no-selection"><Sparkles size={34}/><h2>Sélectionnez un dossier</h2><p>Sa fiche stratégique apparaîtra ici et sera générée automatiquement si nécessaire.</p></div>}</section>
    </div>

    {editing&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setEditing(null);}}><form className="modal" onSubmit={saveDossier}><div className="modal-head"><h2>Modifier le dossier</h2><button type="button" onClick={()=>setEditing(null)}>×</button></div>{editMessage&&<div className="message">{editMessage}</div>}<label>Client<input value={draft.client} onChange={e=>setDraft({...draft,client:e.target.value})}/></label><label>Intitulé<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Objectif<textarea value={draft.objective} onChange={e=>setDraft({...draft,objective:e.target.value})}/></label><label>Contexte<textarea value={draft.context} onChange={e=>setDraft({...draft,context:e.target.value})}/></label><label>Statut<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option>Actif</option><option>En pause</option><option>Terminé</option><option>Archivé</option></select></label><div className="modal-actions"><button type="button" onClick={()=>setEditing(null)}>Annuler</button><button className="save" disabled={saving}>{saving?"Enregistrement…":"Enregistrer"}</button></div></form></div>}
  </div>;
}
