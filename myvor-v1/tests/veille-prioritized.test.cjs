const fs=require('fs');
const path=require('path');
const assert=require('assert');

const file=fs.readFileSync(path.join(__dirname,'..','app','VeilleCorporate.tsx'),'utf8');
assert.ok(file.includes('Ce qui compte pour vos dossiers'),'la veille doit être centrée sur les dossiers');
assert.ok(file.includes('scan-dossier-history'),'la veille doit reconstruire le corpus du dossier');
assert.ok(file.includes('CorpusImportancePyramid'),'la veille doit utiliser la pyramide d’importance');
assert.ok(file.includes('Dossier à surveiller'),'un sélecteur de dossier doit être présent');
assert.ok(!file.includes('Sources primaires'),'le catalogue général par source ne doit plus être l’interface principale');
console.log('veille priorisée contract: ok');
