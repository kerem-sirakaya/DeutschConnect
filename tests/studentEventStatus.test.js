// Prüft Status-Filter und Status-Anzeige für Schüler:innen (Events-Seite, Meine Events,
// Startseite, Schulseite, Detailseite). Keine echte Datenbank. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVENT_STATUS_FILTERS,
  countEventsByStatusFilter,
  filterEvents,
  getEventRecommendations,
  getEventRole,
  getMyEvents,
  isListed,
  matchesStatusFilter,
} from '../src/lib/selectors.js';
import { visibleToStudents } from '../src/lib/eventArchive.js';
import { fetchMyRegistrations, registrationsToMap } from '../src/lib/eventsApi.js';
import { changeEventStatus } from '../src/lib/adminEvents.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const NOW = new Date('2026-11-08T10:00:00Z');
const ids = (list) => list.map((event) => event.id);

const ev = (id, status, start, extra = {}) => ({
  id,
  title: { de: `Event ${id}` },
  summary: '',
  location: 'ERS',
  start,
  durationMinutes: 90,
  topics: ['languages'],
  format: 'meetup',
  schoolIds: ['ers', 'anka'],
  status,
  cancelledAt: null,
  archivedAt: null,
  organizerIds: [],
  ...extra,
});

const planned = ev('plan', 'planned', '2026-11-12T14:00:00+03:00');
const confirmed = ev('conf', 'confirmed', '2026-11-20T14:00:00+03:00', { topics: ['science'] });
const cancelledFuture = ev('canc', 'cancelled', '2026-11-15T14:00:00+03:00', { cancelledAt: '2026-11-08T08:00:00Z' });
// Abgesagt vor 2 h, ursprüngliches Datum gestern -> noch sichtbar (24 h ab Absage)
const cancelledPastDate = ev('canc-past', 'cancelled', '2026-11-07T14:00:00+03:00', { cancelledAt: '2026-11-08T08:00:00Z' });
// Abgesagt vor 2 Tagen -> archiviert (für Schüler:innen weg)
const cancelledOld = ev('canc-old', 'cancelled', '2026-11-30T14:00:00+03:00', { cancelledAt: '2026-11-06T08:00:00Z' });
const archivedByDb = ev('arch', 'planned', '2026-12-01T14:00:00+03:00', { archivedAt: '2026-11-08T09:07:00Z' });
const completedRecent = ev('done', 'completed', '2026-11-08T08:00:00+03:00'); // Ende vor ~3,5 h
const all = [planned, confirmed, cancelledFuture, cancelledPastDate, cancelledOld, archivedByDb, completedRecent];

/** Wie AppStateContext: zuerst archivierte Events ausblenden */
const studentEvents = visibleToStudents(all, NOW);

const student = (registrations = {}) => ({
  id: 'student-b', schoolId: 'ers', interests: ['languages', 'science'], registrations,
  supportedIdeas: [], projectInterest: [], invitations: [], dismissedUpdates: [],
});

// ---------------------------------------------------------------------------
// 1–5: Filter Alle | Geplant | Abgesagt
// ---------------------------------------------------------------------------

test('1) drei Status-Filter: Alle, Geplant, Abgesagt', () => {
  assert.deepEqual(EVENT_STATUS_FILTERS, ['all', 'scheduled', 'cancelled']);
  const page = read('src', 'pages', 'EventsPage.jsx');
  for (const value of ['all', 'scheduled', 'cancelled']) assert.ok(page.includes(`value: '${value}'`), value);
  assert.match(page, /aria-pressed=\{status === option\.value\}/);
  assert.match(page, /onClick=\{\(\) => setFilter\('status', option\.value\)\}/, 'Wechsel über die Adresse, ohne Neuladen');
});

test('2+3) planned UND confirmed erscheinen unter "Geplant"', () => {
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'scheduled' }, NOW)), ['plan', 'conf']);
  assert.equal(matchesStatusFilter(planned, 'scheduled'), true);
  assert.equal(matchesStatusFilter(confirmed, 'scheduled'), true);
});

test('4) cancelled erscheint unter "Abgesagt" – auch mit vergangenem Original-Datum, solange sichtbar', () => {
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'cancelled' }, NOW)), ['canc-past', 'canc']);
  // Zeitraum "7 Tage": nur künftige Absagen im Zeitfenster
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'cancelled', timeframe: 'week' }, NOW)), ['canc']);
  // Zeitraum "Vergangen": Absagen mit vergangenem Datum
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'cancelled', timeframe: 'past' }, NOW)), ['canc-past']);
});

