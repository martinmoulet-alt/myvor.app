import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {buildContinuityImpact} from "@/lib/impactContinuity";

export const runtime="nodejs";

class ContinuityError extends Error{constructor(message:string,public status=500){super(message);}}

function supabaseConfig(){
  const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
  if(!url||!anonKey)throw new ContinuityError("La connexion Supabase de Myvor n’est pas configurée.",503);
  return{url,anonKey};
}

async function verifySession(authorization:string){
  if(!authorization.toLowerCase().startsWith("bearer "))throw new ContinuityError("Session Myvor requise.",401);
  const{url,anonKey}=supabaseConfig();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:authorization},signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw new ContinuityError("Session Myvor invalide ou expirée.",401);
  }catch(error){
    if(error instanceof ContinuityError)throw error;
    throw new ContinuityError("Impossible de vérifier la session Myvor.",503);
  }finally{clearTimeout(timer);}
}

function validatePrepared(prepared:any){
  if(!prepared||typeof prepared!=="object"||!prepared.dossier||!Array.isArray(prepared.items))throw new ContinuityError("Préparation de Note invalide.",400);
  if(prepared.items.length>12)throw new ContinuityError("Préparation de Note trop volumineuse.",413);
  if(typeof prepared.source_text==="string"&&prepared.source_text.length>120000)throw new ContinuityError("Corpus de Note trop volumineux.",413);
  if(Array.isArray(prepared.official_candidates)&&prepared.official_candidates.length>5000)throw new ContinuityError("Préparation de Note trop volumineuse.",413);
}

export async function POST(request:Request){
  try{
    const authorization=request.headers.get("authorization")||"";
    await verifySession(authorization);
    const body=await request.json().catch(()=>null);
    const prepared=body?.prepared;
    validatePrepared(prepared);
    const reason=typeof body?.reason==="string"?body.reason:"Analyse IA indisponible";
    const result=buildContinuityImpact(prepared,reason);
    const generatedAt=new Date().toISOString();
    return NextResponse.json({
      ...result,
      audit:{
        analysis_id:randomUUID(),
        generated_at:generatedAt,
        prompt_version:String(prepared?.invoke_body?.prompt_version||"impact-prompt-v4"),
        engine_version:"myvor-impact-continuity-v1",
        model:"none",
        include_internal_notes:prepared?.include_internal_notes!==false,
        dossier_snapshot:{id:prepared?.dossier?.id||"",client:prepared?.dossier?.client||"",title:prepared?.dossier?.title||"",objective:prepared?.dossier?.objective||""},
        selection:prepared?.selection||null,
        source_snapshots:Array.isArray(prepared?.source_snapshots)?prepared.source_snapshots:[],
        fallback_reason:reason,
        edge_status:Number(body?.edge_status)||null,
      },
    });
  }catch(error:any){
    const status=error instanceof ContinuityError?error.status:500;
    return NextResponse.json({error:error?.message||"Impossible de produire la Note de continuité."},{status});
  }
}
