// Prüft die Aufteilung der Admin-Events in Spalten (Geplant | Abgesagt) und Zusatz-Gruppen.
// Nachgebauter Supabase-Client, keine echte Datenbank. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVENT_FILTERS,
  EVENT_GROUPS,
  changeEventStatus,
  countEventsByStatus,
  eventGroupOf,
  filterEvents,
  groupEventsForFilter,
  loadAdminEvents,
  removeEvent,
} from '../src/lib/adminEvents.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

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
  id, title: { de: id }, summary: null, description: null, location: 'ERS', audience: null,
  start_at: '2026-12-01T11:00:00Z', duration_minutes: 60, capacity: 20, online: false, topics: [],
  format: 'meetup', host_school_id: 'ers', school_ids: ['ers'], status,
  created_at: '2026-11-01T10:00:00Z', registered_count: 2, interested_count: 1,
  cancelled_at: status === 'cancelled' ? '2026-11-07T09:00:00Z' : null, archived_at: null, ...extra,
});

const rows = [
  row('p1', 'planned'),
  row('p2', 'planned'),
  row('k1', 'confirmed'),
  row('c1', 'cancelled'),
  row('d1', 'draft', { registered_count: 0, interested_count: 0 }),
  row('done1', 'completed'),
  row('arch-c', 'cancelled', { archived_at: '2026-11-08T09:07:00Z' }),
  row('arch-done', 'completed', { archived_at: '2026-11-03T09:07:00Z' }),
  row('arch-p', 'planned', { archived_at: '2026-11-05T09:07:00Z' }), // vorbei, nie abgeschlossen
];

async function loaded() {
  const { events } = await loadAdminEvents(fakeClient({ admin_list_events: { data: rows, error: null } }));
  return events;
}
const groupIds = (groups, key) => groups.find((group) => group.key === key)?.events.map((event) => event.id) ?? null;

// ---------------------------------------------------------------------------
// 1–6: Welche Events stehen in welcher Spalte?
// ---------------------------------------------------------------------------

test('1+2) geplante UND bestätigte Events stehen in "Geplante Events"', async () => {
  const groups = groupEventsForFilter(await loaded(), 'all');
  assert.deepEqual(groupIds(groups, 'planned'), ['p1', 'p2', 'k1']);
});

test('3) abgesagte (nicht archivierte) Events stehen in "Abgesagte Events"', async () => {
  const groups = groupEventsForFilter(await loaded(), 'all');
  assert.deepEqual(groupIds(groups, 'cancelled'), ['c1']);
});

test('4+5) abgeschlossene Events und Entwürfe stehen in KEINER der beiden Spalten', async () => {
  const groups = groupEventsForFilter(await loaded(), 'all');
  const columns = groups.filter((group) => group.column).flatMap((group) => group.events.map((event) => event.id));
  for (const id of ['done1', 'd1', 'arch-done']) assert.ok(!columns.includes(id), id);
  // ... aber sie bleiben unter "Alle" erreichbar
  assert.deepEqual(groupIds(groups, 'draft'), ['d1']);
  assert.deepEqual(groupIds(groups, 'completed'), ['done1']);
});

test('6) archivierte Events sind nicht in den Spalten – egal welcher Status', async () => {
  const groups = groupEventsForFilter(await loaded(), 'all');
  const columns = groups.filter((group) => group.column).flatMap((group) => group.events.map((event) => event.id));
  for (const id of ['arch-c', 'arch-done', 'arch-p']) assert.ok(!columns.includes(id), id);
  assert.equal(eventGroupOf({ status: 'cancelled', archivedAt: '2026-11-08T09:07:00Z' }), 'archived');
  assert.equal(eventGroupOf({ status: 'planned', archivedAt: '2026-11-08T09:07:00Z' }), 'archived');
});

test('ohne Migration 008 (kein archived_at): nichts gilt als archiviert, Spalten funktionieren', () => {
  const events = [
    { id: 'a', status: 'cancelled' },
    { id: 'b', status: 'planned', archivedAt: null },
    { id: 'c', status: 'confirmed', archivedAt: undefined },
  ];
  const groups = groupEventsForFilter(events, 'all');
  assert.deepEqual(groupIds(groups, 'planned'), ['b', 'c']);
  assert.deepEqual(groupIds(groups, 'cancelled'), ['a']);
  assert.deepEqual(groupIds(groups, 'archived'), []);
});

// ---------------------------------------------------------------------------
// 7–10: Archiv-Filter, keine Doppelungen, Zahlen, bestehende Filter
// ---------------------------------------------------------------------------

test('7) Filter "Archiviert" zeigt alle archivierten Events (Status bleibt erhalten)', async () => {
  const groups = groupEventsForFilter(await loaded(), 'archived');
  assert.deepEqual(groups.map((group) => group.key), ['archived']);
  assert.deepEqual(groupIds(groups, 'archived'), ['arch-c', 'arch-done', 'arch-p']);
  assert.deepEqual(groups[0].events.map((event) => event.status), ['cancelled', 'completed', 'planned']);
});

