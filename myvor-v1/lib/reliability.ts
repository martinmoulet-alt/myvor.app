export type RetryOptions={
  attempts?:number;
  baseDelayMs?:number;
  maxDelayMs?:number;
  shouldRetry?:(error:unknown,attempt:number)=>boolean;
};

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}

export function isTransientError(error:unknown){
  const message=String((error as any)?.message||error||"").toLowerCase();
  const status=Number((error as any)?.status||(error as any)?.statusCode||0);
  if(status===408||status===409||status===425||status===429||status>=500)return true;
  return ["timeout","timed out","network","fetch failed","failed to fetch","connection","temporarily","econnreset","etimedout","aborterror"].some(token=>message.includes(token));
}

export async function withRetry<T>(operation:()=>Promise<T>,options:RetryOptions={}):Promise<T>{
  const attempts=Math.max(1,options.attempts??3);
  const baseDelayMs=Math.max(0,options.baseDelayMs??250);
  const maxDelayMs=Math.max(baseDelayMs,options.maxDelayMs??1800);
  let lastError:unknown;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await operation();}
    catch(error){
      lastError=error;
      const retryable=options.shouldRetry?options.shouldRetry(error,attempt):isTransientError(error);
      if(!retryable||attempt>=attempts)throw error;
      const delay=Math.min(maxDelayMs,baseDelayMs*Math.pow(2,attempt-1));
      if(delay)await sleep(delay);
    }
  }
  throw lastError;
}

export async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const onAbort=()=>controller.abort();
  init.signal?.addEventListener("abort",onAbort,{once:true});
  try{return await fetch(input,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);init.signal?.removeEventListener("abort",onAbort);}
}

export async function fetchJsonWithRetry<T>(input:RequestInfo|URL,init:RequestInit={},options:RetryOptions&{timeoutMs?:number}={}):Promise<T>{
  const timeoutMs=options.timeoutMs??15000;
  return withRetry(async()=>{
    const response=await fetchWithTimeout(input,init,timeoutMs);
    const raw=await response.text();
    let payload:any=null;
    try{payload=raw?JSON.parse(raw):null;}catch{}
    if(!response.ok){
      const error:any=new Error(payload?.error||payload?.message||`Erreur réseau (${response.status})`);
      error.status=response.status;
      throw error;
    }
    if(payload===null&&raw){const error:any=new Error("Réponse serveur invalide.");error.status=502;throw error;}
    return payload as T;
  },options);
}
