const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

test("Score d’urgence preserves the workflow watch context",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../app/ImpactModule.tsx"),"utf8");
  assert.match(source,/myvor:workflow-context/);
  assert.match(source,/dossier_id:workflowContext\.dossierId/);
  assert.match(source,/focusWatchIds=\{workflowContext\?\.watchIds\|\|\[\]\}/);
  assert.match(source,/onOpenRadar=\{props\.onOpenRadar\|\|openRadarFallback\}/);
});

test("Score d’urgence exposes the four decision views and saved history",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../app/UrgencyScoreModule.tsx"),"utf8");
  for(const label of ["À traiter","Analyse","Justification","Historique"])assert.match(source,new RegExp(label));
  assert.match(source,/from\("productions"\)/);
  assert.match(source,/\.eq\("type","urgency_score"\)/);
  assert.match(source,/saveProduction/);
  assert.match(source,/watch_ids:selected\.map/);
});

test("Score d’urgence uses the validated Myvor color thresholds",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../app/UrgencyScoreModule.tsx"),"utf8");
  assert.match(source,/score>=85\?"absolument urgent":score>=70\?"fort":score>=50\?"moyen":"faible"/);
  assert.match(source,/bandCritical/);
  assert.match(source,/bandHigh/);
  assert.match(source,/bandMedium/);
  assert.match(source,/bandLow/);
});

test("Score d’urgence keeps official source links in saved productions",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../app/UrgencyScoreModule.tsx"),"utf8");
  assert.match(source,/sourceList\(selected\)/);
  assert.match(source,/sources,/);
  assert.match(source,/target="_blank"/);
  assert.match(source,/rel="noreferrer"/);
});
