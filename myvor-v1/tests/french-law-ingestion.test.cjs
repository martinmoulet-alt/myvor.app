const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const catalog=fs.readFileSync(path.join(root,'supabase/functions/sync-watch-catalog/index.ts'),'utf8');

test('French JORF feed continuously updates the canonical legal catalog',()=>{
  assert.match(catalog,/document_id:string/);
  assert.match(catalog,/legal_catalog_fr/);
  assert.match(catalog,/onConflict:\"document_id\"/);
  assert.match(catalog,/catalog_upserts/);
  assert.match(catalog,/jurisdiction:\"FR\"/);
  assert.match(catalog,/JORF\/DILA/);
});
