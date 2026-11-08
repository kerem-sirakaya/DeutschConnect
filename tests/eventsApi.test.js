// Prüft das Laden/Speichern echter Events mit einem NACHGEBAUTEN Supabase-Client.
// Es wird keine echte Datenbank angesprochen. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchEvents,
  fetchMyRegistrations,
  mapDbEvent,
  planRegistrationChange,
  registrationErrorKey,
  registrationsToMap,
  saveRegistration,
} from '../src/lib/eventsApi.js';
import { getEventRole, getMyEvents, isUpcoming } from '../src/lib/selectors.js';

/** Nachgebauter Client: merkt sich alle Aufrufe und liefert vorbereitete Antworten. */
function fakeClient(responses = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, steps: [] };
      calls.push(call);
      const builder = {
        then(resolve, reject) {
          return Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve, reject);
        },
      };
      for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
        builder[method] = (...args) => {
          call.steps.push([method, ...args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return client;
}

const row = {
  id: 'uuid-e1',
  title: { de: 'Sprachcafé', tr: 'Dil Kafesi', en: 'Language Café' },
  summary: null,
  description: { de: 'Beschreibung' },
  location: 'ERS, Bibliothek',
  audience: null,
  start_at: '2099-01-10T13:30:00+00:00',
  duration_minutes: null,
  capacity: 30,
  online: false,
  topics: ['languages'],
  format: 'meetup',
  host_school_id: 'ers',
  school_ids: ['ers', 'anka'],
  status: 'planned',
};

test('Datenbank-Event bekommt dieselbe Form wie Demo-Events', () => {
  const event = mapDbEvent(row);
  assert.equal(event.start, row.start_at);
  assert.equal(event.hostSchoolId, 'ers');
  assert.deepEqual(event.schoolIds, ['ers', 'anka']);
  assert.equal(event.durationMinutes, null);
  assert.equal(event.summary, '');
  assert.equal(event.isDemo, false);
  assert.ok(isUpcoming(event, new Date('2098-12-01')));
});

test('Events werden nach Datum sortiert geladen', async () => {
  const client = fakeClient({ events: { data: [row], error: null } });
  const events = await fetchEvents(client);
  assert.equal(events.length, 1);
  assert.deepEqual(client.calls[0].steps[1], ['order', 'start_at', { ascending: true }]);
});

test('leere Tabelle ergibt leere Liste – keine Demo-Events als Ersatz', async () => {
  assert.deepEqual(await fetchEvents(fakeClient({ events: { data: [], error: null } })), []);
});

test('Ladefehler wird weitergegeben statt verschluckt', async () => {
  const client = fakeClient({ events: { data: null, error: { code: '42501', message: 'permission denied' } } });
  await assert.rejects(fetchEvents(client), { code: '42501' });
});

test('eigene Anmeldungen: nur für die eigene user_id abgefragt', async () => {
  const client = fakeClient({
    event_registrations: { data: [{ event_id: 'uuid-e1', status: 'registered' }, { event_id: 'x', status: 'kaputt' }], error: null },
  });
  const map = await fetchMyRegistrations(client, 'user-1');
  assert.deepEqual(map, { 'uuid-e1': 'registered' });
  assert.deepEqual(client.calls[0].steps[1], ['eq', 'user_id', 'user-1']);
});

test('Anmeldung/Interesse/Abmeldung nutzen den passenden Befehl', () => {
  assert.equal(planRegistrationChange(null, 'registered'), 'insert');
  assert.equal(planRegistrationChange(null, 'interested'), 'insert');
  assert.equal(planRegistrationChange('interested', 'registered'), 'update');
  assert.equal(planRegistrationChange('registered', null), 'delete');
  assert.equal(planRegistrationChange('registered', 'registered'), null);
});

test('Speichern: insert / update (nur status) / delete jeweils mit event_id + user_id', async () => {
  const client = fakeClient({ event_registrations: { error: null } });
  const base = { userId: 'user-1', eventId: 'uuid-e1' };
  await saveRegistration(client, { ...base, current: null, next: 'registered' });
  await saveRegistration(client, { ...base, current: 'interested', next: 'registered' });
  await saveRegistration(client, { ...base, current: 'registered', next: null });
  const [insert, update, remove] = client.calls.map((c) => c.steps);
  assert.deepEqual(insert, [['insert', { event_id: 'uuid-e1', user_id: 'user-1', status: 'registered' }]]);
  assert.deepEqual(update, [['update', { status: 'registered' }], ['eq', 'event_id', 'uuid-e1'], ['eq', 'user_id', 'user-1']]);
  assert.deepEqual(remove, [['delete'], ['eq', 'event_id', 'uuid-e1'], ['eq', 'user_id', 'user-1']]);
});

test('Interesse zählt nicht als Anmeldung, bleibt aber unter "Meine Events" sichtbar', () => {
  const user = { id: 'user-1', registrations: registrationsToMap([{ event_id: 'uuid-e1', status: 'interested' }]) };
  const event = mapDbEvent(row);
  assert.equal(getEventRole(user, event), 'interested');
  assert.equal(getMyEvents(user, [event], new Date('2098-12-01')).upcoming.length, 1);
});

test('Fehler beim Speichern werden verständlichen Texten zugeordnet', () => {
  assert.equal(registrationErrorKey({ code: '42501' }), 'eventDetail.errors.closed');
  assert.equal(registrationErrorKey({ code: '23505' }), 'eventDetail.errors.conflict');
  assert.equal(registrationErrorKey({ code: 'DC008' }), 'eventDetail.errors.full');
  assert.equal(registrationErrorKey({ code: 'DC009' }), 'eventDetail.errors.technical');
  assert.equal(registrationErrorKey({ name: 'TypeError', message: 'Failed to fetch' }), 'eventDetail.errors.network');
  assert.equal(registrationErrorKey({ code: 'XX' }), 'eventDetail.errors.generic');
  assert.equal(registrationErrorKey(null), null);
});
