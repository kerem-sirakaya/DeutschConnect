// Prüft die Admin-Übersicht (/admin): Kennzahlen, Zustände, Aktivitäten, Navigation,
// Sicherheit und Migration 010 – mit NACHGEBAUTEM Supabase-Client, ohne echte Datenbank.
// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAdminOverviewStats, mapOverviewStats } from '../src/lib/adminApi.js';
import {
  OVERVIEW_QUICK_ACTIONS,
  OVERVIEW_STATS,
  RECENT_ACTIVITY_LIMIT,
  buildRecentActivity,
  isMissingFunctionError,
  loadOverviewStats,
  loadRecentActivity,
  statValue,
} from '../src/lib/adminOverview.js';
import { normalizeEventFilter } from '../src/lib/adminEvents.js';
import { normalizeIdeaFilter } from '../src/lib/adminIdeas.js';
import { resolveAdminAccess } from '../src/lib/adminAccess.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

/** Nachgebauter Client: nur rpc; direkter Tabellenzugriff ist verboten. */
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const response = responses[name];
      return typeof response === 'function' ? response(calls.length) : response ?? { data: [], error: null };
    },
    from(table) {
      throw new Error(`Direkter Tabellenzugriff auf "${table}" ist verboten`);
    },
  };
}

const statsRow = {
  total_students: 42,
  upcoming_events: 3,
  total_registrations: '57', // bigint kann als Text ankommen
  ideas_pending_review: 4,
  archived_events: 9,
};

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------

test('1) echte Kennzahlen aus admin_get_overview_stats werden übernommen', async () => {
  const client = fakeClient({ admin_get_overview_stats: { data: [statsRow], error: null } });
  const result = await loadOverviewStats(client);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.stats, {
    totalStudents: 42,
    upcomingEvents: 3,
    totalRegistrations: 57,
    ideasPendingReview: 4,
    archivedEvents: 9,
  });
  assert.deepEqual(client.calls, [{ name: 'admin_get_overview_stats', args: undefined }]);
});

test('2) Null-Werte (leere Datenbank) werden als 0 angezeigt – nicht als "nicht verfügbar"', async () => {
  const zero = { total_students: 0, upcoming_events: 0, total_registrations: 0, ideas_pending_review: 0, archived_events: 0 };
  const { stats } = await loadOverviewStats(fakeClient({ admin_get_overview_stats: { data: [zero], error: null } }));
  for (const stat of OVERVIEW_STATS) assert.equal(statValue(stats, stat.key), 0, stat.key);
});

test('einzelne Zeile statt Liste wird ebenfalls akzeptiert; fehlende Zeile ist ein Fehler, keine 0', async () => {
  assert.equal((await fetchAdminOverviewStats(fakeClient({ admin_get_overview_stats: { data: statsRow, error: null } }))).totalStudents, 42);
  const empty = await loadOverviewStats(fakeClient({ admin_get_overview_stats: { data: [], error: null } }));
  assert.equal(empty.status, 'error');
  assert.equal(empty.stats, null);
});

// Statische Prüfung der Zähl-Regeln in Migration 010 (es wird KEIN SQL ausgeführt)
const m010 = read('supabase', 'migrations', '010_admin_overview_stats.sql').replace(/--.*$/gm, '');
const fn010 = m010.slice(m010.indexOf('create or replace function public.admin_get_overview_stats'), m010.indexOf('revoke all on function public.admin_get_overview_stats'));

