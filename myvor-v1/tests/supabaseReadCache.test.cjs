const test=require('node:test');
const assert=require('node:assert/strict');
const {createResilientSupabaseFetch,isProtectedSupabaseRead,isTransientSupabaseStatus}=require('../.test-dist/supabaseReadCache.js');

test('recognizes only transient Supabase failures',()=>{
  assert.equal(isTransientSupabaseStatus(503),true);
  assert.equal(isTransientSupabaseStatus(429),true);
  assert.equal(isTransientSupabaseStatus(401),false);
  assert.equal(isTransientSupabaseStatus(403),false);
});

test('protects authenticated REST reads but not writes or auth calls',()=>{
  assert.equal(isProtectedSupabaseRead('https://demo.supabase.co/rest/v1/dossiers?select=*','GET','https://demo.supabase.co'),true);
  assert.equal(isProtectedSupabaseRead('https://demo.supabase.co/rest/v1/dossiers','POST','https://demo.supabase.co'),false);
  assert.equal(isProtectedSupabaseRead('https://demo.supabase.co/auth/v1/user','GET','https://demo.supabase.co'),false);
});

test('serves the last successful REST read after repeated transient failures',async()=>{
  let call=0;
  const fakeFetch=async()=>{
    call++;
    if(call===1)return new Response(JSON.stringify([{id:'d1'}]),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({message:'temporary'}),{status:503,headers:{'content-type':'application/json'}});
  };
  const resilient=createResilientSupabaseFetch('https://demo.supabase.co',fakeFetch);
  const init={method:'GET',headers:{Authorization:'Bearer user-a'}};
  const first=await resilient('https://demo.supabase.co/rest/v1/dossiers?select=*',init);
  assert.equal(first.status,200);
  const second=await resilient('https://demo.supabase.co/rest/v1/dossiers?select=*',init);
  assert.equal(second.status,200);
  assert.equal(second.headers.get('x-myvor-data-source'),'last-known-good');
  assert.deepEqual(await second.json(),[{id:'d1'}]);
});

test('never serves stale data for authentication failures',async()=>{
  let call=0;
  const fakeFetch=async()=>{
    call++;
    if(call===1)return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({message:'expired'}),{status:401,headers:{'content-type':'application/json'}});
  };
  const resilient=createResilientSupabaseFetch('https://demo.supabase.co',fakeFetch);
  const init={method:'GET',headers:{Authorization:'Bearer user-a'}};
  await resilient('https://demo.supabase.co/rest/v1/watch_items?select=*',init);
  const expired=await resilient('https://demo.supabase.co/rest/v1/watch_items?select=*',init);
  assert.equal(expired.status,401);
  assert.equal(expired.headers.get('x-myvor-data-source'),null);
});