test('8) kein Event erscheint doppelt – in KEINEM Filter; unter "Alle" erscheint jedes genau einmal', async () => {
  const events = await loaded();
  for (const filter of EVENT_FILTERS) {
    const ids = groupEventsForFilter(events, filter).flatMap((group) => group.events.map((event) => event.id));
    assert.equal(new Set(ids).size, ids.length, `Filter ${filter}`);
  }
  const all = groupEventsForFilter(events, 'all').flatMap((group) => group.events.map((event) => event.id)).sort();
  assert.deepEqual(all, events.map((event) => event.id).sort(), 'unter "Alle" fehlt nichts');
});

test('9) Zahlen der Spalten stimmen', async () => {
  const groups = groupEventsForFilter(await loaded(), 'all');
  const count = (key) => groups.find((group) => group.key === key).events.length;
  assert.equal(count('planned'), 3);
  assert.equal(count('cancelled'), 1);
  assert.equal(count('draft'), 1);
  assert.equal(count('completed'), 1);
  assert.equal(count('archived'), 3);
});

test('10) bestehende Filter: gleiche Events wie bisher, nur in Gruppen aufgeteilt', async () => {
  const events = await loaded();
  const flat = (filter) => groupEventsForFilter(events, filter).flatMap((group) => group.events.map((event) => event.id)).sort();
  for (const filter of EVENT_FILTERS) {
    assert.deepEqual(flat(filter), filterEvents(events, filter).map((event) => event.id).sort(), `Filter ${filter}`);
  }
  // "Geplant" -> Spalte Geplant (+ archivierte geplante darunter), keine Abgesagt-Spalte
  assert.deepEqual(groupEventsForFilter(events, 'planned').map((group) => group.key), ['planned', 'archived']);
  assert.deepEqual(groupIds(groupEventsForFilter(events, 'planned'), 'planned'), ['p1', 'p2']);
  assert.deepEqual(groupIds(groupEventsForFilter(events, 'confirmed'), 'planned'), ['k1']);
  // "Abgesagt" -> Spalte Abgesagt (+ archivierte abgesagte darunter)
  assert.deepEqual(groupEventsForFilter(events, 'cancelled').map((group) => group.key), ['cancelled', 'archived']);
  assert.deepEqual(groupIds(groupEventsForFilter(events, 'cancelled'), 'cancelled'), ['c1']);
  assert.deepEqual(groupIds(groupEventsForFilter(events, 'cancelled'), 'archived'), ['arch-c']);
  // Unbekannter Filter -> "Alle"
  assert.deepEqual(groupEventsForFilter(events, 'quatsch').map((group) => group.key), ['planned', 'cancelled', 'draft', 'completed', 'archived']);
  // Filter-Chips zählen weiterhin nach Status bzw. Archiv
  const counts = countEventsByStatus(events);
  assert.equal(counts.cancelled, 2);
  assert.equal(counts.archived, 3);
});

// ---------------------------------------------------------------------------
// 11: Statuswechsel verschieben ein Event in die richtige Spalte
// ---------------------------------------------------------------------------

test('11) Absagen verschiebt von "Geplant" nach "Abgesagt", Zahlen passen sich an', async () => {
  const events = await loaded();
  const before = groupEventsForFilter(events, 'all');
  assert.equal(before.find((g) => g.key === 'planned').events.length, 3);
  const { events: after, errorKey } = await changeEventStatus(fakeClient(), events, 'p1', 'cancelled');
  assert.equal(errorKey, null);
  const groups = groupEventsForFilter(after, 'all');
  assert.deepEqual(groupIds(groups, 'planned'), ['p2', 'k1']);
  assert.deepEqual(groupIds(groups, 'cancelled'), ['p1', 'c1']);
});

test('11) Veröffentlichen verschiebt einen Entwurf nach "Geplant"; Abschließen entfernt aus den Spalten', async () => {
  const events = await loaded();
  const published = (await changeEventStatus(fakeClient(), events, 'd1', 'planned')).events;
  assert.ok(groupIds(groupEventsForFilter(published, 'all'), 'planned').includes('d1'));
  assert.ok(!groupIds(groupEventsForFilter(published, 'all'), 'draft').includes('d1'));
  const confirmed = (await changeEventStatus(fakeClient(), published, 'p2', 'confirmed')).events;
  assert.ok(groupIds(groupEventsForFilter(confirmed, 'all'), 'planned').includes('p2'), 'bestätigt bleibt in "Geplant"');
  const completed = (await changeEventStatus(fakeClient(), confirmed, 'k1', 'completed')).events;
  const groups = groupEventsForFilter(completed, 'all');
  assert.ok(!groupIds(groups, 'planned').includes('k1'));
  assert.ok(groupIds(groups, 'completed').includes('k1'));
});

