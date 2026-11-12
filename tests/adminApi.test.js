// Prüft die Admin-RPC-Wrapper mit einem NACHGEBAUTEN Supabase-Client.
// Es wird keine echte Datenbank angesprochen. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_EVENT_STATUSES,
  ADMIN_IDEA_STATUSES,
  adminErrorKey,
  cleanText,
  createAdminEvent,
  deleteAdminEvent,
  deleteAdminIdea,
  fetchAdminEvents,
  fetchAdminIdeas,
  fetchIsAdmin,
  mapAdminEvent,
  mapAdminIdea,
  setAdminEventStatus,
  setAdminIdeaStatus,
  toEventParams,
  updateAdminEvent,
} from '../src/lib/adminApi.js';

/**
 * Nachgebauter Client: merkt sich alle rpc-Aufrufe und liefert vorbereitete Antworten.
 * `from()` wirft absichtlich – Admin-Funktionen dürfen NIE direkt auf Tabellen zugreifen.
 */
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return responses[name] ?? { data: null, error: null };
    },
    from(table) {
      throw new Error(`Direkter Tabellenzugriff auf "${table}" ist im Admin-Bereich verboten`);
    },
  };
}

const eventRow = {
  id: 'uuid-e1',
  title: { de: 'Sprachcafé', en: 'Language Café' },
  summary: null,
  description: null,
  location: 'ERS',
  audience: null,
  start_at: '2099-01-10T11:00:00+00:00',
  duration_minutes: 90,
  capacity: 20,
  online: false,
  topics: ['languages'],
  format: 'meetup',
  host_school_id: 'ers',
  school_ids: ['ers', 'anka'],
  status: 'draft',
  created_at: '2026-11-01T10:00:00+00:00',
  registered_count: 3,
  interested_count: '2', // bigint kann als Text ankommen
};

const ideaRow = {
  id: 'uuid-i1',
  school_id: 'anka',
  title: 'Robotik-AG',
  summary: 'Gemeinsam bauen',
  description: 'Eine gemeinsame Robotik-AG beider Schulen.',
  topics: ['technology'],
  format: 'project',
  school_ids: ['ers', 'anka'],
  status: 'submitted',
  created_at: '2026-11-02T10:00:00+00:00',
  supporters: 4,
};

const formInput = {
  title: { de: ' Sprachcafé ', tr: '', en: 'Language Café' },
  summary: { de: '', tr: '  ', en: '' },
  description: '',
  location: 'ERS, Bibliothek',
  audience: undefined,
  start: '2099-01-10T14:00:00+03:00',
  durationMinutes: 90,
  capacity: 20,
  online: false,
  topics: ['languages'],
  format: 'meetup',
  hostSchoolId: 'ers',
  schoolIds: ['ers', 'anka'],
};

const EVENT_PARAM_NAMES = [
  'p_title', 'p_start_at', 'p_host_school_id', 'p_school_ids', 'p_summary', 'p_description',
  'p_location', 'p_audience', 'p_duration_minutes', 'p_capacity', 'p_online', 'p_topics', 'p_format',
];

// ---------------------------------------------------------------------------
// Umwandlung
// ---------------------------------------------------------------------------

test('admin_list_events-Zeile bekommt Event-Form + Zählungen', () => {
  const event = mapAdminEvent(eventRow);
  assert.equal(event.id, 'uuid-e1');
  assert.equal(event.start, eventRow.start_at);
  assert.equal(event.hostSchoolId, 'ers');
  assert.equal(event.status, 'draft');
  assert.equal(event.createdAt, eventRow.created_at);
  assert.equal(event.registeredCount, 3);
  assert.equal(event.interestedCount, 2);
  assert.equal(mapAdminEvent({ ...eventRow, registered_count: null }).registeredCount, 0);
});

test('admin_list_ideas-Zeile enthält keine Autor:innen-Daten', () => {
  const idea = mapAdminIdea(ideaRow);
  assert.equal(idea.supporters, 4);
  assert.equal(idea.status, 'submitted');
  assert.deepEqual(idea.schoolIds, ['ers', 'anka']);
  assert.ok(!('authorId' in idea));
  // Selbst wenn die Datenbank eine author_id mitschicken würde, wird sie nicht übernommen
  assert.ok(!('authorId' in mapAdminIdea({ ...ideaRow, author_id: 'uuid-person' })));
});

test('cleanText entfernt leere Sprachen und leere Texte', () => {
  assert.equal(cleanText(null), null);
  assert.equal(cleanText(undefined), null);
  assert.equal(cleanText('   '), null);
  assert.equal(cleanText('Text'), 'Text');
  assert.deepEqual(cleanText({ de: 'Hallo', tr: '', en: '  ' }), { de: 'Hallo' });
  assert.equal(cleanText({ de: '', tr: '', en: '' }), null);
});

