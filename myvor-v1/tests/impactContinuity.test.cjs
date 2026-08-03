const test=require('node:test');
const assert=require('node:assert/strict');
const continuity=require('../.test-dist/impactContinuity.js');

const prepared={
  depth:'deep',
  dossier:{title:'IA Act',objective:'Anticiper les obligations applicables au client',key_deadlines:['2 août 2027 — application générale']},
  items:[
    {id:'a',title:'Texte officiel A',urgency:'fort',source_url:'https://example.test/a'},
    {id:'b',title:'Texte officiel B',urgency:'moyen',source_url:'https://example.test/b'},
  ],
  traces:[
    {url:'https://example.test/a',status:'fetched',read_chars:4200,content_hash:'abc'},
    {url:'https://example.test/b',status:'unavailable',read_chars:0},
  ],
  official_sources_requested:2,
  official_sources_fetched:1,
  profile:{fields:['sector','key_actors']},
  selection:{requested_ids:['a','b'],analyzed_ids:['a','b'],omitted_ids:[],max_items:12,max_urls:6},
};

test('always builds a continuity note from a prepared impact request',()=>{
  const result=continuity.buildContinuityImpact(prepared,'OpenAI temporairement indisponible');
  assert.equal(result.note.continuity_mode,true);
  assert.equal(result.note.score_available,false);
  assert.equal(result.note.quality.status,'insufficient_sources');
  assert.equal(result.note.quality.can_validate,false);
  assert.match(result.note.executive_summary,/Mode continuité activé/);
});

test('continuity mode never invents analytical conclusions',()=>{
  const result=continuity.buildContinuityImpact(prepared,'timeout');
  assert.deepEqual(result.note.risks,[]);
  assert.deepEqual(result.note.opportunities,[]);
  assert.deepEqual(result.note.dispositions_concernees,[]);
  assert.equal(result.note.score,0);
  assert.match(result.note.rationale,/ne signifie pas un impact faible/);
});

test('continuity mode preserves traceability and known dossier deadlines',()=>{
  const result=continuity.buildContinuityImpact(prepared,'timeout');
  assert.equal(result.note.sources_used.length,2);
  assert.equal(result.note.sources_used[0].status,'fetched');
  assert.deepEqual(result.note.deadlines,['2 août 2027 — application générale']);
  assert.ok(result.note.informations_a_confirmer.some(item=>item.includes('Texte officiel B')));
});
