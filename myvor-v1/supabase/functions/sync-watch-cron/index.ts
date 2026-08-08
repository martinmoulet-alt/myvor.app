import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function safeEqual(a:string,b:string){const aa=new TextEncoder().encode(a);const bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;}
function adminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);

  const expected=Deno.env.get("MYVOR_CRON_SECRET")||"";
  const supplied=req.headers.get("x-myvor-cron-secret")||"";
  if(!expected||!supplied||!safeEqual(expected,supplied))return json({error:"Non autorisé."},401);

  const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const key=adminKey();
  if(!url||!key)return json({error:"Configuration Supabase serveur incomplète."},503);

  try{
    const response=await fetch(`${url}/functions/v1/sync-watch`,{
      method:"POST",
      headers:{
        apikey:key,
        Authorization:`Bearer ${key}`,
        "Content-Type":"application/json",
        "x-myvor-cron-secret":expected,
      },
      body:JSON.stringify({source:"supabase-cron",requested_at:new Date().toISOString()}),
    });
    const raw=await response.text();
    let payload:unknown;try{payload=raw?JSON.parse(raw):{};}catch{payload={error:raw||`HTTP ${response.status}`};}
    return json(payload,response.status);
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},502);}
});
