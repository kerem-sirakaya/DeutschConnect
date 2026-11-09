// Nachhilfe-Börse: reine Regeln + API-Schicht mit NACHGEBAUTEM Supabase-Client
// (keine echte Datenbank). Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  countOpenIncoming,
  filterTutoringEntries,
  hasContactData,
  mapEntryRow,
  mapRequestRow,
  matchTutoring,
  normalizeSubject,
  sortRequests,
  subjectOptions,
  validateRequestMessage,
  validateResponseNote,
  validateTutoringEntry,
} from '../src/lib/tutoring.js';
import {
  createTutoringEntry,
  deleteTutoringEntry,
  fetchTutoringState,
  respondTutoringRequest,
  sendTutoringRequest,
  setTutoringSaved,
  tutoringErrorKey,
  updateTutoringEntry,
} from '../src/lib/tutoringApi.js';
import { demoTutoringEntries, demoTutoringFor } from '../src/data/tutoring.js';

const valid = {
  kind: 'offer',
  subject: 'Mathematik',
  topics: 'Bruchrechnung',
  description: 'Ich erkläre gern Schritt für Schritt.',
  availability: 'Dienstags',
  languages: ['de'],
  format: 'online',
};

const entry = (overrides = {}) => ({
  id: 'e1',
  schoolId: 'ers',
  kind: 'offer',
  subject: 'Mathe',
  topics: 'Gleichungen',
  description: 'Beschreibung',
  availability: 'Montag',
  languages: ['de', 'tr'],
  format: 'online',
  status: 'active',
  isOwn: false,
  isSaved: false,
  ...overrides,
});

// ---------- Kontaktdaten-Erkennung (muss Migration 011 entsprechen) ----------

test('Kontaktdaten: E-Mail, Link und Telefonnummer werden erkannt', () => {
  assert.equal(hasContactData('schreib mir: a.b@example.org'), true);
  assert.equal(hasContactData('siehe https://example.org'), true);
  assert.equal(hasContactData('www.example.org'), true);
  assert.equal(hasContactData('0532 123 45 67'), true);
  assert.equal(hasContactData('+90 (532) 123-45-67'), true);
});

test('Kontaktdaten: Datum, Uhrzeit und Klassenstufe sind erlaubt', () => {
  assert.equal(hasContactData('Am 12.11.2026 von 14:00-16:00 Uhr, Klasse 10'), false);
  assert.equal(hasContactData('Dienstags nach der 8. Stunde'), false);
  assert.equal(hasContactData(''), false);
  assert.equal(hasContactData(null), false);
});

