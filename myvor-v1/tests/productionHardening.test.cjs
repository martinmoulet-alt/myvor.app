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

test('server Veille catalog preserves publication metadata and stays internal',()=>{
  const catalog=read('supabase/functions/sync-watch-catalog/index.ts');
  const middleware=read('middleware.ts');
  assert.match(catalog,/source_name:clip\(item\?\.source_name,180\)\|\|undefined/);
  assert.match(catalog,/published_at:clip\(item\?\.published_at,100\)\|\|undefined/);
  assert.match(catalog,/source_name:item\.source_name\|\|null/);
  assert.match(catalog,/published_at:safeTimestamp\(item\.published_at\)/);
  assert.match(middleware,/pathname==="\/api\/veille\/sources"/);
  assert.match(middleware,/x-myvor-cron-secret/);
});

test('Veille cards prefer publication date over import date',()=>{
  const veille=read('app/VeilleCorporate.tsx');
  assert.match(veille,/item\.published_at\|\|item\.created_at/);
  assert.match(veille,/item\.source_name\|\|sourceLabel/);
});
