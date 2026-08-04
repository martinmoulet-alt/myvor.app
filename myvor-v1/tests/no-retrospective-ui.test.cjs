const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function read(relative){return fs.readFileSync(path.join(process.cwd(),relative),'utf8');}

test('dossier and impact UI stay focused on current state and next actions',()=>{
  const dossier=read('app/DossierDetail.tsx');
  const impact=read('app/ImpactProductionDetail.tsx');
  for(const forbidden of ['Historique du dossier','Mémoire du dossier','Productions IA','Évolution depuis la note précédente']){
    assert.equal(dossier.includes(forbidden),false,`DossierDetail must not expose retrospective label: ${forbidden}`);
    assert.equal(impact.includes(forbidden),false,`ImpactProductionDetail must not expose retrospective label: ${forbidden}`);
  }
  assert.equal(dossier.includes('listProductions'),false,'DossierDetail must not render saved-production history');
  assert.match(dossier,/Ce qui compte maintenant/);
  assert.match(dossier,/Prochaine action/);
  assert.match(dossier,/Prochaine échéance/);
});
