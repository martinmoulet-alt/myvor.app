const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("primary Radar uses the authenticated canonical dossier corpus as evidence fallback",()=>{
  const source=read("app/api/radar/route.ts");
  assert.match(source,/dossier_corpus/);
  assert.match(source,/fetchCorpusEvidence/);
  assert.match(source,/source_text/);
  assert.match(source,/canonical_corpus_used/);
  assert.match(source,/origin:\"stored\"/);
  assert.match(source,/private\.is_organization_member|Authorization/);
});

test("Radar fallback prioritizes sourced institutions and filters generic actor placeholders",()=>{
  const source=read("app/api/radar/fast/route.ts");
  const sourceSeeds=source.indexOf("items.forEach(item=>{const seed=institutionFromSource(item);if(seed)push(seed);});");
  const dossierSeeds=source.indexOf("dossier.key_actors");
  assert.ok(sourceSeeds>=0,"source-derived actor seeds must exist");
  assert.ok(dossierSeeds>=0,"dossier actor seeds must exist");
  assert.ok(sourceSeeds<dossierSeeds,"source-derived actors must be prioritized before dossier hints");
  assert.match(source,/GENERIC_ACTOR/);
  assert.match(source,/specificActor/);
  assert.match(source,/myvor-radar-stable-v7-sourced-first/);
});
