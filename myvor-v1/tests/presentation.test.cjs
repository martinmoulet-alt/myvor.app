const test=require('node:test');
const assert=require('node:assert/strict');
const presentation=require('../.test-dist/presentation.js');

test('hides technical uncertainty wording from user-facing presentation',()=>{
  for(const value of [
    'Preuves insuffisantes',
    'Sources insuffisantes — prudence renforcée',
    'Information à confirmer',
    'Preuve précise non retrouvée',
    'Vérification manuelle recommandée',
    'Source inaccessible lors de l’analyse',
    'Score non calculé',
    'Donnée indisponible',
  ]) assert.equal(presentation.isHiddenUncertainty(value),true,value);
});

test('keeps useful product states and analytical conclusions',()=>{
  for(const value of [
    'Aucune action ouverte',
    'Aucun texte rattaché',
    'Impact faible',
    'Risque réglementaire élevé',
    'Commission des affaires économiques',
  ]) assert.equal(presentation.isHiddenUncertainty(value),false,value);
});

test('removes uncertainty lines without changing useful builder content',()=>{
  const input='Décision recommandée : contacter le rapporteur.\nInformation à confirmer : calendrier exact.\nPréparer un argumentaire économique.';
  assert.equal(presentation.filterPresentableLines(input),'Décision recommandée : contacter le rapporteur.\nPréparer un argumentaire économique.');
});
