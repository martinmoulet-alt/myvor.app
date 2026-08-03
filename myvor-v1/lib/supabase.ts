import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null;

function shouldAttachUserToken(rawUrl:string){
  if(typeof window==="undefined")return false;
  try{
    const target=new URL(rawUrl,window.location.origin);
    const sameOrigin=target.origin===window.location.origin;
    if(sameOrigin&&["/api/radar","/api/impact","/api/builder","/api/veille/assign","/api/veille/sources"].some(path=>target.pathname===path||target.pathname.startsWith(`${path}/`)))return true;
    if(url&&target.origin===new URL(url).origin){
      return ["/functions/v1/dossier-profile","/functions/v1/note-builder","/functions/v1/impact-analysis","/functions/v1/influence-radar"].some(path=>target.pathname===path||target.pathname.startsWith(`${path}/`));
    }
  }catch{}
  return false;
}

function jsonHeaders(accessToken:string){
  return new Headers({"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`});
}

async function maybeRunImpactSplit(originalFetch:typeof window.fetch,rawUrl:string,init:RequestInit|undefined,accessToken:string){
  if(!url||!key||typeof window==="undefined")return null;
  let target:URL;
  try{target=new URL(rawUrl,window.location.origin);}catch{return null;}
  if(target.origin!==window.location.origin||target.pathname!=="/api/impact"||String(init?.method||"GET").toUpperCase()!=="POST")return null;
  if(typeof init?.body!=="string")return null;

  let requestBody:any=null;
  try{requestBody=JSON.parse(init.body);}catch{return null;}
  if(requestBody?.phase)return null;
  if(!["express","standard","deep"].includes(String(requestBody?.depth||"standard")))return null;

  const sameOriginHeaders=jsonHeaders(accessToken);
  const prepareResponse=await originalFetch(rawUrl,{...init,headers:sameOriginHeaders,body:JSON.stringify({...requestBody,phase:"prepare"})});
  if(!prepareResponse.ok)return prepareResponse;

  const preparePayload=await prepareResponse.json().catch(()=>null);
  const prepared=preparePayload?.prepared;
  if(!prepared?.invoke_body){
    return new Response(JSON.stringify({error:"La préparation de la Note d’impact est incomplète."}),{status:502,headers:{"Content-Type":"application/json"}});
  }

  const edgeHeaders=jsonHeaders(accessToken);
  edgeHeaders.set("apikey",key);
  const edgeResponse=await originalFetch(`${url.replace(/\/$/,"")}/functions/v1/impact-analysis`,{
    method:"POST",
    headers:edgeHeaders,
    body:JSON.stringify(prepared.invoke_body),
  });

  const edgeRaw=await edgeResponse.text();
  let edgePayload:any=null;
  try{edgePayload=edgeRaw?JSON.parse(edgeRaw):null;}catch{}
  if(!edgeResponse.ok){
    return new Response(JSON.stringify(edgePayload||{error:`La fonction impact-analysis a échoué (${edgeResponse.status}).`}),{status:edgeResponse.status,headers:{"Content-Type":"application/json"}});
  }
  if(!edgePayload?.impact){
    return new Response(JSON.stringify({error:"La fonction impact-analysis n’a pas retourné une Note exploitable."}),{status:502,headers:{"Content-Type":"application/json"}});
  }

  return originalFetch(rawUrl,{
    method:"POST",
    headers:sameOriginHeaders,
    body:JSON.stringify({phase:"finalize",prepared,payload:edgePayload}),
  });
}

if(typeof window!=="undefined"&&supabase&&!(window as any).__myvorAuthenticatedFetchInstalled){
  (window as any).__myvorAuthenticatedFetchInstalled=true;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const rawUrl=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
    if(!shouldAttachUserToken(rawUrl))return originalFetch(input,init);

    const {data}=await supabase.auth.getSession();
    const accessToken=data.session?.access_token;
    if(!accessToken)return originalFetch(input,init);

    const splitResponse=await maybeRunImpactSplit(originalFetch,rawUrl,init,accessToken);
    if(splitResponse)return splitResponse;

    const headers=new Headers(input instanceof Request?input.headers:undefined);
    if(init?.headers)new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
    headers.set("Authorization",`Bearer ${accessToken}`);

    try{
      const target=new URL(rawUrl,window.location.origin);
      if(url&&target.origin===new URL(url).origin&&key)headers.set("apikey",key);
    }catch{}

    if(input instanceof Request){
      return originalFetch(new Request(input,{...init,headers}));
    }
    return originalFetch(input,{...init,headers});
  };
}
