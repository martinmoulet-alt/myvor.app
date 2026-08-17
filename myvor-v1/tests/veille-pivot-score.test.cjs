const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'VeilleCorporate.tsx'), 'utf8');

test('veille scoring recognizes exact legal references and applies the agreed floors', () => {
  assert.match(source, /kind:\"reference\",floor:96/);
  assert.match(source, /kind:\"title\",floor:92/);
  assert.match(source, /kind:\"priority\",floor:82/);
  assert.match(source, /COM\\s\*\\\(/);
  assert.match(source, /PROC:/);
});

test('COM references normalize leading zeroes before comparison', () => {
  assert.match(source, /String\(Number\(match\[2\]\)\)/);
  assert.match(source, /`COM:\$\{year\}:\$\{number\}`/);
});

test('priority phrases cannot promote a generic one-word keyword', () => {
  assert.match(source, /normalized\.length>=16&&tokens\.length>=3/);
  assert.match(source, /confidence>=AUTO_LINK_THRESHOLD/);
});

test('every visible watch score has a deterministic user-facing explanation', () => {
  assert.match(source, /Pourquoi ce score :/);
  assert.match(source, /Score fondé principalement sur/);
  assert.match(source, /Score porté à/);
  assert.match(source, /resultFor\(item\)/);
});
