import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(()=>new Response(JSON.stringify({
  error:"Endpoint de diagnostic retiré. Utilisez les modules Myvor dédiés.",
  deprecated:true,
}),{
  status:410,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
}));
