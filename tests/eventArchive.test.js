// Prüft die automatische Archivierung von Events (Frontend-Regeln + Migration 008/009).
// Es wird KEINE Datenbank angesprochen und KEIN SQL ausgeführt. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARCHIVE_DELAY_MS,
  eventEndsAt,
  isArchivedForStudents,
  studentArchiveDueAt,
  visibleToStudents,
} from '../src/lib/eventArchive.js';
import { EVENT_COLUMNS, EVENT_COLUMNS_BASE, fetchEvents, mapDbEvent } from '../src/lib/eventsApi.js';
import { mapAdminEvent } from '../src/lib/adminApi.js';
import { countEventsByStatus, filterEvents, loadAdminEvents } from '../src/lib/adminEvents.js';
import { getEventRole, getMyEvents } from '../src/lib/selectors.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const H = 60 * 60 * 1000;
const at = (iso) => new Date(iso);

const ev = (id, status, start, extra = {}) => ({
  id,
  title: { de: `Event ${id}` },
  summary: '',
  location: 'ERS',
  start,
  durationMinutes: 90,
  topics: ['languages'],
  format: 'meetup',
  schoolIds: ['ers'],
  status,
  cancelledAt: null,
  archivedAt: null,
  organizerIds: [],
  ...extra,
});

// ---------------------------------------------------------------------------
// Ende eines Events
// ---------------------------------------------------------------------------

test('Ende = Start + Dauer', () => {
  assert.equal(eventEndsAt(ev('a', 'planned', '2026-12-01T14:00:00+03:00')), at('2026-12-01T15:30:00+03:00').getTime());
});

test('ohne Dauer: Mitternacht nach dem Starttag in Ankara (unabhängig von der Browser-Zeitzone)', () => {
  const noDuration = (start) => ev('a', 'planned', start, { durationMinutes: null });
  assert.equal(eventEndsAt(noDuration('2026-12-01T14:00:00+03:00')), at('2026-12-02T00:00:00+03:00').getTime());
  // 23:30 Ankara = 20:30 UTC – trotzdem Ende am Ankara-Tag
  assert.equal(eventEndsAt(noDuration('2026-12-01T20:30:00Z')), at('2026-12-02T00:00:00+03:00').getTime());
  // 01:00 Ankara = 22:00 UTC am VORtag – Ende ist Mitternacht nach dem Ankara-Tag
  assert.equal(eventEndsAt(noDuration('2026-11-30T22:00:00Z')), at('2026-12-02T00:00:00+03:00').getTime());
  assert.equal(eventEndsAt({ start: null }), null);
});

// ---------------------------------------------------------------------------
// 1 + 2: Abgesagte Events
// ---------------------------------------------------------------------------

const cancelled = ev('c', 'cancelled', '2026-12-20T14:00:00+03:00', { cancelledAt: '2026-11-08T10:00:00Z' });

test('1) abgesagtes Event bleibt vor Ablauf von 24 Stunden sichtbar', () => {
  assert.equal(isArchivedForStudents(cancelled, at('2026-11-08T10:00:00Z')), false);
  assert.equal(isArchivedForStudents(cancelled, at('2026-11-09T09:59:59Z')), false);
  assert.deepEqual(visibleToStudents([cancelled], at('2026-11-09T09:00:00Z')).map((e) => e.id), ['c']);
});

test('2) abgesagtes Event ist nach 24 Stunden archiviert – auch wenn sein Datum noch in der Zukunft liegt', () => {
  assert.equal(studentArchiveDueAt(cancelled), at('2026-11-09T10:00:00Z').getTime());
  assert.equal(isArchivedForStudents(cancelled, at('2026-11-09T10:00:00Z')), true);
  assert.deepEqual(visibleToStudents([cancelled], at('2026-11-10T00:00:00Z')), []);
});

test('abgesagt ohne bekannten Zeitpunkt (vor Migration 008): bleibt sichtbar, bis die Datenbank archiviert', () => {
  const legacy = { ...cancelled, cancelledAt: null };
  assert.equal(studentArchiveDueAt(legacy), null);
  assert.equal(isArchivedForStudents(legacy, at('2030-01-01T00:00:00Z')), false);
});

// ---------------------------------------------------------------------------
// 3 + 4: Beendete Events
// ---------------------------------------------------------------------------

const completed = ev('d', 'completed', '2026-11-01T14:00:00+03:00'); // Ende 15:30 Ankara = 12:30 UTC

