// Prüft die Admin-Event-Verwaltung (Laden, Filter, Status, Löschen, Speichern, Fehler)
// mit einem NACHGEBAUTEN Supabase-Client. Keine echte Datenbank. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DELETE_ACTION,
  EVENT_ACTIONS,
  EVENT_FILTERS,
  EVENT_FILTER_OPTIONS,
  EVENT_STATS,
  canDeleteEvent,
  changeEventStatus,
  countEventsByStatus,
  eventActionsFor,
  eventEmptyKey,
  filterEvents,
  isAllowedEventTransition,
  loadAdminEvents,
  normalizeEventFilter,
  removeEvent,
  saveEvent,
} from '../src/lib/adminEvents.js';
import { emptyEventForm, formToEventInput } from '../src/lib/eventForm.js';

function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return responses[name] ?? { data: null, error: null };
    },
    from(table) {
      throw new Error(`Direkter Tabellenzugriff auf "${table}" ist verboten`);
    },
  };
}

const row = (id, status, extra = {}) => ({
  id,
  title: { de: `Event ${id}` },
  summary: null,
  description: null,
  location: 'ERS',
  audience: null,
  start_at: '2026-12-01T11:00:00+00:00',
  duration_minutes: 60,
  capacity: 20,
  online: false,
  topics: [],
  format: 'meetup',
  host_school_id: 'ers',
  school_ids: ['ers', 'anka'],
  status,
  created_at: '2026-11-01T10:00:00+00:00',
  registered_count: 0,
  interested_count: 0,
  ...extra,
});

const rows = [
  row('e1', 'draft'),
  row('e2', 'draft', { interested_count: 1 }),
  row('e3', 'planned', { registered_count: 5 }),
  row('e4', 'confirmed'),
  row('e5', 'completed'),
  row('e6', 'cancelled'),
];

async function loadedEvents() {
  const { events } = await loadAdminEvents(fakeClient({ admin_list_events: { data: rows, error: null } }));
  return events;
}

// ---------------------------------------------------------------------------
// Statuswechsel = Migration 006
// ---------------------------------------------------------------------------

test('erlaubte Wechsel entsprechen exakt admin_set_event_status (Migration 006)', () => {
  assert.deepEqual(
    EVENT_ACTIONS.map((a) => `${a.from}->${a.to}`).sort(),
    [
      'confirmed->cancelled',
      'confirmed->completed',
      'draft->confirmed',
      'draft->planned',
      'planned->cancelled',
      'planned->completed',
      'planned->confirmed',
    ],
  );
});

test('nicht erlaubte Wechsel (auch nie zurück zu draft, abgesagt/abgeschlossen endgültig)', () => {
  for (const [from, to] of [
    ['planned', 'draft'],
    ['confirmed', 'draft'],
    ['confirmed', 'planned'],
    ['draft', 'cancelled'],
    ['draft', 'completed'],
    ['cancelled', 'planned'],
    ['cancelled', 'confirmed'],
    ['completed', 'planned'],
    ['completed', 'cancelled'],
    ['planned', 'planned'],
    ['planned', 'unbekannt'],
  ]) {
    assert.equal(isAllowedEventTransition(from, to), false, `${from}->${to}`);
  }
  assert.deepEqual(eventActionsFor('cancelled'), []);
  assert.deepEqual(eventActionsFor('completed'), []);
  assert.deepEqual(eventActionsFor('draft').map((a) => a.id), ['publish', 'publishConfirmed']);
});

// ---------------------------------------------------------------------------
// Laden, Filtern, Zählen, leere Zustände
// ---------------------------------------------------------------------------

test('Laden über admin_list_events, mit Zählungen', async () => {
  const client = fakeClient({ admin_list_events: { data: rows, error: null } });
  const result = await loadAdminEvents(client);
  assert.equal(result.errorKey, null);
  assert.equal(result.events.length, 6);
  assert.deepEqual(client.calls, [{ name: 'admin_list_events', args: undefined }]);
  assert.equal(result.events.find((e) => e.id === 'e3').registeredCount, 5);
});

test('Laden: Fehler werden übersetzt, leere Antwort ist leere Liste', async () => {
  for (const [error, key] of [
    [{ code: '42501' }, 'admin.errors.notAllowed'],
    [{ code: 'PGRST202' }, 'admin.errors.unavailable'],
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'admin.errors.network'],
  ]) {
    assert.deepEqual(await loadAdminEvents(fakeClient({ admin_list_events: { data: null, error } })), { events: null, errorKey: key });
  }
  assert.deepEqual(await loadAdminEvents(fakeClient({ admin_list_events: { data: [], error: null } })), { events: [], errorKey: null });
});

