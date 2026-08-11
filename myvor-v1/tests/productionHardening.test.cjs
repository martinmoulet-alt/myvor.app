const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('production headers prevent framing and MIME sniffing',()=>{
  const config=read('next.config.ts');
  assert.match(config,/Content-Security-Policy/);
  assert.match(config,/frame-ancestors 'none'/);
  assert.match(config,/X-Content-Type-Options/);
  assert.match(config,/X-Frame-Options/);
  assert.match(config,/Strict-Transport-Security/);
  assert.match(config,/Permissions-Policy/);
  assert.match(config,/Cross-Origin-Resource-Policy/);
  assert.match(config,/poweredByHeader:false/);
});

test('Radar fast fallback is authenticated and quota protected',()=>{
  const middleware=read('middleware.ts');
  assert.match(middleware,/"\/api\/radar\/fast":\{feature:"radar"/);
  assert.match(middleware,/matcher:\["\/api\/radar","\/api\/radar\/fast"/);
});

test('server Veille catalog is strict DILA JORF ingestion and stays internal',()=>{
  const catalog=read('supabase/functions/sync-watch-catalog/index.ts');
  assert.match(catalog,/https:\/\/echanges\.dila\.gouv\.fr\/OPENDATA\/JORFSIMPLE\//);
  assert.match(catalog,/<ID\(\?:\\s\[\^>\]\*\)\?>\\s\*JORFTEXT\\d\+\\s\*<\\\/ID>/);
  assert.match(catalog,/source_name:"Légifrance — Journal officiel"/);
  assert.match(catalog,/published_at:safeDate\(i\.published_at\)/);
  assert.match(catalog,/verify_veille_internal_request/);
  assert.match(catalog,/p_worker:"catalog"/);
  assert.doesNotMatch(catalog,/\/api\/veille\/sources/);
});

test('Veille cards prefer publication date over import date',()=>{
  const veille=read('app/VeilleCorporate.tsx');
  assert.match(veille,/item\.published_at\|\|item\.created_at/);
  assert.match(veille,/item\.source_name\|\|sourceLabel/);
});