test('3) beendetes Event bleibt 24 Stunden nach seinem ENDE sichtbar', () => {
  assert.equal(isArchivedForStudents(completed, at('2026-11-01T12:30:00Z')), false); // genau Ende
  assert.equal(isArchivedForStudents(completed, at('2026-11-02T12:29:59Z')), false); // 1 s vor Ablauf
});

test('4) beendetes Event ist nach Ablauf der 24 Stunden archiviert', () => {
  assert.equal(studentArchiveDueAt(completed), at('2026-11-01T12:30:00Z').getTime() + ARCHIVE_DELAY_MS);
  assert.equal(isArchivedForStudents(completed, at('2026-11-02T12:30:00Z')), true);
});

test('auch geplante/bestätigte Events, die vorbei sind, aber nie als abgeschlossen markiert wurden', () => {
  for (const status of ['planned', 'confirmed']) {
    const past = ev('p', status, '2026-11-01T14:00:00+03:00');
    assert.equal(isArchivedForStudents(past, at('2026-11-02T12:29:00Z')), false, status);
    assert.equal(isArchivedForStudents(past, at('2026-11-02T12:31:00Z')), true, status);
  }
});

// ---------------------------------------------------------------------------
// 5 + 6: Künftige und laufende Events nie
// ---------------------------------------------------------------------------

test('5) künftige Events werden nie archiviert', () => {
  const now = at('2026-11-08T10:00:00Z');
  for (const status of ['planned', 'confirmed']) {
    assert.equal(isArchivedForStudents(ev('f', status, '2026-11-09T14:00:00+03:00'), now), false);
    assert.equal(isArchivedForStudents(ev('f', status, '2027-06-01T14:00:00+03:00', { durationMinutes: null }), now), false);
  }
});

test('6) laufende Events werden nie archiviert – nur weil der Start vorbei ist, reicht nicht', () => {
  // Start vor 30 Stunden, Dauer 2 Tage -> läuft noch
  const longRunning = ev('r', 'confirmed', '2026-11-07T04:00:00Z', { durationMinutes: 2 * 24 * 60 });
  assert.equal(isArchivedForStudents(longRunning, at('2026-11-08T10:00:00Z')), false);
  // Ende erst in 24 h nach Ende (Start + 2 Tage + 24 h)
  assert.equal(isArchivedForStudents(longRunning, at('2026-11-10T03:59:00Z')), false);
  assert.equal(isArchivedForStudents(longRunning, at('2026-11-10T04:00:00Z')), true);
});

test('Entwürfe werden nie archiviert (sieht ohnehin nur der Admin-Bereich)', () => {
  assert.equal(studentArchiveDueAt(ev('x', 'draft', '2020-01-01T10:00:00Z')), null);
  assert.equal(isArchivedForStudents(ev('x', 'draft', '2020-01-01T10:00:00Z'), at('2026-11-08T10:00:00Z')), false);
});

test('von der Datenbank archiviert (archivedAt) ist immer ausgeblendet', () => {
  const archived = ev('a', 'planned', '2027-01-01T10:00:00Z', { archivedAt: '2026-11-08T09:07:00Z' });
  assert.equal(isArchivedForStudents(archived, at('2026-11-08T10:00:00Z')), true);
});

// ---------------------------------------------------------------------------
// 7: Admins sehen archivierte Events weiterhin
// ---------------------------------------------------------------------------

const adminRow = (id, status, extra = {}) => ({
  id, title: { de: id }, summary: null, description: null, location: null, audience: null,
  start_at: '2026-10-01T11:00:00Z', duration_minutes: 60, capacity: null, online: false, topics: [],
  format: 'meetup', host_school_id: 'ers', school_ids: ['ers'], status,
  created_at: '2026-09-01T10:00:00Z', registered_count: 3, interested_count: 1,
  cancelled_at: null, archived_at: null, ...extra,
});