test('alle Filter', async () => {
  const events = await loadedEvents();
  assert.deepEqual(EVENT_FILTERS, ['all', 'draft', 'planned', 'confirmed', 'completed', 'cancelled', 'archived']);
  const ids = (filter) => filterEvents(events, filter).map((e) => e.id);
  assert.equal(ids('all').length, 6);
  assert.deepEqual(ids('draft'), ['e1', 'e2']);
  assert.deepEqual(ids('planned'), ['e3']);
  assert.deepEqual(ids('confirmed'), ['e4']);
  assert.deepEqual(ids('completed'), ['e5']);
  assert.deepEqual(ids('cancelled'), ['e6']);
  assert.equal(ids('quatsch').length, 6);
  assert.equal(normalizeEventFilter('quatsch'), 'all');
});

test('Kennzahlen', async () => {
  assert.deepEqual(countEventsByStatus(await loadedEvents()), {
    all: 6, draft: 2, planned: 1, confirmed: 1, completed: 1, cancelled: 1, archived: 0,
  });
  assert.deepEqual(countEventsByStatus([]), { all: 0, draft: 0, planned: 0, confirmed: 0, completed: 0, cancelled: 0, archived: 0 });
});

test('leere Zustände', () => {
  assert.equal(eventEmptyKey('all'), 'admin.events.empty.all');
  assert.equal(eventEmptyKey('draft'), 'admin.events.empty.filtered');
  assert.deepEqual(filterEvents([], 'draft'), []);
});

// ---------------------------------------------------------------------------
// Status ändern
// ---------------------------------------------------------------------------

test('Entwurf veröffentlichen: draft -> planned', async () => {
  const events = await loadedEvents();
  const client = fakeClient();
  const result = await changeEventStatus(client, events, 'e1', 'planned');
  assert.equal(result.errorKey, null);
  assert.equal(result.action.id, 'publish');
  assert.deepEqual(client.calls, [{ name: 'admin_set_event_status', args: { p_id: 'e1', p_status: 'planned' } }]);
  assert.equal(result.events.find((e) => e.id === 'e1').status, 'planned');
  assert.equal(events.find((e) => e.id === 'e1').status, 'draft', 'Original unverändert');
});

test('weitere erlaubte Wechsel', async () => {
  const events = await loadedEvents();
  for (const [id, to, actionId] of [
    ['e1', 'confirmed', 'publishConfirmed'],
    ['e3', 'confirmed', 'confirm'],
    ['e3', 'cancelled', 'cancel'],
    ['e3', 'completed', 'complete'],
    ['e4', 'cancelled', 'cancel'],
    ['e4', 'completed', 'complete'],
  ]) {
    const result = await changeEventStatus(fakeClient(), events, id, to);
    assert.equal(result.errorKey, null, `${id}->${to}`);
    assert.equal(result.action.id, actionId);
  }
});

test('ungültiger Wechsel: keine Anfrage, Liste unverändert', async () => {
  const events = await loadedEvents();
  for (const [id, to] of [
    ['e3', 'draft'],
    ['e5', 'cancelled'],
    ['e6', 'planned'],
    ['e1', 'completed'],
  ]) {
    const client = fakeClient();
    const result = await changeEventStatus(client, events, id, to);
    assert.equal(result.errorKey, 'admin.errors.transition');
    assert.equal(result.events, events);
    assert.equal(client.calls.length, 0);
  }
  const client = fakeClient();
  assert.equal((await changeEventStatus(client, events, 'gibt-es-nicht', 'planned')).errorKey, 'admin.errors.notFound');
  assert.equal(client.calls.length, 0);
});

test('Datenbank-Regeln beim Statuswechsel: Fehler übersetzt, Liste unverändert', async () => {
  const events = await loadedEvents();
  for (const [code, key] of [
    ['DC002', 'admin.errors.pastDate'], // Veröffentlichen mit Datum in der Vergangenheit
    ['DC007', 'admin.errors.notStarted'], // Abschließen vor Beginn
    ['DC004', 'admin.errors.transition'],
    ['DC009', 'admin.errors.technical'],
    ['42501', 'admin.errors.notAllowed'],
    ['P0002', 'admin.errors.notFound'],
  ]) {
    const client = fakeClient({ admin_set_event_status: { data: null, error: { code } } });
    const result = await changeEventStatus(client, events, 'e1', 'planned');
    assert.equal(result.errorKey, key, code);
    assert.equal(result.events, events);
  }
});

// ---------------------------------------------------------------------------
// Löschen
// ---------------------------------------------------------------------------

test('Löschen nur für Entwürfe ohne Anmeldungen und Interessierte', async () => {
  const events = await loadedEvents();
  const byId = (id) => events.find((e) => e.id === id);
  assert.equal(canDeleteEvent(byId('e1')), true);
  assert.equal(canDeleteEvent(byId('e2')), false, 'Entwurf mit Interessierten');
  for (const id of ['e3', 'e4', 'e5', 'e6']) assert.equal(canDeleteEvent(byId(id)), false, id);
});

test('Entwurf löschen: admin_delete_event, Event verschwindet aus der Liste', async () => {
  const events = await loadedEvents();
  const client = fakeClient();
  const result = await removeEvent(client, events, 'e1');
  assert.equal(result.errorKey, null);
  assert.deepEqual(client.calls, [{ name: 'admin_delete_event', args: { p_id: 'e1' } }]);
  assert.ok(!result.events.some((e) => e.id === 'e1'));
});