test('5) abgesagte Events erscheinen NIE unter "Geplant" und nie als normale Events', () => {
  const scheduled = ids(filterEvents(studentEvents, { status: 'scheduled' }, NOW));
  for (const id of ['canc', 'canc-past']) assert.ok(!scheduled.includes(id));
  assert.equal(matchesStatusFilter(cancelledFuture, 'scheduled'), false);
  // Karte: eigene rote Darstellung + Hinweis
  const card = read('src', 'components', 'EventCard.jsx');
  assert.match(card, /event-card--cancelled/);
  assert.match(card, /events\.card\.cancelledOn/);
  assert.match(card, /events\.card\.cancelled'/);
  assert.match(card, /<StatusBadge type="event" status=\{event\.status\} \/>/);
  assert.match(read('src', 'components', 'Badges.jsx'), /cancelled: 'danger'/);
});

test('"Alle" bleibt wie bisher (bevorstehende inkl. abgesagter mit künftigem Datum)', () => {
  assert.deepEqual(ids(filterEvents(studentEvents, {}, NOW)), ids(filterEvents(studentEvents, { status: 'all' }, NOW)));
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'all' }, NOW)), ['plan', 'canc', 'conf']);
  // unbekannter Status -> "Alle"
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'quatsch' }, NOW)), ['plan', 'canc', 'conf']);
});

// ---------------------------------------------------------------------------
// 6: Keine Anmeldung zu abgesagten Events
// ---------------------------------------------------------------------------