test('7) Admins sehen archivierte Events weiterhin (Liste, Filter "Archiviert", Zahlen)', async () => {
  const rows = [
    adminRow('arch-done', 'completed', { archived_at: '2026-10-03T08:07:00Z' }),
    adminRow('arch-cancel', 'cancelled', { cancelled_at: '2026-10-01T09:00:00Z', archived_at: '2026-10-02T09:07:00Z' }),
    adminRow('open', 'planned', { start_at: '2027-01-01T10:00:00Z' }),
  ];
  const client = { calls: [], async rpc(name) { this.calls.push(name); return { data: rows, error: null }; } };
  const { events, errorKey } = await loadAdminEvents(client);
  assert.equal(errorKey, null);
  assert.deepEqual(client.calls, ['admin_list_events']);
  assert.equal(events.length, 3, 'nichts wird für Admins ausgeblendet');
  assert.equal(mapAdminEvent(rows[0]).archivedAt, '2026-10-03T08:07:00Z');
  assert.deepEqual(filterEvents(events, 'archived').map((e) => e.id), ['arch-done', 'arch-cancel']);
  assert.equal(filterEvents(events, 'all').length, 3);
  // Status bleibt unverändert – "archiviert" ist ein eigener Zustand
  assert.deepEqual(filterEvents(events, 'completed').map((e) => e.id), ['arch-done']);
  assert.deepEqual(filterEvents(events, 'cancelled').map((e) => e.id), ['arch-cancel']);
  assert.equal(countEventsByStatus(events).archived, 2);
  assert.equal(countEventsByStatus(events).completed, 1);
});

// ---------------------------------------------------------------------------
// 8: Anmeldungen bleiben erhalten
// ---------------------------------------------------------------------------

test('8) Ausblenden verändert weder Events noch Anmeldungen', () => {
  const now = at('2026-11-10T00:00:00Z');
  const events = [cancelled, completed, ev('f', 'planned', '2026-12-01T14:00:00+03:00')];
  const snapshot = JSON.stringify(events);
  const registrations = { c: 'registered', d: 'registered', f: 'interested' };
  const regSnapshot = JSON.stringify(registrations);
  const user = { id: 'u', registrations, interests: [], schoolId: 'ers' };

  const visible = visibleToStudents(events, now);
  assert.deepEqual(visible.map((e) => e.id), ['f']);
  assert.equal(JSON.stringify(events), snapshot, 'Event-Liste unverändert');
  assert.equal(JSON.stringify(registrations), regSnapshot, 'Anmeldungen unverändert');
  // Anmeldung zum archivierten Event existiert weiter (nur nicht angezeigt)
  assert.equal(getEventRole(user, cancelled), 'registered');
  assert.deepEqual(getMyEvents(user, visible, now).upcoming.map((e) => e.id), ['f']);
});

// ---------------------------------------------------------------------------
// 9: Mehrfach ausführen ist unproblematisch
// ---------------------------------------------------------------------------

test('9) mehrfache Anwendung liefert dasselbe Ergebnis (idempotent)', () => {
  const now = at('2026-11-10T00:00:00Z');
  const events = [cancelled, completed, ev('f', 'planned', '2026-12-01T14:00:00+03:00')];
  const once = visibleToStudents(events, now);
  const twice = visibleToStudents(once, now);
  const thrice = visibleToStudents(visibleToStudents(twice, now), now);
  assert.deepEqual(twice, once);
  assert.deepEqual(thrice, once);
});

// ---------------------------------------------------------------------------
// Laden: neue Spalten + sicherer Rückfall, solange 008 nicht ausgeführt ist
// ---------------------------------------------------------------------------

function sequenceClient(responses) {
  const selects = [];
  return {
    selects,
    from() {
      const builder = {
        select(columns) { selects.push(columns); return builder; },
        order() { return Promise.resolve(responses[selects.length - 1]); },
      };
      return builder;
    },
  };
}

test('Events werden mit cancelled_at und archived_at geladen', async () => {
  const client = sequenceClient([{ data: [{ ...adminRow('x', 'cancelled'), cancelled_at: '2026-11-08T10:00:00Z' }], error: null }]);
  const events = await fetchEvents(client);
  assert.deepEqual(client.selects, [EVENT_COLUMNS]);
  assert.match(EVENT_COLUMNS, /cancelled_at, archived_at$/);
  assert.equal(events[0].cancelledAt, '2026-11-08T10:00:00Z');
  assert.equal(events[0].archivedAt, null);
});

test('Migration 008 noch nicht ausgeführt (42703): Laden ohne neue Spalten, App funktioniert weiter', async () => {
  const client = sequenceClient([
    { data: null, error: { code: '42703', message: 'column events.cancelled_at does not exist' } },
    { data: [adminRow('x', 'planned')], error: null },
  ]);
  const events = await fetchEvents(client);
  assert.deepEqual(client.selects, [EVENT_COLUMNS, EVENT_COLUMNS_BASE]);
  assert.equal(events.length, 1);
  assert.equal(mapDbEvent({ ...adminRow('y', 'planned'), cancelled_at: undefined, archived_at: undefined }).archivedAt, null);
});

