// Prüft die Ideen-Moderation (Laden, Filtern, Statuswechsel, Fehler) mit einem
// NACHGEBAUTEN Supabase-Client. Keine echte Datenbank. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IDEA_ACTIONS,
  IDEA_FILTER_OPTIONS,
  IDEA_FILTERS,
  IDEA_WORKLOAD,
  countIdeasByStatus,
  filterIdeas,
  ideaActionsFor,
  ideaEmptyKey,
  isAllowedIdeaTransition,
  loadAdminIdeas,
  moderateIdea,
  normalizeIdeaFilter,
} from '../src/lib/adminIdeas.js';

/** Nachgebauter Client: nur rpc – direkter Tabellenzugriff würde den Test sprengen. */
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const response = responses[name];
      return typeof response === 'function' ? response(args) : response ?? { data: null, error: null };
    },
    from(table) {
      throw new Error(`Direkter Tabellenzugriff auf "${table}" ist verboten`);
    },
  };
}

const row = (id, status, extra = {}) => ({
  id,
  school_id: 'ers',
  title: `Idee ${id}`,
  summary: 'Kurz',
  description: 'Eine ausführliche Beschreibung der Idee.',
  topics: ['science'],
  format: 'workshop',
  school_ids: ['ers', 'anka'],
  status,
  created_at: '2026-11-01T10:00:00+00:00',
  supporters: 2,
  ...extra,
});

const rows = [row('i1', 'submitted'), row('i2', 'collecting'), row('i3', 'review'), row('i4', 'planned'), row('i5', 'rejected'), row('i6', 'submitted')];

async function loadedIdeas() {
  const { ideas } = await loadAdminIdeas(fakeClient({ admin_list_ideas: { data: rows, error: null } }));
  return ideas;
}

// ---------------------------------------------------------------------------
// Erlaubte Statuswechsel = Migration 006
// ---------------------------------------------------------------------------

test('erlaubte Wechsel entsprechen exakt admin_set_idea_status (Migration 006)', () => {
  const pairs = IDEA_ACTIONS.map((action) => `${action.from}->${action.to}`).sort();
  assert.deepEqual(
    pairs,
    [
      'collecting->rejected',
      'collecting->review',
      'rejected->submitted',
      'review->collecting',
      'review->planned',
      'review->rejected',
      'submitted->collecting',
      'submitted->rejected',
    ],
  );
});

test('nicht erlaubte Wechsel werden erkannt', () => {
  for (const [from, to] of [
    ['submitted', 'review'],
    ['submitted', 'planned'],
    ['collecting', 'planned'],
    ['collecting', 'submitted'],
    ['rejected', 'collecting'],
    ['rejected', 'review'],
    ['rejected', 'planned'],
    ['planned', 'collecting'],
    ['planned', 'rejected'],
    ['submitted', 'submitted'],
    ['submitted', 'unknown'],
  ]) {
    assert.equal(isAllowedIdeaTransition(from, to), false, `${from}->${to}`);
  }
  assert.deepEqual(ideaActionsFor('planned'), [], 'planned ist endgültig');
  assert.deepEqual(ideaActionsFor('unknown'), []);
  assert.deepEqual(ideaActionsFor('submitted').map((a) => a.id), ['approve', 'reject']);
  assert.deepEqual(ideaActionsFor('rejected').map((a) => a.id), ['reopen']);
});

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

test('Laden: alle Ideen über admin_list_ideas, ohne Autor:innen-Daten', async () => {
  const client = fakeClient({ admin_list_ideas: { data: rows.map((r) => ({ ...r, author_id: 'person' })), error: null } });
  const result = await loadAdminIdeas(client);
  assert.equal(result.errorKey, null);
  assert.equal(result.ideas.length, 6);
  assert.deepEqual(client.calls, [{ name: 'admin_list_ideas', args: { p_status: null } }]);
  assert.ok(result.ideas.every((idea) => !('authorId' in idea) && !('author_id' in idea)));
  assert.equal(result.ideas[0].supporters, 2);
});

