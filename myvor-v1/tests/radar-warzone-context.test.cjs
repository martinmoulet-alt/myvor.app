const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=(relative)=>fs.readFileSync(path.join(root,relative),"utf8");

test("Radar keeps the exact workflow watch context from Score d’urgence",()=>{
  const source=read("app/RadarModule.tsx");
  assert.match(source,/myvor:workflow-context/);
  assert.match(source,/workflowIds\?relatedAll\.filter/);
  assert.match(source,/sameIds\(productionItemIds\(item\.content\),relatedIds\)/);
  assert.match(source,/context_source:scopedFromScore\?"urgency_score":"dossier"/);
});

test("Radar prefers grounded actors and keeps a resilient fallback",()=>{
  const source=read("app/RadarModule.tsx");
  assert.match(source,/authedPost<T>\("\/api\/radar",body,29000\)/);
  assert.match(source,/authedPost<T>\("\/api\/radar\/fast",body,18000\)/);
  assert.match(source,/fallback_used:true/);
  assert.match(source,/updateProductionContent/);
});

test("War Zone only executes a strategy for the current Radar and watch context",()=>{
  const source=read("app/WarZoneView.tsx");
  assert.match(source,/slice\(0,4\)/);
  assert.match(source,/slice\(0,8\)/);
  assert.match(source,/matchesContext/);
  assert.match(source,/currentContextMatches/);
  assert.match(source,/Recalcule la stratégie avant de l’ajouter aux actions/);
  assert.match(source,/actor_ids:currentActorIds/);
  assert.match(source,/watch_ids:currentWatchIds/);
});
