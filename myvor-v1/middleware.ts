import {NextRequest,NextResponse} from "next/server";

type ProtectedRoute={feature:string|null;methods:string[]};

const protectedRoutes:Record<string,ProtectedRoute>={
  "/api/radar":{feature:"radar",methods:["POST"]},
  "/api/impact":{feature:null,methods:["POST"]},
  "/api/builder":{feature:"note-builder",methods:["POST"]},
  "/api/veille/assign":{feature:null,methods:["POST"]},
  "/api/veille/sources":{feature:null,methods:["GET"]},
};

function json(error:string,status:number){
  return NextResponse.json({error},{status});
}

export async function middleware(request:NextRequest){
  const route=protectedRoutes[request.nextUrl.pathname];
  if(!route||!route.methods.includes(request.method))return NextResponse.next();

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
      const quotaResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,{
        method:"POST",
        headers:{apikey:anonKey,Authorization:authorization,"Content-Type":"application/json"},
        body:JSON.stringify({p_feature:route.feature}),
        cache:"no-store",
      });
      if(!quotaResponse.ok)return json("Impossible de vérifier le quota IA Myvor.",503);
      const allowed=await quotaResponse.json().catch(()=>false);
      if(allowed!==true)return json("Trop de générations IA en peu de temps. Réessaie dans quelques minutes.",429);
    }

    return NextResponse.next();
  }catch{
    return json("Impossible de vérifier la session Myvor.",503);
  }
}

export const config={
  matcher:["/api/radar","/api/impact","/api/builder","/api/veille/assign","/api/veille/sources"],
};
