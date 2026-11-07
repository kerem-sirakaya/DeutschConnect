import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoState, demoReducer, readDemoState, validIdeaInput } from '../src/data/demoState.js';
import { filterTutoring, matchingTutoring, visibleMembers } from '../src/data/modules.js';

const record = { kind: 'offer', subject: 'Biologie', topics: 'Zellen und Pflanzen', description: 'Wir können gemeinsam fiktive Übungsaufgaben zum Thema Zellen besprechen.', availability: 'Demo: nachmittags nach Absprache', format: 'online', languages: ['de'] };
const action = (state, value) => demoReducer(state, value);

test('existing v1 data keeps preferences, participation and projects when modules are introduced', () => {
  const old = createDemoState();
  old.profiles.alex.displayName = 'Demo Alex';
  old.participation.alex.ideenlabor = 'joined';
  delete old.modules;
  const loaded = readDemoState({ getItem: () => JSON.stringify(old) }, 'de');
  assert.equal(loaded.profiles.alex.displayName, 'Demo Alex');
  assert.equal(loaded.participation.alex.ideenlabor, 'joined');
  assert.equal(loaded.ideas[0].id, 'schulcode');
  assert.equal(loaded.modules.tutoring.length, 4);
});

test('offers and requests are created for the active persona and survive reload', () => {
  let state = action(createDemoState(), { type: 'submitTutoring', id: 'local-biology', record });
  assert.equal(state.modules.tutoring[0].ownerId, 'alex');
  state = action(state, { type: 'switchProfile', id: 'deniz' });
  state = action(state, { type: 'submitTutoring', id: 'local-need', record: { ...record, kind: 'request' } });
  const restored = readDemoState({ getItem: () => JSON.stringify(state) }, 'de');
  assert.equal(restored.modules.tutoring.find((item) => item.id === 'local-need').ownerId, 'deniz');
  assert.equal(restored.modules.tutoring.find((item) => item.id === 'local-biology').topics, record.topics);
  assert.equal(action(state, { type: 'submitTutoring', id: 'local-bad', record: { ...record, languages: [] } }), state);
});

test('tutoring filters combine subject, language, format, type and translated search', () => {
  for (const language of ['de', 'tr', 'en']) {
    const t = { ext: JSON.parse(readFileSync(new URL('../src/locales/modules/' + language + '.json', import.meta.url), 'utf8')) };
    const records = createDemoState().modules.tutoring;
    const filters = { kind: 'offer', subject: 'math', language: 'de', format: 'online', query: t.ext.tutorSeeds['math-offer'].topics.toLocaleUpperCase(language) };
    assert.deepEqual(filterTutoring(records, filters, t, language).map((item) => item.id), ['math-offer']);
    assert.equal(filterTutoring(records, { ...filters, language: 'en' }, t, language).length, 0);
  }
});

test('personal tutoring suggestions differ between Alex and Deniz', () => {
  const state = createDemoState();
  assert.equal(matchingTutoring(state.profiles.alex, state.modules)[0].id, 'math-request');
  assert.equal(matchingTutoring(state.profiles.deniz, state.modules)[0].id, 'math-offer');
});

test('local contact drafts and interests remain separate per persona', () => {
  let state = action(createDemoState(), { type: 'saveContactDraft', targetId: 'math-request', note: 'Ein rein fiktiver Anfrageentwurf ohne Kontaktdaten.' });
  state = action(state, { type: 'toggleModuleInterest', targetType: 'initiative', targetId: 'interviews' });
  state = action(state, { type: 'switchProfile', id: 'deniz' });
  assert.equal(state.modules.contactDrafts.filter((item) => item.ownerId === 'deniz').length, 0);
  assert.equal(state.modules.interests.deniz.length, 0);
  assert.ok(state.modules.interests.alex.includes('initiative:interviews'));
  assert.equal(action(state, { type: 'saveContactDraft', targetId: 'math-request', note: 'Not allowed on own listing.' }), state);
});

test('community sharing is optional and withdrawing removes directory visibility', () => {
  let state = createDemoState();
  assert.ok(!visibleMembers(state).some((member) => member.id === 'alex'));
  state = action(state, { type: 'setCommunityVisibility', visible: true });
  assert.ok(visibleMembers(state).some((member) => member.id === 'alex'));
  state = action(state, { type: 'setCommunityVisibility', visible: false });
  assert.ok(!visibleMembers(state).some((member) => member.id === 'alex'));
});

test('room contributions, ownership and report drafts work in the local simulation', () => {
  let state = action(createDemoState(), { type: 'postMessage', id: 'local-post', roomId: 'projects', body: 'Eine rein fiktive Frage zu einem gemeinsamen Projekt.' });
  state = action(state, { type: 'switchProfile', id: 'deniz' });
  state = action(state, { type: 'removeMessage', id: 'local-post' });
  assert.equal(state.modules.messages.length, 1);
  state = action(state, { type: 'report', targetType: 'message', targetId: 'local-post', reason: 'privacy' });
  assert.equal(state.modules.reports[0].ownerId, 'deniz');
  const restored = readDemoState({ getItem: () => JSON.stringify(state) }, 'de');
  assert.equal(restored.modules.messages[0].body, state.modules.messages[0].body);
  assert.equal(restored.modules.reports[0].reason, 'privacy');
  state = action(action(state, { type: 'switchProfile', id: 'alex' }), { type: 'removeMessage', id: 'local-post' });
  assert.equal(state.modules.messages.length, 0);
});

test('free projects accept new themes and preserve goals, schools and interview links', () => {
  const idea = { title: 'Stadtgarten und Klangkunst', description: 'Ein fiktives freies Projekt jenseits der vorgegebenen Schulformate.', category: 'open', topics: ['Stadtgarten', 'Klangkunst'], goals: 'Ein kleines gemeinsames Exponat entwickeln.', collaborators: 'Kreative Mitwirkende', desiredSchoolIds: ['ers', 'anka'], projectStatus: 'looking', initiativeId: 'interviews' };
  assert.ok(validIdeaInput(idea));
  const state = action(createDemoState(), { type: 'submitIdea', id: 'local-open', idea });
  const restored = readDemoState({ getItem: () => JSON.stringify(state) }, 'de');
  const saved = restored.ideas.find((item) => item.id === 'local-open');
  assert.deepEqual(saved.topics, idea.topics);
  assert.deepEqual(saved.desiredSchoolIds, idea.desiredSchoolIds);
  assert.equal(saved.initiativeId, 'interviews');
  assert.equal(saved.projectStatus, 'looking');
  assert.equal(validIdeaInput({ ...idea, projectStatus: 'confirmed' }), false);
});