test('andere Ladefehler werden weiterhin gemeldet (kein stiller Rückfall)', async () => {
  const client = sequenceClient([{ data: null, error: { code: '42501', message: 'permission denied' } }]);
  await assert.rejects(fetchEvents(client), { code: '42501' });
  assert.equal(client.selects.length, 1);
});

// ---------------------------------------------------------------------------
// Migration 008 + 009 (statisch – es wird KEIN SQL ausgeführt)
// ---------------------------------------------------------------------------

const strip = (sql) => sql.replace(/--.*$/gm, '');
const m008 = strip(readFileSync(join(root, 'supabase', 'migrations', '008_event_archiving.sql'), 'utf8'));
const m009 = strip(readFileSync(join(root, 'supabase', 'migrations', '009_event_archiving_cron.sql'), 'utf8'));
// Nur der Körper von archive_finished_events (bis zur nächsten Funktion)
const archiveFn = m008.slice(
  m008.indexOf('create or replace function public.archive_finished_events'),
  m008.indexOf('create or replace function public.admin_set_event_status'),
);

test('008: archivieren statt löschen – kein DELETE, kein DROP TABLE, kein TRUNCATE, kein CASCADE', () => {
  assert.ok(archiveFn.length > 100 && !archiveFn.includes('admin_set_event_status'), 'Ausschnitt korrekt');
  assert.doesNotMatch(m008, /\bdelete\s+from\b/i);
  assert.doesNotMatch(m008, /drop\s+table|\btruncate\s+(table\s+)?public\.|on delete cascade/i);
  assert.match(archiveFn, /update public\.events e\s+set archived_at = now\(\)/);
});

test('008: Archivierung ist idempotent und trifft nie künftige oder laufende Events', () => {
  assert.match(archiveFn, /where e\.archived_at is null/);
  assert.match(archiveFn, /e\.cancelled_at <= now\(\) - interval '24 hours'/);
  assert.match(archiveFn, /public\.event_ends_at\(e\.start_at, e\.duration_minutes\) <= now\(\) - interval '24 hours'/);
  assert.match(archiveFn, /e\.status in \('planned', 'confirmed', 'completed'\)/);
  assert.doesNotMatch(archiveFn, /'draft'/);
  assert.doesNotMatch(archiveFn, /start_at <= now\(\)/, 'nicht nur nach Startzeit archivieren');
});

