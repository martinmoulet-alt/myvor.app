"use client";

import {useEffect,useMemo,useState} from "react";
import {Building2,Check,ChevronRight,Crown,Mail,RefreshCw,ShieldCheck,UserPlus,Users} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Role="owner"|"admin"|"member"|"viewer";
type Workspace={id:string;name:string;role:Role};
type Member={organization_id:string;user_id:string;role:Role;email:string|null;display_name:string|null;joined_at:string};
type Invitation={id:string;email:string;role:Exclude<Role,"owner">;status:string;created_at:string;expires_at:string};

const ROLE_LABELS:Record<Role,string>={owner:"Propriétaire",admin:"Administrateur",member:"Collaborateur",viewer:"Lecture seule"};
const ROLE_HELP:Record<Role,string>={owner:"Contrôle complet du workspace.",admin:"Gère l’équipe et modifie les dossiers.",member:"Crée et modifie les dossiers et livrables.",viewer:"Consulte le workspace sans modifier les données."};

function orgShape(value:any){if(Array.isArray(value))return value[0]||null;return value||null;}
function roleRank(role:Role){return role==="owner"?1:role==="admin"?2:role==="member"?3:4;}

export default function TeamWorkspace(){
  const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const[workspaces,setWorkspaces]=useState<Workspace[]>([]),[activeId,setActiveId]=useState(""),[members,setMembers]=useState<Member[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]);
  const[inviteEmail,setInviteEmail]=useState(""),[inviteRole,setInviteRole]=useState<Exclude<Role,"owner">>("member"),[workspaceName,setWorkspaceName]=useState("");

  const active=workspaces.find(item=>item.id===activeId)||null;
  const canManage=active?.role==="owner"||active?.role==="admin";
  const canRename=canManage;
  const sortedMembers=useMemo(()=>[...members].sort((a,b)=>roleRank(a.role)-roleRank(b.role)||(a.display_name||a.email||"").localeCompare(b.display_name||b.email||"","fr")),[members]);

  useEffect(()=>{void load();},[]);

  async function load(){
    if(!supabase)return;
    setLoading(true);setError("");
    try{
      const{data:sessionData}=await supabase.auth.getSession();const userId=sessionData.session?.user?.id;if(!userId)throw new Error("Session Myvor requise.");
      const[{data:membershipRows,error:membershipError},{data:profile,error:profileError}]=await Promise.all([
        supabase.from("organization_members").select("organization_id,role,organizations(id,name)").eq("user_id",userId),
        supabase.from("user_profiles").select("active_organization_id").eq("user_id",userId).maybeSingle(),
      ]);
      if(membershipError)throw membershipError;if(profileError)throw profileError;
      const next=(membershipRows||[]).map((row:any)=>{const org=orgShape(row.organizations);return org?{id:String(org.id),name:String(org.name),role:row.role as Role}:null;}).filter(Boolean) as Workspace[];
      const preferred=String(profile?.active_organization_id||"");const nextActive=next.some(item=>item.id===preferred)?preferred:(next[0]?.id||"");
      setWorkspaces(next);setActiveId(nextActive);setWorkspaceName(next.find(item=>item.id===nextActive)?.name||"");
      if(nextActive)await loadWorkspace(nextActive);
    }catch(err:any){setError(err?.message||"Impossible de charger le workspace.");}
    finally{setLoading(false);}
  }

  async function loadWorkspace(organizationId:string){
    if(!supabase)return;
    const[{data:memberRows,error:memberError},{data:inviteRows,error:inviteError}]=await Promise.all([
      supabase.from("organization_members").select("organization_id,user_id,role,email,display_name,joined_at").eq("organization_id",organizationId).order("joined_at",{ascending:true}),
      supabase.from("organization_invitations").select("id,email,role,status,created_at,expires_at").eq("organization_id",organizationId).eq("status","pending").order("created_at",{ascending:false}),
    ]);
    if(memberError)throw memberError;
    setMembers((memberRows||[]) as Member[]);
    setInvitations(inviteError?[]:(inviteRows||[]) as Invitation[]);
  }

  async function switchWorkspace(id:string){
    if(!supabase||id===activeId)return;
    setSaving(true);setError("");setMessage("");
    const{data}=await supabase.auth.getSession();const userId=data.session?.user?.id;
    if(!userId){setSaving(false);return;}
    const{error:updateError}=await supabase.from("user_profiles").update({active_organization_id:id,updated_at:new Date().toISOString()}).eq("user_id",userId);
    if(updateError){setError(updateError.message);setSaving(false);return;}
    setActiveId(id);setWorkspaceName(workspaces.find(item=>item.id===id)?.name||"");await loadWorkspace(id);setMessage("Workspace actif modifié. Rechargement des dossiers…");setSaving(false);window.setTimeout(()=>window.location.reload(),450);
  }

  async function renameWorkspace(){
    if(!supabase||!active||!canRename)return;const name=workspaceName.trim();if(name.length<2){setError("Le nom du workspace est trop court.");return;}
    setSaving(true);setError("");setMessage("");
    const{error:updateError}=await supabase.from("organizations").update({name,updated_at:new Date().toISOString()}).eq("id",active.id);
    if(updateError)setError(updateError.message);else{setWorkspaces(items=>items.map(item=>item.id===active.id?{...item,name}:item));setMessage("Nom du workspace mis à jour.");}
    setSaving(false);
  }

  async function invite(){
    if(!supabase||!active||!canManage)return;const email=inviteEmail.trim().toLowerCase();if(!email){setError("Renseignez l’adresse e-mail du collaborateur.");return;}
    setSaving(true);setError("");setMessage("");
    const{data,error:invokeError}=await supabase.functions.invoke("organization-invite",{body:{organization_id:active.id,email,role:inviteRole}});
    if(invokeError){setError(invokeError.message||"Invitation impossible.");setSaving(false);return;}
    if(data?.error){setError(String(data.error));setSaving(false);return;}
    setInviteEmail("");setMessage(String(data?.message||"Invitation envoyée."));await loadWorkspace(active.id);setSaving(false);
  }

  async function changeRole(member:Member,role:Role){
    if(!supabase||!active||!canManage||member.role==="owner"||role==="owner")return;
    if(active.role==="admin"&&(member.role==="admin"||role==="admin")){setError("Seul un propriétaire peut modifier un administrateur.");return;}
    setSaving(true);setError("");setMessage("");
    const{error:updateError}=await supabase.from("organization_members").update({role}).eq("organization_id",active.id).eq("user_id",member.user_id);
    if(updateError)setError(updateError.message);else{setMembers(items=>items.map(item=>item.user_id===member.user_id?{...item,role}:item));setMessage("Rôle mis à jour.");}
    setSaving(false);
  }

  async function removeMember(member:Member){
    if(!supabase||!active||!canManage||member.role==="owner")return;
    if(active.role==="admin"&&member.role==="admin"){setError("Seul un propriétaire peut retirer un administrateur.");return;}
    setSaving(true);setError("");setMessage("");
    const{error:deleteError}=await supabase.from("organization_members").delete().eq("organization_id",active.id).eq("user_id",member.user_id);
    if(deleteError)setError(deleteError.message);else{setMembers(items=>items.filter(item=>item.user_id!==member.user_id));setMessage("Collaborateur retiré du workspace.");}
    setSaving(false);
  }

  if(loading)return <div className="tw-loading"><RefreshCw size={18}/>Chargement du workspace…<style jsx>{`.tw-loading{min-height:300px;display:flex;align-items:center;justify-content:center;gap:9px;color:#91a5bd}`}</style></div>;

  return <div className="team-workspace">
    <style jsx global>{`
      .app:has(.team-workspace) .main{max-width:none;background:linear-gradient(180deg,#031126,#06192d);min-height:calc(100vh - 68px)}
      .team-workspace{max-width:1280px;margin:0 auto;color:#f5f8fc;display:grid;gap:16px}.tw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.tw-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#e0b746;font-weight:900;margin-bottom:7px}.tw-head h1{font-size:30px;margin:0;color:white;letter-spacing:-.03em}.tw-head p{margin:8px 0 0;color:#9eb0c4;max-width:760px}.tw-security{border:1px solid rgba(76,201,140,.28);background:rgba(76,201,140,.07);color:#72dfa8;border-radius:999px;padding:8px 11px;font-size:10px;font-weight:850;display:flex;align-items:center;gap:6px;white-space:nowrap}.tw-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:14px}.tw-panel{border:1px solid #173552;background:linear-gradient(145deg,#06172c,#081e38);border-radius:14px;overflow:hidden}.tw-panel-head{min-height:54px;padding:0 16px;border-bottom:1px solid #16324d;display:flex;align-items:center;justify-content:space-between;gap:10px}.tw-panel-head h2{font-size:14px;margin:0;color:#fff;display:flex;align-items:center;gap:8px}.tw-body{padding:15px 16px}.tw-workspaces{display:grid;gap:7px}.tw-workspace-btn{border:1px solid #1d3c59;background:#081d35;border-radius:11px;color:#d8e2ed;padding:11px;text-align:left;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;cursor:pointer}.tw-workspace-btn.active{border-color:#e0b746;background:rgba(224,183,70,.08)}.tw-workspace-icon{width:30px;height:30px;border-radius:8px;background:#102d50;color:#e0b746;display:grid;place-items:center}.tw-workspace-btn b{display:block;font-size:11px}.tw-workspace-btn small{display:block;color:#7f94aa;font-size:9px;margin-top:3px}.tw-role-card{margin-top:13px;border:1px solid #1c3a57;border-radius:11px;padding:12px;background:#071a31}.tw-role-card b{font-size:10px;color:#e0b746}.tw-role-card p{font-size:10px;color:#8fa4b9;line-height:1.5;margin:6px 0 0}.tw-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tw-field{display:grid;gap:6px}.tw-field label{font-size:10px;color:#8fa4ba;font-weight:800}.tw-field input,.tw-field select{width:100%;border:1px solid #24445f;background:#071a31;color:#f4f7fb;border-radius:9px;min-height:40px;padding:0 11px;outline:none}.tw-field input:focus,.tw-field select:focus{border-color:#e0b746}.tw-inline{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.tw-btn{min-height:40px;border:1px solid #284864;background:#0b2541;color:white;border-radius:9px;padding:0 13px;font-weight:850;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}.tw-btn.primary{background:#e0b746;border-color:#e0b746;color:#07162c}.tw-btn.danger{color:#ff9298;border-color:#58303a;background:#231923}.tw-btn:disabled{opacity:.55;cursor:not-allowed}.tw-invite{display:grid;grid-template-columns:minmax(0,1fr) 170px auto;gap:8px}.tw-members{display:grid}.tw-member{display:grid;grid-template-columns:42px minmax(0,1fr) 170px auto;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid #15314b}.tw-member:last-child{border-bottom:0}.tw-avatar{width:38px;height:38px;border-radius:11px;background:#102d50;color:#e0b746;display:grid;place-items:center;font-weight:900;text-transform:uppercase}.tw-member b{display:block;font-size:12px;color:#fff}.tw-member small{display:block;font-size:10px;color:#8398ae;margin-top:3px}.tw-role{border:1px solid #264661;border-radius:999px;padding:6px 9px;font-size:9px;color:#b7c8d9;text-align:center}.tw-owner{color:#e0b746;border-color:rgba(224,183,70,.35);display:flex;align-items:center;justify-content:center;gap:5px}.tw-member select{border:1px solid #24445f;background:#071a31;color:#fff;border-radius:8px;min-height:34px;padding:0 8px}.tw-pending{display:grid;gap:7px;margin-top:12px}.tw-pending-row{border:1px dashed #27465f;border-radius:9px;padding:9px 10px;display:flex;justify-content:space-between;gap:12px;color:#9fb1c3;font-size:10px}.tw-notice{border:1px solid #294a65;background:#0a223d;border-radius:10px;padding:10px 12px;color:#b9c8d8;font-size:11px}.tw-notice.success{border-color:rgba(75,199,138,.3);color:#76dba8;background:rgba(75,199,138,.06)}.tw-notice.error{border-color:rgba(218,81,91,.35);color:#ff9299;background:rgba(218,81,91,.08)}
      @media(max-width:900px){.tw-layout{grid-template-columns:1fr}.tw-grid{grid-template-columns:1fr}}@media(max-width:700px){.tw-head{display:grid}.tw-invite{grid-template-columns:1fr}.tw-member{grid-template-columns:38px minmax(0,1fr)}.tw-member select,.tw-member>.tw-role,.tw-member>.tw-btn{grid-column:2}.tw-security{justify-self:start}}
    `}</style>

    <header className="tw-head"><div><div className="tw-kicker">Workspace cabinet</div><h1>Équipe & accès</h1><p>Travaillez à plusieurs sur les mêmes dossiers, avec des rôles séparés et une isolation stricte entre workspaces.</p></div><span className="tw-security"><ShieldCheck size={14}/> Accès protégés par RLS</span></header>
    {error&&<div className="tw-notice error">{error}</div>}{message&&<div className="tw-notice success">{message}</div>}

    <div className="tw-layout">
      <aside className="tw-panel"><div className="tw-panel-head"><h2><Building2 size={15}/> Vos workspaces</h2></div><div className="tw-body"><div className="tw-workspaces">{workspaces.map(item=><button key={item.id} type="button" disabled={saving} className={`tw-workspace-btn ${item.id===activeId?"active":""}`} onClick={()=>void switchWorkspace(item.id)}><span className="tw-workspace-icon"><Building2 size={15}/></span><span><b>{item.name}</b><small>{ROLE_LABELS[item.role]}</small></span>{item.id===activeId?<Check size={15}/>:<ChevronRight size={15}/>}</button>)}</div>{active&&<div className="tw-role-card"><b>Votre rôle · {ROLE_LABELS[active.role]}</b><p>{ROLE_HELP[active.role]}</p></div>}</div></aside>

      <main style={{display:"grid",gap:14}}>
        <section className="tw-panel"><div className="tw-panel-head"><h2><Building2 size={15}/> Paramètres du workspace</h2></div><div className="tw-body tw-grid"><div className="tw-field"><label>Nom du cabinet / organisation</label><div className="tw-inline"><input value={workspaceName} disabled={!canRename||saving} onChange={event=>setWorkspaceName(event.target.value)}/><button className="tw-btn" type="button" disabled={!canRename||saving} onClick={()=>void renameWorkspace()}>Enregistrer</button></div></div><div className="tw-field"><label>Workspace actif</label><input value={active?.name||""} disabled/></div></div></section>

        <section className="tw-panel"><div className="tw-panel-head"><h2><UserPlus size={15}/> Inviter un collaborateur</h2></div><div className="tw-body">{canManage?<div className="tw-invite"><div className="tw-field"><label>Adresse e-mail</label><input type="email" value={inviteEmail} placeholder="collaborateur@cabinet.fr" onChange={event=>setInviteEmail(event.target.value)}/></div><div className="tw-field"><label>Rôle</label><select value={inviteRole} onChange={event=>setInviteRole(event.target.value as Exclude<Role,"owner">)}><option value="member">Collaborateur</option><option value="viewer">Lecture seule</option>{active?.role==="owner"&&<option value="admin">Administrateur</option>}</select></div><button className="tw-btn primary" type="button" disabled={saving} onClick={()=>void invite()}><Mail size={15}/>Inviter</button></div>:<div className="tw-notice">Votre rôle ne permet pas d’inviter de nouveaux membres.</div>}{invitations.length>0&&<div className="tw-pending">{invitations.map(invite=><div className="tw-pending-row" key={invite.id}><span>Invitation en attente · {invite.email}</span><b>{ROLE_LABELS[invite.role]}</b></div>)}</div>}</div></section>

        <section className="tw-panel"><div className="tw-panel-head"><h2><Users size={15}/> Membres</h2><span className="tw-role">{members.length} membre{members.length>1?"s":""}</span></div><div className="tw-body tw-members">{sortedMembers.map(member=>{const label=member.display_name||member.email||"Utilisateur";const initial=label.trim().charAt(0)||"U";const protectedRole=member.role==="owner"||(active?.role==="admin"&&member.role==="admin");return <div className="tw-member" key={member.user_id}><span className="tw-avatar">{initial}</span><span><b>{label}</b><small>{member.email||"Compte Myvor"}</small></span>{member.role==="owner"?<span className="tw-role tw-owner"><Crown size={12}/>Propriétaire</span>:canManage&&!protectedRole?<select disabled={saving} value={member.role} onChange={event=>void changeRole(member,event.target.value as Role)}><option value="member">Collaborateur</option><option value="viewer">Lecture seule</option>{active?.role==="owner"&&<option value="admin">Administrateur</option>}</select>:<span className="tw-role">{ROLE_LABELS[member.role]}</span>}{canManage&&member.role!=="owner"&&!protectedRole?<button className="tw-btn danger" type="button" disabled={saving} onClick={()=>void removeMember(member)}>Retirer</button>:<span/>}</div>;})}</div></section>
      </main>
    </div>
  </div>;
}
