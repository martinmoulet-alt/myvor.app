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
});

test('Radar fast fallback is authenticated and quota protected',()=>{
  const middleware=read('middleware.ts');
  assert.match(middleware,/"\/api\/radar\/fast":\{feature:"radar"/);
  assert.match(middleware,/matcher:\["\/api\/radar","\/api\/radar\/fast"/);
});

test('manual Veille synchronization preserves institutional publication metadata',()=>{
  const page=read('app/page.tsx');
  assert.match(page,/source_name:item\.source_name\|\|null/);
  assert.match(page,/published_at:item\.published_at\|\|null/);
  assert.match(page,/Mise à jour partielle : les dernières données disponibles restent affichées/);
});

test('Veille cards prefer publication date over import date',()=>{
  const veille=read('app/VeilleCorporate.tsx');
  assert.match(veille,/item\.published_at\|\|item\.created_at/);
  assert.match(veille,/item\.source_name\|\|sourceLabel/);
});
