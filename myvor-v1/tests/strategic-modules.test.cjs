const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=(relative)=>fs.readFileSync(path.join(root,relative),"utf8");

test("Radar generation consumes a per-user quota",()=>{
  const source=read("app/api/radar/fast/route.ts");
  assert.match(source,/consume_ai_quota/);
  assert.match(source,/p_feature:\s*["']radar["']/);
  assert.match(source,/status:429/);
});

test("War Zone engine is server-side rate limited",()=>{
  const source=read("supabase/functions/warzone-strategy/index.ts");
  assert.match(source,/consume_ai_quota/);
  assert.match(source,/warzone-strategy/);
  assert.match(source,/429/);
});

test("War Zone strategies are versioned and reconnect to operations",()=>{
  const source=read("app/WarZoneView.tsx");
  assert.match(source,/type:\s*["']warzone["']/);
  assert.match(source,/listProductions/);
  assert.match(source,/updateProductionContent/);
  assert.match(source,/Nouveaux signaux de veille/);
  assert.match(source,/Créer un livrable/);
  assert.match(source,/Voir les actions/);
});

test("Note Builder has generation and edit quotas",()=>{
  const source=read("supabase/functions/note-builder/index.ts");
  assert.match(source,/note-builder-edit/);
  assert.match(source,/consume_ai_quota/);
});

test("background watch sync uses the secured cron relay",()=>{
  const source=read("supabase/functions/sync-watch-cron/index.ts");
  assert.match(source,/x-myvor-cron-secret/);
  assert.match(source,/functions\/v1\/sync-watch/);
});