test('Laden: API-Fehler werden zu übersetzten Schlüsseln', async () => {
  const cases = [
    [{ code: '42501' }, 'admin.errors.notAllowed'],
    [{ code: 'PGRST202' }, 'admin.errors.unavailable'],
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'admin.errors.network'],
    [{ code: 'XX000' }, 'admin.errors.generic'],
  ];
  for (const [error, key] of cases) {
    const result = await loadAdminIdeas(fakeClient({ admin_list_ideas: { data: null, error } }));
    assert.deepEqual(result, { ideas: null, errorKey: key });
  }
});

test('Laden: leere Antwort ergibt leere Liste', async () => {
  const result = await loadAdminIdeas(fakeClient({ admin_list_ideas: { data: [], error: null } }));
  assert.deepEqual(result, { ideas: [], errorKey: null });
});

// ---------------------------------------------------------------------------
// Filtern, Zählen, leere Zustände
// ---------------------------------------------------------------------------

test('Filtern nach jedem Status und "Alle"', async () => {
  const ideas = await loadedIdeas();
  assert.equal(filterIdeas(ideas, 'all').length, 6);
  assert.deepEqual(filterIdeas(ideas, 'submitted').map((i) => i.id), ['i1', 'i6']);
  assert.deepEqual(filterIdeas(ideas, 'collecting').map((i) => i.id), ['i2']);
  assert.deepEqual(filterIdeas(ideas, 'review').map((i) => i.id), ['i3']);
  assert.deepEqual(filterIdeas(ideas, 'planned').map((i) => i.id), ['i4']);
  assert.deepEqual(filterIdeas(ideas, 'rejected').map((i) => i.id), ['i5']);
  // Unbekannter Filter aus der Adresse (?status=xyz) -> "Alle"
  assert.equal(filterIdeas(ideas, 'xyz').length, 6);
  assert.equal(normalizeIdeaFilter('xyz'), 'all');
  assert.equal(normalizeIdeaFilter(null), 'all');
});

test('Filter-Liste: Alle + alle sechs Status', () => {
  assert.deepEqual(IDEA_FILTERS, ['all', 'submitted', 'collecting', 'review', 'planned', 'rejected']);
});

test('Zählung für die Moderations-Übersicht', async () => {
  const counts = countIdeasByStatus(await loadedIdeas());
  assert.deepEqual(counts, { all: 6, submitted: 2, collecting: 1, review: 1, planned: 1, rejected: 1 });
  assert.deepEqual(countIdeasByStatus([]), { all: 0, submitted: 0, collecting: 0, review: 0, planned: 0, rejected: 0 });
});

test('leere Zustände: passender Text je Filter', async () => {
  assert.equal(ideaEmptyKey('all'), 'admin.ideas.empty.all');
  assert.equal(ideaEmptyKey('submitted'), 'admin.ideas.empty.submitted');
  assert.equal(ideaEmptyKey('rejected'), 'admin.ideas.empty.filtered');
  const onlyPlanned = (await loadedIdeas()).filter((idea) => idea.status === 'planned');
  assert.deepEqual(filterIdeas(onlyPlanned, 'submitted'), []);
});

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

test('Freigeben: submitted -> collecting', async () => {
  const ideas = await loadedIdeas();
  const client = fakeClient();
  const result = await moderateIdea(client, ideas, 'i1', 'collecting');
  assert.equal(result.errorKey, null);
  assert.equal(result.action.id, 'approve');
  assert.deepEqual(client.calls, [{ name: 'admin_set_idea_status', args: { p_id: 'i1', p_status: 'collecting' } }]);
  assert.equal(result.ideas.find((i) => i.id === 'i1').status, 'collecting');
  // Andere Ideen bleiben unverändert, Original-Liste wird nicht verändert
  assert.equal(result.ideas.find((i) => i.id === 'i6').status, 'submitted');
  assert.equal(ideas.find((i) => i.id === 'i1').status, 'submitted');
});

test('Ablehnen: von submitted, collecting und review', async () => {
  const ideas = await loadedIdeas();
  for (const id of ['i1', 'i2', 'i3']) {
    const client = fakeClient();
    const result = await moderateIdea(client, ideas, id, 'rejected');
    assert.equal(result.errorKey, null, id);
    assert.equal(result.action.id, 'reject');
    assert.equal(result.ideas.find((i) => i.id === id).status, 'rejected');
    assert.deepEqual(client.calls[0], { name: 'admin_set_idea_status', args: { p_id: id, p_status: 'rejected' } });
  }
});

