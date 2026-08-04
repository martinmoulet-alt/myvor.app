import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null;

const readCache=new Map<string,{status:number;statusText:string;headers:[string,string][];body:string;storedAt:number}>();
const READ_CACHE_TTL_MS=10*60*1000;

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
function retryableStatus(status:number){return status===408||status===425||status===429||status>=500;}
async function fetchRetriable(originalFetch:typeof window.fetch,input:RequestInfo|URL,init:RequestInit|undefined,attempts=2){let lastResponse:Response|null=null;let lastError:unknown=null;for(let attempt=1;attempt<=Math.max(1,attempts);attempt++){try{const response=await originalFetch(input,init);lastResponse=response;if(response.ok||!retryableStatus(response.status))return response;}catch(error){lastError=error;}if(attempt<attempts)await sleep(220*attempt);}if(lastResponse)return lastResponse;throw lastError||new Error("Service temporairement indisponible.");}
function isSupabaseRead(rawUrl:string,method:string){if(!url||method!=="GET")return false;try{const target=new URL(rawUrl,typeof window!=="undefined"?window.location.origin:undefined);return target.origin===new URL(url).origin&&target.pathname.startsWith("/rest/v1/");}catch{return false;}}
function cacheKey(userId:string,rawUrl:string){return `${userId}|${rawUrl}`;}
function cachedResponse(userId:string,rawUrl:string){const cached=readCache.get(cacheKey(userId,rawUrl));if(!cached||Date.now()-cached.storedAt>READ_CACHE_TTL_MS){if(cached)readCache.delete(cacheKey(userId,rawUrl));return null;}return new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers:cached.headers});}
async function rememberResponse(userId:string,rawUrl:string,response:Response){try{const body=await response.clone().text();readCache.set(cacheKey(userId,rawUrl),{status:response.status,statusText:response.statusText,headers:[...response.headers.entries()],body,storedAt:Date.now()});}catch{}}
async function reliableRead(originalFetch:typeof window.fetch,input:RequestInfo|URL,init:RequestInit|undefined,userId:string,rawUrl:string){let lastResponse:Response|null=null;let lastError:unknown=null;for(let attempt=1;attempt<=3;attempt++){try{const response=await originalFetch(input,init);lastResponse=response;if(response.ok){await rememberResponse(userId,rawUrl,response);return response;}if(!retryableStatus(response.status))return response;}catch(error){lastError=error;}if(attempt<3)await sleep(attempt===1?180:520);}const cached=cachedResponse(userId,rawUrl);if(cached)return cached;if(lastResponse)return lastResponse;throw lastError||new Error("Lecture Supabase indisponible.");}

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

async function runImpactFallback(originalFetch:typeof window.fetch,rawUrl:string,headers:Headers,prepared:any,reason:string,edgeStatus?:number|null){
  let fallbackUrl="/api/impact/fallback";
  try{fallbackUrl=new URL("/api/impact/fallback",new URL(rawUrl,window.location.origin).origin).toString();}catch{}
  return fetchRetriable(originalFetch,fallbackUrl,{
    method:"POST",
    headers,
    body:JSON.stringify({prepared,reason,edge_status:edgeStatus||null}),
  },2);
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
  const prepareResponse=await fetchRetriable(originalFetch,rawUrl,{...init,headers:sameOriginHeaders,body:JSON.stringify({...requestBody,phase:"prepare"})},2);
  if(!prepareResponse.ok)return prepareResponse;

  const preparePayload=await prepareResponse.json().catch(()=>null);
  const prepared=preparePayload?.prepared;
  if(!prepared?.invoke_body){
    return new Response(JSON.stringify({error:"La préparation de la Note d’impact est incomplète."}),{status:502,headers:{"Content-Type":"application/json"}});
  }

  const edgeHeaders=jsonHeaders(accessToken);
  edgeHeaders.set("apikey",key);
  let edgeResponse:Response;
  try{
    edgeResponse=await originalFetch(`${url.replace(/\/$/,"")}/functions/v1/impact-analysis`,{
      method:"POST",
      headers:edgeHeaders,
      body:JSON.stringify(prepared.invoke_body),
    });
  }catch(error:any){
    return runImpactFallback(originalFetch,rawUrl,sameOriginHeaders,prepared,`Connexion au moteur IA impossible : ${error?.message||"erreur réseau"}.`);
  }

  const edgeRaw=await edgeResponse.text();
  let edgePayload:any=null;
  try{edgePayload=edgeRaw?JSON.parse(edgeRaw):null;}catch{}
  if(!edgeResponse.ok){
    const reason=String(edgePayload?.error||`La fonction impact-analysis a échoué (${edgeResponse.status}).`);
    return runImpactFallback(originalFetch,rawUrl,sameOriginHeaders,prepared,reason,edgeResponse.status);
  }
  if(!edgePayload?.impact){
    return runImpactFallback(originalFetch,rawUrl,sameOriginHeaders,prepared,"Le moteur IA n’a pas retourné une Note complète exploitable.",502);
  }

  const finalizeResponse=await fetchRetriable(originalFetch,rawUrl,{
    method:"POST",
    headers:sameOriginHeaders,
    body:JSON.stringify({phase:"finalize",prepared,payload:edgePayload}),
  },2);
  if(finalizeResponse.ok)return finalizeResponse;

  const finalizeRaw=await finalizeResponse.clone().text().catch(()=>"");
  let finalizePayload:any=null;
  try{finalizePayload=finalizeRaw?JSON.parse(finalizeRaw):null;}catch{}
  return runImpactFallback(
    originalFetch,
    rawUrl,
    sameOriginHeaders,
    prepared,
    String(finalizePayload?.error||`La finalisation de la Note a échoué (${finalizeResponse.status}).`),
    finalizeResponse.status,
  );
}

if(typeof window!=="undefined"&&supabase&&!(window as any).__myvorAuthenticatedFetchInstalled){
  (window as any).__myvorAuthenticatedFetchInstalled=true;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const rawUrl=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
    const method=String(init?.method||(input instanceof Request?input.method:"GET")||"GET").toUpperCase();

    const {data}=await supabase.auth.getSession();
    const session=data.session;
    const accessToken=session?.access_token;
    const userId=session?.user?.id||"anonymous";

    if(isSupabaseRead(rawUrl,method)){
      const headers=new Headers(input instanceof Request?input.headers:undefined);
      if(init?.headers)new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
      const requestInput=input instanceof Request?new Request(input,{...init,headers}):input;
      return reliableRead(originalFetch,requestInput,input instanceof Request?undefined:{...init,headers},userId,rawUrl);
    }

    if(!shouldAttachUserToken(rawUrl)||!accessToken)return originalFetch(input,init);

    const splitResponse=await maybeRunImpactSplit(originalFetch,rawUrl,init,accessToken);
    if(splitResponse)return splitResponse;

    const headers=new Headers(input instanceof Request?input.headers:undefined);
    if(init?.headers)new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
    headers.set("Authorization",`Bearer ${accessToken}`);

    try{
      const target=new URL(rawUrl,window.location.origin);
      if(url&&target.origin===new URL(url).origin&&key)headers.set("apikey",key);
      const safeVeille=(target.origin===window.location.origin&&((target.pathname==="/api/veille/sources"&&method==="GET")||(target.pathname==="/api/veille/assign"&&method==="POST")));
      if(safeVeille&&!(input instanceof Request))return fetchRetriable(originalFetch,rawUrl,{...init,headers},2);
    }catch{}

    if(input instanceof Request){
      return originalFetch(new Request(input,{...init,headers}));
    }
    return originalFetch(input,{...init,headers});
  };
}