test('toEventParams nutzt exakt die Parameternamen aus Migration 006', () => {
  const params = toEventParams(formInput);
  assert.deepEqual(Object.keys(params).sort(), [...EVENT_PARAM_NAMES].sort());
  assert.deepEqual(params.p_title, { de: ' Sprachcafé ', en: 'Language Café' }); // Trimmen macht die DB
  assert.equal(params.p_summary, null);
  assert.equal(params.p_description, null);
  assert.equal(params.p_audience, null);
  assert.equal(params.p_start_at, '2099-01-10T14:00:00+03:00');
  assert.deepEqual(params.p_school_ids, ['ers', 'anka']);
  assert.equal(params.p_host_school_id, 'ers');
});

test('toEventParams setzt sichere Standardwerte', () => {
  const params = toEventParams({ title: 'X', start: '2099-01-01T10:00:00+03:00', hostSchoolId: 'ers', schoolIds: ['ers'] });
  assert.equal(params.p_online, false);
  assert.deepEqual(params.p_topics, []);
  assert.equal(params.p_format, 'meetup');
  assert.equal(params.p_capacity, null);
  assert.equal(params.p_duration_minutes, null);
});

test('Status-Listen entsprechen den Prüfregeln aus Migration 006', () => {
  assert.deepEqual(ADMIN_EVENT_STATUSES, ['draft', 'planned', 'confirmed', 'completed', 'cancelled']);
  assert.deepEqual(ADMIN_IDEA_STATUSES, ['submitted', 'collecting', 'review', 'planned', 'rejected']);
});

// ---------------------------------------------------------------------------
// RPC-Aufrufe
// ---------------------------------------------------------------------------

test('fetchIsAdmin: nur true zählt als Admin', async () => {
  for (const [data, expected] of [[true, true], [false, false], [null, false], ['true', false], [1, false]]) {
    const client = fakeClient({ is_admin: { data, error: null } });
    assert.equal(await fetchIsAdmin(client), expected, `data=${JSON.stringify(data)}`);
    assert.deepEqual(client.calls, [{ name: 'is_admin', args: undefined }]);
  }
});

test('fetchIsAdmin wirft bei Fehlern (kein stilles "ja")', async () => {
  const client = fakeClient({ is_admin: { data: true, error: { code: 'PGRST301', message: 'JWT expired' } } });
  await assert.rejects(() => fetchIsAdmin(client), (error) => error.code === 'PGRST301');
});

test('fetchAdminEvents ruft admin_list_events ohne Parameter auf', async () => {
  const client = fakeClient({ admin_list_events: { data: [eventRow], error: null } });
  const events = await fetchAdminEvents(client);
  assert.deepEqual(client.calls, [{ name: 'admin_list_events', args: undefined }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].registeredCount, 3);
  assert.deepEqual(await fetchAdminEvents(fakeClient({ admin_list_events: { data: null, error: null } })), []);
});

test('fetchAdminEvents wirft bei 42501', async () => {
  const client = fakeClient({ admin_list_events: { data: null, error: { code: '42501', message: 'Nur für Admins.' } } });
  await assert.rejects(() => fetchAdminEvents(client), (error) => adminErrorKey(error) === 'admin.errors.notAllowed');
});

test('createAdminEvent leitet alle Felder weiter und gibt die neue ID zurück', async () => {
  const client = fakeClient({ admin_create_event: { data: 'uuid-new', error: null } });
  const result = await createAdminEvent(client, formInput);
  assert.deepEqual(result, { id: 'uuid-new', error: null });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'admin_create_event');
  assert.deepEqual(client.calls[0].args, toEventParams(formInput));
  assert.ok(!('p_status' in client.calls[0].args), 'Status wird nie mitgeschickt (immer Entwurf)');
});

test('createAdminEvent gibt Fehler zurück statt zu werfen', async () => {
  const error = { code: '22023', message: 'Titel fehlt' };
  const result = await createAdminEvent(fakeClient({ admin_create_event: { data: null, error } }), formInput);
  assert.deepEqual(result, { error });
});

test('updateAdminEvent schickt p_id + alle Felder, aber nie einen Status', async () => {
  const client = fakeClient();
  const result = await updateAdminEvent(client, 'uuid-e1', formInput);
  assert.deepEqual(result, { error: null });
  assert.equal(client.calls[0].name, 'admin_update_event');
  assert.deepEqual(Object.keys(client.calls[0].args).sort(), ['p_id', ...EVENT_PARAM_NAMES].sort());
  assert.equal(client.calls[0].args.p_id, 'uuid-e1');
});