test('Wiedereröffnen: rejected -> submitted (bleibt privat)', async () => {
  const ideas = await loadedIdeas();
  const client = fakeClient();
  const result = await moderateIdea(client, ideas, 'i5', 'submitted');
  assert.equal(result.errorKey, null);
  assert.equal(result.action.id, 'reopen');
  assert.equal(result.ideas.find((i) => i.id === 'i5').status, 'submitted');
});

test('weitere Wechsel: collecting -> review, review -> planned, review -> collecting', async () => {
  const ideas = await loadedIdeas();
  for (const [id, to, actionId] of [
    ['i2', 'review', 'toReview'],
    ['i3', 'planned', 'toPlanned'],
    ['i3', 'collecting', 'backToCollecting'],
  ]) {
    const result = await moderateIdea(fakeClient(), ideas, id, to);
    assert.equal(result.errorKey, null);
    assert.equal(result.action.id, actionId);
  }
});

test('ungültiger Wechsel: KEINE Anfrage an die Datenbank, Liste unverändert', async () => {
  const ideas = await loadedIdeas();
  for (const [id, to] of [
    ['i1', 'planned'],
    ['i5', 'collecting'],
    ['i4', 'rejected'],
    ['i1', 'submitted'],
  ]) {
    const client = fakeClient();
    const result = await moderateIdea(client, ideas, id, to);
    assert.equal(result.errorKey, 'admin.errors.transition', `${id}->${to}`);
    assert.equal(result.ideas, ideas);
    assert.equal(client.calls.length, 0);
  }
});

test('unbekannte Idee: notFound, keine Anfrage', async () => {
  const ideas = await loadedIdeas();
  const client = fakeClient();
  const result = await moderateIdea(client, ideas, 'gibt-es-nicht', 'collecting');
  assert.equal(result.errorKey, 'admin.errors.notFound');
  assert.equal(client.calls.length, 0);
});

test('API-Fehler beim Moderieren: Liste bleibt unverändert, Fehler übersetzt', async () => {
  const ideas = await loadedIdeas();
  const cases = [
    [{ code: '42501' }, 'admin.errors.notAllowed'],
    [{ code: '22023' }, 'admin.errors.invalid'],
    [{ code: 'P0002' }, 'admin.errors.notFound'],
    [{ code: 'DC004' }, 'admin.errors.transition'], // z. B. jemand anderes war schneller
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'admin.errors.network'],
  ];
  for (const [error, key] of cases) {
    const client = fakeClient({ admin_set_idea_status: { data: null, error } });
    const result = await moderateIdea(client, ideas, 'i1', 'collecting');
    assert.equal(result.errorKey, key);
    assert.equal(result.ideas, ideas, 'gleiche Liste (unverändert)');
    assert.equal(result.action, null);
  }
});

// ---------------------------------------------------------------------------
// Übersetzungen
// ---------------------------------------------------------------------------

test('alle Texte der Moderation existieren in de, tr und en', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const keys = new Set([
    ...IDEA_ACTIONS.flatMap((action) => [action.labelKey, action.confirmKey]),
    ...IDEA_FILTER_OPTIONS.map((option) => option.labelKey),
    ...IDEA_WORKLOAD.map((item) => item.labelKey),
    ...['all', 'submitted', 'planned'].map(ideaEmptyKey),
    'admin.ideas.title',
    'admin.ideas.subtitle',
    'admin.ideas.success',
    'admin.ideas.supporters_one',
    'admin.ideas.supporters_other',
  ]);
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8'));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key} fehlt`);
      assert.ok(value.trim().length > 0, `${lang}: ${key} ist leer`);
    }
    // Bestätigungen nennen die Idee beim Namen
    for (const action of IDEA_ACTIONS) {
      const text = action.confirmKey.split('.').reduce((node, part) => node?.[part], dict);
      assert.match(text, /\{title\}/, `${lang}: ${action.confirmKey} ohne {title}`);
    }
  }
});
