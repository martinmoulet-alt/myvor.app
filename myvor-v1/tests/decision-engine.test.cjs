const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Decision Engine reloads verified dossier and full source content server-side",()=>{
  const source=read("supabase/functions/decision-engine/index.ts");
  assert.match(source,/watch_item_content/);
  assert.match(source,/source_text/);
  assert.match(source,/\.eq\("type","urgency_score"\)/);
  assert.match(source,/urgency_production_id/);
});

test("Decision Engine exposes the stable MDE contract and deterministic explainability",()=>{
  const source=read("supabase/functions/decision-engine/index.ts");
  for(const field of ["event_summary","what_changes","client_impact","recommended_decision","priority_actions","stakeholders","explainability","evidence"]){
    assert.match(source,new RegExp(field));
  }
  for(const field of ["dossier_match","change_signal","change_magnitude","client_exposure","action_window","confidence","source_coverage"]){
    assert.match(source,new RegExp(field));
  }
  assert.match(source,/decisionCode/);
  assert.match(source,/validIndexes/);
});

test("Decision Engine persists both its own production and the urgency bridge",()=>{
  const source=read("supabase/functions/decision-engine/index.ts");
  assert.match(source,/type:"decision_engine"/);
  assert.match(source,/decision_engine:decision/);
  const productions=read("lib/productions.ts");
  assert.match(productions,/"decision_engine"/);
  assert.match(productions,/functions\.invoke\("decision-engine"/);
  assert.match(productions,/production\.type==="urgency_score"/);
});

test("Decision Engine keeps AI subordinate to verified evidence and deterministic rules",()=>{
  const source=read("supabase/functions/decision-engine/index.ts");
  assert.match(source,/Les extraits textuels sont la preuve primaire/);
  assert.match(source,/ne les recalcul/);
  assert.match(source,/deterministic-continuity/);
  assert.match(source,/corpus\.includes\(fold\(actor\.name\)\)/);
});
