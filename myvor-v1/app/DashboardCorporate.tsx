"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowRight,Bell,BriefcaseBusiness,CalendarDays,FileSearch,Search,ShieldCheck,Sparkles,Target} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Tab="dashboard"|"dossiers"|"veille"|"impact"|"radar"|"builder";
type Dossier={id:string;client:string;title:string;objective:string;context:string;status:string;created_at:string};
type Watch={id:string;title:string;nature:string;source_url:string;dossier_id:string|null;urgency:string;created_at:string;source_name?:string|null;published_at?:string|null};
export type Action={id:string;dossier_id:string|null;type:string;title:string;description:string|null;actor_name:string|null;priority:string;status:string;due_date:string|null;created_at:string;updated_at:string};
type UserProfile={job_type:string|null;topics:string[]|null;institutions:string[]|null;alert_level:string|null};
type SearchResult={key:string;kind:"Dossier"|"Veille"|"Action";title:string;meta:string;target:"dossier"|"watch"|"action";id:string};
type DossierPriority={dossier:Dossier;score:number;reasons:string[]};

const DAY=24*60*60*1000;
const JOB_LABELS:Record<string,string>={cabinet:"Cabinet d’affaires publiques",corporate:"Direction affaires publiques",consultant:"Consultant indépendant",federation:"Fédération ou organisation",other:"Profil personnalisé"};
const ALERT_LABELS:Record<string,string>={essential:"Essentiel",reactive:"Réactif",realtime:"Temps réel"};