test('11) archiviert (nach Neuladen mit archived_at) verlässt die Spalte "Abgesagt"', async () => {
  const events = await loaded();
  const archivedNow = events.map((event) => (event.id === 'c1' ? { ...event, archivedAt: '2026-11-08T10:07:00Z' } : event));
  const groups = groupEventsForFilter(archivedNow, 'all');
  assert.deepEqual(groupIds(groups, 'cancelled'), []);
  assert.ok(groupIds(groups, 'archived').includes('c1'));
});

test('11) Fehlgeschlagener Statuswechsel ändert keine Spalte', async () => {
  const events = await loaded();
  const result = await changeEventStatus(fakeClient({ admin_set_event_status: { data: null, error: { code: 'DC004' } } }), events, 'p1', 'cancelled');
  assert.equal(result.events, events);
  assert.deepEqual(groupIds(groupEventsForFilter(result.events, 'all'), 'planned'), ['p1', 'p2', 'k1']);
});

// ---------------------------------------------------------------------------
// 12: Leerzustände und Layout
// ---------------------------------------------------------------------------

test('12) beide Spalten erscheinen auch leer – mit eigenem Hinweis; Zusatz-Gruppen nur mit Inhalt', () => {
  const groups = groupEventsForFilter([{ id: 'x', status: 'completed' }], 'all');
  const planned = groups.find((g) => g.key === 'planned');
  const cancelled = groups.find((g) => g.key === 'cancelled');
  assert.equal(planned.alwaysShow, true);
  assert.equal(cancelled.alwaysShow, true);
  assert.equal(planned.emptyKey, 'admin.events.groups.planned.empty');
  assert.equal(cancelled.emptyKey, 'admin.events.groups.cancelled.empty');
  assert.equal(groups.find((g) => g.key === 'draft').alwaysShow, false);
  // Einzige Gruppe eines Filters erscheint auch leer
  assert.equal(groupEventsForFilter([], 'archived')[0].alwaysShow, true);
});

test('12) Layout: zwei gleich breite Spalten, auf schmalen Bildschirmen untereinander, kein Überlauf', () => {
  const css = read('src', 'styles', 'pages.css');
  assert.match(css, /\.admin-event-columns \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 340px\), 1fr\)\);/);
  assert.match(css, /\.admin-event-group \{[^}]*min-width: 0;/);
  const page = read('src', 'pages', 'admin', 'AdminEventsPage.jsx');
  assert.match(page, /admin-event-columns--single/);
  assert.match(page, /<EventGroup key=\{group\.key\} group=\{group\} renderCard=\{renderCard\} \/>/);
  // Anzahl in jeder Überschrift sichtbar
  assert.match(page, /admin-event-group__count/);
});

// ---------------------------------------------------------------------------
// 13: Bestehende Funktionen bleiben erhalten
// ---------------------------------------------------------------------------

test('13) Karte bleibt AdminEventCard mit allen Aktionen; Löschen von Entwürfen funktioniert weiter', async () => {
  const page = read('src', 'pages', 'admin', 'AdminEventsPage.jsx');
  assert.match(page, /<AdminEventCard\s/);
  assert.match(page, /onConfirm=\{confirm\}/);
  assert.match(page, /removeEvent\(supabase, list\.events, eventId\)/);
  assert.match(page, /changeEventStatus\(supabase, list\.events, eventId, to\)/);
  assert.doesNotMatch(page, /\.from\(|draggable|onDrop/);
  const events = await loaded();
  const { events: after, errorKey } = await removeEvent(fakeClient(), events, 'd1');
  assert.equal(errorKey, null);
  assert.equal(groupIds(groupEventsForFilter(after, 'all'), 'draft').length, 0);
});

test('13) abgesagte Karte zeigt Absage-Datum (falls vorhanden) und rotes Badge', () => {
  const card = read('src', 'components', 'admin', 'AdminEventCard.jsx');
  assert.match(card, /event\.status === 'cancelled'/);
  assert.match(card, /admin\.events\.cancelledOn/);
  assert.match(card, /admin\.events\.cancelledNote/);
  assert.match(card, /<StatusBadge type="event" status=\{event\.status\} \/>/);
  assert.match(read('src', 'components', 'Badges.jsx'), /cancelled: 'danger'/);
});

// ---------------------------------------------------------------------------
// Übersetzungen
// ---------------------------------------------------------------------------

test('Texte der Spalten existieren in de, tr und en', () => {
  const keys = [
    ...EVENT_GROUPS.flatMap((group) => [group.titleKey, group.emptyKey]),
    'admin.events.groupCount_one',
    'admin.events.groupCount_other',
    'admin.events.cancelledOn',
    'admin.events.cancelledNote',
  ];
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(read('src', 'locales', `${lang}.json`));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key}`);
      assert.ok(value.trim().length > 0);
    }
  }
  const de = JSON.parse(read('src', 'locales', 'de.json')).admin.events.groups;
  assert.equal(de.planned.title, 'Geplante Events');
  assert.equal(de.cancelled.title, 'Abgesagte Events');
  assert.equal(de.planned.empty, 'Keine geplanten Events vorhanden.');
  assert.equal(de.cancelled.empty, 'Keine abgesagten Events vorhanden.');
});