test('3) Anmeldungen: nur status = registered (Interessierte zählen nicht), jede Zeile einmal', () => {
  assert.match(fn010, /select count\(\*\) into total_registrations\s+from public\.event_registrations r\s+where r\.status = 'registered';/);
  assert.doesNotMatch(fn010, /'interested'/);
  assert.doesNotMatch(fn010, /count\(distinct/i, 'Primärschlüssel (event_id, user_id) – einfaches count(*) genügt');
});

test('4) Bevorstehend: nur planned/confirmed, Beginn in der Zukunft, nicht archiviert', () => {
  assert.ok(fn010.includes("e.status in (''planned'', ''confirmed'') and e.start_at > now() and e.archived_at is null"));
  assert.match(fn010, /where e\.status in \('planned', 'confirmed'\) and e\.start_at > now\(\);/); // ohne 008
  assert.doesNotMatch(fn010, /'draft'|'cancelled'|'completed'/);
});

test('5) Zu prüfende Ideen: nur status = submitted', () => {
  assert.match(fn010, /from public\.ideas i\s+where i\.status = 'submitted';/);
  assert.doesNotMatch(fn010, /'collecting'|'review'|'rejected'/);
});

test('6) Archiviert: nur archived_at IS NOT NULL (nicht einfach alle abgesagten/abgeschlossenen)', () => {
  assert.ok(fn010.includes("'select count(*) from public.events e where e.archived_at is not null'"));
});

test('7) Admins zählen nicht als Schüler:innen', () => {
  assert.match(fn010, /from public\.profiles p\s+where not exists \(select 1 from public\.admins a where a\.user_id = p\.id\);/);
});

test('8) Historische Anmeldungen bleiben in der Zählung (kein Filter nach Event-Status/Archiv)', () => {
  const regQuery = fn010.slice(fn010.indexOf('into total_registrations'), fn010.indexOf('into ideas_pending_review'));
  assert.doesNotMatch(regQuery, /events|archived|start_at/);
  assert.doesNotMatch(m010, /\bdelete\s+from\b|\bupdate\s+public\./i, 'Migration ändert keine Daten');
});

// ---------------------------------------------------------------------------
// Laden, Fehler, leere Zustände
// ---------------------------------------------------------------------------

test('9) Seite startet im Ladezustand (Skeleton statt leerer Seite)', () => {
  const page = read('src', 'pages', 'admin', 'AdminOverviewPage.jsx');
  assert.match(page, /useState\(\{ status: 'loading', stats: null, errorKey: null \}\)/);
  assert.match(page, /useState\(\{ status: 'loading', items: \[\], errorKey: null \}\)/);
  assert.match(page, /admin-stat__skeleton/);
  assert.match(page, /aria-busy=\{stats\.status === 'loading'\}/);
});

test('10) Erneut versuchen startet eine NEUE Anfrage', async () => {
  let call = 0;
  const client = fakeClient({
    admin_get_overview_stats: () => (++call === 1 ? { data: null, error: { name: 'TypeError', message: 'Failed to fetch' } } : { data: [statsRow], error: null }),
  });
  const first = await loadOverviewStats(client);
  const second = await loadOverviewStats(client);
  assert.equal(first.status, 'error');
  assert.equal(first.errorKey, 'admin.errors.network');
  assert.equal(second.status, 'ready');
  assert.equal(client.calls.length, 2);
  // Seite: Retry erhöht den Token, der das Laden auslöst (kein Laden bei jedem Rendern)
  const page = read('src', 'pages', 'admin', 'AdminOverviewPage.jsx');
  assert.match(page, /setStatsToken\(\(n\) => n \+ 1\)/);
  assert.match(page, /\}, \[statsToken\]\);/);
  assert.match(page, /\}, \[activityToken\]\);/);
});

test('11) Fehler beim Laden der Kennzahlen: Fehlermeldung, KEINE Zahlen (auch keine 0)', async () => {
  for (const [error, key] of [
    [{ code: '42501' }, 'admin.errors.notAllowed'], // Berechtigung ist kein "leer"
    [{ code: 'XX000' }, 'admin.errors.generic'],
  ]) {
    const result = await loadOverviewStats(fakeClient({ admin_get_overview_stats: { data: null, error } }));
    assert.equal(result.status, 'error');
    assert.equal(result.errorKey, key);
    assert.equal(result.stats, null);
    for (const stat of OVERVIEW_STATS) assert.equal(statValue(result.stats, stat.key), null);
  }
});

test('12) Aktivitäten laden unabhängig: Fehler dort beeinflusst die Kennzahlen nicht', async () => {
  const client = fakeClient({
    admin_get_overview_stats: { data: [statsRow], error: null },
    admin_list_events: { data: null, error: { code: 'XX000' } },
    admin_list_ideas: { data: [], error: null },
  });
  const [stats, activity] = await Promise.all([loadOverviewStats(client), loadRecentActivity(client)]);
  assert.equal(stats.status, 'ready');
  assert.equal(stats.stats.totalStudents, 42);
  assert.equal(activity.status, 'error');
  assert.equal(activity.errorKey, 'admin.errors.generic');
  assert.deepEqual(activity.items, []);
});

test('13) keine Events und Ideen: leere Aktivitätenliste (kein Fehler)', async () => {
  const result = await loadRecentActivity(fakeClient({ admin_list_events: { data: [], error: null }, admin_list_ideas: { data: [], error: null } }));
  assert.deepEqual(result, { status: 'ready', items: [], errorKey: null });
});