test('6) abgesagte Events: keine Anmelde-Knöpfe, Datenbank lehnt zusätzlich ab', () => {
  const detail = read('src', 'pages', 'EventDetailPage.jsx');
  // Alle Anmelde-/Interesse-Knöpfe stehen nur im Zweig "!past && !cancelled"
  assert.match(detail, /\{!past && !cancelled && role !== 'organizer' && !closedForNew && \(/);
  const buttons = detail.indexOf("t('eventDetail.register')");
  assert.ok(detail.lastIndexOf('!past && !cancelled && role !== \'organizer\' && !closedForNew', buttons) > 0);
  // abgesagt zählt nicht als "bevorstehend" für Empfehlungen
  assert.ok(!ids(getEventRecommendations(student(), studentEvents, NOW).map((rec) => rec.event)).includes('canc'));
  // Datenbank (Migration 006): Anmelde-Trigger erlaubt nur planned/confirmed
  assert.match(read('supabase', 'migrations', '006_admin_events_ideas.sql'), /ev_status not in \('planned', 'confirmed'\)/);
});

// ---------------------------------------------------------------------------
// 7–10: Meine Events – Event-Status getrennt von der eigenen Anmeldung
// ---------------------------------------------------------------------------

test('7) angemeldete Schüler:in sieht in "Meine" den AKTUELLEN Event-Status', () => {
  const user = student({ plan: 'registered', conf: 'registered', canc: 'registered' });
  const mine = getMyEvents(user, studentEvents, NOW);
  assert.deepEqual(ids(mine.upcoming), ['plan', 'canc', 'conf']);
  assert.deepEqual(mine.upcoming.map((event) => event.status), ['planned', 'cancelled', 'confirmed']);
  for (const event of mine.upcoming) assert.equal(getEventRole(user, event), 'registered');
});

test('8) abgesagtes Event bleibt in "Meine" sichtbar, solange es nicht archiviert ist', () => {
  const user = student({ canc: 'registered', 'canc-past': 'registered', 'canc-old': 'registered' });
  const mine = getMyEvents(user, studentEvents, NOW);
  assert.ok(ids(mine.upcoming).includes('canc'), 'künftiges Datum -> bevorstehend');
  assert.ok(ids(mine.past).includes('canc-past'), 'vergangenes Datum -> unter "Vergangen"');
  assert.ok(![...ids(mine.upcoming), ...ids(mine.past)].includes('canc-old'), 'nach 24 h archiviert -> weg');
});

test('9) Event-Status und eigene Teilnahme werden GETRENNT angezeigt', () => {
  const card = read('src', 'components', 'EventCard.jsx');
  // Status immer, Rolle zusätzlich (früher ersetzte die Rolle den Status)
  assert.match(card, /<StatusBadge type="event" status=\{event\.status\} \/>/);
  assert.match(card, /\{role && \(\s*<span className="event-card__state">[\s\S]*?<RoleBadge role=\{role\} \/>/);
  assert.doesNotMatch(card, /role \? <RoleBadge/, 'Rolle ersetzt den Status nicht mehr');
  assert.match(card, /events\.card\.eventStatus/);
  assert.match(card, /events\.card\.yourStatus/);
  const detail = read('src', 'pages', 'EventDetailPage.jsx');
  assert.match(detail, /eventDetail\.cancelledRegistrationKept/);
  assert.match(detail, /eventDetail\.cancelledOn/);
});

test('10) Absagen löscht keine Anmeldungen (nur admin_set_event_status, Anmeldungen unverändert)', async () => {
  const calls = [];
  const client = {
    async rpc(name, args) { calls.push(name); return { data: null, error: null }; },
    from(table) { throw new Error(`kein direkter Zugriff auf ${table}`); },
  };
  const registrations = { plan: 'registered' };
  const user = student(registrations);
  const { events } = await changeEventStatus(client, [planned], 'plan', 'cancelled');
  assert.deepEqual(calls, ['admin_set_event_status']);
  assert.deepEqual(registrations, { plan: 'registered' });
  assert.equal(getEventRole(user, events[0]), 'registered');
  assert.equal(events[0].status, 'cancelled');
  // Datenbank: Absagen ändert nur events.status / cancelled_at (Migration 008), kein DELETE
  assert.doesNotMatch(read('supabase', 'migrations', '008_event_archiving.sql').replace(/--.*$/gm, ''), /delete from public\.event_registrations/i);
});

// ---------------------------------------------------------------------------
// 11–12: Archivierte Events überall weg – auch beim Filterwechsel
// ---------------------------------------------------------------------------

test('11) archivierte Events erscheinen in keinem Bereich für Schüler:innen', () => {
  const user = student({ arch: 'registered', 'canc-old': 'registered' });
  const hidden = ['arch', 'canc-old'];
  const areas = {
    alle: filterEvents(studentEvents, {}, NOW),
    vergangen: filterEvents(studentEvents, { timeframe: 'past' }, NOW),
    meineBevorstehend: getMyEvents(user, studentEvents, NOW).upcoming,
    meineVergangen: getMyEvents(user, studentEvents, NOW).past,
    schule: studentEvents.filter((e) => e.schoolIds.includes('ers') && isListed(e, NOW)),
    empfehlungen: getEventRecommendations(user, studentEvents, NOW).map((rec) => rec.event),
  };
  for (const [area, list] of Object.entries(areas)) {
    for (const id of hidden) assert.ok(!ids(list).includes(id), `${id} in ${area}`);
  }
  // Ausblenden passiert zentral (AppStateContext), auch für die Detailseite (getEvent)
  // (seit dem Ausblenden von Anka Bilim: archiviert wird ZUERST entfernt, danach Schul-Filter mit Ausnahme für
  // eigene Anmeldungen – archivierte Events kommen dadurch nie zurück)
  const appState = read('src', 'state', 'AppStateContext.jsx');
  assert.match(appState, /const studentEvents = visibleToStudents\(accountEvents\.events, now\);/);
  assert.match(appState, /const events = visibleOrOwn\(studentEvents, /);
});

test('12) Filterwechsel holt archivierte Events nicht zurück', () => {
  for (const status of EVENT_STATUS_FILTERS) {
    for (const timeframe of ['upcoming', 'week', 'month', 'past']) {
      const list = ids(filterEvents(studentEvents, { status, timeframe }, NOW));
      assert.ok(!list.includes('arch') && !list.includes('canc-old'), `${status}/${timeframe}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 13: Bestehende Filter wirken zusammen
// ---------------------------------------------------------------------------

test('13) Status-Filter wirkt zusammen mit Suche, Schule, Thema, Format und Zeitraum', () => {
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'scheduled', topic: 'science' }, NOW)), ['conf']);
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'scheduled', schoolId: 'unbekannt' }, NOW)), []);
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'scheduled', query: 'conf' }, NOW)), ['conf']);
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'scheduled', format: 'workshop' }, NOW)), []);
  assert.deepEqual(ids(filterEvents(studentEvents, { status: 'scheduled', timeframe: 'week' }, NOW)), ['plan']);
});

test('Zahlen je Status kommen aus den sichtbaren Events und denselben übrigen Filtern', () => {
  assert.deepEqual(countEventsByStatusFilter(studentEvents, {}, NOW), { all: 3, scheduled: 2, cancelled: 2 });
  assert.deepEqual(countEventsByStatusFilter(studentEvents, { topic: 'science' }, NOW), { all: 1, scheduled: 1, cancelled: 0 });
  assert.deepEqual(countEventsByStatusFilter([], {}, NOW), { all: 0, scheduled: 0, cancelled: 0 });
  const page = read('src', 'pages', 'EventsPage.jsx');
  assert.match(page, /countEventsByStatusFilter\(events, baseFilters, now\)/);
});

// ---------------------------------------------------------------------------
// 14: Startseite und Schulseite nutzen dieselbe Karte mit Status
// ---------------------------------------------------------------------------

test('14) Startseite und Eventliste zeigen Events über EventCard (Status immer sichtbar)', () => {
  for (const page of ['HomePage.jsx', 'EventsPage.jsx']) {
    assert.match(read('src', 'pages', page), /<EventCard\b/, page);
  }
});

// ---------------------------------------------------------------------------
// 15: Leerzustände
// ---------------------------------------------------------------------------

test('15) Leerzustand für "Abgesagt": eigener Hinweis', () => {
  const page = read('src', 'pages', 'EventsPage.jsx');
  assert.match(page, /status === 'cancelled' \? 'events\.noCancelledTitle' : 'events\.noResultsTitle'/);
  assert.deepEqual(filterEvents([planned], { status: 'cancelled' }, NOW), []);
  const de = JSON.parse(read('src', 'locales', 'de.json'));
  assert.equal(de.events.noCancelledTitle, 'Zurzeit gibt es keine abgesagten Events.');
});

// ---------------------------------------------------------------------------
// 16: Übersetzungen
// ---------------------------------------------------------------------------

test('16) alle neuen Texte existieren in de, tr und en', () => {
  const keys = [
    'events.statusFilter.label', 'events.statusFilter.all', 'events.statusFilter.scheduled', 'events.statusFilter.cancelled',
    'events.noCancelledTitle', 'events.noCancelledText',
    'events.card.eventStatus', 'events.card.eventStatusSr', 'events.card.yourStatus', 'events.card.yourStatusSr',
    'events.card.cancelled', 'events.card.cancelledOn',
    'eventDetail.cancelledNote', 'eventDetail.cancelledOn', 'eventDetail.cancelledRegistrationKept',
    'status.event.planned', 'status.event.confirmed', 'status.event.cancelled', 'roles.registered',
  ];
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(read('src', 'locales', `${lang}.json`));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key}`);
      assert.ok(value.trim().length > 0);
    }
    for (const key of ['events.card.cancelledOn', 'eventDetail.cancelledOn']) {
      assert.match(key.split('.').reduce((node, part) => node[part], dict), /\{date\}/, `${lang}: ${key}`);
    }
    assert.match(dict.eventDetail.cancelledRegistrationKept, /\{role\}/);
  }
  const de = JSON.parse(read('src', 'locales', 'de.json'));
  assert.equal(de.status.event.planned, 'Geplant');
  assert.equal(de.status.event.confirmed, 'Bestätigt');
  assert.equal(de.status.event.cancelled, 'Abgesagt');
  assert.equal(de.roles.registered, 'Angemeldet');
  assert.equal(de.eventDetail.cancelledNote, 'Dieses Event wurde abgesagt.');
});

// ---------------------------------------------------------------------------
// 17–18: Datenschutz und bestehende Funktionen
// ---------------------------------------------------------------------------

test('17) nur die EIGENEN Anmeldungen werden geladen (user_id-Filter + RLS)', async () => {
  const steps = [];
  const client = {
    from(table) {
      const builder = {
        select(columns) { steps.push(['select', table, columns]); return builder; },
        eq(column, value) { steps.push(['eq', column, value]); return Promise.resolve({ data: [{ event_id: 'plan', status: 'registered' }], error: null }); },
      };
      return builder;
    },
  };
  const map = await fetchMyRegistrations(client, 'student-b');
  assert.deepEqual(steps, [['select', 'event_registrations', 'event_id, status'], ['eq', 'user_id', 'student-b']]);
  assert.deepEqual(map, { plan: 'registered' });
  // RLS (001): nur eigene Zeilen lesbar
  assert.match(
    read('supabase', 'migrations', '001_initial_schema.sql'),
    /create policy "registrations: eigene lesen"\s+on public\.event_registrations for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\);/,
  );
});

test('18) bestehende Anmelde-Logik unverändert: registered/interested, keine anderen Werte', () => {
  assert.deepEqual(registrationsToMap([
    { event_id: 'a', status: 'registered' },
    { event_id: 'b', status: 'interested' },
    { event_id: 'c', status: 'unbekannt' },
  ]), { a: 'registered', b: 'interested' });
  const detail = read('src', 'pages', 'EventDetailPage.jsx');
  // seit den Erfolgsmeldungen: Knopf -> saveRole(...) -> actions.setRegistration(event.id, next)
  assert.match(detail, /saveRole\(role === 'registered' \? null : 'registered'\)/);
  assert.match(detail, /await actions\.setRegistration\(event\.id, next\)/);
});
