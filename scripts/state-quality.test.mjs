import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, demoReducer, demoStorageKey, inspectDemoState, myIdeas } from '../src/data/demoState.js';
import { filterTutoring, matchingTutoring } from '../src/data/modules.js';
import { createLocalRepository, recoveryPrefix } from '../src/state/localRepository.js';

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[demoStorageKey, initial]]);
  return {
    writes: [], failMain: false, failBackup: false,
    get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if ((this.failMain && key === demoStorageKey) || (this.failBackup && key.startsWith(recoveryPrefix))) {
        const error = new Error('full'); error.name = 'QuotaExceededError'; throw error;
      }
      this.writes.push(key); values.set(key, value);
    },
  };
}

function serialLocks() {
  let queue = Promise.resolve();
  return { request(name, work) {
    const operation = queue.then(work);
    queue = operation.catch(() => {});
    return operation;
  } };
}

const idea = { title: 'Gemeinsamer Schulgarten', description: 'Ein fiktives gemeinsames Gartenprojekt für beide Schulen vorbereiten.', category: 'open', topics: ['Schulgarten'] };
const tutor = { kind: 'offer', subject: 'Mathematik', topics: 'Gleichungen lösen', description: 'Wir üben gemeinsam fiktive Aufgaben zum Thema lineare Gleichungen.', availability: 'Nachmittags nach Absprache', languages: ['de'], format: 'online' };
const restore = (state) => inspectDemoState(JSON.stringify(state)).state;

test('record recovery retains valid custom records, preferences and valid field fragments', () => {
  let saved = demoReducer(createDemoState(), { type: 'submitIdea', id: 'local-good', idea });
  saved.ideas.push({ id: 'local-broken', ownerId: 'alex', schoolId: 'ers', title: '?' });
  saved.profiles.alex.displayName = 'Ülkü';
  saved.profiles.alex.schoolId = 'unknown';
  saved.participation.alex.ideenlabor = 'joined';
  saved.participation.alex.unknown = 'joined';
  const result = inspectDemoState(JSON.stringify(saved));
  assert.ok(result.recoveredRecords >= 3);
  assert.equal(result.state.profiles.alex.displayName, 'Ülkü');
  assert.equal(result.state.profiles.alex.schoolId, 'ers');
  assert.equal(result.state.participation.alex.ideenlabor, 'joined');
  assert.equal(result.state.participation.alex.unknown, undefined);
  assert.ok(result.state.ideas.some((entry) => entry.id === 'local-good'));
  assert.ok(!result.state.ideas.some((entry) => entry.id === 'local-broken'));
});

test('orphan records are validated against sanitized profiles and cannot reach UI', () => {
  const saved = createDemoState();
  saved.profiles.orphan = { ...saved.profiles.alex, id: 'orphan' };
  saved.modules.messages.push({ id: 'local-orphan', ownerId: 'orphan', roomId: 'general', body: 'This must not crash a missing profile card.' });
  saved.modules.messages.push({ id: 'local-valid', ownerId: 'alex', roomId: 'general', body: 'This valid fictional message remains.' });
  saved.modules.tutoring.push({ ...tutor, id: 'local-orphan-tutor', ownerId: 'orphan', schoolId: 'ers' });
  const result = inspectDemoState(JSON.stringify(saved));
  assert.ok(result.recoveredRecords >= 3);
  assert.equal(result.state.modules.messages.length, 1);
  assert.equal(result.state.modules.messages[0].ownerId, 'alex');
  assert.ok(result.state.modules.tutoring.every((entry) => Object.hasOwn(result.state.profiles, entry.ownerId)));
});

test('startup and parse/version failures never overwrite raw storage', async () => {
  for (const value of [null, '{broken', JSON.stringify({ version: 99, valuable: 'unchanged' })]) {
    const storage = memoryStorage(value);
    const repository = createLocalRepository({ storage, locks: serialLocks() });
    assert.equal(storage.writes.length, 0);
    if (value !== null) {
      assert.equal(await repository.dispatch({ type: 'participation', eventId: 'ideenlabor', status: 'joined' }, 'alex'), false);
      assert.equal(storage.getItem(demoStorageKey), value);
      assert.equal(repository.exportRecovery().raw, value);
      assert.equal(storage.writes.length, 0);
    }
  }
});

