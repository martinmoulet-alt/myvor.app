const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const sync=fs.readFileSync(path.join(root,'supabase/functions/sync-watch/index.ts'),'utf8');
const qualifier=fs.readFileSync(path.join(root,'supabase/functions/qualify-watch-ai/index.ts'),'utf8');

test('veille scans both historical and recent unlinked items',()=>{
  assert.match(sync,/RULE_PREFIX="Règles dossier v14 —"/);
  assert.match(sync,/oldest=.*sort\(\(a,b\)=>itemTime\(a\)-itemTime\(b\)\)/s);
  assert.match(sync,/newest=.*sort\(\(a,b\)=>itemTime\(b\)-itemTime\(a\)\)/s);
  assert.doesNotMatch(sync,/Date\.now\(\).*\b(?:30|60|90|180|365)\b.*day/i);
});

test('generic institutional phrases cannot be discriminating by themselves',()=>{
  for(const phrase of ['journal officiel','assemblee nationale','senat','gouvernement','constitution']){
    assert.ok(sync.includes(`"${phrase}"`),`missing generic guard for ${phrase}`);
  }
  assert.match(sync,/\.filter\(isStrongConfiguredTerm\)/);
});

test('named instruments are required for instrument-specific dossiers',()=>{
  assert.match(sync,/function instrumentAliases\(/);
  assert.match(sync,/loi du \\d\{1,2\}/);
  assert.match(sync,/artificial intelligence act/);
  assert.match(sync,/instrument nommé absent/);
});

test('qualifier compares a new item against older linked dossier texts',()=>{
  assert.match(qualifier,/RULE_PREFIX="Règles dossier v14 —"/);
  assert.match(qualifier,/TEXTES HISTORIQUES/);
  assert.match(qualifier,/itemTime\(h\)<candidateTime/);
  assert.match(qualifier,/change_type/);
  assert.match(qualifier,/Ce qui change \[\$\{result\.change_type\}\]/);
});
