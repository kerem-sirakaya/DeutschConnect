import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activities, filterEvents } from '../src/data/activities.js';
import { createDemoState, demoReducer, readDemoState, myEvents, myIdeas, recommendedEvents } from '../src/data/demoState.js';

test('personas have distinct activities, recommendations and owned projects', () => {
  const state = createDemoState();
  const { alex, deniz } = state.profiles;
  assert.deepEqual(myEvents(alex, state.participation.alex).map((event) => event.id), ['codewerkstatt']);
  assert.deepEqual(myEvents(deniz, state.participation.deniz).map((event) => event.id), ['sprachwerkstatt']);
  assert.equal(recommendedEvents(alex, state.participation.alex)[0].id, 'ideenlabor');
  assert.equal(recommendedEvents(deniz, state.participation.deniz)[0].id, 'kulturbruecken');
  assert.equal(myIdeas(alex, state.ideas)[0].id, 'schulcode');
  assert.equal(myIdeas(deniz, state.ideas).length, 0);
});

test('participation changes only the active persona and removes joined events from recommendations', () => {
  const original = createDemoState();
  const joined = demoReducer(original, { type: 'participation', eventId: 'ideenlabor', status: 'joined' });
  assert.equal(joined.participation.alex.ideenlabor, 'joined');
  assert.equal(joined.participation.deniz.ideenlabor, undefined);
  assert.equal(original.participation.alex.ideenlabor, undefined);
  assert.ok(!recommendedEvents(joined.profiles.alex, joined.participation.alex).some((event) => event.id === 'ideenlabor'));
  const withdrawn = demoReducer(joined, { type: 'participation', eventId: 'ideenlabor', status: null });
  assert.ok(recommendedEvents(withdrawn.profiles.alex, withdrawn.participation.alex).some((event) => event.id === 'ideenlabor'));
});

test('interests and school preferences change recommendations without altering the other profile', () => {
  const initial = createDemoState();
  const changed = demoReducer(initial, { type: 'preferences', patch: { interests: ['culture'], schoolId: 'anka' } });
  assert.equal(recommendedEvents(changed.profiles.alex, changed.participation.alex)[0].id, 'kulturbruecken');
  assert.deepEqual(changed.profiles.deniz, initial.profiles.deniz);
  const noInterests = demoReducer(changed, { type: 'preferences', patch: { interests: [] } });
  assert.ok(recommendedEvents(noInterests.profiles.alex, {}).every((event) => event.hostSchoolId === 'anka'));
});

test('new ideas belong to the active profile, while the local explore directory is shared', () => {
  const initial = demoReducer(createDemoState(), { type: 'switchProfile', id: 'deniz' });
  const submitted = demoReducer(initial, { type: 'submitIdea', id: 'local-test-idea', idea: { title: 'Demo-Sprachtreffen', description: 'Eine gemeinsame Aktivität für die beiden Demo-Schulen vorschlagen.', category: 'language' } });
  assert.equal(myIdeas(submitted.profiles.deniz, submitted.ideas)[0].ownerId, 'deniz');
  assert.equal(submitted.ideas[0].schoolId, 'anka');
  assert.equal(myIdeas(submitted.profiles.alex, submitted.ideas).length, 1);
  assert.ok(submitted.ideas.some((idea) => idea.id === 'local-test-idea'));
});

test('joining and leaving ideas updates My ideas without changing authorship', () => {
  const initial = demoReducer(createDemoState(), { type: 'switchProfile', id: 'deniz' });
  const joined = demoReducer(initial, { type: 'toggleIdea', id: 'schulcode' });
  assert.equal(myIdeas(joined.profiles.deniz, joined.ideas)[0].id, 'schulcode');
  assert.equal(joined.ideas.find((idea) => idea.id === 'schulcode').ownerId, 'alex');
  const left = demoReducer(joined, { type: 'toggleIdea', id: 'schulcode' });
  assert.equal(myIdeas(left.profiles.deniz, left.ideas).length, 0);
});

test('serialized preferences and interactions survive reloading the demo state', () => {
  let state = demoReducer(createDemoState(), { type: 'preferences', patch: { displayName: 'Demo Alex', language: 'en' } });
  state = demoReducer(state, { type: 'participation', eventId: 'ideenlabor', status: 'joined' });
  state = demoReducer(state, { type: 'submitIdea', id: 'local-persisted', idea: { title: 'Persisted idea', description: 'This is a fictional idea stored only in the demo browser.', category: 'science' } });
  const restored = readDemoState({ getItem: () => JSON.stringify(state) }, 'de');
  assert.deepEqual(restored, state);
});

test('corrupt or blocked storage recovers with safe demo defaults', () => {
  for (const value of ['{broken', 'null', JSON.stringify({ version: 1, activeId: 'alex' })]) {
    assert.deepEqual(readDemoState({ getItem: () => value }, 'de'), createDemoState());
  }
  assert.deepEqual(readDemoState({ getItem: () => { throw new Error('blocked'); } }, 'de'), createDemoState());
  const invalid = createDemoState();
  invalid.participation = {};
  assert.deepEqual(readDemoState({ getItem: () => JSON.stringify(invalid) }, 'de'), createDemoState());
});

test('invalid data cannot create broken profile preferences or participation entries', () => {
  const initial = createDemoState();
  assert.equal(demoReducer(initial, { type: 'preferences', patch: { schoolId: 'unknown' } }), initial);
  assert.equal(demoReducer(initial, { type: 'preferences', patch: { language: 'unknown' } }), initial);
  assert.equal(demoReducer(initial, { type: 'participation', eventId: 'unknown', status: 'joined' }), initial);
  assert.equal(demoReducer(initial, { type: 'submitIdea', id: 'local-invalid', idea: { title: 'x', description: '', category: 'science' } }), initial);
});

test('the event directory combines topic, school and translated search filters', () => {
  for (const language of ['de', 'tr', 'en']) {
    const t = JSON.parse(readFileSync(new URL('../src/locales/' + language + '.json', import.meta.url), 'utf8'));
    const filters = { category: 'technology', school: 'ers', query: t.activities.codewerkstatt.title.toLocaleUpperCase(language) };
    assert.deepEqual(filterEvents(activities, filters, t, language).map((event) => event.id), ['codewerkstatt']);
    assert.equal(filterEvents(activities, { ...filters, school: 'anka' }, t, language).length, 0);
    assert.equal(filterEvents(activities, { category: 'all', school: 'all', query: 'nonexistent-result' }, t, language).length, 0);
    assert.equal(filterEvents(activities, { category: 'all', school: 'all', query: '' }, t, language).length, 4);
  }
});