test('008: nur der Datenbank-Eigentümer darf archivieren – auch nicht service_role (K2)', () => {
  assert.match(m008, /revoke all on function public\.archive_finished_events\(\) from public, anon, authenticated, service_role;/);
  assert.match(m008, /revoke all on function public\.event_ends_at\(timestamptz, integer\) from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(m008, /grant execute on function public\.(archive_finished_events|event_ends_at)/);
  assert.match(archiveFn, /security definer/);
  assert.ok(archiveFn.includes("set search_path = ''"));
  // Selbstprüfung: Erlaubnisliste über ALLE ACL-Einträge (nicht nur anon/authenticated)
  assert.match(m008, /ist ausführbar für: % \(erlaubt: nur %\)/);
  assert.match(m008, /acl\.grantee = 0 or g\.rolname is distinct from owner_name/);
  assert.match(m008, /acl\.grantee = 0 or g\.rolname not in \(owner_name, 'authenticated', 'service_role'\)/);
});

test('008 K1: Eigentümer, Mitgliedschaften (inkl. service_role) und Tabellenrechte werden geprüft', () => {
  assert.match(m008, /app_roles\s+text\[\] := array\['anon', 'authenticated', 'service_role', 'authenticator'\]/);
  assert.match(m008, /pg_has_role\(r, owner_name, 'member'\)/);
  assert.match(m008, /has_table_privilege\(owner_name, 'public\.events', 'select'\)/);
  assert.match(m008, /has_table_privilege\(owner_name, 'public\.events', 'update'\)/);
  assert.match(m008, /gehört nicht dem Eigentümer von public\.events/);
  assert.match(m008, /current_user is distinct from \(select pg_get_userbyid\(relowner\) from pg_class where oid = 'public\.events'::regclass\)/);
  assert.match(m008, /relforcerowsecurity/);
});

test('008 K3: Policy wird vollständig gegen eine Vergleichs-Policy geprüft', () => {
  assert.match(m008, /create temp table _008_ref_events \(status text, archived_at timestamptz\) on commit drop;/);
  assert.match(m008, /create policy ref_events_select on _008_ref_events for select to authenticated\s+using \(status in \('planned', 'confirmed', 'completed', 'cancelled'\) and archived_at is null\);/);
  for (const part of ['not pol.polpermissive', "pol.polcmd <> 'r'", 'pol.polroles <>', 'pol.polwithcheck is not null', 'pol.qual is distinct from ref_qual']) {
    assert.ok(m008.includes(part), part);
  }
  assert.match(m008, /select count\(\*\) into n from pg_policy where polrelid = 'public\.events'::regclass;/);
});

test('008 K4: Laufzeit-Probe mit echten Test-Events, danach vollständig zurückgerollt', () => {
  assert.match(m008, /perform public\.archive_finished_events\(\);\s+second_run := public\.archive_finished_events\(\);/);
  for (const text of ['künftiges Event archiviert', 'laufendes Event archiviert', 'Entwurf archiviert', 'Absage vor 1 h archiviert',
    'Event ohne Dauer zu früh archiviert', 'Ende vor 29 h nicht archiviert', 'Absage vor 25 h nicht archiviert', 'nicht idempotent', 'Status verändert']) {
    assert.ok(m008.includes(text), text);
  }
  assert.match(m008, /raise exception using errcode = 'DC8PR'/);
  assert.match(m008, /exception when sqlstate 'DC8PR' then/);
  assert.match(m008, /Probe-Events wurden nicht zurückgerollt/);
});

test('008 K6 + K7: neue Spalten von admin_list_events und Abhängigkeiten vor dem Löschen', () => {
  assert.match(m008, /not like '%cancelled_at timestamp with time zone%'/);
  assert.match(m008, /not like '%archived_at timestamp with time zone%'/);
  assert.match(m008, /d\.refclassid = 'pg_proc'::regclass\s+and d\.refobjid = 'public\.admin_list_events\(\)'::regprocedure/);
  assert.ok(m008.indexOf("refclassid = 'pg_proc'::regclass") < m008.indexOf('drop function if exists public.admin_list_events()'),
    'Abhängigkeits-Prüfung VOR dem Löschen');
});

test('008: Lese-Policy für Schüler:innen wird nur VERSCHÄRFT (archived_at is null)', () => {
  assert.match(
    m008,
    /create policy "events: lesen \(veröffentlicht, nicht archiviert\)"\s+on public\.events for select to authenticated\s+using \(status in \('planned', 'confirmed', 'completed', 'cancelled'\) and archived_at is null\);/,
  );
  assert.doesNotMatch(m008, /grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?public\./i);
});

test('008: Absage-Zeitpunkt wird gesetzt, Admin-Funktionen behalten ihre Regeln', () => {
  assert.match(m008, /cancelled_at = case when p_status = 'cancelled' then now\(\) else cancelled_at end/);
  for (const code of ['DC004', 'DC002', 'DC007', 'DC006', 'DC005', 'DC009', '42501']) assert.ok(m008.includes(`'${code}'`), code);
  assert.match(m008, /cancelled_at timestamptz, archived_at timestamptz\s*\)/, 'admin_list_events liefert die neuen Spalten');
  assert.match(m008, /grant execute on function public\.admin_list_events\(\) to authenticated;/);
});

test('009: stündlicher pg_cron-Job, ohne Duplikate, ruft nur die Archiv-Funktion auf', () => {
  assert.match(m009, /create extension if not exists pg_cron;/);
  assert.match(m009, /select cron\.unschedule\(jobid\) from cron\.job where jobname = 'dc_archive_finished_events';/);
  assert.match(m009, /cron\.schedule\(\s*'dc_archive_finished_events',\s*'7 \* \* \* \*',\s*'select public\.archive_finished_events\(\);'\s*\)/);
  assert.doesNotMatch(m009, /\bdelete\s+from\b|service_role/i);
});

test('009 K5: Job läuft in DIESER Datenbank als Eigentümer der Funktion, der sie ausführen darf', () => {
  assert.match(m009, /current_user is distinct from fn_owner/);
  assert.match(m009, /and database = current_database\(\)/);
  assert.match(m009, /and username = fn_owner/);
  assert.match(m009, /and has_function_privilege\(username, 'public\.archive_finished_events\(\)', 'EXECUTE'\)/);
});

// ---------------------------------------------------------------------------
// Dauer geändert: Archiv-Zustand neu berechnen (Datenbank + Frontend gleiche Regel)
// ---------------------------------------------------------------------------

