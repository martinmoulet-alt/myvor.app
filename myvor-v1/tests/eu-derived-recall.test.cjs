const fs=require('fs');
const path=require('path');
const assert=require('assert');

const file=fs.readFileSync(path.join(__dirname,'..','supabase','functions','scan-dossier-history','index.ts'),'utf8');
assert.match(file,/canonical-corpus-reader-v13-eu-derived-recall/);
assert.match(file,/askDerivedCandidates/);
assert.match(file,/verifiesDirectDerivation/);
assert.match(file,/eu-derived-recall-v1/);
assert.match(file,/publications\.europa\.eu/);
assert.match(file,/Acte UE directement dérivé/);
assert.ok(file.indexOf('verifiesDirectDerivation')<file.indexOf('watch_item_dossier_links'), 'la vérification officielle doit précéder le rattachement');
console.log('EU derived recall verification contract: ok');
