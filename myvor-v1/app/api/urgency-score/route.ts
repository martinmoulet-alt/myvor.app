import {NextResponse} from "next/server";

export const runtime="nodejs";

type Mode="express"|"standard"|"deep";

function config(){const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";if(!url||!anonKey)throw new Error("La connexion Supabase de Myvor n’est pas configurée.");return{url,anonKey};}
async function verifySession(authorization:string){if(!authorization.toLowerCase().startsWith("bearer "))throw new Error("Session Myvor requise.");const{url,anonKey}=config();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anonKey,Authorization:authorization},signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error("Session Myvor invalide ou expirée.");}finally{clearTimeout(timer);}}

export async function POST(request:Request){
  try{
    const authorization=request.headers.get("authorization")||"";await verifySession(authorization);
    const body=await request.json().catch(()=>null);const mode:Mode=["express","standard","deep"].includes(String(body?.mode))?body.mode:"standard";
    const dossier=body?.dossier||null;const items=Array.isArray(body?.items)?body.items:[];
    if(!dossier?.id||!dossier?.objective)return NextResponse.json({error:"Dossier client incomplet."},{status:400});
    if(!items.length)return NextResponse.json({error:"Aucun élément de veille rattaché n’a été transmis."},{status:400});
    const{url,anonKey}=config();const timeoutMs=mode==="express"?24000:mode==="standard"?46000:80000;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(`${url}/functions/v1/urgency-score-analysis`,{method:"POST",headers:{Authorization:authorization,apikey:anonKey,"Content-Type":"application/json"},body:JSON.stringify({dossier,items,mode}),signal:controller.signal,cache:"no-store"});
      const raw=await response.text();let payload:any=null;try{payload=raw?JSON.parse(raw):null;}catch{return NextResponse.json({error:`Le moteur Score d’urgence a renvoyé une réponse invalide (${response.status}).`},{status:502});}
      if(!response.ok)return NextResponse.json({error:payload?.error||`Le moteur Score d’urgence a échoué (${response.status}).`},{status:response.status>=400&&response.status<600?response.status:502});
      return NextResponse.json(payload,{status:200});
    }catch(error:any){if(error?.name==="AbortError")return NextResponse.json({error:mode==="express"?"Le Score Express n’a pas pu être calculé dans la fenêtre de 20 secondes.":mode==="standard"?"Le Score Standard n’a pas pu être calculé dans la fenêtre de 40 secondes.":"Le Score approfondi a dépassé le temps de réponse disponible."},{status:504});throw error;}finally{clearTimeout(timer);}
  }catch(error:any){const message=error?.message||"Erreur interne pendant le calcul du Score d’urgence.";const status=message.includes("Session")?401:500;return NextResponse.json({error:message},{status});}
}