test('recovery backs up exact raw input before saving and remains exportable after reload', async () => {
  const saved = createDemoState();
  saved.ideas.push({ id: 'local-bad' });
  const raw = JSON.stringify(saved);
  const storage = memoryStorage(raw);
  const repository = createLocalRepository({ storage, locks: serialLocks(), writerId: 'test' });
  assert.equal(repository.getSnapshot().storageStatus.kind, 'recovered');
  assert.equal(storage.writes.length, 0);
  assert.equal(await repository.dispatch({ type: 'participation', eventId: 'ideenlabor', status: 'joined' }, 'alex'), true);
  assert.ok(storage.writes[0].startsWith(recoveryPrefix));
  assert.equal(storage.getItem(storage.writes[0]), raw);
  const reloaded = createLocalRepository({ storage, locks: serialLocks() });
  assert.equal(reloaded.exportRecovery().raw, raw);
});

test('quota failures preserve authoritative data, backups and unsaved snapshot', async () => {
  for (const failure of ['main', 'backup']) {
    const saved = createDemoState();
    if (failure === 'backup') saved.ideas.push({ id: 'local-bad' });
    const raw = JSON.stringify(saved);
    const storage = memoryStorage(raw);
    const repository = createLocalRepository({ storage, locks: serialLocks() });
    storage.failMain = failure === 'main'; storage.failBackup = failure === 'backup';
    assert.equal(await repository.dispatch({ type: 'participation', eventId: 'ideenlabor', status: 'joined' }, 'alex'), false);
    assert.equal(storage.getItem(demoStorageKey), raw);
    assert.equal(repository.getSnapshot().state.participation.alex.ideenlabor, undefined);
    assert.equal(repository.getSnapshot().storageStatus.reason, failure === 'backup' ? 'backup-failed' : 'quota');
  }
});

test('two serialized writers merge against latest state and queued actor identity stays fixed', async () => {
  const storage = memoryStorage();
  const locks = serialLocks();
  const first = createLocalRepository({ storage, locks });
  const second = createLocalRepository({ storage, locks });
  const actor = 'alex';
  const join = first.dispatch({ type: 'participation', eventId: 'ideenlabor', status: 'joined' }, actor);
  const preferences = second.dispatch({ type: 'preferences', patch: { displayName: 'Deniz Demo' } }, 'deniz');
  assert.deepEqual(await Promise.all([join, preferences]), [true, true]);
  const loaded = inspectDemoState(storage.getItem(demoStorageKey)).state;
  assert.equal(loaded.participation.alex.ideenlabor, 'joined');
  assert.equal(loaded.participation.deniz.ideenlabor, undefined);
  assert.equal(loaded.profiles.deniz.displayName, 'Deniz Demo');
  assert.equal(loaded.profiles.alex.displayName, 'Alex');
  assert.equal(JSON.parse(storage.getItem(demoStorageKey))._persistence.revision, 2);
});

test('without atomic Web Locks writes are refused and stale data produces a conflict', async () => {
  const original = JSON.stringify(createDemoState());
  const storage = memoryStorage(original);
  const repository = createLocalRepository({ storage });
  assert.equal(await repository.dispatch({ type: 'participation', eventId: 'ideenlabor', status: 'joined' }, 'alex'), false);
  assert.equal(repository.getSnapshot().storageStatus.reason, 'locks-unavailable');
  const changed = createDemoState(); changed.profiles.deniz.displayName = 'Updated elsewhere';
  storage.setItem(demoStorageKey, JSON.stringify(changed));
  const external = storage.getItem(demoStorageKey);
  assert.equal(await repository.dispatch({ type: 'preferences', patch: { displayName: 'Older tab' } }, 'alex'), false);
  assert.equal(repository.getSnapshot().storageStatus.kind, 'conflict');
  assert.equal(storage.getItem(demoStorageKey), external);
  await repository.reloadStorage();
  assert.equal(repository.getSnapshot().state.profiles.deniz.displayName, 'Updated elsewhere');
});

