const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const route=fs.readFileSync('app/api/radar/route.ts','utf8');

test('radar route has bounded primary and compact fallback analysis',()=>{
  assert.match(route,/callRadarModel\(apiKey,model,basePrompt,1500,12000\)/);
  assert.match(route,/callRadarModel\(apiKey,model,compactPrompt,900,6500\)/);
  assert.match(route,/continuity=true/);
});

test('radar adapts actor count to small dossiers',()=>{
  assert.match(route,/incoming\.length<=1\?4/);
  assert.match(route,/incoming\.length===2\?5:6/);
});

test('radar route is bounded for serverless execution',()=>{
  assert.match(route,/export const maxDuration=30/);
  const verifySession=route.match(/async function verifySession[\s\S]*?finally\{clearTimeout\(timer\);\}\}/)?.[0]||'';
  const authTimeout=Number(verifySession.match(/setTimeout\(\(\)=>controller\.abort\(\),(\d+)\)/)?.[1]||0);
  assert.ok(authTimeout>0&&authTimeout<=4000,`auth verification timeout must stay <= 4000 ms, got ${authTimeout}`);
});