test('14) Migration 008 fehlt: archivierte Events "nicht verfügbar", Rest funktioniert', async () => {
  const result = await loadOverviewStats(fakeClient({ admin_get_overview_stats: { data: [{ ...statsRow, archived_events: null }], error: null } }));
  assert.equal(result.status, 'ready');
  assert.equal(statValue(result.stats, 'archivedEvents'), null);
  assert.equal(statValue(result.stats, 'totalStudents'), 42);
  // Migration 010 erkennt fehlende Spalte zur Laufzeit statt abzustürzen
  assert.match(fn010, /a\.attname = 'archived_at'/);
  assert.match(fn010, /archived_events := null;/);
  const archived = OVERVIEW_STATS.find((stat) => stat.key === 'archivedEvents');
  assert.equal(archived.unavailableKey, 'admin.overview.stats.archived.unavailable');
});

test('15) Migration 010 fehlt: Hinweis statt erfundener Zahlen; unbekannt ist nie 0', async () => {
  for (const code of ['PGRST202', '42883']) {
    assert.equal(isMissingFunctionError({ code }), true);
    const result = await loadOverviewStats(fakeClient({ admin_get_overview_stats: { data: null, error: { code } } }));
    assert.deepEqual(result, { status: 'unavailable', stats: null, errorKey: null });
  }
  assert.equal(statValue({ totalStudents: undefined }, 'totalStudents'), null);
  assert.equal(statValue({ totalStudents: Number.NaN }, 'totalStudents'), null);
  assert.equal(mapOverviewStats({ total_students: null }).totalStudents, null);
  assert.equal(mapOverviewStats({ total_students: 'abc' }).totalStudents, null);
  assert.equal(mapOverviewStats({ total_students: 0 }).totalStudents, 0);
  assert.equal((await loadOverviewStats(null)).status, 'error', 'ohne Supabase-Client kein falsches "ready"');
});

// ---------------------------------------------------------------------------
// Aktivitäten
// ---------------------------------------------------------------------------

const eventRow = (id, created, extra = {}) => ({
  id, title: { de: `Event ${id}`, en: `Event ${id} EN` }, summary: null, description: null, location: null, audience: null,
  start_at: '2027-01-01T10:00:00Z', duration_minutes: null, capacity: null, online: false, topics: [], format: 'meetup',
  host_school_id: 'ers', school_ids: ['ers'], status: 'draft', created_at: created,
  registered_count: 0, interested_count: 0, ...extra,
});
const ideaRow = (id, created, extra = {}) => ({
  id, school_id: 'anka', title: `Idee ${id}`, summary: '', description: '', topics: [], format: 'meetup',
  school_ids: ['anka'], status: 'submitted', created_at: created, supporters: 0, ...extra,
});

test('Aktivitäten: Events und Ideen gemischt, neueste zuerst, höchstens 5', async () => {
  const client = fakeClient({
    admin_list_events: {
      data: [
        eventRow('e1', '2026-11-01T10:00:00Z'),
        eventRow('e2', '2026-11-05T10:00:00Z', { status: 'planned' }),
        eventRow('e3', '2026-11-07T10:00:00Z', { archived_at: '2026-11-08T07:07:00Z', status: 'completed' }),
      ],
      error: null,
    },
    admin_list_ideas: {
      data: [ideaRow('i1', '2026-11-06T10:00:00Z'), ideaRow('i2', '2026-11-02T10:00:00Z', { status: 'collecting' }), ideaRow('i3', '2026-11-08T09:00:00Z')],
      error: null,
    },
  });
  const { status, items } = await loadRecentActivity(client);
  assert.equal(status, 'ready');
  assert.equal(RECENT_ACTIVITY_LIMIT, 5);
  assert.deepEqual(items.map((item) => `${item.type}:${item.id}`), ['idea:i3', 'event:e3', 'idea:i1', 'event:e2', 'idea:i2']);
  const e3 = items.find((item) => item.id === 'e3');
  assert.equal(e3.archived, true);
  assert.equal(e3.status, 'completed');
  assert.equal(e3.to, '/admin/events/e3/edit');
  assert.equal(items.find((item) => item.id === 'i2').to, '/admin/ideas?status=collecting');
  assert.deepEqual(client.calls.map((c) => c.name).sort(), ['admin_list_events', 'admin_list_ideas']);
});