test('stale record edits are rejected while independent updates can still merge', async () => {
  const storage = memoryStorage(); const locks = serialLocks();
  const first = createLocalRepository({ storage, locks });
  const second = createLocalRepository({ storage, locks });
  const expectedRecord = JSON.stringify(first.getSnapshot().state.ideas[0]);
  assert.equal(await first.dispatch({ type: 'updateIdea', id: 'schulcode', idea, expectedRecord }, 'alex'), true);
  assert.equal(await second.dispatch({ type: 'updateIdea', id: 'schulcode', idea: { ...idea, title: 'Stale edit would overwrite' }, expectedRecord }, 'alex'), false);
  assert.equal(second.getSnapshot().storageStatus.reason, 'record-changed');
  assert.equal(inspectDemoState(storage.getItem(demoStorageKey)).state.ideas[0].title, idea.title);
});

test('seed project editing, withdrawal and deletion preserve ownership, members and history on reload', () => {
  let state = demoReducer(createDemoState(), { type: 'toggleIdea', id: 'schulcode', actorId: 'deniz' });
  const original = state;
  assert.equal(demoReducer(state, { type: 'updateIdea', id: 'schulcode', idea, actorId: 'deniz' }), original);
  state = demoReducer(state, { type: 'updateIdea', id: 'schulcode', idea, actorId: 'alex' });
  state = restore(state);
  assert.equal(state.ideas[0].title, idea.title);
  assert.equal(state.ideas[0].ownerId, 'alex');
  assert.deepEqual(state.ideas[0].participantIds, ['deniz']);
  state = demoReducer(state, { type: 'withdrawIdea', id: 'schulcode', actorId: 'alex' });
  assert.equal(state.ideas[0].lifecycle, 'withdrawn');
  state = demoReducer(state, { type: 'removeIdea', id: 'schulcode', actorId: 'alex' });
  state = restore(state);
  assert.equal(state.ideas[0].lifecycle, 'deleted');
  assert.equal(state.ideas[0].history.length, 3);
  assert.equal(myIdeas(state.profiles.alex, state.ideas).length, 0);
  assert.equal(demoReducer(state, { type: 'toggleIdea', id: 'schulcode', actorId: 'deniz' }), state);
});

test('seed tutoring edit, close and deletion survive reload and exclude inactive matches', () => {
  let state = createDemoState();
  const forbidden = demoReducer(state, { type: 'closeTutoring', id: 'math-offer', actorId: 'deniz' });
  assert.equal(forbidden, state);
  state = demoReducer(state, { type: 'updateTutoring', id: 'math-offer', record: tutor, actorId: 'alex' });
  state = restore(state);
  const edited = state.modules.tutoring.find((item) => item.id === 'math-offer');
  assert.equal(edited.description, tutor.description);
  assert.equal(edited.subjectKey, 'math');
  state = demoReducer(state, { type: 'closeTutoring', id: 'math-offer', actorId: 'alex' });
  assert.ok(!matchingTutoring(state.profiles.deniz, state.modules).some((entry) => entry.id === 'math-offer'));
  assert.equal(filterTutoring([edited, { ...edited, id: 'closed', lifecycle: 'closed' }], { ownerId: 'alex' }, {}, 'de').length, 2);
  state = demoReducer(state, { type: 'removeTutoring', id: 'math-offer', actorId: 'alex' });
  state = restore(state);
  const removed = state.modules.tutoring.find((item) => item.id === 'math-offer');
  assert.equal(removed.lifecycle, 'deleted');
  assert.equal(removed.history.length, 3);
  assert.equal(demoReducer(state, { type: 'toggleModuleInterest', targetType: 'tutoring', targetId: 'math-offer', actorId: 'deniz' }), state);
});

