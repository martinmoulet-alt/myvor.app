import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async()=>new Response(JSON.stringify({error:"Endpoint retiré"}),{status:410,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}}));