test('Migration 011 nutzt dieselben Muster wie das Frontend', () => {
  const sql = readFileSync(new URL('../supabase/migrations/011_tutoring.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes("'[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}'"));
  assert.ok(sql.includes("'(https?://|www\\.)'"));
  assert.ok(sql.includes("'(\\d[\\s/()-]*){9,}'"));
  // Grenzen identisch
  for (const fragment of ['between 2 and 80', 'between 3 and 200', 'between 20 and 1000', 'between 10 and 600']) {
    assert.ok(sql.includes(fragment), fragment);
  }
});

// ---------- Validierung ----------

test('gültiger Eintrag hat keine Fehler', () => {
  assert.deepEqual(validateTutoringEntry(valid), {});
});

test('Längen, Sprachen, Format und Art werden geprüft', () => {
  const errors = validateTutoringEntry({ ...valid, kind: 'x', subject: 'M', topics: 'ab', description: 'kurz', availability: '', languages: [], format: 'zoom' });
  assert.deepEqual(Object.keys(errors).sort(), ['availability', 'description', 'format', 'kind', 'languages', 'subject', 'topics']);
  assert.equal(validateTutoringEntry({ ...valid, languages: ['fr'] }).languages, 'tutoring.errors.languages');
});

test('Leerzeichen zählen nicht als Inhalt', () => {
  assert.equal(validateTutoringEntry({ ...valid, subject: '   ' }).subject, 'tutoring.errors.subject');
});

test('Kontaktdaten im Eintrag werden abgelehnt', () => {
  assert.equal(validateTutoringEntry({ ...valid, description: 'Ruf an: 0532 123 45 67 bitte' }).description, 'tutoring.errors.contactData');
});

test('Anfrage-Nachricht und Antwortnotiz', () => {
  assert.equal(validateRequestMessage('Hallo!'), 'tutoring.errors.message');
  assert.equal(validateRequestMessage('Hallo, ich hätte Interesse.'), null);
  assert.equal(validateRequestMessage('Mail an x@y.de bitte, danke'), 'tutoring.errors.contactData');
  assert.equal(validateRequestMessage('x'.repeat(601)), 'tutoring.errors.message');
  assert.equal(validateResponseNote(''), null);
  assert.equal(validateResponseNote('x'.repeat(601)), 'tutoring.errors.note');
});

// ---------- Filter, Fächer, Matching ----------

test('Fächer werden sprachübergreifend vereinheitlicht', () => {
  assert.equal(normalizeSubject(' Mathe '), 'math');
  assert.equal(normalizeSubject('Matematik'), 'math');
  assert.equal(normalizeSubject('Bilişim'), 'coding');
  assert.equal(normalizeSubject('Kunst'), 'kunst');
});

test('Tabs: Angebote/Gesuche nur fremde aktive, "Meine" nur eigene', () => {
  const list = [
    entry({ id: 'a' }),
    entry({ id: 'b', kind: 'request' }),
    entry({ id: 'c', isOwn: true }),
    entry({ id: 'd', status: 'closed' }),
    entry({ id: 'e', isSaved: true, status: 'closed' }),
  ];
  assert.deepEqual(filterTutoringEntries(list, 'offers').map((x) => x.id), ['a']);
  assert.deepEqual(filterTutoringEntries(list, 'requests').map((x) => x.id), ['b']);
  assert.deepEqual(filterTutoringEntries(list, 'my').map((x) => x.id), ['c']);
  assert.deepEqual(filterTutoringEntries(list, 'saved').map((x) => x.id), ['e']);
});

test('Filter: Suche, Sprache, Format ("either" passt immer) und Fach', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b', languages: ['en'], format: 'either', subject: 'Physik', topics: 'Optik' })];
  assert.deepEqual(filterTutoringEntries(list, 'offers', { query: 'optik' }).map((x) => x.id), ['b']);
  assert.deepEqual(filterTutoringEntries(list, 'offers', { language: 'tr' }).map((x) => x.id), ['a']);
  assert.deepEqual(filterTutoringEntries(list, 'offers', { format: 'school' }).map((x) => x.id), ['b']);
  assert.deepEqual(filterTutoringEntries(list, 'offers', { subject: 'math' }).map((x) => x.id), ['a']);
});

test('Fach-Optionen ohne Doppelungen', () => {
  const options = subjectOptions([entry({ subject: 'Mathe' }), entry({ subject: 'Mathematik' }), entry({ subject: 'Physik' })]);
  assert.deepEqual(options.map(([key]) => key).sort(), ['math', 'physics']);
});

test('Matching: gegenteilige Art, gleiches Fach, gemeinsame Sprache', () => {
  const mine = entry({ id: 'mine', isOwn: true, kind: 'request', subject: 'Mathe', languages: ['de'] });
  const match = entry({ id: 'match', kind: 'offer', subject: 'Mathematik', languages: ['de'] });
  const wrongLanguage = entry({ id: 'x', kind: 'offer', subject: 'Mathe', languages: ['en'] });
  const sameKind = entry({ id: 'y', kind: 'request', subject: 'Mathe', languages: ['de'] });
  const result = matchTutoring([mine, match, wrongLanguage, sameKind]);
  assert.equal(result.type, 'matches');
  assert.deepEqual(result.entries.map((x) => x.id), ['match']);
});

test('Matching ohne Treffer: fremde aktive Angebote zum Entdecken', () => {
  const result = matchTutoring([entry({ id: 'o' }), entry({ id: 'r', kind: 'request' }), entry({ id: 'c', status: 'closed' })]);
  assert.equal(result.type, 'discover');
  assert.deepEqual(result.entries.map((x) => x.id), ['o']);
});

test('Anfragen: offene zuerst, Zähler nur für eingehende offene', () => {
  const requests = [
    { id: '1', direction: 'incoming', status: 'accepted', createdAt: '2026-11-03' },
    { id: '2', direction: 'incoming', status: 'pending', createdAt: '2026-11-01' },
    { id: '3', direction: 'outgoing', status: 'pending', createdAt: '2026-11-04' },
  ];
  assert.deepEqual(sortRequests(requests).map((r) => r.id), ['3', '2', '1']);
  assert.equal(countOpenIncoming(requests), 1);
});

// ---------- Datenbank-Zeilen ----------

test('Zeilen aus tutoring_list_entries/-requests werden umgewandelt', () => {
  const e = mapEntryRow({ id: 'x', school_id: 'anka', kind: 'request', subject: 'S', topics: 'T', description: 'D', availability: 'A', languages: ['tr'], format: 'school', status: 'active', created_at: 'c', updated_at: 'u', is_own: true, is_saved: false, my_request_status: null, incoming_pending: '2' });
  assert.equal(e.schoolId, 'anka');
  assert.equal(e.isOwn, true);
  assert.equal(e.incomingPending, 2);
  assert.equal(e.isDemo, false);
  const r = mapRequestRow({ id: 'r', entry_id: 'x', direction: 'outgoing', entry_kind: 'offer', entry_subject: 'S', entry_topics: 'T', entry_status: 'active', other_first_name: null, other_school_id: 'ers', message: 'M', status: 'pending', response_note: null, created_at: 'c', responded_at: null });
  assert.equal(r.otherFirstName, null);
  assert.equal(r.direction, 'outgoing');
});

// ---------- Demo-Daten ----------

test('Demo-Einträge sind fiktiv, vollständig übersetzt und als Demo markiert', () => {
  for (const item of demoTutoringEntries) {
    for (const field of ['subject', 'topics', 'description', 'availability']) {
      assert.deepEqual(Object.keys(item[field]).sort(), ['de', 'en', 'tr'], `${item.id}.${field}`);
      for (const text of Object.values(item[field])) assert.equal(hasContactData(text), false);
    }
  }
  const forAlex = demoTutoringFor('alex');
  assert.ok(forAlex.every((x) => x.isDemo));
  assert.ok(forAlex.some((x) => x.isOwn) && forAlex.some((x) => !x.isOwn));
});

// ---------- API-Schicht ----------

function fakeClient(responses = {}) {
  const calls = [];
  const builder = (key, args) => {
    const call = { key, args, steps: [] };
    calls.push(call);
    const b = {
      then(resolve, reject) {
        return Promise.resolve(responses[key] ?? { data: [], error: null }).then(resolve, reject);
      },
    };
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'single']) {
      b[m] = (...a) => {
        call.steps.push([m, ...a]);
        return b;
      };
    }
    return b;
  };
  return { calls, from: (t) => builder(t), rpc: (name, args) => builder(`rpc:${name}`, args) };
}

