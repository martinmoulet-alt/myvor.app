import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const CRON_SECRET_SHA256="91370f1f47c9a4a1e099fe367b4c0988420faf23eb49067f797801bfb69932c8";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
function safeEqual(a:string,b:string){const aa=new TextEncoder().encode(a);const bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;}
async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(byte=>byte.toString(16).padStart(2,"0")).join("");}
function adminKey(){const modern=Deno.env.get("SUPABASE_SECRET_KEYS");if(modern){try{const keys=JSON.parse(modern);const value=keys?.default||Object.values(keys||{})[0];if(typeof value==="string"&&value)return value;}catch{}}return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);

  const supplied=req.headers.get("x-myvor-cron-secret")||"";
  const suppliedHash=supplied?await sha256(supplied):"";
  if(!suppliedHash||!safeEqual(CRON_SECRET_SHA256,suppliedHash))return json({error:"Non autorisé."},401);

  const url=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
  const key=adminKey();
  const internalCronSecret=Deno.env.get("MYVOR_CRON_SECRET")||"";
  if(!url||!key||!internalCronSecret)return json({error:"Configuration Supabase serveur incomplète."},503);

  try{
    const response=await fetch(`${url}/functions/v1/sync-watch`,{
      method:"POST",
      headers:{
        apikey:key,
        Authorization:`Bearer ${key}`,
        "Content-Type":"application/json",
        "x-myvor-cron-secret":internalCronSecret,
      },
      body:JSON.stringify({source:"supabase-cron",requested_at:new Date().toISOString()}),
    });
    const raw=await response.text();
    let payload:unknown;try{payload=raw?JSON.parse(raw):{};}catch{payload={error:raw||`HTTP ${response.status}`};}
    return json(payload,response.status);
  }catch(error){return json({error:error instanceof Error?error.message:String(error)},502);}
});
