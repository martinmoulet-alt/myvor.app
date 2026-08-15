import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.111.0";
import {corsHeaders} from "npm:@supabase/supabase-js@2.111.0/cors";
const H={...corsHeaders,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:H});}
function clip(v:unknown,n:number){return String(v??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,n).trim();}
function list(v:unknown){return Array.isArray(v)?[...new Set(v.map(x=>String(x||"").trim()).filter(Boolean))]:[];}
function celexFromRef(ref:string){return ref.match(/\b([356][0-9A-Z()_.-]{5,70})\b/i)?.[1]?.toUpperCase()||"";}
function celexFromUrl(url:string){return String(url||"").match(/CELEX:([^&?#]+)/i)?.[1]?.toUpperCase()||"";}
function adminKey(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(raw){try{const keys=JSON.parse(raw),v=keys?.default||Object.values(keys||{})[0];if(typeof v==="string"&&v)return v;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",key=adminKey(),authorization=req.headers.get("Authorization")||"";
  if(!url||!key)return json({error:"Configuration serveur incomplète"},503);
  if(!authorization.startsWith("Bearer "))return json({error:"Authentification requise"},401);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),token=authorization.replace(/^Bearer\s+/i,"").trim();
  const{data:authData,error:authError}=await admin.auth.getUser(token),user=authData?.user;
  if(authError||!user)return json({error:"Session invalide"},401);
  const body=await req.json().catch(()=>null),dossierId=clip(body?.dossier_id,80);
  if(!/^[0-9a-f-]{36}$/i.test(dossierId))return json({error:"dossier_id invalide"},400);
  const{data:d,error}=await admin.from("dossiers").select("id,user_id,organization_id,reference_texts").eq("id",dossierId).maybeSingle();
  if(error||!d)return json({error:"Dossier introuvable"},404);
  const{data:membership,error:me}=await admin.from("organization_members").select("user_id").eq("organization_id",d.organization_id).eq("user_id",user.id).maybeSingle();
  if(me)return json({error:"Vérification des droits impossible"},503);
  if(!(d.user_id===user.id||!!membership))return json({error:"Accès interdit"},403);
  const refs=list(d.reference_texts),allowed=new Set(refs.map(celexFromRef).filter(Boolean));
  if(!allowed.size)return json({ok:true,engine:"scan-dossier-history-v11-readonly",dossier_id:d.id,results:[],message:"Aucun corpus canonique disponible pour ce dossier.",linked:0,suggested:0,rejected:0,unlinked:0});
  const{data:rows,error:we}=await admin.from("watch_items").select("id,title,nature,source_url,dossier_id,qualification_confidence,qualification_reason,published_at,created_at,change_type,change_summary").eq("organization_id",d.organization_id).in("dossier_id",[d.id]);
  if(we)return json({error:"Lecture du corpus impossible"},500);
  const results=(rows||[]).filter((item:any)=>allowed.has(celexFromUrl(item.source_url))).map((item:any)=>({id:item.id,title:item.title,score:Number(item.qualification_confidence)||.999,status:"linked",reason:item.qualification_reason||"Texte du corpus juridique canonique.",change_type:item.change_type,change_summary:item.change_summary})).sort((a:any,b:any)=>b.score-a.score);
  return json({ok:true,engine:"scan-dossier-history-v11-readonly",dossier_id:d.id,results,linked:results.length,suggested:0,rejected:0,unlinked:0,message:`${results.length} texte(s) du corpus juridique canonique.`});
});