test('Löschen verweigert: veröffentlicht oder mit Einträgen – keine Anfrage', async () => {
  const events = await loadedEvents();
  for (const [id, key] of [
    ['e3', 'admin.errors.onlyDrafts'],
    ['e6', 'admin.errors.onlyDrafts'],
    ['e2', 'admin.errors.hasEntries'],
    ['x', 'admin.errors.notFound'],
  ]) {
    const client = fakeClient();
    const result = await removeEvent(client, events, id);
    assert.equal(result.errorKey, key, id);
    assert.equal(result.events, events);
    assert.equal(client.calls.length, 0);
  }
});

test('Löschen: Datenbank lehnt ab (DC001/DC003) – Liste unverändert', async () => {
  const events = await loadedEvents();
  for (const [code, key] of [
    ['DC001', 'admin.errors.hasEntries'],
    ['DC003', 'admin.errors.onlyDrafts'],
  ]) {
    const result = await removeEvent(fakeClient({ admin_delete_event: { data: null, error: { code } } }), events, 'e1');
    assert.equal(result.errorKey, key);
    assert.equal(result.events, events);
  }
});

// ---------------------------------------------------------------------------
// Speichern
// ---------------------------------------------------------------------------

const input = formToEventInput({
  ...emptyEventForm({ schoolIds: ['ers'] }),
  title: { de: 'Neu', tr: '', en: '' },
  startLocal: '2026-12-10T15:30',
  hostSchoolId: 'ers',
});

test('Anlegen: admin_create_event, Zeit mit +03:00, kein Status', async () => {
  const client = fakeClient({ admin_create_event: { data: 'uuid-neu', error: null } });
  const result = await saveEvent(client, input);
  assert.deepEqual(result, { id: 'uuid-neu', errorKey: null });
  assert.equal(client.calls[0].name, 'admin_create_event');
  assert.equal(client.calls[0].args.p_start_at, '2026-12-10T15:30:00+03:00');
  assert.ok(!('p_status' in client.calls[0].args));
});

test('Bearbeiten: admin_update_event mit p_id und allen 13 Feldern', async () => {
  const client = fakeClient();
  const result = await saveEvent(client, input, 'uuid-e1');
  assert.deepEqual(result, { id: 'uuid-e1', errorKey: null });
  assert.equal(client.calls[0].name, 'admin_update_event');
  assert.equal(client.calls[0].args.p_id, 'uuid-e1');
  assert.equal(Object.keys(client.calls[0].args).length, 14);
});

test('Speichern: Datenbank-Fehler werden übersetzt', async () => {
  for (const [code, key] of [
    ['22023', 'admin.errors.invalid'],
    ['DC002', 'admin.errors.pastDate'],
    ['DC005', 'admin.errors.capacityTooLow'],
    ['DC006', 'admin.errors.dateLocked'],
    ['P0002', 'admin.errors.notFound'],
  ]) {
    const update = await saveEvent(fakeClient({ admin_update_event: { data: null, error: { code } } }), input, 'e1');
    assert.deepEqual(update, { id: null, errorKey: key }, code);
    const create = await saveEvent(fakeClient({ admin_create_event: { data: null, error: { code } } }), input);
    assert.deepEqual(create, { id: null, errorKey: key }, code);
  }
});

// ---------------------------------------------------------------------------
// Übersetzungen
// ---------------------------------------------------------------------------

test('alle Texte der Event-Verwaltung existieren in de, tr und en', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const keys = new Set([
    ...[...EVENT_ACTIONS, DELETE_ACTION].flatMap((action) => [action.labelKey, action.confirmKey]),
    ...EVENT_FILTER_OPTIONS.map((option) => option.labelKey),
    ...EVENT_STATS.map((stat) => stat.labelKey),
    eventEmptyKey('all'),
    eventEmptyKey('draft'),
    // Aus Variablen/Bedingungen, die der allgemeine i18n-Test nicht findet
    'admin.events.created',
    'admin.events.updated',
    'admin.events.offline',
    'events.online',
    'admin.events.registered_one',
    'admin.events.registered_other',
    'admin.events.interested_one',
    'admin.events.interested_other',
    'admin.eventForm.capacityHintRegistered_one',
    'admin.eventForm.capacityHintRegistered_other',
    ...[
      'titleRequired', 'tooLong', 'startRequired', 'startInvalid', 'startPast', 'duration', 'capacity',
      'capacityBelowRegistrations', 'schoolsRequired', 'schoolsInvalid', 'hostRequired', 'hostNotParticipating',
      'topics', 'format',
    ].map((name) => `admin.eventForm.errors.${name}`),
  ]);
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8'));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key} fehlt`);
      assert.ok(value.trim().length > 0, `${lang}: ${key} ist leer`);
    }
  }
});
