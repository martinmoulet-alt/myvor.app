const test=require('node:test');
const assert=require('node:assert/strict');
const radar=require('../.test-dist/radarAudit.js');

test('accepts an evidence excerpt only when it exists in the official source',()=>{
  const source='La commission des finances examinera le texte mercredi 12 août. Le rapporteur présentera ses conclusions.';
  assert.equal(radar.evidenceExcerptIsGrounded(source,'La commission des finances examinera le texte mercredi 12 août.'),true);
  assert.equal(radar.evidenceExcerptIsGrounded(source,'Le ministre soutient officiellement la mesure.'),false);
});

test('normalizes accents and typographic punctuation before grounding',()=>{
  const source='L’Assemblée nationale examine la réforme énergétique.';
  assert.equal(radar.evidenceExcerptIsGrounded(source,"L'Assemblee nationale examine la reforme energetique."),true);
});

test('keeps official contact values only when they appear on the fetched page',()=>{
  const page='Contact : cabinet.rapporteur@assemblee-nationale.fr — Téléphone 01 40 63 60 00';
  const verified=radar.verifyOfficialContactValues(page,'cabinet.rapporteur@assemblee-nationale.fr','01 40 63 60 00');
  assert.equal(verified.email,'cabinet.rapporteur@assemblee-nationale.fr');
  assert.equal(verified.phone,'01 40 63 60 00');
});

test('drops guessed contact values that are absent from the official page',()=>{
  const page='Page officielle du député. Aucun contact direct publié.';
  const verified=radar.verifyOfficialContactValues(page,'prenom.nom@assemblee-nationale.fr','01 23 45 67 89');
  assert.equal(verified.email,'');
  assert.equal(verified.phone,'');
});
