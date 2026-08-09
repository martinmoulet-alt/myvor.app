import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

type SourceItem={title:string;nature:string;source_url:string;source_name?:string;published_at?:string};
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const CRON_SECRET_SHA256="91370f1f47c9a4a1e099fe367b4c0988420faf23eb49067f797801bfb69932c8";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max).trim();}
function canonicalUrl(value:string){try{const url=new URL(value);url.hash="";for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||["fbclid","gclid"].includes(key))url.searchParams.delete(key);return url.toString();}catch{return value.trim();}}
function safeTimestamp(value?:string){if(!value)return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}
function safeEqual(a:string,b:string){const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function getAdminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
async function fetchJson(url:string,timeoutMs=30000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Myvor-Supabase-Catalog/1.0"},signal:controller.signal});const raw=await response.text();let payload:any={};try{payload=raw?JSON.parse(raw):{};}catch{payload={};}if(!response.ok)throw new Error(`HTTP ${response.status}`);return payload;}finally{clearTimeout(timer);}}

Deno.serve(async req=>{
  if(req.method!=="POST")return json({error:"Méthode non autorisée"},405);
  const supplied=req.headers.get("x-myvor-cron-secret")||"",suppliedHash=supplied?await sha256(supplied):"";
  if(!suppliedHash||!safeEqual(CRON_SECRET_SHA256,suppliedHash))return json({error:"Non autorisé"},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",adminKey=getAdminKey();
  if(!supabaseUrl||!adminKey)return json({error:"Configuration Supabase serveur incomplète"},500);
  const sourceEndpoint=Deno.env.get("MYVOR_SOURCES_URL")||"https://myvor.app/api/veille/sources";
  let payload:any;try{payload=await fetchJson(sourceEndpoint);}catch(error:any){return json({ok:false,error:`Collecte impossible: ${clip(error?.message,220)}`},502);}
  const sources:SourceItem[]=(Array.isArray(payload?.items)?payload.items:[])
    .map((item:any)=>({title:clip(item?.title,800),nature:clip(item?.nature||"Publication institutionnelle",140),source_url:canonicalUrl(clip(item?.source_url,1200)),source_name:clip(item?.source_name,180)||undefined,published_at:clip(item?.published_at,100)||undefined}))
    .filter(item=>item.title&&item.source_url.startsWith("http"))
    .filter((item,index,array)=>array.findIndex(x=>x.source_url===item.source_url)===index)
    .slice(0,500);
  const supabase=createClient(supabaseUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:settings,error:settingsError}=await supabase.from("veille_settings").select("user_id").eq("enabled",true);
  if(settingsError)return json({ok:false,error:"Impossible de charger les réglages de veille"},500);
  const userIds=[...new Set((settings||[]).map((row:any)=>String(row.user_id)).filter(Boolean))];
  if(!userIds.length)return json({ok:true,sources:sources.length,organizations:0,inserted:0});
  const[{data:profiles},{data:memberships}]=await Promise.all([
    supabase.from("user_profiles").select("user_id,active_organization_id").in("user_id",userIds),
    supabase.from("organization_members").select("user_id,organization_id,joined_at").in("user_id",userIds).order("joined_at",{ascending:true}),
  ]);
  const profileByUser=new Map((profiles||[]).map((row:any)=>[String(row.user_id),String(row.active_organization_id||"")]));
  const memberByUser=new Map<string,string>();for(const row of memberships||[]){const uid=String((row as any).user_id||""),org=String((row as any).organization_id||"");if(uid&&org&&!memberByUser.has(uid))memberByUser.set(uid,org);}
  const orgOwners=new Map<string,string>();for(const uid of userIds){const org=profileByUser.get(uid)||memberByUser.get(uid)||"";if(org&&!orgOwners.has(org))orgOwners.set(org,uid);}
  const summaries:any[]=[];let totalInserted=0;
  for(const [organizationId,userId] of orgOwners){
    const existingUrls=new Set<string>();let start=0;
    while(true){const{data,error}=await supabase.from("watch_items").select("source_url").eq("organization_id",organizationId).range(start,start+999);if(error)throw new Error(`Lecture du catalogue impossible: ${clip(error.message,180)}`);const rows=data||[];for(const row of rows)existingUrls.add(canonicalUrl(String((row as any).source_url||"")));if(rows.length<1000)break;start+=1000;}
    const fresh=sources.filter(item=>!existingUrls.has(item.source_url));let inserted=0;
    for(let offset=0;offset<fresh.length;offset+=100){const batch=fresh.slice(offset,offset+100).map(item=>({user_id:userId,organization_id:organizationId,created_by:userId,dossier_id:null,title:item.title,nature:item.nature,source_url:item.source_url,source_name:item.source_name||null,published_at:safeTimestamp(item.published_at),urgency:"moyen"}));if(!batch.length)continue;const{error}=await supabase.from("watch_items").insert(batch);if(error)throw new Error(`Insertion catalogue impossible: ${clip(error.message,180)}`);inserted+=batch.length;}
    totalInserted+=inserted;summaries.push({organization_id:organizationId,available:sources.length,new_items:inserted,total_known:existingUrls.size+inserted});
  }
  return json({ok:true,synced_at:new Date().toISOString(),sources:sources.length,active_sources:Array.isArray(payload?.active_sources)?payload.active_sources.length:0,organizations:orgOwners.size,inserted:totalInserted,details:summaries});
});