test('setAdminEventStatus, deleteAdminEvent, setAdminIdeaStatus: exakte Namen und Parameter', async () => {
  const client = fakeClient();
  assert.deepEqual(await setAdminEventStatus(client, 'uuid-e1', 'planned'), { error: null });
  assert.deepEqual(await deleteAdminEvent(client, 'uuid-e1'), { error: null });
  assert.deepEqual(await setAdminIdeaStatus(client, 'uuid-i1', 'collecting'), { error: null });
  assert.deepEqual(client.calls, [
    { name: 'admin_set_event_status', args: { p_id: 'uuid-e1', p_status: 'planned' } },
    { name: 'admin_delete_event', args: { p_id: 'uuid-e1' } },
    { name: 'admin_set_idea_status', args: { p_id: 'uuid-i1', p_status: 'collecting' } },
  ]);
});

test('Änderungs-Funktionen geben Datenbank-Fehler unverändert zurück', async () => {
  const error = { code: 'DC004', message: 'Statuswechsel nicht erlaubt' };
  const responses = {
    admin_update_event: { data: null, error },
    admin_set_event_status: { data: null, error },
    admin_delete_event: { data: null, error },
    admin_set_idea_status: { data: null, error },
  };
  const client = fakeClient(responses);
  assert.deepEqual(await updateAdminEvent(client, 'e', formInput), { error });
  assert.deepEqual(await setAdminEventStatus(client, 'e', 'completed'), { error });
  assert.deepEqual(await deleteAdminEvent(client, 'e'), { error });
  assert.deepEqual(await setAdminIdeaStatus(client, 'i', 'planned'), { error });
});

test('fetchAdminIdeas: ohne Filter p_status = null, mit Filter weitergeleitet', async () => {
  const client = fakeClient({ admin_list_ideas: { data: [ideaRow], error: null } });
  const all = await fetchAdminIdeas(client);
  await fetchAdminIdeas(client, 'submitted');
  assert.deepEqual(client.calls, [
    { name: 'admin_list_ideas', args: { p_status: null } },
    { name: 'admin_list_ideas', args: { p_status: 'submitted' } },
  ]);
  assert.equal(all[0].supporters, 4);
});

test('fetchAdminIdeas wirft bei Fehlern', async () => {
  const client = fakeClient({ admin_list_ideas: { data: null, error: { code: '22023' } } });
  await assert.rejects(() => fetchAdminIdeas(client, 'unknown'), (error) => error.code === '22023');
});

// ---------------------------------------------------------------------------
// Fehler -> Übersetzungsschlüssel
// ---------------------------------------------------------------------------

const EXPECTED_KEYS = {
  42501: 'admin.errors.notAllowed',
  22023: 'admin.errors.invalid',
  P0002: 'admin.errors.notFound',
  DC001: 'admin.errors.hasEntries',
  DC002: 'admin.errors.pastDate',
  DC003: 'admin.errors.onlyDrafts',
  DC004: 'admin.errors.transition',
  DC005: 'admin.errors.capacityTooLow',
  DC006: 'admin.errors.dateLocked',
  DC007: 'admin.errors.notStarted',
  DC008: 'admin.errors.full',
  DC009: 'admin.errors.technical',
  DC010: 'admin.errors.ideaNotDeletable',
  PGRST202: 'admin.errors.unavailable',
};

test('adminErrorKey: jeder Datenbank-Code bekommt einen eigenen Schlüssel', () => {
  for (const [code, key] of Object.entries(EXPECTED_KEYS)) {
    assert.equal(adminErrorKey({ code, message: 'x' }), key, `Code ${code}`);
  }
  assert.equal(adminErrorKey({ code: '23514' }), 'admin.errors.invalid');
  assert.equal(adminErrorKey({ code: '23503' }), 'admin.errors.invalid');
  assert.equal(adminErrorKey({ code: '22P02' }), 'admin.errors.invalid');
  assert.equal(adminErrorKey({ name: 'TypeError', message: 'Failed to fetch' }), 'admin.errors.network');
  assert.equal(adminErrorKey({ code: 'XX000' }), 'admin.errors.generic');
  assert.equal(adminErrorKey({}), 'admin.errors.generic');
  assert.equal(adminErrorKey(null), null);
});

test('alle Admin-Fehlerschlüssel existieren in de, tr und en', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const keys = new Set([...Object.values(EXPECTED_KEYS), 'admin.errors.network', 'admin.errors.generic']);
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8'));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key} fehlt`);
    }
  }
});

test('deleteAdminIdea: ruft admin_delete_idea mit p_id auf und gibt Fehler unverändert zurück', async () => {
  const client = fakeClient();
  assert.deepEqual(await deleteAdminIdea(client, 'uuid-i1'), { error: null });
  assert.deepEqual(client.calls, [{ name: 'admin_delete_idea', args: { p_id: 'uuid-i1' } }]);
  const error = { code: '42501', message: 'Nur für Admins.' };
  assert.deepEqual(await deleteAdminIdea(fakeClient({ admin_delete_idea: { data: null, error } }), 'x'), { error });
});
