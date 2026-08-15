const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const source=fs.readFileSync(path.join(__dirname,"../app/page.tsx"),"utf8");

test("production modules stay visible in the main navigation",()=>{
  assert.match(source,/\["impact","Score d’urgence",AlertTriangle\]/);
  assert.match(source,/\["radar","Radar & War Zone",Radar\]/);
  assert.match(source,/\["builder","Note Builder",Sparkles\]/);
});

test("desktop sidebar renders the complete navigation",()=>{
  assert.match(source,/<aside className="sidebar">\{nav\.map/);
});

test("mobile menu renders the complete navigation",()=>{
  assert.match(source,/className="mobile-menu-nav">\{nav\.map/);
});
