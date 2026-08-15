const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const source=fs.readFileSync(path.join(__dirname,"../supabase/functions/radar-enrich/index.ts"),"utf8");

test("Radar actor enrichment has a resilient fallback chain",()=>{
  assert.match(source,/DEFAULT_MODEL="gpt-5-mini"/);
  assert.match(source,/requestActorDetail\(apiKey,configuredModel,prompt,true/);
  assert.match(source,/requestActorDetail\(apiKey,DEFAULT_MODEL,prompt,false/);
  assert.match(source,/buildFallbackActor/);
  assert.match(source,/actor_detail_degraded/);
});

test("Radar actor enrichment stays inside the frontend timeout budget",()=>{
  assert.match(source,/webSearch\?26000:18000/);
});
