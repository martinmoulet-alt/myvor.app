type CachedResponse={
  body:string;
  headers:Array<[string,string]>;
  storedAt:number;
};

type FetchLike=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;

const CACHE_TTL_MS=15*60*1000;
const MAX_CACHE_ENTRIES=120;
const MAX_CACHE_BODY_CHARS=2_000_000;

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}

function rawUrl(input:RequestInfo|URL){
  if(typeof input==="string")return input;
  if(input instanceof URL)return input.toString();
  return input.url;
}

function requestMethod(input:RequestInfo|URL,init?:RequestInit){
  return String(init?.method||(input instanceof Request?input.method:"GET")||"GET").toUpperCase();
}

function requestHeaders(input:RequestInfo|URL,init?:RequestInit){
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  if(init?.headers)new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
  return headers;
}

export function isTransientSupabaseStatus(status:number){
  return status===408||status===425||status===429||status>=500;
}

export function isProtectedSupabaseRead(targetUrl:string,method:string,supabaseUrl:string){
  if(method!=="GET"||!supabaseUrl)return false;
  try{
    const target=new URL(targetUrl);
    const base=new URL(supabaseUrl);
    return target.origin===base.origin&&target.pathname.startsWith("/rest/v1/");
  }catch{return false;}
}

function cacheKey(targetUrl:string,headers:Headers){
  const authorization=headers.get("authorization")||"anonymous";
  return `${authorization}|${targetUrl}`;
}

function prune(cache:Map<string,CachedResponse>){
  const now=Date.now();
  for(const [key,value] of cache){if(now-value.storedAt>CACHE_TTL_MS)cache.delete(key);}
  while(cache.size>MAX_CACHE_ENTRIES){const first=cache.keys().next().value;if(!first)break;cache.delete(first);}
}

function cachedResponse(entry:CachedResponse){
  const headers=new Headers(entry.headers);
  headers.set("x-myvor-data-source","last-known-good");
  headers.set("cache-control","no-store");
  return new Response(entry.body,{status:200,headers});
}

export function createResilientSupabaseFetch(supabaseUrl:string,fetchImpl:FetchLike=fetch):FetchLike{
  const cache=new Map<string,CachedResponse>();
  return async(input,init)=>{
    const targetUrl=rawUrl(input);
    const method=requestMethod(input,init);
    if(!isProtectedSupabaseRead(targetUrl,method,supabaseUrl))return fetchImpl(input,init);

    const headers=requestHeaders(input,init);
    const key=cacheKey(targetUrl,headers);
    let lastResponse:Response|null=null;
    let lastError:unknown=null;

    for(let attempt=0;attempt<2;attempt++){
      try{
        const response=await fetchImpl(input,init);
        if(response.ok){
          try{
            const clone=response.clone();
            const body=await clone.text();
            if(body.length<=MAX_CACHE_BODY_CHARS){
              cache.set(key,{body,headers:Array.from(clone.headers.entries()),storedAt:Date.now()});
              prune(cache);
            }
          }catch{}
          return response;
        }
        if(!isTransientSupabaseStatus(response.status))return response;
        lastResponse=response;
      }catch(error){lastError=error;}
      if(attempt===0)await sleep(180);
    }

    prune(cache);
    const fallback=cache.get(key);
    if(fallback&&Date.now()-fallback.storedAt<=CACHE_TTL_MS)return cachedResponse(fallback);
    if(lastResponse)return lastResponse;
    throw lastError instanceof Error?lastError:new Error("Lecture Supabase indisponible.");
  };
}