function rank(value:string){return value==="absolument urgent"?4:value==="fort"?3:value==="moyen"?2:1;}
function safeTime(value:string|null|undefined){const n=value?new Date(value).getTime():0;return Number.isFinite(n)?n:0;}
function searchable(...values:(string|null|undefined)[]){return values.filter(Boolean).join(" ").toLocaleLowerCase("fr");}
function shortDate(value:string|null){if(!value)return"—";const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short"}).format(d):"—";}
function actionDestination(type:string):Tab{return type==="contact"?"radar":type==="note_client"||type==="amendement"?"builder":type==="analyse"?"impact":"dossiers";}
function actionCta(type:string){return type==="contact"?"Ouvrir le radar":type==="note_client"?"Rédiger la note":type==="amendement"?"Préparer l’amendement":type==="analyse"?"Analyser l’impact":"Ouvrir l’action";}
function firstNameFromSession(session:any){const raw=String(session?.user?.user_metadata?.full_name||session?.user?.user_metadata?.name||"").trim();const email=String(session?.user?.email||"").split("@")[0].split(/[._-]/)[0];return(raw||email).split(" ")[0]||"";}
function isActiveDossier(status:string){const normalized=status.toLocaleLowerCase("fr");return !["clos","clôtur","archive","termin","inactif"].some(token=>normalized.includes(token));}
function deadlinePoints(dueDate:string|null){if(!dueDate)return 0;const due=safeTime(dueDate);if(!due)return 0;const days=(due-Date.now())/DAY;if(days<0)return 20;if(days<=1)return 20;if(days<=3)return 16;if(days<=7)return 12;if(days<=14)return 7;if(days<=30)return 3;return 0;}

export default function DashboardCorporate({dossiers,watch,actions,actionsLoading,actionsError,go}:{dossiers:Dossier[];watch:Watch[];actions:Action[];actionsLoading:boolean;actionsError:string;go:(tab:Tab)=>void}){
  const[searchOpen,setSearchOpen]=useState(false);
  const[searchQuery,setSearchQuery]=useState("");
  const[displayName,setDisplayName]=useState("");
  const[profile,setProfile]=useState<UserProfile>({job_type:null,topics:[],institutions:[],alert_level:"reactive"});
  const[currentUserId,setCurrentUserId]=useState("");
  const[activeOrganizationId,setActiveOrganizationId]=useState("");
  const[pinnedDossierId,setPinnedDossierId]=useState("");
  const[prioritySaving,setPrioritySaving]=useState(false);
  const[priorityError,setPriorityError]=useState("");

  useEffect(()=>{
    if(!supabase)return;
    let active=true;
    async function loadPersonalization(){
      const{data:sessionData}=await supabase!.auth.getSession();
      if(!active)return;
      const session=sessionData.session;
      setDisplayName(firstNameFromSession(session));
      const userId=session?.user?.id;
      if(!userId)return;
      setCurrentUserId(userId);
      const[profileRes,membershipRes]=await Promise.all([
        supabase!.from("user_profiles").select("job_type,topics,institutions,alert_level,active_organization_id").eq("user_id",userId).maybeSingle(),
        supabase!.from("organization_members").select("organization_id").eq("user_id",userId),
      ]);
      if(!active)return;
      const data=profileRes.data;
      if(data)setProfile({job_type:data.job_type||null,topics:Array.isArray(data.topics)?data.topics:[],institutions:Array.isArray(data.institutions)?data.institutions:[],alert_level:data.alert_level||"reactive"});
      const memberships=Array.isArray(membershipRes.data)?membershipRes.data:[];
      const preferredOrganizationId=String(data?.active_organization_id||"");
      const organizationId=String(memberships.some(item=>item.organization_id===preferredOrganizationId)?preferredOrganizationId:memberships[0]?.organization_id||"");
      setActiveOrganizationId(organizationId);
      if(!organizationId){setPinnedDossierId("");return;}
      const{data:preference}=await supabase!.from("workspace_preferences").select("priority_dossier_id").eq("user_id",userId).eq("organization_id",organizationId).maybeSingle();
      if(!active)return;
      setPinnedDossierId(String(preference?.priority_dossier_id||""));
    }
    void loadPersonalization();
    return()=>{active=false;};
  },[]);

  const openActions=useMemo(()=>actions.filter(action=>action.status!=="termine"),[actions]);
  const dossierPriorities=useMemo<DossierPriority[]>(()=>{
    const now=Date.now();
    return dossiers.map(dossier=>{
      const linkedWatch=watch.filter(item=>item.dossier_id===dossier.id);
      const linkedActions=openActions.filter(action=>action.dossier_id===dossier.id);
      const watchRank=Math.max(0,...linkedWatch.map(item=>rank(item.urgency)));
      const actionRank=Math.max(0,...linkedActions.map(action=>rank(action.priority)));
      const nearestDue=linkedActions.map(action=>action.due_date).filter((value):value is string=>Boolean(value)).sort((a,b)=>Math.abs(safeTime(a)-now)-Math.abs(safeTime(b)-now))[0]||null;
      const recentActivity=linkedWatch.filter(item=>now-safeTime(item.created_at)<=7*DAY).length+linkedActions.filter(action=>now-safeTime(action.updated_at||action.created_at)<=7*DAY).length;
      const watchScore=watchRank*10;
      const actionScore=Math.round(actionRank*7.5);
      const deadlineScore=deadlinePoints(nearestDue);
      const activityScore=Math.min(10,recentActivity*2);
      let score=Math.min(100,watchScore+actionScore+deadlineScore+activityScore);
      if(!isActiveDossier(dossier.status))score=Math.min(score,10);
      const reasons:string[]=[];
      if(watchRank>=4)reasons.push("veille absolument urgente");else if(watchRank>=3)reasons.push("veille à forte urgence");
      if(actionRank>=4)reasons.push("action absolument urgente");else if(actionRank>=3)reasons.push("action prioritaire ouverte");
      if(deadlineScore>=16)reasons.push("échéance imminente");else if(deadlineScore>=7)reasons.push("échéance proche");
      if(activityScore>=6)reasons.push("forte activité récente");
      if(!reasons.length&&recentActivity>0)reasons.push("activité récente");
      if(!reasons.length)reasons.push("aucun signal urgent détecté");
      return{dossier,score,reasons};
    }).sort((a,b)=>b.score-a.score||safeTime(b.dossier.created_at)-safeTime(a.dossier.created_at));
  },[dossiers,watch,openActions]);

  const automaticPriority=useMemo(()=>dossierPriorities.find(item=>isActiveDossier(item.dossier.status))||dossierPriorities[0]||null,[dossierPriorities]);
  const pinnedDossier=useMemo(()=>pinnedDossierId?dossiers.find(item=>item.id===pinnedDossierId)||null:null,[pinnedDossierId,dossiers]);
  const priorityDossier=pinnedDossier||automaticPriority?.dossier||null;
  const priorityDetails=priorityDossier?dossierPriorities.find(item=>item.dossier.id===priorityDossier.id)||null:null;
  const priorityScore=priorityDetails?.score||0;
  const priorityReason=pinnedDossier?"Choix manuel : ce dossier reste en tête jusqu’à ce que vous repassiez en mode automatique.":priorityDetails?.reasons.slice(0,2).join(" · ")||"Myvor attend davantage de signaux pour établir une priorité.";

  const sortedActions=useMemo(()=>[...openActions].sort((a,b)=>rank(b.priority)-rank(a.priority)||(safeTime(a.due_date)||Number.MAX_SAFE_INTEGER)-(safeTime(b.due_date)||Number.MAX_SAFE_INTEGER)||safeTime(b.updated_at)-safeTime(a.updated_at)),[openActions]);
  const deadlines=useMemo(()=>openActions.filter(action=>action.due_date&&safeTime(action.due_date)>=Date.now()-86400000).sort((a,b)=>safeTime(a.due_date)-safeTime(b.due_date)).slice(0,4),[openActions]);
  const urgentAction=sortedActions.find(action=>rank(action.priority)>=3)||sortedActions[0]||null;
  const urgentWatch=useMemo(()=>[...watch].sort((a,b)=>rank(b.urgency)-rank(a.urgency)||safeTime(b.created_at)-safeTime(a.created_at)),[watch]);

  const relevantWatch=useMemo(()=>{
    const needles=[...(profile.topics||[]),...(profile.institutions||[])].map(value=>value.toLocaleLowerCase("fr"));
    const matched=needles.length?watch.filter(item=>{const haystack=searchable(item.title,item.nature,item.source_name);return needles.some(needle=>haystack.includes(needle));}):[];
    const source=matched.length?matched:urgentWatch;
    return [...source].sort((a,b)=>rank(b.urgency)-rank(a.urgency)||safeTime(b.created_at)-safeTime(a.created_at)).slice(0,3);
  },[profile.topics,profile.institutions,watch,urgentWatch]);

  const priorityWatch=relevantWatch[0]||urgentWatch[0]||null;
  const jobLabel=profile.job_type?JOB_LABELS[profile.job_type]||"Profil personnalisé":"Espace personnalisé";
  const alertLabel=ALERT_LABELS[profile.alert_level||"reactive"]||"Réactif";
  const dateLabel=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  const dossierName=(id:string|null)=>id?dossiers.find(item=>item.id===id)?.title||"Dossier lié":"Sans dossier";

  const openExactDossier=(id:string)=>{sessionStorage.setItem("myvor:open-dossier",id);go("dossiers");};
  const openExactWatch=(id:string)=>{sessionStorage.setItem("myvor:open-watch",id);go("veille");};
  const openExactAction=(action:Action)=>{if(action.dossier_id){sessionStorage.setItem("myvor:open-dossier",action.dossier_id);sessionStorage.setItem("myvor:focus-action",JSON.stringify({id:action.id,type:action.type,title:action.title,actor_name:action.actor_name||""}));go("dossiers");return;}go(actionDestination(action.type));};

  async function changePriority(value:string){
    if(!supabase||prioritySaving||!currentUserId||!activeOrganizationId)return;
    setPrioritySaving(true);setPriorityError("");
    const{error}=await supabase.from("workspace_preferences").upsert({user_id:currentUserId,organization_id:activeOrganizationId,priority_dossier_id:value||null,updated_at:new Date().toISOString()},{onConflict:"user_id,organization_id"});
    setPrioritySaving(false);
    if(error){setPriorityError("Impossible d’enregistrer la priorité.");return;}
    setPinnedDossierId(value);
  }

  const searchResults=useMemo<SearchResult[]>(()=>{
    const query=searchQuery.trim().toLocaleLowerCase("fr");if(!query)return[];
    const dossierResults=dossiers.filter(d=>searchable(d.title,d.client,d.objective,d.context,d.status).includes(query)).slice(0,4).map(d=>({key:`d-${d.id}`,kind:"Dossier" as const,title:d.title,meta:d.client||"Dossier client",target:"dossier" as const,id:d.id}));
    const watchResults=watch.filter(item=>searchable(item.title,item.nature,item.urgency,item.source_name).includes(query)).slice(0,4).map(item=>({key:`w-${item.id}`,kind:"Veille" as const,title:item.title,meta:[item.nature,item.urgency].filter(Boolean).join(" · "),target:"watch" as const,id:item.id}));
    const actionResults=actions.filter(action=>searchable(action.title,action.description,action.actor_name,action.priority,dossierName(action.dossier_id)).includes(query)).slice(0,4).map(action=>({key:`a-${action.id}`,kind:"Action" as const,title:action.title,meta:[dossierName(action.dossier_id),action.priority].filter(Boolean).join(" · "),target:"action" as const,id:action.id}));
    return[...dossierResults,...watchResults,...actionResults].slice(0,10);
  },[searchQuery,dossiers,watch,actions]);

  const closeSearch=()=>{setSearchOpen(false);setSearchQuery("");};
  const openSearchResult=(result:SearchResult)=>{closeSearch();if(result.target==="dossier"){openExactDossier(result.id);return;}if(result.target==="watch"){openExactWatch(result.id);return;}const action=actions.find(item=>item.id===result.id);if(action)openExactAction(action);};

  return <div className="personal-dashboard">
    <style jsx global>{`
      body:has(.personal-dashboard),.app:has(.personal-dashboard){background:#031126}.app:has(.personal-dashboard) .topbar{background:#031126;border-bottom:1px solid #18304c;box-shadow:none}.app:has(.personal-dashboard) .sidebar{background:linear-gradient(180deg,#031126 0%,#061a33 100%);border-right:1px solid #18304c;color:#d4deeb}.app:has(.personal-dashboard) .logo{background:transparent;color:#f5b51b;border:1px solid rgba(245,181,27,.35);box-shadow:0 0 24px rgba(245,181,27,.12)}.app:has(.personal-dashboard) .navbtn{color:#d2dbea;border:1px solid transparent;border-radius:10px}.app:has(.personal-dashboard) .navbtn:hover{background:#0b213d;border-color:#1b3a5a;color:#fff}.app:has(.personal-dashboard) .navbtn.active{background:#102b4d;color:#ffc62a;border-color:#1c3b5c;box-shadow:inset 3px 0 0 #ffc62a}.app:has(.personal-dashboard) .main{max-width:none;margin:0;padding:24px;background:radial-gradient(circle at 50% -20%,rgba(26,73,124,.18),transparent 38%),linear-gradient(180deg,#031126,#04172b);min-height:calc(100vh - 68px)}
      .personal-dashboard{max-width:1380px;margin:0 auto;color:#f7f9fc;display:grid;gap:16px}.pd-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.pd-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#e0b746;font-weight:900;margin-bottom:7px}.pd-top h1{font-size:30px;line-height:1.08;margin:0;color:#fff;letter-spacing:-.03em}.pd-top p{margin:8px 0 0;color:#a8b7c9;font-size:13px}.pd-top-right{display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end}.pd-pill{border:1px solid #274561;background:#071b34;color:#b9c9da;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:800}.pd-pill.gold{border-color:rgba(224,183,70,.45);color:#e9c55e;background:rgba(224,183,70,.08)}.pd-search{width:40px;height:40px;border:1px solid #29435f;background:#07182e;border-radius:10px;color:#b9c8d8;display:grid;place-items:center;cursor:pointer}.pd-search:hover{border-color:#456a90;color:#fff}
      .pd-priority{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:20px;align-items:center;border:1px solid rgba(224,183,70,.36);background:linear-gradient(135deg,rgba(224,183,70,.11),rgba(10,35,65,.92) 38%,#071a31);border-radius:16px;padding:22px 24px;box-shadow:0 16px 45px rgba(0,0,0,.12)}.pd-priority-label{display:flex;align-items:center;gap:8px;color:#e7bf4f;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.pd-priority h2{margin:8px 0 5px;font-size:23px;color:#fff;letter-spacing:-.02em}.pd-priority p{margin:0;max-width:820px;color:#b8c8d9;line-height:1.55}.pd-priority-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}.pd-priority-score,.pd-priority-mode{border:1px solid #2b4c68;background:#0b2745;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;color:#d9e6f2}.pd-priority-score{border-color:rgba(224,183,70,.4);color:#f0cb62;background:rgba(224,183,70,.08)}.pd-priority-reason{font-size:10px;color:#91a8bd}.pd-priority-actions{display:grid;gap:9px}.pd-priority-select{width:100%;min-height:40px;border:1px solid #294761;background:#06182e;color:#eef4fb;border-radius:10px;padding:0 10px;font-size:11px;font-weight:750;outline:none}.pd-priority-select:focus{border-color:#e0b746}.pd-priority-error{font-size:10px;color:#ff8b93}.pd-primary{min-height:44px;border:1px solid #e0b746;background:#e0b746;color:#07162c;border-radius:11px;padding:0 17px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;white-space:nowrap}.pd-primary:hover{background:#edc65e}.pd-primary:disabled,.pd-priority-select:disabled{opacity:.6;cursor:not-allowed}
      .pd-grid{display:grid;grid-template-columns:1.25fr 1fr .95fr;gap:14px}.pd-panel{border:1px solid #173552;background:linear-gradient(145deg,#06172c,#081e38);border-radius:14px;overflow:hidden;min-width:0}.pd-panel-head{min-height:52px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #16324d}.pd-panel-head h3{margin:0;color:#fff;font-size:14px;display:flex;align-items:center;gap:8px}.pd-link{border:0;background:transparent;color:#e3bb4b;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:5px}.pd-body{padding:13px 16px}.pd-list{display:grid}.pd-item{width:100%;border:0;border-bottom:1px solid #142f49;background:transparent;color:#fff;text-align:left;padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;cursor:pointer}.pd-item:last-child{border-bottom:0}.pd-item:hover b{color:#f2c85a}.pd-item b{display:block;font-size:12px;line-height:1.4}.pd-item small{display:block;color:#8298af;font-size:10px;margin-top:4px}.pd-urgency{align-self:start;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;text-transform:uppercase;background:#102944;color:#9db4cc}.pd-urgency.fort,.pd-urgency.absolument-urgent{background:rgba(205,55,67,.13);color:#ff818b}.pd-urgency.moyen{background:rgba(224,183,70,.12);color:#e7c151}.pd-empty{padding:22px 2px;color:#7f94aa;font-size:12px;line-height:1.5}
      .pd-action-title{font-size:19px;line-height:1.25;color:#fff;margin:2px 0 8px}.pd-action-context{color:#9eb1c6;font-size:11px;line-height:1.55;margin-bottom:16px}.pd-action-meta{display:grid;gap:8px;margin-bottom:16px}.pd-action-meta span{display:flex;gap:8px;align-items:center;color:#b6c6d7;font-size:11px}.pd-action-meta svg{color:#e0b746;flex:none}.pd-secondary{width:100%;min-height:40px;border:1px solid #284763;background:#0a213c;color:#eef4fb;border-radius:10px;font-weight:850;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}.pd-secondary:hover{border-color:#456b90;background:#0c2949}
      .pd-config{display:grid;gap:14px}.pd-config-block strong{display:block;color:#fff;font-size:11px;margin-bottom:8px}.pd-chips{display:flex;gap:6px;flex-wrap:wrap}.pd-chip{border:1px solid #24435f;background:#091e38;border-radius:999px;color:#aebfd0;padding:5px 8px;font-size:9px}.pd-config-note{border:1px solid rgba(224,183,70,.24);background:rgba(224,183,70,.06);border-radius:10px;padding:10px;color:#c5d2df;font-size:10px;line-height:1.5}.pd-config-note b{color:#ebc657}
      .pd-bottom{display:grid;grid-template-columns:1.35fr .9fr;gap:14px}.pd-deadline-list{display:grid}.pd-deadline{display:grid;grid-template-columns:66px minmax(0,1fr) auto;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #142f49}.pd-deadline:last-child{border-bottom:0}.pd-date{min-height:46px;border-radius:10px;background:#0b2746;border:1px solid #22445f;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:900;text-transform:uppercase}.pd-date.next{background:#e0b746;color:#07162c;border-color:#e0b746}.pd-deadline b{font-size:12px;color:#fff}.pd-deadline small{display:block;color:#8298af;font-size:10px;margin-top:3px}.pd-deadline button{border:0;background:transparent;color:#e0b746;cursor:pointer;font-size:11px;font-weight:800}.pd-shortcuts{display:grid;grid-template-columns:1fr;gap:8px}.pd-shortcut{border:1px solid #24425f;background:#091e38;border-radius:11px;color:#fff;text-align:left;padding:12px 13px;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:10px;cursor:pointer}.pd-shortcut:hover{border-color:#456a90}.pd-shortcut-icon{width:32px;height:32px;border-radius:9px;background:#102d50;color:#e0b746;display:grid;place-items:center}.pd-shortcut b{font-size:11px}.pd-shortcut small{display:block;color:#8298af;font-size:9px;margin-top:2px}
      .pd-search-backdrop{position:fixed;inset:0;z-index:260;background:rgba(2,8,18,.75);backdrop-filter:blur(7px);display:grid;place-items:start center;padding:10vh 18px}.pd-search-modal{width:min(680px,100%);border:1px solid #294761;border-radius:15px;background:#06182e;box-shadow:0 30px 90px rgba(0,0,0,.45);overflow:hidden}.pd-search-head{height:56px;display:flex;align-items:center;gap:11px;padding:0 14px;border-bottom:1px solid #18344e;color:#8fa6be}.pd-search-head input{flex:1;border:0;outline:0;background:transparent;color:#fff;font:inherit}.pd-search-close{border:0;background:transparent;color:#e0b746;cursor:pointer;font-size:11px}.pd-search-results{max-height:55vh;overflow:auto;padding:7px}.pd-search-result{width:100%;border:0;border-radius:9px;background:transparent;color:#fff;text-align:left;padding:10px;display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:center;cursor:pointer}.pd-search-result:hover{background:#0b2644}.pd-search-kind{font-size:9px;text-transform:uppercase;color:#e0b746;font-weight:900}.pd-search-result b{display:block;font-size:11px}.pd-search-result small{display:block;color:#879caf;font-size:9px;margin-top:3px}.pd-search-empty{padding:24px;color:#8499ae;text-align:center;font-size:11px}
      @media(max-width:1120px){.pd-grid{grid-template-columns:1fr 1fr}.pd-grid>.pd-panel:last-child{grid-column:1/-1}.pd-bottom{grid-template-columns:1fr}}@media(max-width:720px){.app:has(.personal-dashboard) .main{padding:15px 12px calc(24px + env(safe-area-inset-bottom))}.personal-dashboard{gap:12px}.pd-top{display:grid}.pd-top-right{justify-content:flex-start}.pd-top h1{font-size:25px}.pd-priority{grid-template-columns:1fr;padding:18px}.pd-priority h2{font-size:20px}.pd-primary,.pd-priority-select{width:100%}.pd-grid{grid-template-columns:1fr}.pd-grid>.pd-panel:last-child{grid-column:auto}.pd-deadline{grid-template-columns:58px minmax(0,1fr)}.pd-deadline button{grid-column:2;text-align:left}.pd-pill{display:none}}
    `}</style>

    <header className="pd-top">
      <div><div className="pd-kicker">Cockpit personnalisé · {dateLabel}</div><h1>{displayName?`Bonjour ${displayName}.`:"Bonjour."} Voici ce qui mérite votre attention.</h1><p>Myvor priorise vos dossiers, vos évolutions institutionnelles et votre prochaine action.</p></div>
      <div className="pd-top-right"><span className="pd-pill">{jobLabel}</span><span className="pd-pill gold">Alertes · {alertLabel}</span><button className="pd-search" type="button" onClick={()=>setSearchOpen(true)} aria-label="Rechercher"><Search size={17}/></button></div>
    </header>

    <section className="pd-priority">
      <div><div className="pd-priority-label"><Target size={14}/> Dossier prioritaire</div><h2>{priorityDossier?.title||"Créez votre premier dossier prioritaire"}</h2><p>{priorityDossier?.objective||"Myvor utilisera ce dossier comme contexte pour organiser votre veille, vos analyses et vos prochaines actions."}</p>{priorityDossier&&<div className="pd-priority-meta"><span className="pd-priority-score">Priorité {priorityScore}/100</span><span className="pd-priority-mode">{pinnedDossier?"Épinglé":"Calcul Myvor"}</span><span className="pd-priority-reason">{priorityReason}</span></div>}</div>
      <div className="pd-priority-actions"><select className="pd-priority-select" aria-label="Choisir le dossier prioritaire" value={pinnedDossierId} onChange={event=>void changePriority(event.target.value)} disabled={prioritySaving||!dossiers.length}><option value="">Priorité automatique</option>{dossierPriorities.filter(item=>isActiveDossier(item.dossier.status)).map(item=><option value={item.dossier.id} key={item.dossier.id}>{item.dossier.title} · {item.score}/100</option>)}</select><button className="pd-primary" type="button" onClick={()=>priorityDossier?openExactDossier(priorityDossier.id):go("dossiers")}>{priorityDossier?"Ouvrir le dossier":"Créer un dossier"}<ArrowRight size={16}/></button>{priorityError&&<span className="pd-priority-error">{priorityError}</span>}</div>
    </section>

    <section className="pd-grid">
      <article className="pd-panel"><div className="pd-panel-head"><h3><Bell size={15}/> Ce qui a changé</h3><button className="pd-link" type="button" onClick={()=>go("veille")}>Toute la veille <ArrowRight size={13}/></button></div><div className="pd-body"><div className="pd-list">{relevantWatch.length?relevantWatch.map(item=><button className="pd-item" type="button" key={item.id} onClick={()=>openExactWatch(item.id)}><span><b>{item.title}</b><small>{[item.source_name||item.nature,priorityDossier&&item.dossier_id===priorityDossier.id?"Dossier prioritaire":null].filter(Boolean).join(" · ")}</small></span><span className={`pd-urgency ${item.urgency.replaceAll(" ","-")}`}>{item.urgency}</span></button>):<div className="pd-empty">Aucune évolution prioritaire pour le moment. Votre veille reste centrée sur les sujets et institutions choisis pendant l’onboarding.</div>}</div></div></article>

      <article className="pd-panel"><div className="pd-panel-head"><h3><Sparkles size={15}/> Prochaine action</h3><span className="pd-pill gold">Recommandée</span></div><div className="pd-body">{urgentAction?<><div className="pd-action-title">{urgentAction.title}</div><div className="pd-action-context">{urgentAction.description||`Action rattachée à ${dossierName(urgentAction.dossier_id)}.`}</div><div className="pd-action-meta"><span><BriefcaseBusiness size={14}/>{dossierName(urgentAction.dossier_id)}</span>{urgentAction.due_date&&<span><CalendarDays size={14}/>Échéance {shortDate(urgentAction.due_date)}</span>}</div><button className="pd-primary" type="button" onClick={()=>openExactAction(urgentAction)}>{actionCta(urgentAction.type)}<ArrowRight size={15}/></button></>:priorityWatch?<><div className="pd-action-title">Analyser l’évolution prioritaire</div><div className="pd-action-context">{priorityWatch.title}</div><button className="pd-primary" type="button" onClick={()=>openExactWatch(priorityWatch.id)}>Analyser maintenant <ArrowRight size={15}/></button></>:priorityDossier?<><div className="pd-action-title">Configurer la veille du dossier</div><div className="pd-action-context">Commencez par rattacher les évolutions pertinentes à {priorityDossier.title}.</div><button className="pd-primary" type="button" onClick={()=>go("veille")}>Configurer la veille <ArrowRight size={15}/></button></>:<div className="pd-empty">Votre prochaine action apparaîtra dès qu’un dossier est créé.</div>}</div></article>

      <article className="pd-panel"><div className="pd-panel-head"><h3><ShieldCheck size={15}/> Votre veille</h3><button className="pd-link" type="button" onClick={()=>go("veille")}>Ouvrir <ArrowRight size={13}/></button></div><div className="pd-body"><div className="pd-config"><div className="pd-config-block"><strong>Sujets suivis</strong><div className="pd-chips">{profile.topics?.length?profile.topics.map(topic=><span className="pd-chip" key={topic}>{topic}</span>):<span className="pd-chip">À personnaliser</span>}</div></div><div className="pd-config-block"><strong>Institutions surveillées</strong><div className="pd-chips">{profile.institutions?.length?profile.institutions.map(item=><span className="pd-chip" key={item}>{item}</span>):<span className="pd-chip">Périmètre général</span>}</div></div><div className="pd-config-note"><b>Mode {alertLabel}</b> · {profile.alert_level==="essential"?"seules les évolutions décisives remontent.":profile.alert_level==="realtime"?"toute évolution pertinente remonte immédiatement.":"les changements susceptibles d’affecter vos dossiers sont prioritaires."}</div></div></div></article>
    </section>

    <section className="pd-bottom">
      <article className="pd-panel"><div className="pd-panel-head"><h3><CalendarDays size={15}/> Prochaines échéances</h3><span className="pd-pill">{deadlines.length} à suivre</span></div><div className="pd-body"><div className="pd-deadline-list">{deadlines.length?deadlines.map((action,index)=><div className="pd-deadline" key={action.id}><div className={`pd-date ${index===0?"next":""}`}>{shortDate(action.due_date)}</div><div><b>{action.title}</b><small>{dossierName(action.dossier_id)}</small></div><button type="button" onClick={()=>openExactAction(action)}>Ouvrir →</button></div>):<div className="pd-empty">Aucune échéance datée. Les prochaines échéances liées à vos dossiers apparaîtront ici.</div>}</div></div></article>

      <article className="pd-panel"><div className="pd-panel-head"><h3><FileSearch size={15}/> Actions rapides</h3></div><div className="pd-body"><div className="pd-shortcuts"><button className="pd-shortcut" type="button" onClick={()=>go("impact")}><span className="pd-shortcut-icon"><Sparkles size={15}/></span><span><b>Note d’impact</b><small>Mesurer conséquences et niveau d’urgence.</small></span><ArrowRight size={14}/></button><button className="pd-shortcut" type="button" onClick={()=>go("radar")}><span className="pd-shortcut-icon"><Target size={15}/></span><span><b>Radar d’influence</b><small>Identifier les acteurs utiles au dossier.</small></span><ArrowRight size={14}/></button><button className="pd-shortcut" type="button" onClick={()=>go("builder")}><span className="pd-shortcut-icon"><BriefcaseBusiness size={15}/></span><span><b>Note Builder</b><small>Transformer l’analyse en livrable.</small></span><ArrowRight size={14}/></button></div>{actionsLoading&&<div className="pd-empty">Chargement des actions opérationnelles…</div>}{actionsError&&<div className="pd-config-note">Certaines actions n’ont pas pu être chargées. Le reste du cockpit reste disponible.</div>}</div></article>
    </section>

    {searchOpen&&<div className="pd-search-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)closeSearch();}}><div className="pd-search-modal" role="dialog" aria-modal="true" aria-label="Recherche Myvor"><div className="pd-search-head"><Search size={18}/><input autoFocus value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")closeSearch();if(event.key==="Enter"&&searchResults[0])openSearchResult(searchResults[0]);}} placeholder="Rechercher un dossier, un texte, une action…"/><button className="pd-search-close" type="button" onClick={closeSearch}>Fermer</button></div><div className="pd-search-results">{searchQuery.trim()?searchResults.length?searchResults.map(result=><button className="pd-search-result" type="button" key={result.key} onClick={()=>openSearchResult(result)}><span className="pd-search-kind">{result.kind}</span><span><b>{result.title}</b><small>{result.meta}</small></span><ArrowRight size={15}/></button>):<div className="pd-search-empty">Aucun résultat.</div>:<div className="pd-search-empty">Recherchez dans vos dossiers, votre veille et vos actions.</div>}</div></div></div>}
  </div>;
}
