import {createClient} from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const JSON_HEADERS={...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function adminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
function cleanEmail(value:unknown){return String(value||"").trim().toLowerCase();}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const url=Deno.env.get("SUPABASE_URL")||"",key=adminKey();
  if(!url||!key)return json({error:"Configuration serveur incomplète."},503);
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const token=authorization.slice(7).trim();
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:userData,error:userError}=await admin.auth.getUser(token);const caller=userData.user;
  if(userError||!caller)return json({error:"Session Myvor invalide."},401);
  const body=await req.json().catch(()=>null);
  const organizationId=String(body?.organization_id||"").trim(),email=cleanEmail(body?.email),role=String(body?.role||"member");
  if(!organizationId||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Adresse e-mail ou workspace invalide."},400);
  if(!["admin","member","viewer"].includes(role))return json({error:"Rôle invalide."},400);
  const{data:callerMembership,error:membershipError}=await admin.from("organization_members").select("role").eq("organization_id",organizationId).eq("user_id",caller.id).maybeSingle();
  if(membershipError||!callerMembership||!["owner","admin"].includes(String(callerMembership.role)))return json({error:"Vous n’avez pas le droit d’inviter des membres dans ce workspace."},403);
  if(callerMembership.role==="admin"&&role==="admin")return json({error:"Seul un propriétaire peut nommer un administrateur."},403);
  const{data:org}=await admin.from("organizations").select("id,name").eq("id",organizationId).maybeSingle();if(!org)return json({error:"Workspace introuvable."},404);
  let invitationId:string|null=null;
  const{data:pending}=await admin.from("organization_invitations").select("id").eq("organization_id",organizationId).ilike("email",email).eq("status","pending").maybeSingle();
  if(pending?.id){invitationId=pending.id;await admin.from("organization_invitations").update({role,invited_by:caller.id,expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString()}).eq("id",pending.id);}else{const{data:created,error:inviteRecordError}=await admin.from("organization_invitations").insert({organization_id:organizationId,email,role,invited_by:caller.id}).select("id").single();if(inviteRecordError)return json({error:"Impossible d’enregistrer l’invitation."},500);invitationId=created.id;}
  const{data:listData,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(listError)return json({error:"Impossible de vérifier le compte invité."},500);
  const existing=listData.users.find(user=>cleanEmail(user.email)===email);
  if(existing){const displayName=String(existing.user_metadata?.full_name||existing.user_metadata?.name||email.split("@")[0]).trim();const{error:joinError}=await admin.from("organization_members").upsert({organization_id:organizationId,user_id:existing.id,role,email,display_name:displayName,invited_by:caller.id},{onConflict:"organization_id,user_id"});if(joinError)return json({error:"Le compte existe, mais son rattachement au workspace a échoué."},500);if(invitationId)await admin.from("organization_invitations").update({status:"accepted",accepted_at:new Date().toISOString()}).eq("id",invitationId);return json({ok:true,status:"joined",message:`${email} a rejoint ${org.name}.`});}
  const{data:inviteData,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:"https://myvor.app",data:{myvor_org_id:organizationId,myvor_org_role:role}});if(inviteError)return json({error:inviteError.message||"L’e-mail d’invitation n’a pas pu être envoyé."},500);
  return json({ok:true,status:"invited",user_id:inviteData.user?.id||null,message:`Invitation envoyée à ${email}.`});
});
