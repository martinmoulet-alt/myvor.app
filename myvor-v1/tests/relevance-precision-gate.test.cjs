const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260816192000_harden_named_eu_corpus_links.sql'),'utf8');

test('named EU dossiers reject unrelated French canonical links',()=>{
  assert.match(migration,/myvor_named_eu_refs/);
  assert.match(migration,/legifrance\.gouv\.fr/);
  assert.match(migration,/myvor_watch_mentions_named_eu/);
  assert.match(migration,/new\.status := 'rejected'/);
  assert.match(migration,/relevance-gate-named-eu-v1/);
});

test('manual user validation remains an explicit override',()=>{
  assert.match(migration,/manual\|accepted-suggestion\|user/);
});

test('canonical reference_texts are filtered with the same direct-reference rule',()=>{
  assert.match(migration,/myvor_filter_named_eu_reference_texts/);
  assert.match(migration,/new\.reference_texts := cleaned/);
});
