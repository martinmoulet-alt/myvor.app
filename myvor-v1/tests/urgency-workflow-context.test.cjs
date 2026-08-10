const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

test("Score d’urgence preserves the workflow watch context",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../app/ImpactModule.tsx"),"utf8");
  assert.match(source,/myvor:workflow-context/);
  assert.match(source,/dossier_id:workflowContext\.dossierId/);
  assert.match(source,/watch=\{watch\}/);
});
