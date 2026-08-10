import {NextResponse} from "next/server";

export const runtime="nodejs";

function supabaseConfig(){
  const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
  if(!url||!anonKey)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");
  return{url,anonKey};
}

export async function POST(request:Request){
  try{
    const authorization=request.headers.get("authorization")||"";
    if(!authorization.toLowerCase().startsWith("bearer ")){
      return NextResponse.json({error:"Session Myvor requise."},{status:401});
    }

    const body=await request.json().catch(()=>null);
    const dossier=body?.dossier||null;
    const items=Array.isArray(body?.items)?body.items:[];

    if(!dossier?.objective||!items.length){
      return NextResponse.json({error:"Dossier et veille rattachée sont obligatoires."},{status:400});
    }

    const{url,anonKey}=supabaseConfig();
    const response=await fetch(`${url}/functions/v1/urgency-score-analysis`,{
      method:"POST",
      headers:{
        Authorization:authorization,
        apikey:anonKey,
        "Content-Type":"application/json",
      },
      body:JSON.stringify({dossier,items,mode:"deep"}),
      cache:"no-store",
    });

    const raw=await response.text();
    let payload:unknown;
    try{payload=raw?JSON.parse(raw):null;}catch{payload={error:`Réponse non JSON de urgency-score-analysis (${response.status}).`};}

    return NextResponse.json(payload,{status:response.status});
  }catch(error:any){
    return NextResponse.json({error:error?.message||"Erreur interne Score d’urgence."},{status:500});
  }
}
