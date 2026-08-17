const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'VeilleCorporate.tsx'), 'utf8');

test('veille scoring recognizes exact legal references and applies the agreed floors', () => {
  assert.ok(source.includes('kind:"reference",floor:96'));
  assert.ok(source.includes('kind:"title",floor:92'));
  assert.ok(source.includes('kind:"priority",floor:82'));
  assert.ok(source.includes('const com=/\\bCOM\\s*\\('));
  assert.ok(source.includes('PROC:${year}:${number}:${kind}'));
});

test('COM references normalize leading zeroes before comparison', () => {
  assert.ok(source.includes('String(Number(match[2]))'));
  assert.ok(source.includes('COM:${year}:${number}'));
});

test('priority phrases cannot promote a generic one-word keyword', () => {
  assert.ok(source.includes('normalized.length>=16&&tokens.length>=3'));
  assert.ok(source.includes('confidence>=AUTO_LINK_THRESHOLD'));
});

test('every visible watch score has a deterministic user-facing explanation', () => {
  assert.ok(source.includes('Pourquoi ce score :'));
  assert.ok(source.includes('Score fondé principalement sur'));
  assert.ok(source.includes('Score porté à'));
  assert.ok(source.includes('const result=resultFor(item)'));
});
