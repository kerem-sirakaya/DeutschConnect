// Prüft das Laden/Speichern echter Ideen mit einem NACHGEBAUTEN Supabase-Client.
// Es wird keine echte Datenbank angesprochen. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSupport,
  canSupportIdea,
  createIdea,
  deleteOwnIdea,
  fetchIdeasState,
  ideaErrorKey,
  mapDbIdea,
  removeSupport,
} from '../src/lib/ideasApi.js';
import { getMyIdeas } from '../src/lib/selectors.js';

/** Nachgebauter Client: merkt sich alle Aufrufe und liefert vorbereitete Antworten. */
function fakeClient(responses = {}) {
  const calls = [];
  const builderFor = (key) => {
    const call = { key, steps: [] };
    calls.push(call);
    const builder = {
      then(resolve, reject) {
        return Promise.resolve(responses[key] ?? { data: [], error: null }).then(resolve, reject);
      },
    };
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single']) {
      builder[method] = (...args) => {
        call.steps.push([method, ...args]);
        return builder;
      };
    }
    return builder;
  };
  return { calls, from: (table) => builderFor(table), rpc: (name) => builderFor(`rpc:${name}`) };
}

const row = (overrides = {}) => ({
  id: 'idea-1',
  author_id: 'other',
  school_id: 'anka',
  title: 'Sprach-Tandem',
  summary: 'Kurz',
  description: 'Beschreibung mit genug Zeichen',
  topics: ['languages'],
  format: 'meetup',
  school_ids: ['ers', 'anka'],
  status: 'collecting',
  created_at: '2026-11-01T10:00:00+00:00',
  ...overrides,
});

test('Datenbank-Idee bekommt dieselbe Form wie Demo-Ideen', () => {
  const idea = mapDbIdea(row());
  assert.equal(idea.authorId, 'other');
  assert.equal(idea.schoolId, 'anka');
  assert.deepEqual(idea.schoolIds, ['ers', 'anka']);
  assert.equal(idea.createdAt, '2026-11-01T10:00:00+00:00');
  assert.equal(idea.isDemo, false);
});

test('nur fremde UND freigegebene Ideen dürfen unterstützt werden', () => {
  assert.equal(canSupportIdea(mapDbIdea(row({ status: 'collecting' })), 'me'), true);
  assert.equal(canSupportIdea(mapDbIdea(row({ status: 'review' })), 'me'), true);
  assert.equal(canSupportIdea(mapDbIdea(row({ status: 'planned' })), 'me'), true);
  assert.equal(canSupportIdea(mapDbIdea(row({ status: 'submitted' })), 'me'), false);
  assert.equal(canSupportIdea(mapDbIdea(row({ status: 'rejected' })), 'me'), false);
  assert.equal(canSupportIdea(mapDbIdea(row({ author_id: 'me' })), 'me'), false);
});

test('Laden: Ideen, eigene Unterstützungen und Zahlen; unsichtbare Unterstützungen ausgeblendet', async () => {
  const client = fakeClient({
    ideas: { data: [row()], error: null },
    idea_supports: { data: [{ idea_id: 'idea-1' }, { idea_id: 'versteckt' }], error: null },
    'rpc:get_idea_support_counts': { data: [{ idea_id: 'idea-1', supporters: '3' }], error: null },
  });
  const state = await fetchIdeasState(client, 'me');
  assert.equal(state.ideas.length, 1);
  assert.deepEqual(state.supported, ['idea-1']);
  assert.deepEqual(state.counts, { 'idea-1': 3 });
  const supportsCall = client.calls.find((c) => c.key === 'idea_supports');
  assert.deepEqual(supportsCall.steps[1], ['eq', 'user_id', 'me']);
});

test('leere Tabelle ergibt leere Liste – keine Demo-Ideen als Ersatz', async () => {
  const state = await fetchIdeasState(fakeClient(), 'me');
  assert.deepEqual(state, { ideas: [], supported: [], counts: {} });
});

test('Ladefehler wird weitergegeben statt verschluckt', async () => {
  const client = fakeClient({ 'rpc:get_idea_support_counts': { data: null, error: { code: '42501' } } });
  await assert.rejects(fetchIdeasState(client, 'me'), { code: '42501' });
});

test('Idee anlegen: eigene ID + eigene Schule, KEIN Status (setzt die Datenbank)', async () => {
  const client = fakeClient({ ideas: { data: row({ id: 'neu', author_id: 'me', school_id: 'ers', status: 'submitted' }), error: null } });
  const result = await createIdea(client, {
    userId: 'me',
    schoolId: 'ers',
    idea: { title: 'Titel', summary: 'S', description: 'D', topics: ['music'], format: 'workshop', schoolIds: ['ers'] },
  });
  assert.equal(result.idea.id, 'neu');
  const [, payload] = client.calls[0].steps[0];
  assert.equal(payload.author_id, 'me');
  assert.equal(payload.school_id, 'ers');
  assert.equal('status' in payload, false);
});

test('Unterstützen / Entfernen nutzen idea_id + user_id', async () => {
  const client = fakeClient({ idea_supports: { error: null } });
  await addSupport(client, { userId: 'me', ideaId: 'idea-1' });
  await removeSupport(client, { userId: 'me', ideaId: 'idea-1' });
  assert.deepEqual(client.calls[0].steps, [['insert', { idea_id: 'idea-1', user_id: 'me' }]]);
  assert.deepEqual(client.calls[1].steps, [['delete'], ['eq', 'idea_id', 'idea-1'], ['eq', 'user_id', 'me']]);
});

test('Löschen ohne gelöschte Zeile wird als Fehler gemeldet', async () => {
  const none = await deleteOwnIdea(fakeClient({ ideas: { data: [], error: null } }), { userId: 'me', ideaId: 'x' });
  assert.equal(ideaErrorKey(none.error), 'ideas.errors.deleteFailed');
  const ok = await deleteOwnIdea(fakeClient({ ideas: { data: [{ id: 'x' }], error: null } }), { userId: 'me', ideaId: 'x' });
  assert.equal(ok.error, null);
});

test('eigene Ideen (auch nicht freigegebene) erscheinen unter "Meine Ideen"', () => {
  const ideas = [mapDbIdea(row({ id: 'a', author_id: 'me', status: 'submitted' })), mapDbIdea(row({ id: 'b' }))];
  const mine = getMyIdeas({ id: 'me', supportedIdeas: ['b'] }, ideas);
  assert.deepEqual(mine.authored.map((i) => i.id), ['a']);
  assert.deepEqual(mine.supported.map((i) => i.id), ['b']);
});

test('Fehler werden verständlichen Texten zugeordnet', () => {
  assert.equal(ideaErrorKey({ code: '42501' }), 'ideas.errors.notAllowed');
  assert.equal(ideaErrorKey({ code: '23505' }), 'ideas.errors.alreadySupported');
  assert.equal(ideaErrorKey({ code: '23514' }), 'ideas.errors.invalid');
  assert.equal(ideaErrorKey({ name: 'TypeError', message: 'Failed to fetch' }), 'ideas.errors.network');
  assert.equal(ideaErrorKey({ code: 'XX' }), 'ideas.errors.generic');
  assert.equal(ideaErrorKey(null), null);
});