test('Laden: Einträge und Anfragen über die Datenbank-Funktionen', async () => {
  const client = fakeClient({
    'rpc:tutoring_list_entries': { data: [{ id: 'x', languages: ['de'], is_own: false }], error: null },
    'rpc:tutoring_list_requests': { data: [{ id: 'r', direction: 'incoming' }], error: null },
  });
  const state = await fetchTutoringState(client);
  assert.equal(state.entries[0].id, 'x');
  assert.equal(state.requests[0].direction, 'incoming');
});

test('Anlegen sendet eigene ID + Schule, aber keinen Status', async () => {
  const client = fakeClient({ tutoring_entries: { data: { id: 'new' }, error: null } });
  const id = await createTutoringEntry(client, 'me', 'ers', { ...valid, subject: '  Mathe  ', languages: ['de', 'de'] });
  assert.equal(id, 'new');
  const insert = client.calls[0].steps.find(([m]) => m === 'insert')[1];
  assert.equal(insert.owner_id, 'me');
  assert.equal(insert.school_id, 'ers');
  assert.equal(insert.subject, 'Mathe');
  assert.deepEqual(insert.languages, ['de']);
  assert.equal('status' in insert, false);
});

test('Bearbeiten/Löschen ohne betroffene Zeile = nicht gefunden (RLS)', async () => {
  const client = fakeClient({ tutoring_entries: { data: [], error: null } });
  await assert.rejects(updateTutoringEntry(client, 'foreign', valid), (e) => e.code === 'P0002');
  await assert.rejects(deleteTutoringEntry(client, 'foreign'), (e) => e.code === 'P0002');
});

test('Anfrage senden/beantworten ruft die Funktionen mit bereinigten Werten auf', async () => {
  const client = fakeClient({ 'rpc:tutoring_send_request': { data: 'req-1', error: null } });
  assert.equal(await sendTutoringRequest(client, 'e1', '  Hallo, ich hätte Interesse.  '), 'req-1');
  assert.deepEqual(client.calls[0].args, { p_entry_id: 'e1', p_message: 'Hallo, ich hätte Interesse.' });
  await respondTutoringRequest(client, 'req-1', true, '   ');
  assert.deepEqual(client.calls[1].args, { p_request_id: 'req-1', p_accept: true, p_note: null });
});

test('Merken: doppelt gemerkt (23505) gilt als Erfolg, andere Fehler nicht', async () => {
  await setTutoringSaved(fakeClient({ tutoring_saves: { error: { code: '23505' } } }), 'me', 'e1', true);
  await assert.rejects(setTutoringSaved(fakeClient({ tutoring_saves: { error: { code: '42501' } } }), 'me', 'e1', true));
});

test('Fehlercodes → eigene Meldungen; fehlende Migration wird erkannt', () => {
  assert.equal(tutoringErrorKey({ code: 'PGRST202' }), 'tutoring.errors.notInstalled');
  assert.equal(tutoringErrorKey({ code: '42P01' }), 'tutoring.errors.notInstalled');
  assert.equal(tutoringErrorKey({ code: 'DC011' }), 'tutoring.errors.inactive');
  assert.equal(tutoringErrorKey({ code: 'DC012' }), 'tutoring.errors.own');
  assert.equal(tutoringErrorKey({ code: 'DC013' }), 'tutoring.errors.duplicate');
  assert.equal(tutoringErrorKey({ code: 'DC014' }), 'tutoring.errors.transition');
  assert.equal(tutoringErrorKey({ code: '23514' }), 'tutoring.errors.rejectedByServer');
  assert.equal(tutoringErrorKey({ code: 'whatever' }), 'tutoring.errors.generic');
});
