import {NextRequest,NextResponse} from "next/server";

type ProtectedRoute={feature:string|null;methods:string[];maxBodyBytes?:number};

const protectedRoutes:Record<string,ProtectedRoute>={
  "/api/radar":{feature:"radar",methods:["POST"],maxBodyBytes:350_000},
  "/api/radar/fast":{feature:"radar",methods:["POST"],maxBodyBytes:350_000},
  "/api/impact":{feature:null,methods:["POST"],maxBodyBytes:1_500_000},
  "/api/builder":{feature:"note-builder",methods:["POST"],maxBodyBytes:750_000},
  "/api/veille/assign":{feature:"veille-assign",methods:["POST"],maxBodyBytes:300_000},
};
const CRON_SECRET_SHA256="91370f1f47c9a4a1e099fe367b4c0988420faf23eb49067f797801bfb69932c8";

function json(error:string,status:number){
  return NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});
}
function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let index=0;index<a.length;index++)diff|=a.charCodeAt(index)^b.charCodeAt(index);
  return diff===0;
}
async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function authorizeInternalSourceCollection(request:NextRequest){
  const supplied=request.headers.get("x-myvor-cron-secret")||"";
  if(!supplied)return false;
  const suppliedHash=await sha256(supplied);
  return safeEqual(CRON_SECRET_SHA256,suppliedHash);
}
function bodyTooLarge(request:NextRequest,maxBodyBytes?:number){
  if(!maxBodyBytes)return false;
  const raw=request.headers.get("content-length");
  if(!raw)return false;
  const size=Number(raw);
  return Number.isFinite(size)&&size>maxBodyBytes;
}

export async function middleware(request:NextRequest){
  if(request.nextUrl.pathname==="/api/veille/sources"){
    if(request.method!=="GET")return json("Méthode non autorisée.",405);
    try{
      if(!await authorizeInternalSourceCollection(request))return json("Accès interne requis.",401);
      return NextResponse.next();
    }catch{
      return json("Impossible de vérifier l’accès interne.",503);
    }
  }

  const route=protectedRoutes[request.nextUrl.pathname];
  if(!route||!route.methods.includes(request.method))return NextResponse.next();
  if(bodyTooLarge(request,route.maxBodyBytes))return json("Requête trop volumineuse.",413);

  const supabaseUrl=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
  if(!supabaseUrl||!anonKey)return json("La sécurité Supabase de Myvor n’est pas configurée.",503);

  const authorization=request.headers.get("authorization")||"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json("Session Myvor requise.",401);

  try{
    const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{
      method:"GET",
      headers:{apikey:anonKey,Authorization:authorization},
      cache:"no-store",
    });
    if(!userResponse.ok)return json("Session Myvor invalide ou expirée.",401);
    const user=await userResponse.json().catch(()=>null);
    if(!user?.id)return json("Session Myvor invalide ou expirée.",401);

    if(route.feature){
      try{
        const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{
          method:"POST",
          headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},
          body:JSON.stringify({p_feature:route.feature}),
          cache:"no-store",
        });
        if(!quotaResponse.ok)return json("Impossible de vérifier le quota de sécurité Myvor.",503);
        const payload=await quotaResponse.json().catch(()=>false);
        const allowed=payload===true||payload?.allowed===true||payload?.consume_ai_quota===true;
        if(!allowed)return json("Trop de traitements en peu de temps. Réessaie dans quelques minutes.",429);
      }catch{
        return json("Impossible de vérifier le quota de sécurité Myvor.",503);
      }
    }

    return NextResponse.next();
  }catch{
    return json("Impossible de vérifier la session Myvor.",503);
  }
}

export const config={
  matcher:["/api/radar","/api/radar/fast","/api/impact","/api/builder","/api/veille/assign","/api/veille/sources"],
};
