const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.join(__dirname,'..');
const pyramid=fs.readFileSync(path.join(root,'app','CorpusImportancePyramid.tsx'),'utf8');
const dossier=fs.readFileSync(path.join(root,'app','DossierDetail.tsx'),'utf8');

for(const level of ['Critique','Majeur','Secondaire','Contexte'])assert.ok(pyramid.includes(`\"${level}\"`),`niveau ${level} manquant`);
assert.ok(pyramid.includes('classifyCorpusImportance'),'classification d’importance absente');
assert.ok(pyramid.includes('b.rank-a.rank||b.confidence-a.confidence'),'le tri doit privilégier l’importance avant la pertinence');
assert.ok(dossier.includes('CorpusImportancePyramid'),'la pyramide doit être branchée dans le dossier');
assert.ok(dossier.includes('Pyramide du corpus applicable'),'le libellé de la pyramide doit être visible');
console.log('corpus pyramid contract: ok');