test('storage events re-read latest data and ignore unrelated keys', async () => {
  const storage = memoryStorage(); const locks = serialLocks();
  const first = createLocalRepository({ storage, locks });
  const second = createLocalRepository({ storage, locks });
  await first.dispatch({ type: 'preferences', patch: { displayName: 'Neue Übung' } }, 'deniz');
  second.onStorageEvent({ key: 'unrelated', newValue: null });
  assert.equal(second.getSnapshot().state.profiles.deniz.displayName, 'Deniz');
  second.onStorageEvent({ key: demoStorageKey, newValue: 'old queued value deliberately ignored' });
  assert.equal(second.getSnapshot().state.profiles.deniz.displayName, 'Neue Übung');
});

test('queued actions retain captured actor and payload while profile selection changes', async () => {
  const storage = memoryStorage();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const locks = { request: async (name, work) => { await gate; return work(); } };
  const repository = createLocalRepository({ storage, locks });
  let activePersona = 'alex';
  const action = { type: 'submitIdea', id: 'local-slow-action', idea: { ...idea } };
  const queued = repository.dispatch(action, activePersona);
  activePersona = 'deniz';
  action.idea.title = 'A changed input must not replace captured payload';
  release();
  assert.equal(await queued, true);
  const submitted = repository.getSnapshot().state.ideas[0];
  assert.equal(activePersona, 'deniz');
  assert.equal(submitted.ownerId, 'alex');
  assert.equal(submitted.title, idea.title);
});

test('editing can remove an old optional interview association', () => {
  let state = demoReducer(createDemoState(), { type: 'submitIdea', id: 'local-interview', idea: { ...idea, initiativeId: 'interviews' } });
  state = demoReducer(state, { type: 'updateIdea', id: 'local-interview', idea });
  assert.equal(state.ideas[0].initiativeId, undefined);
  assert.equal(restore(state).ideas[0].initiativeId, undefined);
});

test('stale full profile forms cannot overwrite newer changes from another tab', async () => {
  const storage = memoryStorage(); const locks = serialLocks();
  const first = createLocalRepository({ storage, locks });
  const second = createLocalRepository({ storage, locks });
  const profile = second.getSnapshot().state.profiles.alex;
  await first.dispatch({ type: 'preferences', patch: { customInterests: ['Klangkunst'] } }, 'alex');
  assert.equal(await second.dispatch({ type: 'preferences', patch: { ...profile, displayName: 'Stale form', customInterests: [] }, expectedProfile: JSON.stringify(profile) }, 'alex'), false);
  assert.equal(second.getSnapshot().storageStatus.reason, 'record-changed');
  assert.deepEqual(inspectDemoState(storage.getItem(demoStorageKey)).state.profiles.alex.customInterests, ['Klangkunst']);
});

test('profile conflict checks allow independent language changes and missing empty interests', async () => {
  const storage = memoryStorage(); const locks = serialLocks();
  const repository = createLocalRepository({ storage, locks });
  const profile = repository.getSnapshot().state.profiles.alex;
  await repository.dispatch({ type: 'preferences', patch: { language: 'tr' } }, 'alex');
  assert.equal(await repository.dispatch({ type: 'preferences', patch: { displayName: 'Yeni Alex', customInterests: [] }, expectedProfile: JSON.stringify(profile) }, 'alex'), true);
  assert.equal(repository.getSnapshot().state.profiles.alex.language, 'tr');
});
test('new local project groups, their posts and chess games survive recovery independently',()=>{
 let state=demoReducer(createDemoState(),{type:'createProjectGroup',ideaId:'schulcode',actorId:'alex'});
 state=demoReducer(state,{type:'postMessage',id:'local-group-post',roomId:'project-schulcode',body:'A local project message for later.',actorId:'alex'});
 state=demoReducer(state,{type:'startChess',id:'local-good-game',actorId:'alex'});
 state.modules.games.push({id:'local-bad-game',moves:['bad']});
 const result=inspectDemoState(JSON.stringify(state));assert.ok(result.recoveredRecords>0);assert.equal(result.state.modules.games.length,1);assert.equal(result.state.modules.messages[0].body,'A local project message for later.');assert.equal(result.state.modules.groups[0].id,'project-schulcode');
});
