import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, demoReducer, demoStorageKey, inspectDemoState, myIdeas } from '../src/data/demoState.js';
import { guestAccess } from '../src/data/access.js';
import { selectPersonalArea } from '../src/data/personalArea.js';
import { projectParticipation } from '../src/data/projectParticipation.js';
import { createLocalRepository } from '../src/state/localRepository.js';

const now = new Date('2026-11-07T12:00:00+03:00');
const personal = (state, id) => selectPersonalArea(state, id, now);
const project = (state) => state.ideas.find((idea) => idea.id === 'schulcode');
const restore = (state) => inspectDemoState(JSON.stringify(state)).state;
const act = (state, type, actorId = 'deniz', extra = {}) => demoReducer(state, { type, id: 'schulcode', actorId, ...extra });

test('guest capabilities never treat a fictional persona as an authenticated account', () => {
  assert.ok(Object.isFrozen(guestAccess));
  assert.deepEqual(guestAccess, { mode: 'guest', subjectId: null, authenticationAvailable: false, synchronized: false, confirmedAttendanceAvailable: false });
});

test('personal counts derive from each persona and distinguish interest from registration', () => {
  const state = createDemoState();
  assert.deepEqual(personal(state, 'alex').counts, { eventInterests: 1, eventRegistrations: 0, ownedProjects: 1, projectMemberships: 0, projectRequests: 0, tutoringOffers: 1, tutoringRequests: 1, saved: 1 });
  assert.equal(personal(state, 'deniz').counts.eventRegistrations, 1);
  assert.equal(personal(state, 'deniz').counts.eventInterests, 0);
  assert.equal(personal(state, 'deniz').counts.ownedProjects, 0);
  const changed = demoReducer(state, { type: 'participation', eventId: 'codewerkstatt', status: 'joined', actorId: 'alex' });
  assert.equal(personal(changed, 'alex').counts.eventRegistrations, 1);
  assert.equal(personal(changed, 'alex').counts.eventInterests, 0);
  assert.equal(personal(changed, 'alex').counts.saved, 0);
  assert.equal(personal(changed, 'deniz').counts.eventRegistrations, 1);
});

test('past local registrations are archived without being converted into attendance evidence', () => {
  const state = createDemoState();
  const model = selectPersonalArea(state, 'deniz', new Date('2027-01-01T00:00:00Z'));
  assert.equal(model.events.upcoming.length, 0);
  assert.equal(model.events.pastDemo[0].id, 'sprachwerkstatt');
  assert.equal(model.counts.eventRegistrations, 1);
  assert.equal(guestAccess.confirmedAttendanceAvailable, false);
  assert.equal(model.events.pastDemo[0].attendanceConfirmed, undefined);
});

test('interest and requests do not grant project membership; only its demo owner can accept', () => {
  let state = act(createDemoState(), 'setIdeaInterest', 'deniz', { interested: true });
  assert.equal(projectParticipation(project(state), 'deniz'), 'interested');
  assert.equal(personal(state, 'deniz').counts.projectMemberships, 0);
  state = act(state, 'requestIdea');
  assert.equal(projectParticipation(project(state), 'deniz'), 'requested');
  assert.equal(personal(state, 'deniz').counts.projectRequests, 1);
  assert.equal(personal(state, 'deniz').counts.projectMemberships, 0);
  assert.ok(myIdeas(state.profiles.deniz, state.ideas).some((idea) => idea.id === 'schulcode'));
  assert.equal(act(state, 'reviewIdeaRequest', 'deniz', { profileId: 'deniz', decision: 'accept' }), state);
  state = restore(act(state, 'reviewIdeaRequest', 'alex', { profileId: 'deniz', decision: 'accept' }));
  assert.equal(projectParticipation(project(state), 'deniz'), 'member');
  assert.equal(personal(state, 'deniz').counts.projectRequests, 0);
  assert.equal(personal(state, 'deniz').counts.projectMemberships, 1);
  assert.deepEqual(project(state).participantIds, ['deniz']);
  assert.deepEqual(project(state).requestedIds, []);
  assert.equal(guestAccess.synchronized, false);
});

