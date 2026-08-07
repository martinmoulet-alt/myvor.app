const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

function read(relative){
  return fs.readFileSync(path.join(root,relative),'utf8');
}

test('AI edge functions require authenticated quota checks',()=>{
  for(const file of [
    'supabase/functions/dossier-profile/index.ts',
    'supabase/functions/impact-analysis/index.ts',
    'supabase/functions/note-builder/index.ts',
  ]){
    const source=read(file);
    assert.match(source,/authorization/i,`${file} must validate Authorization`);
    assert.match(source,/consume_ai_quota/,`${file} must enforce AI quota`);
    assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY/,`${file} must not depend on a service role secret`);
  }
});

test('OpenAI requests are configured not to persist prompts',()=>{
  for(const file of [
    'supabase/functions/dossier-profile/index.ts',
    'supabase/functions/impact-analysis/index.ts',
    'supabase/functions/note-builder/index.ts',
  ]){
    const source=read(file);
    assert.match(source,/store\s*:\s*false/,`${file} must set store:false`);
  }
});

test('server security headers protect authenticated application responses',()=>{
  const source=read('next.config.ts');
  for(const header of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Strict-Transport-Security',
    'Cross-Origin-Opener-Policy',
  ]){
    assert.match(source,new RegExp(header),`Missing ${header}`);
  }
  assert.match(source,/no-store, max-age=0/, 'API responses must not be cached');
});
