import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverTutoring, isActive, matchingTutoring, memberMatchScore, normalizeSubject, normalizeTopic, projectMatchScore } from '../src/data/matching.js';
import { clearPageMemory, pageMemoryKey, readPageMemory, writePageMemory, submissionId } from '../src/state/pageMemory.js';

function memoryStorage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('create retries retain a scoped record ID without creating a duplicate after a timeout',()=>{
 const storage=memoryStorage();let next=0;const make=()=> 'local-test-'+(++next);
 assert.equal(submissionId(storage,'alex','idea:new',make),'local-test-1');
 assert.equal(submissionId(storage,'alex','idea:new',make),'local-test-1');
 assert.equal(submissionId(storage,'deniz','idea:new',make),'local-test-2');
 clearPageMemory(storage,'alex','submission:idea:new');assert.equal(submissionId(storage,'alex','idea:new',make),'local-test-3');
});

test('filters restore after leaving a list and remain isolated by persona and module', () => {
  const storage = memoryStorage();
  const initial = { query: '', school: 'all' };
  const filters = { query: 'Sprachbrücke', school: 'anka' };
  assert.equal(writePageMemory(storage, 'alex', 'filters:events:all', filters), true);
  assert.deepEqual(readPageMemory(storage, 'alex', 'filters:events:all', initial).value, filters);
  assert.deepEqual(readPageMemory(storage, 'deniz', 'filters:events:all', initial).value, initial);
  assert.deepEqual(readPageMemory(storage, 'alex', 'filters:ideas:all', initial).value, initial);
  assert.equal(readPageMemory(memoryStorage(), 'alex', 'filters:events:all', initial).restored, false);
});

test('unfinished UTF-8 form drafts restore, clear independently and never write on read', () => {
  const storage = memoryStorage();
  const initial = { title: '', topics: [], interview: false, expectedRecord: '' };
  const draft = { title: 'Schüler für kültür', topics: ['Müzik', 'Sprachen'], interview: true, expectedRecord: '{}' };
  assert.equal(writePageMemory(storage, 'alex', 'draft:idea:new', draft), true);
  assert.deepEqual(readPageMemory(storage, 'alex', 'draft:idea:new', initial), { value: draft, restored: true, available: true });
  writePageMemory(storage, 'deniz', 'draft:idea:new', draft);
  clearPageMemory(storage, 'alex', 'draft:idea:new');
  assert.deepEqual(readPageMemory(storage, 'alex', 'draft:idea:new', initial).value, initial);
  assert.deepEqual(readPageMemory(storage, 'deniz', 'draft:idea:new', initial).value, draft);
  const snapshot = new Map(storage.values);
  readPageMemory(storage, 'alex', 'unwritten', initial);
  assert.deepEqual(storage.values, snapshot);
});

test('invalid drafts and denied/quota-limited storage fail safely without erasing raw drafts', () => {
  const storage = memoryStorage();
  const key = pageMemoryKey('alex', 'draft:test');
  for (const raw of ['{broken', '{"title":null}', '{"title":"ok","topics":[null]}']) {
    storage.values.set(key, raw);
    assert.equal(readPageMemory(storage, 'alex', 'draft:test', { title: '', topics: [] }).available, false);
    assert.equal(storage.values.get(key), raw);
  }
  assert.equal(writePageMemory({ setItem() { throw new Error('quota'); } }, 'alex', 'draft:test', {}), false);
  assert.equal(readPageMemory(undefined, 'alex', 'draft:test', '').available, false);
  assert.equal(writePageMemory(storage, 'alex', 'draft:huge', 'a'.repeat(25000)), false);
});

test('subject aliases are independent of the currently selected UI language', () => {
  for (const subject of ['Mathematik', 'MATEMATİK', 'mathematics', 'maths']) assert.equal(normalizeSubject(subject), 'math');
  for (const subject of ['Deutsch', 'Almanca', 'German']) assert.equal(normalizeSubject(subject), 'german');
  for (const subject of ['Programmieren', 'Programlama', 'Coding', 'Kodlama']) assert.equal(normalizeSubject(subject), 'coding');
  assert.equal(normalizeSubject('  Robotik & Elektronik '), 'robotik elektronik');
});

test('free interests and project topics affect cross-language recommendations', () => {
  const profile = { id: 'alex', interests: ['technology'], customInterests: ['Musik', 'Klimaschutz'] };
  const idea = { category: 'open', topics: ['Müzik'], lifecycle: 'active' };
  assert.ok(projectMatchScore(idea, profile) > 0);
  assert.ok(projectMatchScore({ category: 'open', topics: ['Klimaschutz'] }, profile) > 0);
  assert.equal(projectMatchScore({ category: 'open', topics: ['Theater'] }, profile), 0);
  assert.ok(memberMatchScore({ interests: [], customInterests: ['music'] }, profile) > 0);
  assert.equal(normalizeTopic('Teknoloji'), normalizeTopic('Technik'));
  assert.equal(normalizeTopic('Programlama'), normalizeTopic('Coding'));
  assert.equal(projectMatchScore({ category: 'open', topics: [] }, { interests: [], customInterests: ['Open source'] }), 0);
  assert.equal(projectMatchScore({ ...idea, lifecycle: 'withdrawn' }, profile), 0);
});

test('direct tutoring matches require a shared subject, language, compatible format and opposite kind', () => {
  const profile = { id: 'alex', interests: ['science'], customInterests: [] };
  const own = { id: 'own', ownerId: 'alex', kind: 'offer', subject: 'Mathematik', languages: ['de'], format: 'online' };
  const target = { id: 'match', ownerId: 'deniz', kind: 'request', subject: 'Matematik', languages: ['de', 'tr'], format: 'either' };
  const records = [own, target,
    { ...target, id: 'wrong-language', languages: ['tr'] },
    { ...target, id: 'wrong-format', format: 'school' },
    { ...target, id: 'wrong-kind', kind: 'offer' },
    { ...target, id: 'wrong-subject', subject: 'German' },
    { ...target, id: 'closed', lifecycle: 'closed' },
    { ...target, id: 'deleted', lifecycle: 'deleted' },
  ];
  const modules = { tutoring: records };
  assert.deepEqual(matchingTutoring(profile, modules).map((record) => record.id), ['match']);
  const discoveries = discoverTutoring(profile, modules).map((record) => record.id);
  assert.ok(discoveries.includes('wrong-language'));
  assert.equal(discoveries.includes('match'), false);
  assert.equal(discoveries.includes('closed'), false);
  assert.deepEqual(matchingTutoring(profile, { tutoring: records.map((record) => record.id === 'own' ? { ...record, lifecycle: 'closed' } : record) }), []);
  assert.equal(isActive({}), true);
});