test('request decline, withdrawal, leaving and closed-project rules remain separate', () => {
  let state = createDemoState();
  assert.equal(act(state, 'requestIdea', 'alex'), state);
  state = act(state, 'requestIdea');
  assert.equal(act(state, 'requestIdea'), state);
  state = act(state, 'reviewIdeaRequest', 'alex', { profileId: 'deniz', decision: 'decline' });
  assert.equal(projectParticipation(project(state), 'deniz'), 'none');
  state = act(act(state, 'requestIdea'), 'cancelIdeaRequest');
  assert.equal(project(state).requestedIds.length, 0);
  state = act(act(state, 'requestIdea'), 'reviewIdeaRequest', 'alex', { profileId: 'deniz', decision: 'accept' });
  state = act(state, 'leaveIdea');
  assert.equal(projectParticipation(project(state), 'deniz'), 'none');
  state = act(state, 'setIdeaInterest', 'deniz', { interested: true });
  state = act(state, 'withdrawIdea', 'alex');
  assert.equal(act(state, 'requestIdea'), state);
  state = act(state, 'setIdeaInterest', 'deniz', { interested: false });
  assert.equal(project(state).interestedIds.length, 0);
});

test('new project relationship fields survive reload and damaged entries are isolated', () => {
  const state = createDemoState();
  project(state).requestedIds = ['deniz', 'orphan', 'deniz', 'alex'];
  project(state).interestedIds = ['deniz'];
  const result = inspectDemoState(JSON.stringify(state));
  assert.deepEqual(project(result.state).requestedIds, ['deniz']);
  assert.deepEqual(project(result.state).interestedIds, ['deniz']);
  assert.ok(result.recoveredRecords > 0);
  assert.equal(result.state.ideas.length, state.ideas.length);
  project(state).participantIds = 12;
  assert.doesNotThrow(() => restore(state));
  assert.deepEqual(project(restore(state)).participantIds, []);
});

test('closed and removed entries do not inflate active tutoring or membership counts', () => {
  let state = act(act(createDemoState(), 'requestIdea'), 'reviewIdeaRequest', 'alex', { profileId: 'deniz', decision: 'accept' });
  assert.equal(personal(state, 'deniz').community.projectMemberships.length, 1);
  state = act(state, 'withdrawIdea', 'alex');
  assert.equal(personal(state, 'deniz').counts.projectMemberships, 0);
  assert.equal(personal(state, 'deniz').projects.collaborating.length, 1);
  state = demoReducer(state, { type: 'closeTutoring', id: 'math-offer', actorId: 'alex' });
  assert.equal(personal(state, 'alex').counts.tutoringOffers, 0);
  assert.equal(personal(state, 'alex').tutoring.offers.length, 1);
  state = demoReducer(state, { type: 'removeTutoring', id: 'math-offer', actorId: 'alex' });
  assert.equal(personal(state, 'alex').tutoring.offers.length, 0);
});

test('saved totals combine only valid activities and exclude person connections and duplicate keys', () => {
  let state = act(createDemoState(), 'setIdeaInterest', 'deniz', { interested: true });
  state.modules.interests.deniz = ['tutoring:math-offer', 'tutoring:math-offer', 'initiative:interviews', 'person:guest-mika', 'tutoring:unknown'];
  let model = personal(state, 'deniz');
  assert.equal(model.counts.saved, 3);
  assert.equal(model.saved.tutoring.length, 1);
  state = act(state, 'removeIdea', 'alex');
  model = personal(state, 'deniz');
  assert.equal(model.counts.saved, 2);
  assert.equal(model.projects.interested.length, 0);
});

test('separate repositories merge new project requests and interests without granting membership', async () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let queue = Promise.resolve();
  const locks = { request: (name, work) => { const pending = queue.then(work); queue = pending.catch(() => {}); return pending; } };
  const first = createLocalRepository({ storage, locks });
  const second = createLocalRepository({ storage, locks });
  assert.deepEqual(await Promise.all([
    first.dispatch({ type: 'requestIdea', id: 'schulcode' }, 'deniz'),
    second.dispatch({ type: 'setIdeaInterest', id: 'schulcode', interested: true }, 'deniz'),
  ]), [true, true]);
  const state = inspectDemoState(values.get(demoStorageKey)).state;
  assert.deepEqual(project(state).requestedIds, ['deniz']);
  assert.deepEqual(project(state).interestedIds, ['deniz']);
  assert.deepEqual(project(state).participantIds, []);
  assert.equal(personal(state, 'deniz').counts.projectRequests, 1);
});
