"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,Building2,Check,Mail,Plus,ShieldCheck,Users} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Organization={id:string;name:string;created_at:string};
type Membership={organization_id:string;user_id:string;role:string;email:string|null;display_name:string|null;joined_at:string};
type Invitation={id:string;organization_id:string;email:string;role:string;status:string;created_at:string;expires_at:string};

export default function WorkspacePage(){
  const[loading,setLoading]=useState(true);
  const[message,setMessage]=useState("");
  const[organizations,setOrganizations]=useState<Organization[]>([]);
  const[members,setMembers]=useState<Membership[]>([]);
  const[invitations,setInvitations]=useState<Invitation[]>([]);
  const[activeId,setActiveId]=useState("");
  const[newName,setNewName]=useState("");
  const[email,setEmail]=useState("");
  const[role,setRole]=useState("member");
  const[busy,setBusy]=useState(false);

  const active=organizations.find(item=>item.id===activeId)||null;
  const activeMembers=useMemo(()=>members.filter(item=>item.organization_id===activeId),[members,activeId]);
  const activeInvitations=useMemo(()=>invitations.filter(item=>item.organization_id===activeId&&item.status==="pending"),[invitations,activeId]);
  const myRole=activeMembers.find(item=>item.user_id===currentUserId)?.role||"member";
  const canManage=myRole==="owner"||myRole==="admin";
  const[currentUserId,setCurrentUserId]=useState("");

  async function load(){
    if(!supabase)return;
    setLoading(true);setMessage("");
    const{data:sessionData}=await supabase.auth.getSession();
    const userId=sessionData.session?.user?.id||"";setCurrentUserId(userId);
    if(!userId){window.location.href="/";return;}
    await supabase.rpc("accept_my_workspace_invitations");
    const[orgRes,memberRes,profileRes,inviteRes]=await Promise.all([
      supabase.from("organizations").select("id,name,created_at").order("created_at"),
      supabase.from("organization_members").select("organization_id,user_id,role,email,display_name,joined_at").order("joined_at"),
      supabase.from("user_profiles").select("active_organization_id").eq("user_id",userId).maybeSingle(),
      supabase.from("organization_invitations").select("id,organization_id,email,role,status,created_at,expires_at").order("created_at",{ascending:false}),
    ]);
    if(orgRes.error||memberRes.error){setMessage(orgRes.error?.message||memberRes.error?.message||"Impossible de charger les workspaces.");setLoading(false);return;}
    const orgs=(orgRes.data||[]) as Organization[];setOrganizations(orgs);setMembers((memberRes.data||[]) as Membership[]);setInvitations((inviteRes.data||[]) as Invitation[]);
    const preferred=String(profileRes.data?.active_organization_id||"");setActiveId(orgs.some(item=>item.id===preferred)?preferred:orgs[0]?.id||"");setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  async function switchWorkspace(id:string){if(!supabase||busy)return;setBusy(true);const{error}=await supabase.rpc("set_active_organization",{p_organization_id:id});setBusy(false);if(error){setMessage(error.message);return;}setActiveId(id);setMessage("Workspace actif mis à jour. Rechargez l’application pour afficher ses dossiers.");}
  async function createWorkspace(){if(!supabase||!newName.trim()||busy)return;setBusy(true);const{error}=await supabase.rpc("create_organization",{p_name:newName.trim()});setBusy(false);if(error){setMessage(error.message);return;}setNewName("");setMessage("Workspace créé.");await load();}
  async function invite(){if(!supabase||!activeId||!email.trim()||busy)return;setBusy(true);const{error}=await supabase.rpc("invite_organization_member",{p_organization_id:activeId,p_email:email.trim(),p_role:role});setBusy(false);if(error){setMessage(error.message);return;}setEmail("");setMessage("Invitation enregistrée. Si le compte existe déjà, il a été ajouté immédiatement.");await load();}

  return <main className="workspace-page"><style jsx global>{`
    *{box-sizing:border-box}body{margin:0;background:#031126;color:#eef4fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.workspace-page{min-height:100vh;padding:28px;background:radial-gradient(circle at 50% -20%,rgba(26,73,124,.22),transparent 38%),linear-gradient(180deg,#031126,#04172b)}.ws-shell{max-width:1180px;margin:0 auto;display:grid;gap:18px}.ws-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.ws-back{border:1px solid #294761;background:#071a31;color:#dce8f5;border-radius:10px;padding:10px 13px;display:flex;gap:8px;align-items:center;cursor:pointer}.ws-kicker{color:#e0b746;text-transform:uppercase;letter-spacing:.13em;font-size:10px;font-weight:900}.ws-top h1{font-size:31px;margin:7px 0 6px}.ws-top p{margin:0;color:#9eb1c6}.ws-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px}.ws-panel{border:1px solid #173552;background:linear-gradient(145deg,#06172c,#081e38);border-radius:15px;overflow:hidden}.ws-head{padding:15px 17px;border-bottom:1px solid #173552;display:flex;justify-content:space-between;gap:12px;align-items:center}.ws-head h2{font-size:14px;margin:0}.ws-body{padding:16px}.ws-list{display:grid;gap:8px}.ws-item{width:100%;text-align:left;border:1px solid #24425f;background:#091e38;color:#eef4fb;border-radius:11px;padding:12px;cursor:pointer;display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center}.ws-item.active{border-color:#e0b746;background:rgba(224,183,70,.09)}.ws-icon{width:34px;height:34px;border-radius:9px;background:#102d50;color:#e0b746;display:grid;place-items:center}.ws-item b{display:block;font-size:12px}.ws-item small{display:block;color:#8298af;margin-top:2px}.ws-form{display:grid;gap:9px;margin-top:14px}.ws-form input,.ws-form select{width:100%;border:1px solid #294761;background:#06182e;color:#fff;border-radius:10px;padding:11px 12px;outline:none}.ws-form button,.ws-primary{border:1px solid #e0b746;background:#e0b746;color:#07162c;border-radius:10px;padding:11px 13px;font-weight:900;cursor:pointer}.ws-primary:disabled,.ws-form button:disabled{opacity:.55;cursor:not-allowed}.ws-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}.ws-stat{border:1px solid #23425f;background:#091e38;border-radius:12px;padding:13px}.ws-stat span{display:block;color:#8499af;font-size:10px}.ws-stat strong{display:block;font-size:21px;margin-top:5px}.ws-table{display:grid}.ws-row{display:grid;grid-template-columns:minmax(0,1fr) 110px 150px;gap:12px;padding:12px 2px;border-bottom:1px solid #17324d;align-items:center}.ws-row:last-child{border-bottom:0}.ws-row b{display:block;font-size:12px}.ws-row small{display:block;color:#8298af;margin-top:3px}.ws-role{border:1px solid #2a4965;background:#0b2746;border-radius:999px;padding:5px 8px;font-size:10px;text-align:center}.ws-empty{color:#7f94aa;font-size:12px;padding:18px 0}.ws-message{border:1px solid rgba(224,183,70,.26);background:rgba(224,183,70,.07);border-radius:11px;padding:11px 13px;color:#d8e3ef;font-size:12px}.ws-invite{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:9px}.ws-invite input,.ws-invite select{border:1px solid #294761;background:#06182e;color:#fff;border-radius:10px;padding:11px 12px}.ws-invite button{border:1px solid #e0b746;background:#e0b746;color:#07162c;border-radius:10px;padding:0 15px;font-weight:900;cursor:pointer}@media(max-width:800px){.workspace-page{padding:16px 12px}.ws-top{display:grid}.ws-grid{grid-template-columns:1fr}.ws-stats{grid-template-columns:1fr}.ws-row{grid-template-columns:1fr auto}.ws-row>:last-child{grid-column:1/-1}.ws-invite{grid-template-columns:1fr}.ws-invite button{min-height:42px}}
  `}</style><div className="ws-shell"><header className="ws-top"><div><div className="ws-kicker">Administration Myvor</div><h1>Workspace & équipe</h1><p>Partagez les dossiers, la veille, les analyses et les livrables avec votre organisation.</p></div><button className="ws-back" onClick={()=>window.location.href="/"}><ArrowLeft size={16}/>Retour à Myvor</button></header>{message&&<div className="ws-message">{message}</div>}{loading?<div className="ws-panel"><div className="ws-body">Chargement des workspaces…</div></div>:<div className="ws-grid"><aside className="ws-panel"><div className="ws-head"><h2>Vos workspaces</h2><Building2 size={16}/></div><div className="ws-body"><div className="ws-list">{organizations.map(org=><button key={org.id} className={`ws-item ${org.id===activeId?"active":""}`} onClick={()=>void switchWorkspace(org.id)} disabled={busy}><span className="ws-icon"><Building2 size={16}/></span><span><b>{org.name}</b><small>{members.filter(member=>member.organization_id===org.id).length} membre(s)</small></span>{org.id===activeId&&<Check size={15}/>}</button>)}</div><div className="ws-form"><input value={newName} onChange={event=>setNewName(event.target.value)} placeholder="Nom du nouveau workspace"/><button onClick={()=>void createWorkspace()} disabled={busy||!newName.trim()}><Plus size={14}/> Créer un workspace</button></div></div></aside><section className="ws-panel"><div className="ws-head"><h2>{active?.name||"Workspace"}</h2><ShieldCheck size={16}/></div><div className="ws-body"><div className="ws-stats"><div className="ws-stat"><span>Membres actifs</span><strong>{activeMembers.length}</strong></div><div className="ws-stat"><span>Invitations</span><strong>{activeInvitations.length}</strong></div><div className="ws-stat"><span>Votre rôle</span><strong style={{fontSize:16,textTransform:"capitalize"}}>{myRole}</strong></div></div>{canManage&&<div className="ws-invite"><input value={email} onChange={event=>setEmail(event.target.value)} type="email" placeholder="collaborateur@cabinet.fr"/><select value={role} onChange={event=>setRole(event.target.value)}><option value="admin">Administrateur</option><option value="member">Membre</option><option value="viewer">Lecture seule</option></select><button onClick={()=>void invite()} disabled={busy||!email.trim()}><Mail size={15}/> Inviter</button></div>}<div className="ws-table" style={{marginTop:16}}>{activeMembers.map(member=><div className="ws-row" key={`${member.organization_id}-${member.user_id}`}><div><b>{member.display_name||member.email||"Membre Myvor"}</b><small>{member.email||member.user_id}</small></div><span className="ws-role">{member.role}</span><small>Depuis {new Date(member.joined_at).toLocaleDateString("fr-FR")}</small></div>)}{!activeMembers.length&&<div className="ws-empty"><Users size={22}/><div>Aucun membre dans ce workspace.</div></div>}</div>{activeInvitations.length>0&&<><div className="ws-head" style={{margin:"18px -16px 0"}}><h2>Invitations en attente</h2></div><div className="ws-table">{activeInvitations.map(invitation=><div className="ws-row" key={invitation.id}><div><b>{invitation.email}</b><small>Expire le {new Date(invitation.expires_at).toLocaleDateString("fr-FR")}</small></div><span className="ws-role">{invitation.role}</span><small>En attente</small></div>)}</div></>}</div></section></div>}</div></main>;
}
