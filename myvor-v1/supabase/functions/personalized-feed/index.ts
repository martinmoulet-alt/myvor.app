import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const JOB_LABELS:Record<string,string>={cabinet:"cabinet d’affaires publiques",corporate:"direction affaires publiques",consultant:"consultant indépendant",federation:"fédération ou organisation",other:"professionnel des affaires publiques"};
type Watch={id:string;title:string;nature:string;source_name:string|null;urgency:string;dossier_id:string|null;published_at:string|null;created_at:string;qualification_reason:string|null};
type Dossier={id:string;title:string;objective:string;context:string|null;status:string;sector:string|null;activity:string|null;strategic_issues:string[]|null;watch_topics:string[]|null;watch_subtopics:string[]|null;key_actors:string[]|null};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, max-age=120"}});}
function clip(value:unknown,max:number){return String(value??"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}
function list(value:unknown,max=12){return Array.isArray(value)?value.map(item=>clip(item,180)).filter(Boolean).slice(0,max):[];}
function urgencyRank(value:string){const key=value.toLowerCase();return key==="absolument urgent"?4:key==="fort"?3:key==="moyen"?2:1;}
function time(value:string|null|undefined){const n=value?Date.parse(value):0;return Number.isFinite(n)?n:0;}
function recency(value:string|null|undefined){const ageDays=Math.max(0,(Date.now()-time(value))/86400000);return Math.exp(-ageDays/18);}
function activeStatus(value:string){const key=value.toLowerCase();return !["clos","clôtur","archive","termin","inactif"].some(token=>key.includes(token));}
function vector(value:unknown):number[]{if(Array.isArray(value))return value.map(Number).filter(Number.isFinite);if(value&&ArrayBuffer.isView(value))return Array.from(value as Float32Array).map(Number).filter(Number.isFinite);return[];}
function dot(a:number[],b:number[]){let sum=0;const size=Math.min(a.length,b.length);for(let i=0;i<size;i++)sum+=a[i]*b[i];return Math.max(0,Math.min(1,sum));}
function semanticWatchText(item:Watch){return [item.title,item.nature,item.source_name,item.qualification_reason].filter(Boolean).map(value=>clip(value,700)).join(". ").slice(0,1800);}
function dossierText(dossier:Dossier){return [dossier.title,dossier.objective,dossier.context,dossier.sector,dossier.activity,...list(dossier.strategic_issues,6),...list(dossier.watch_topics,8),...list(dossier.watch_subtopics,8),...list(dossier.key_actors,6)].filter(Boolean).join(". ").slice(0,2600);}
async function embedMany(model:any,texts:string[]){const output:number[][]=[];for(let start=0;start<texts.length;start+=6){const batch=texts.slice(start,start+6);const settled=await Promise.allSettled(batch.map(text=>model.run(text,{mean_pool:true,normalize:true})));for(const result of settled)output.push(result.status==="fulfilled"?vector(result.value):[]);}return output;}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"Session Myvor requise."},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!supabaseUrl||!anonKey)return json({error:"Configuration Supabase incomplète."},503);
  const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const{data:userData,error:userError}=await supabase.auth.getUser();const user=userData.user;
  if(userError||!user)return json({error:"Session Myvor invalide ou expirée."},401);
  const body=await req.json().catch(()=>({}));const requested=Math.max(3,Math.min(8,Number(body?.limit)||6));

  const[{data:profile},{data:memberships}]=await Promise.all([
    supabase.from("user_profiles").select("job_type,topics,institutions,alert_level,active_organization_id").eq("user_id",user.id).maybeSingle(),
    supabase.from("organization_members").select("organization_id").eq("user_id",user.id),
  ]);
  const memberRows=Array.isArray(memberships)?memberships:[];const preferred=String(profile?.active_organization_id||"");
  const organizationId=String(memberRows.some(row=>row.organization_id===preferred)?preferred:memberRows[0]?.organization_id||"");
  if(!organizationId)return json({items:[],engine:"semantic-personalization-v1",reason:"no_workspace"});

  const[{data:preference},{data:dossierRows},{data:watchRows,error:watchError}]=await Promise.all([
    supabase.from("workspace_preferences").select("priority_dossier_id").eq("user_id",user.id).eq("organization_id",organizationId).maybeSingle(),
    supabase.from("dossiers").select("id,title,objective,context,status,sector,activity,strategic_issues,watch_topics,watch_subtopics,key_actors").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(16),
    supabase.from("watch_items").select("id,title,nature,source_name,urgency,dossier_id,published_at,created_at,qualification_reason").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(80),
  ]);
  if(watchError)return json({error:"Impossible de charger la veille personnalisée."},500);
  const dossiers=((dossierRows||[]) as Dossier[]).filter(dossier=>activeStatus(dossier.status));const watches=(watchRows||[]) as Watch[];
  if(!watches.length)return json({items:[],engine:"semantic-personalization-v1",reason:"no_watch"});
  const pinnedId=String(preference?.priority_dossier_id||"");const pinned=dossiers.find(dossier=>dossier.id===pinnedId)||null;

  const profileText=[
    `Métier : ${JOB_LABELS[String(profile?.job_type||"")]||"professionnel des affaires publiques"}.`,
    list(profile?.topics,16).length?`Sujets prioritaires : ${list(profile?.topics,16).join(", ")}.`:"",
    list(profile?.institutions,16).length?`Institutions suivies : ${list(profile?.institutions,16).join(", ")}.`:"",
    pinned?`Dossier prioritaire : ${dossierText(pinned)}.`:"",
    ...dossiers.filter(dossier=>dossier.id!==pinnedId).slice(0,8).map(dossier=>`Dossier actif : ${dossierText(dossier)}.`),
  ].filter(Boolean).join("\n").slice(0,9000);

  const candidatePool=[...watches].sort((a,b)=>{
    const base=(item:Watch)=>urgencyRank(item.urgency)*.5+recency(item.published_at||item.created_at)*1.4+(pinnedId&&item.dossier_id===pinnedId?.55:item.dossier_id?.18:0);
    return base(b)-base(a);
  }).slice(0,30);
  try{
    const model=new Supabase.ai.Session("gte-small");
    const profileEmbedding=vector(await model.run(profileText||"veille institutionnelle affaires publiques",{mean_pool:true,normalize:true}));
    if(!profileEmbedding.length)throw new Error("embedding profil vide");
    const embeddings=await embedMany(model,candidatePool.map(semanticWatchText));
    const scored=candidatePool.map((item,index)=>{
      const similarity=embeddings[index]?.length?dot(profileEmbedding,embeddings[index]):0;
      const urgency=urgencyRank(item.urgency)/4;const recent=recency(item.published_at||item.created_at);const dossierBoost=pinnedId&&item.dossier_id===pinnedId?1:item.dossier_id?0.35:0;
      const score=Math.max(0,Math.min(1,similarity*.72+urgency*.16+recent*.08+dossierBoost*.04));
      const reasons:string[]=[];if(pinnedId&&item.dossier_id===pinnedId)reasons.push("lié au dossier prioritaire");if(similarity>=.78)reasons.push("forte proximité avec vos enjeux");else if(similarity>=.64)reasons.push("proche de vos sujets suivis");if(urgency>=.75)reasons.push("urgence élevée");if(recent>.8)reasons.push("évolution récente");
      return{id:item.id,score:Number(score.toFixed(3)),semantic_similarity:Number(similarity.toFixed(3)),reason:reasons.slice(0,2).join(" · ")||"pertinence calculée sur votre portefeuille"};
    }).sort((a,b)=>b.score-a.score).slice(0,requested);
    return json({items:scored,engine:"semantic-personalization-v1",model:"gte-small",organization_id:organizationId,profile_basis:{topics:list(profile?.topics,16).length,institutions:list(profile?.institutions,16).length,active_dossiers:dossiers.length,priority_dossier:Boolean(pinned)},candidate_count:candidatePool.length});
  }catch(error:any){return json({error:`Personnalisation sémantique indisponible : ${clip(error?.message||"erreur inconnue",240)}`},503);}
});
