import {createClient} from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const JSON_HEADERS={...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function adminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const url=Deno.env.get("SUPABASE_URL")||"",key=adminKey();if(!url||!key)return json({error:"Configuration serveur incomplète."},503);
  const authorization=req.headers.get("authorization")||"";if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),token=authorization.slice(7).trim();
  const{data:userData,error:userError}=await admin.auth.getUser(token);const user=userData.user;if(userError||!user)return json({error:"Session Myvor invalide."},401);
  const body=await req.json().catch(()=>null),name=String(body?.name||"").trim();if(name.length<2||name.length>120)return json({error:"Nom de workspace invalide."},400);
  const{data:org,error:orgError}=await admin.from("organizations").insert({name,created_by:user.id}).select("id,name").single();if(orgError)return json({error:orgError.message},500);
  const displayName=String(user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split("@")[0]||"Utilisateur").trim();
  const{error:memberError}=await admin.from("organization_members").insert({organization_id:org.id,user_id:user.id,role:"owner",email:user.email||null,display_name:displayName});
  if(memberError){await admin.from("organizations").delete().eq("id",org.id);return json({error:"Impossible de créer le propriétaire du workspace."},500);}
  const{error:profileError}=await admin.from("user_profiles").upsert({user_id:user.id,active_organization_id:org.id,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(profileError)return json({ok:true,organization:org,warning:"Workspace créé, mais activation automatique impossible."});
  return json({ok:true,organization:org});
});
