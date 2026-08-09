"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,Building2,Check,Mail,Plus,Users} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Organization={id:string;name:string;created_at:string};
type Member={organization_id:string;user_id:string;role:string;email:string|null;display_name:string|null;joined_at:string};
type Invitation={id:string;organization_id:string;email:string;role:string;status:string;expires_at:string};

export default function WorkspacePage(){
  const[currentUserId,setCurrentUserId]=useState("");
  const[organizations,setOrganizations]=useState<Organization[]>([]);
  const[members,setMembers]=useState<Member[]>([]);
  const[invitations,setInvitations]=useState<Invitation[]>([]);
  const[activeId,setActiveId]=useState("");
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");
  const[newName,setNewName]=useState("");
  const[email,setEmail]=useState("");
  const[role,setRole]=useState("member");

  const active=organizations.find(org=>org.id===activeId)||null;
  const activeMembers=useMemo(()=>members.filter(member=>member.organization_id===activeId),[members,activeId]);
  const pending=useMemo(()=>invitations.filter(invitation=>invitation.organization_id===activeId&&invitation.status==="pending"),[invitations,activeId]);
  const myRole=activeMembers.find(member=>member.user_id===currentUserId)?.role||"member";
  const canManage=myRole==="owner"||myRole==="admin";

  async function load(){
    if(!supabase)return;
    setLoading(true);
    const{data:sessionData}=await supabase.auth.getSession();
    const userId=sessionData.session?.user?.id||"";
    if(!userId){window.location.href="/";return;}
    setCurrentUserId(userId);
    await supabase.rpc("accept_my_workspace_invitations");
    const[orgsRes,membersRes,profileRes,invitesRes]=await Promise.all([
      supabase.from("organizations").select("id,name,created_at").order("created_at"),
      supabase.from("organization_members").select("organization_id,user_id,role,email,display_name,joined_at").order("joined_at"),
      supabase.from("user_profiles").select("active_organization_id").eq("user_id",userId).maybeSingle(),
      supabase.from("organization_invitations").select("id,organization_id,email,role,status,expires_at").order("created_at",{ascending:false}),
    ]);
    if(orgsRes.error||membersRes.error){setMessage(orgsRes.error?.message||membersRes.error?.message||"Chargement impossible.");setLoading(false);return;}
    const orgs=(orgsRes.data||[]) as Organization[];
    setOrganizations(orgs);setMembers((membersRes.data||[]) as Member[]);setInvitations((invitesRes.data||[]) as Invitation[]);
    const preferred=String(profileRes.data?.active_organization_id||"");
    setActiveId(orgs.some(org=>org.id===preferred)?preferred:orgs[0]?.id||"");
    setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  async function switchWorkspace(id:string){if(!supabase||busy)return;setBusy(true);const{error}=await supabase.rpc("set_active_organization",{p_organization_id:id});setBusy(false);if(error){setMessage(error.message);return;}setActiveId(id);setMessage("Workspace actif modifié. Revenez à Myvor pour afficher ses dossiers.");}
  async function createWorkspace(){if(!supabase||busy||!newName.trim())return;setBusy(true);const{error}=await supabase.rpc("create_organization",{p_name:newName.trim()});setBusy(false);if(error){setMessage(error.message);return;}setNewName("");setMessage("Workspace créé.");await load();}
  async function invite(){if(!supabase||busy||!activeId||!email.trim())return;setBusy(true);const{error}=await supabase.rpc("invite_organization_member",{p_organization_id:activeId,p_email:email.trim(),p_role:role});setBusy(false);if(error){setMessage(error.message);return;}setEmail("");setMessage("Invitation enregistrée. Un compte existant est ajouté immédiatement.");await load();}

  return <main><style jsx global>{`
    *{box-sizing:border-box}body{margin:0;background:#031126;color:#eef4fb;font-family:Inter,system-ui,sans-serif}main{min-height:100vh;padding:24px;background:linear-gradient(180deg,#031126,#071a31)}.shell{max-width:1120px;margin:auto;display:grid;gap:16px}.top{display:flex;justify-content:space-between;gap:16px}.kicker{color:#e0b746;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}h1{margin:7px 0 5px;font-size:30px}p{margin:0;color:#9fb1c6}.back,.primary{border:1px solid #e0b746;border-radius:10px;padding:10px 13px;font-weight:850;cursor:pointer}.back{background:#071a31;color:#eef4fb;border-color:#294761;display:flex;align-items:center;gap:7px}.primary{background:#e0b746;color:#07162c}.grid{display:grid;grid-template-columns:290px 1fr;gap:14px}.panel{border:1px solid #173552;background:#071a31;border-radius:14px;overflow:hidden}.head{padding:14px 16px;border-bottom:1px solid #173552;display:flex;align-items:center;justify-content:space-between}.head h2{margin:0;font-size:14px}.body{padding:15px}.list{display:grid;gap:8px}.org{width:100%;border:1px solid #24425f;background:#091e38;color:#fff;border-radius:10px;padding:11px;display:grid;grid-template-columns:32px 1fr auto;gap:9px;align-items:center;text-align:left;cursor:pointer}.org.active{border-color:#e0b746;background:rgba(224,183,70,.08)}.icon{width:32px;height:32px;border-radius:8px;background:#102d50;color:#e0b746;display:grid;place-items:center}.org b,.member b{display:block;font-size:12px}.org small,.member small{display:block;color:#8298af;margin-top:3px}.form{display:grid;gap:8px;margin-top:13px}.form input,.invite input,.invite select{border:1px solid #294761;background:#06182e;color:#fff;border-radius:9px;padding:10px}.invite{display:grid;grid-template-columns:1fr 140px auto;gap:8px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:14px}.stat{border:1px solid #24425f;background:#091e38;border-radius:10px;padding:12px}.stat span{display:block;color:#8298af;font-size:10px}.stat strong{display:block;margin-top:4px;font-size:19px}.member{display:grid;grid-template-columns:1fr 100px 130px;gap:10px;padding:11px 0;border-bottom:1px solid #17324d;align-items:center}.role{border:1px solid #2a4965;background:#0b2746;border-radius:999px;padding:5px 7px;font-size:10px;text-align:center}.message{border:1px solid rgba(224,183,70,.28);background:rgba(224,183,70,.08);border-radius:10px;padding:10px 12px;color:#dce6f0;font-size:12px}.empty{padding:16px 0;color:#8095aa;font-size:12px}@media(max-width:760px){main{padding:15px 11px}.top{display:grid}.grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.invite{grid-template-columns:1fr}.member{grid-template-columns:1fr auto}.member>:last-child{grid-column:1/-1}}
  `}</style><div className="shell"><header className="top"><div><div className="kicker">Administration Myvor</div><h1>Workspace & équipe</h1><p>Partagez dossiers, veille, analyses et livrables avec votre organisation.</p></div><button className="back" onClick={()=>window.location.href="/"}><ArrowLeft size={16}/>Retour à Myvor</button></header>{message&&<div className="message">{message}</div>}{loading?<section className="panel"><div className="body">Chargement…</div></section>:<div className="grid"><aside className="panel"><div className="head"><h2>Vos workspaces</h2><Building2 size={16}/></div><div className="body"><div className="list">{organizations.map(org=><button key={org.id} className={`org ${org.id===activeId?"active":""}`} onClick={()=>void switchWorkspace(org.id)} disabled={busy}><span className="icon"><Building2 size={15}/></span><span><b>{org.name}</b><small>{members.filter(member=>member.organization_id===org.id).length} membre(s)</small></span>{org.id===activeId&&<Check size={14}/>}</button>)}</div><div className="form"><input value={newName} onChange={event=>setNewName(event.target.value)} placeholder="Nom du workspace"/><button className="primary" onClick={()=>void createWorkspace()} disabled={busy||!newName.trim()}><Plus size={14}/> Créer</button></div></div></aside><section className="panel"><div className="head"><h2>{active?.name||"Workspace"}</h2><Users size={16}/></div><div className="body"><div className="stats"><div className="stat"><span>Membres</span><strong>{activeMembers.length}</strong></div><div className="stat"><span>Invitations</span><strong>{pending.length}</strong></div><div className="stat"><span>Votre rôle</span><strong style={{fontSize:15,textTransform:"capitalize"}}>{myRole}</strong></div></div>{canManage&&<div className="invite"><input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="collaborateur@cabinet.fr"/><select value={role} onChange={event=>setRole(event.target.value)}><option value="admin">Administrateur</option><option value="member">Membre</option><option value="viewer">Lecture seule</option></select><button className="primary" onClick={()=>void invite()} disabled={busy||!email.trim()}><Mail size={14}/> Inviter</button></div>}<div style={{marginTop:14}}>{activeMembers.map(member=><div className="member" key={`${member.organization_id}-${member.user_id}`}><div><b>{member.display_name||member.email||"Membre Myvor"}</b><small>{member.email||member.user_id}</small></div><span className="role">{member.role}</span><small>Depuis {new Date(member.joined_at).toLocaleDateString("fr-FR")}</small></div>)}{!activeMembers.length&&<div className="empty">Aucun membre.</div>}</div>{pending.length>0&&<><div className="head" style={{margin:"18px -15px 0"}}><h2>Invitations en attente</h2></div>{pending.map(invitation=><div className="member" key={invitation.id}><div><b>{invitation.email}</b><small>Expire le {new Date(invitation.expires_at).toLocaleDateString("fr-FR")}</small></div><span className="role">{invitation.role}</span><small>En attente</small></div>)}</>}</div></section></div>}</div></main>;
}