const updateFn = m008.slice(
  m008.indexOf('create or replace function public.admin_update_event'),
  m008.indexOf('drop function if exists public.admin_list_events()'),
);

test('008: admin_update_event merkt sich die alte Dauer und berechnet archived_at bei Datum ODER Dauer neu', () => {
  assert.match(updateFn, /select e\.status, e\.start_at, e\.duration_minutes, e\.archived_at\s+into old_status, old_start, old_duration, old_archived/);
  assert.match(updateFn, /old_status in \('planned', 'confirmed', 'completed'\)\s+and \(p_start_at is distinct from old_start or p_duration_minutes is distinct from old_duration\)/);
  // gleiche Regel wie archive_finished_events: Ende + 24 h
  assert.match(updateFn, /public\.event_ends_at\(p_start_at, p_duration_minutes\) <= now\(\) - interval '24 hours'\s+then coalesce\(old_archived, now\(\)\)\s+else null/);
  assert.match(updateFn, /archived_at = new_archived/);
  // Abgesagt: kein Neustart des Countdowns – cancelled_at wird hier nie verändert
  assert.doesNotMatch(updateFn, /cancelled_at\s*=/);
  assert.match(updateFn, /new_archived := old_archived;/);
  // DC006 bleibt VOR der Neuberechnung
  assert.ok(updateFn.indexOf("'DC006'") < updateFn.indexOf('new_archived := case'));
});

test('Frontend: längere Dauer macht ein beendetes Event wieder sichtbar (wie die Datenbank)', () => {
  const now = at('2026-11-08T12:00:00Z');
  // Start vor 30 h, 60 Min. -> Ende vor 29 h -> archiviert
  const before = ev('d', 'completed', '2026-11-07T06:00:00Z', { durationMinutes: 60 });
  assert.equal(isArchivedForStudents(before, now), true);
  // Nach dem Bearbeiten: Dauer 1440 Min., archivedAt von der Datenbank zurückgesetzt -> Ende vor 6 h -> sichtbar
  const after = { ...before, durationMinutes: 1440, archivedAt: null };
  assert.equal(isArchivedForStudents(after, now), false);
  assert.equal(studentArchiveDueAt(after), at('2026-11-09T06:00:00Z').getTime());
});

test('Frontend: kürzere Dauer kann ein Event sofort fällig machen – gleiche Grenze wie in der Datenbank', () => {
  const now = at('2026-11-08T12:00:00Z');
  const longEvent = ev('p', 'planned', '2026-11-07T06:00:00Z', { durationMinutes: 1440 }); // Ende vor 6 h
  assert.equal(isArchivedForStudents(longEvent, now), false);
  const shortened = { ...longEvent, durationMinutes: 60 }; // Ende vor 29 h
  assert.equal(isArchivedForStudents(shortened, now), true);
});

test('Frontend: Dauer eines abgesagten Events ändert den 24-h-Countdown NICHT', () => {
  const base = ev('c', 'cancelled', '2026-12-20T14:00:00+03:00', { cancelledAt: '2026-11-08T10:00:00Z', durationMinutes: 60 });
  const longer = { ...base, durationMinutes: 1440 };
  const none = { ...base, durationMinutes: null };
  assert.equal(studentArchiveDueAt(longer), studentArchiveDueAt(base));
  assert.equal(studentArchiveDueAt(none), studentArchiveDueAt(base));
  assert.equal(isArchivedForStudents(longer, at('2026-11-09T09:59:00Z')), false);
  assert.equal(isArchivedForStudents(longer, at('2026-11-09T10:00:00Z')), true);
});

test('Frontend und Datenbank nutzen dieselbe Grenze (Ende/Absage + genau 24 h) und dieselbe Status-Liste', () => {
  assert.equal(ARCHIVE_DELAY_MS, 24 * H);
  assert.match(archiveFn, /interval '24 hours'/);
  const src = readFileSync(join(root, 'src', 'lib', 'eventArchive.js'), 'utf8');
  assert.match(src, /FINISHABLE_STATUSES = \['planned', 'confirmed', 'completed'\]/);
  assert.match(archiveFn, /e\.status in \('planned', 'confirmed', 'completed'\)/);
  // Ohne Dauer: Mitternacht nach dem Ankara-Tag – hier und in event_ends_at
  assert.ok(m008.includes("((p_start_at at time zone 'Europe/Istanbul')::date + 1)::timestamp at time zone 'Europe/Istanbul'"));
});
