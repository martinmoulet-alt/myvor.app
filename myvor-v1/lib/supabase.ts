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

if(typeof window!=="undefined"&&supabase&&!(window as any).__myvorAuthenticatedFetchInstalled){
  (window as any).__myvorAuthenticatedFetchInstalled=true;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const rawUrl=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
    if(!shouldAttachUserToken(rawUrl))return originalFetch(input,init);

    const {data}=await supabase.auth.getSession();
    const accessToken=data.session?.access_token;
    if(!accessToken)return originalFetch(input,init);

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