test('Aktivitäten: nur echte Zeitstempel, fehlende Texte sind kein Problem, keine Personendaten', () => {
  const items = buildRecentActivity(
    [{ id: 'e1', title: null, status: 'draft', createdAt: null }, { id: 'e2', title: { de: 'A' }, status: 'planned', createdAt: 'kaputt' }],
    [{ id: 'i1', title: '', status: 'submitted', createdAt: '2026-11-08T10:00:00Z', authorId: 'person' }],
  );
  assert.deepEqual(items.map((item) => item.id), ['i1']);
  assert.ok(!('authorId' in items[0]));
  assert.deepEqual(Object.keys(items[0]).sort(), ['archived', 'createdAt', 'id', 'status', 'title', 'to', 'type']);
  assert.deepEqual(buildRecentActivity(null, undefined), []);
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const app = read('src', 'App.jsx');
const adminRoutes = ['/admin', '/admin/events', '/admin/events/new', '/admin/ideas'];

function isValidAdminTarget(to) {
  const [path, query] = to.split('?');
  const routeExists =
    adminRoutes.includes(path) || /^\/admin\/events\/[^/]+\/edit$/.test(path);
  if (!routeExists) return false;
  if (!query) return true;
  const status = new URLSearchParams(query).get('status');
  if (path === '/admin/events') return normalizeEventFilter(status) === status;
  if (path === '/admin/ideas') return normalizeIdeaFilter(status) === status;
  return false;
}

test('Routen, auf die verlinkt wird, existieren in App.jsx', () => {
  assert.match(app, /<Route path="admin" element=\{<AdminRoute \/>\}>/);
  assert.match(app, /<Route path="events" element=\{<AdminEventsPage \/>\}/);
  assert.match(app, /<Route path="events\/new" element=\{<AdminEventFormPage \/>\}/);
  assert.match(app, /<Route path="events\/:eventId\/edit" element=\{<AdminEventFormPage \/>\}/);
  assert.match(app, /<Route path="ideas" element=\{<AdminIdeasPage \/>\}/);
});

test('16–19) Schnellzugriff führt genau zu den vier geforderten Zielen', () => {
  assert.deepEqual(OVERVIEW_QUICK_ACTIONS.map((action) => action.to), [
    '/admin/events/new',
    '/admin/events',
    '/admin/ideas?status=submitted',
    '/admin/ideas',
  ]);
  for (const action of OVERVIEW_QUICK_ACTIONS) assert.ok(isValidAdminTarget(action.to), action.to);
  const page = read('src', 'pages', 'admin', 'AdminOverviewPage.jsx');
  assert.match(page, /<Link to=\{action\.to\} className=\{`admin-quick__item/, 'ganze Karte ist ein Link');
});

test('20) Kennzahl-Karten verlinken nur auf gültige Routen und Filter', () => {
  const byKey = Object.fromEntries(OVERVIEW_STATS.map((stat) => [stat.key, stat]));
  assert.equal(byKey.ideasPendingReview.to, '/admin/ideas?status=submitted');
  assert.equal(byKey.archivedEvents.to, '/admin/events?status=archived');
  assert.equal(byKey.upcomingEvents.to, '/admin/events');
  assert.equal(byKey.totalStudents.to, null, 'keine Schülerverwaltung – kein erfundener Link');
  for (const stat of OVERVIEW_STATS) if (stat.to) assert.ok(isValidAdminTarget(stat.to), stat.to);
  assert.deepEqual(OVERVIEW_STATS.map((stat) => stat.key), ['totalStudents', 'upcomingEvents', 'totalRegistrations', 'ideasPendingReview', 'archivedEvents']);
});

test('Aktivitäts-Links zeigen auf gültige Routen', () => {
  const items = buildRecentActivity(
    [{ id: 'abc', status: 'cancelled', createdAt: '2026-11-08T10:00:00Z' }],
    ['submitted', 'collecting', 'review', 'planned', 'rejected'].map((status, i) => ({ id: `i${i}`, status, createdAt: `2026-11-0${i + 1}T10:00:00Z` })),
    10,
  );
  for (const item of items) assert.ok(isValidAdminTarget(item.to), item.to);
});

// ---------------------------------------------------------------------------
// Sicherheit
// ---------------------------------------------------------------------------

test('21–23) Zugriff: Schüler:in -> kein Zugriff, abgemeldet -> Login, Admin -> erlaubt', () => {
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'ready', isAdmin: false }), 'denied');
  assert.equal(resolveAdminAccess({ isAuthenticated: false, adminStatus: 'none', isAdmin: false }), 'login');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'ready', isAdmin: true }), 'allowed');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'error', isAdmin: false }), 'error', 'fail-closed');
  // Die Übersicht wird nur lazy und nur unter AdminRoute geladen
  assert.match(app, /const AdminOverviewPage = lazy\(\(\) => import\('\.\/pages\/admin\/AdminOverviewPage\.jsx'\)\);/);
  assert.match(app, /<Route index element=\{<AdminOverviewPage \/>\} \/>/);
});

test('24) Kontowechsel/Abmelden: kein zwischengespeicherter Zustand außerhalb der Seite', () => {
  const lib = read('src', 'lib', 'adminOverview.js');
  const page = read('src', 'pages', 'admin', 'AdminOverviewPage.jsx');
  assert.doesNotMatch(lib, /^(let|var)\s/m, 'kein Modul-Zwischenspeicher');
  for (const code of [lib, page]) assert.doesNotMatch(code, /\b(localStorage|sessionStorage)\s*[.[]/);
  // Abgebrochene Anfragen überschreiben keinen neueren Zustand
  assert.match(page, /let active = true;[\s\S]*?active && setStats\(result\)/);
  assert.match(page, /let active = true;[\s\S]*?active && setActivity\(result\)/);
});

test('29) kein direkter Zugriff auf Tabellen (insb. admins) im Admin-Code', () => {
  for (const file of [read('src', 'lib', 'adminOverview.js'), read('src', 'pages', 'admin', 'AdminOverviewPage.jsx'), read('src', 'lib', 'adminApi.js')]) {
    assert.doesNotMatch(file, /\.from\(/);
  }
});

test('30) Migration 010: sichere Funktion, keine neuen Rechte, keine Policies, keine Personendaten', () => {
  assert.match(fn010, /security definer/);
  assert.ok(fn010.includes("set search_path = ''"));
  assert.match(fn010, /if not public\.is_admin\(\) then\s+raise exception '[^']*' using errcode = '42501'/);
  assert.ok(fn010.indexOf('is_admin()') < fn010.indexOf('count(*)'), 'Admin-Prüfung vor jeder Zählung');
  assert.match(m010, /revoke all on function public\.admin_get_overview_stats\(\) from public, anon;/);
  assert.match(m010, /grant execute on function public\.admin_get_overview_stats\(\) to authenticated;/);
  assert.doesNotMatch(m010, /create policy|alter policy|drop policy|alter table/i);
  assert.doesNotMatch(m010, /grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?(public|auth)\./i);
  // Rückgabe nur Zahlen
  assert.match(fn010, /returns table \(\s+total_students\s+bigint,\s+upcoming_events\s+bigint,\s+total_registrations\s+bigint,\s+ideas_pending_review\s+bigint,\s+archived_events\s+bigint\s+\)/);
  assert.doesNotMatch(fn010, /email|first_name|author_id|auth\.users/);
  // Selbstprüfung inkl. Laufzeit-Probe (ohne Admin -> 42501) und Erlaubnisliste
  assert.match(m010, /exception when insufficient_privilege then\s+null;/);
  assert.match(m010, /g\.rolname not in \(owner_name, 'authenticated', 'service_role'\)/);
});

// ---------------------------------------------------------------------------
// Übersetzungen
// ---------------------------------------------------------------------------

test('alle Texte der Übersicht existieren in de, tr und en (ohne leere Werte)', () => {
  const keys = new Set([
    ...OVERVIEW_STATS.flatMap((stat) => [stat.labelKey, stat.descKey, stat.unavailableKey].filter(Boolean)),
    ...OVERVIEW_QUICK_ACTIONS.flatMap((action) => [action.labelKey, action.descKey]),
    ...['title', 'subtitle', 'context', 'contextNoName', 'statsTitle', 'statsLoading', 'statsUnavailable', 'valueUnavailable',
      'quickTitle', 'activityTitle', 'activityNote', 'activityLoading', 'activityEmpty', 'activityEventCreated',
      'activityIdeaSubmitted', 'activityUntitled'].map((name) => `admin.overview.${name}`),
  ]);
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(read('src', 'locales', `${lang}.json`));
    for (const key of keys) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key} fehlt`);
      assert.ok(value.trim().length > 0, `${lang}: ${key} ist leer`);
    }
    // Platzhalter des alten Platzhalter-Texts sind entfernt
    assert.equal(dict.admin.placeholder, undefined);
    assert.equal(dict.admin.overview.placeholder, undefined);
  }
  const de = JSON.parse(read('src', 'locales', 'de.json'));
  assert.equal(de.admin.overview.title, 'Willkommen im Connect/ED Admin-Dashboard');
  assert.equal(de.admin.overview.activityTitle, 'Aktivitäten');
});
