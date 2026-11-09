// Stufe 5: freiwillige Profile + persönliche Statistik. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SHARING,
  demoStats,
  filterDirectory,
  isProfileId,
  mapPublicProfileRow,
  mapSharingRow,
  mapStatsRow,
  profileErrorKey,
  sharingToRow,
} from '../src/lib/profiles.js';
import {
  fetchMySharing,
  fetchMyStats,
  fetchPublicProfile,
  fetchPublicProfiles,
  saveMySharing,
} from '../src/lib/profilesApi.js';
import { demoDirectory, demoPublicProfile } from '../src/data/publicProfiles.js';
import { sectionForPath } from '../src/components/layout/navigation.js';

const sql = readFileSync(new URL('../supabase/migrations/012_profiles_stats.sql', import.meta.url), 'utf8');
const UID = '11111111-2222-4333-8444-555555555555';

// ---------- Freigaben ----------
test('ohne Zeile ist alles privat', () => {
  assert.deepEqual(mapSharingRow(null), { ...DEFAULT_SHARING });
  assert.equal(Object.values(DEFAULT_SHARING).some(Boolean), false);
});

test('Freigaben: nur echtes true zählt, Hin- und Rückweg stimmen', () => {
  const row = { is_public: true, show_school: 'yes', show_interests: true, show_projects: false, show_activity: null };
  const values = mapSharingRow(row);
  assert.deepEqual(values, { isPublic: true, school: false, interests: true, projects: false, activity: false });
  assert.deepEqual(sharingToRow(values), {
    is_public: true, show_school: false, show_interests: true, show_projects: false, show_activity: false,
  });
});

// ---------- Statistik ----------
test('Statistik: fehlende Zahlen bleiben null (keine erfundene 0)', () => {
  const stats = mapStatsRow({ events_upcoming: 2, ideas_published: 0, tutoring_offers: null });
  assert.equal(stats.eventsUpcoming, 2);
  assert.equal(stats.ideasPublished, 0);
  assert.equal(stats.tutoringOffers, null);
  assert.equal(stats.supportsReceived, null);
});

test('Demo-Statistik zählt nur eigene Daten und keine abgesagten Events', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const user = { id: 'alex', registrations: { a: 'registered', b: 'registered', c: 'interested', d: 'registered' }, supportedIdeas: ['x'] };
  const events = [
    { id: 'a', status: 'planned', start: '2026-06-10T10:00:00Z' },
    { id: 'b', status: 'completed', start: '2026-05-10T10:00:00Z' },
    { id: 'c', status: 'planned', start: '2026-06-10T10:00:00Z' },
    { id: 'd', status: 'cancelled', start: '2026-05-10T10:00:00Z' },
  ];
  const ideas = [
    { id: 'i1', authorId: 'alex', status: 'planned' },
    { id: 'i2', authorId: 'alex', status: 'submitted' },
    { id: 'i3', authorId: 'elif', status: 'collecting' },
  ];
  const s = demoStats(user, ideas, events, now);
  assert.equal(s.eventsUpcoming, 1);
  assert.equal(s.eventsPast, 1);
  assert.equal(s.eventsInterested, 1);
  assert.equal(s.ideasSubmitted, 2);
  assert.equal(s.ideasPublished, 1);
  assert.equal(s.ideasPlanned, 1);
  assert.equal(s.supportsGiven, 1);
  assert.equal(s.tutoringOffers, null);
});

// ---------- Öffentliches Profil ----------
test('öffentliches Profil: Aktivität nur mit Freigabe', () => {
  const base = { id: UID, first_name: 'Ada', avatar_color: '#123456', school_id: null, interests: null, is_public: true };
  const hidden = mapPublicProfileRow({ ...base, show_activity: false, ideas_published: 5 });
  assert.equal(hidden.activity, null);
  assert.deepEqual(hidden.interests, []);
  const shown = mapPublicProfileRow({ ...base, show_activity: true, ideas_published: 5, events_past: 1, supports_received: 0 });
  assert.deepEqual(shown.activity, { ideasPublished: 5, eventsPast: 1, supportsReceived: 0 });
  assert.equal(mapPublicProfileRow(null), null);
});

test('nur UUIDs gehen an die Datenbank', () => {
  assert.equal(isProfileId(UID), true);
  assert.equal(isProfileId('elif'), false);
  assert.equal(isProfileId(undefined), false);
  assert.equal(isProfileId(`${UID}' or 1=1`), false);
});

test('Verzeichnis-Suche über Name und Beschreibung, Schulfilter', () => {
  const people = [
    { id: '1', firstName: 'Ada', schoolId: 'ers', interests: ['science'] },
    { id: '2', firstName: 'Can', schoolId: null, interests: [] },
  ];
  const describe = (p) => p.interests.join(' ');
  assert.deepEqual(filterDirectory(people, { query: 'scien' }, describe).map((p) => p.id), ['1']);
  assert.deepEqual(filterDirectory(people, { query: 'CAN' }, describe).map((p) => p.id), ['2']);
  assert.deepEqual(filterDirectory(people, { schoolId: 'ers' }, describe).map((p) => p.id), ['1']);
});

test('Fehlercodes → Texte', () => {
  assert.equal(profileErrorKey({ code: 'PGRST202' }), 'profiles.errors.notInstalled');
  assert.equal(profileErrorKey({ code: '42P01' }), 'profiles.errors.notInstalled');
  assert.equal(profileErrorKey({ code: '42501' }), 'profiles.errors.notAllowed');
  assert.equal(profileErrorKey({ code: 'XX000' }), 'profiles.errors.generic');
});

// ---------- Demo-Daten respektieren die Freigaben ----------
test('Demo: private Profile erscheinen nicht, nicht freigegebene Angaben fehlen', () => {
  const directory = demoDirectory('elif');
  assert.ok(!directory.some((p) => p.id === 'alex'), 'Alex ist privat');
  const deniz = directory.find((p) => p.id === 'deniz');
  assert.equal(deniz.schoolId, null);
  assert.deepEqual(deniz.interests, []);
  assert.equal(deniz.activity, null);
  assert.equal(demoPublicProfile('alex', 'elif'), null, 'privat für andere');
  assert.equal(demoPublicProfile('alex', 'alex').isSelf, true, 'Vorschau für sich selbst');
  assert.ok(directory.every((p) => p.lastName === '' && !('grade' in p)), 'nie Nachname/Klasse');
});

// ---------- API mit Fake-Client ----------
function fakeClient(responses) {
  const calls = [];
  const builder = (table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const chain = {
      select: (cols) => (call.ops.push(['select', cols]), chain),
      eq: (col, val) => (call.ops.push(['eq', col, val]), chain),
      upsert: (row, opts) => (call.ops.push(['upsert', row, opts]), chain),
      maybeSingle: () => Promise.resolve(responses[table]),
      single: () => Promise.resolve(responses[table]),
    };
    return chain;
  };
  return {
    calls,
    from: builder,
    rpc: (name, args) => {
      calls.push({ rpc: name, args });
      return Promise.resolve(responses[name]);
    },
  };
}

test('API: Freigaben lesen (eigene ID) und speichern über die Funktion (ohne ID)', async () => {
  const client = fakeClient({
    profile_sharing: { data: { is_public: true, show_school: true }, error: null },
    save_profile_sharing: { data: [{ is_public: true, show_school: false }], error: null },
  });
  const read = await fetchMySharing(client, UID);
  assert.equal(read.isPublic, true);
  assert.deepEqual(client.calls[0].ops.find((op) => op[0] === 'eq'), ['eq', 'user_id', UID]);
  const saved = await saveMySharing(client, { ...DEFAULT_SHARING, isPublic: true });
  assert.equal(saved.isPublic, true);
  const call = client.calls.at(-1);
  assert.equal(call.rpc, 'save_profile_sharing');
  assert.deepEqual(call.args, {
    p_is_public: true, p_show_school: false, p_show_interests: false, p_show_projects: false, p_show_activity: false,
  });
  assert.ok(!('p_user_id' in call.args), 'die Datenbank nimmt immer auth.uid()');
});

test('API: RPCs und Fehlerweitergabe', async () => {
  const client = fakeClient({
    get_my_activity_stats: { data: [{ events_upcoming: 3 }], error: null },
    list_public_profiles: { data: [{ id: UID, first_name: 'Ada', avatar_color: '#000000', school_id: 'ers', interests: ['music'] }], error: null },
    get_public_profile: { data: [], error: null },
  });
  assert.equal((await fetchMyStats(client)).eventsUpcoming, 3);
  assert.equal((await fetchPublicProfiles(client))[0].firstName, 'Ada');
  assert.equal(await fetchPublicProfile(client, UID), null, 'leeres Ergebnis = nicht verfügbar');
  assert.deepEqual(client.calls.at(-1).args, { p_user_id: UID });
  const failing = fakeClient({ get_my_activity_stats: { data: null, error: { code: 'PGRST202' } } });
  await assert.rejects(fetchMyStats(failing), (error) => error.code === 'PGRST202');
});

// ---------- Migration 012: Sicherheitsregeln im SQL ----------
test('Migration 012: privat als Standard, kein anon, SECURITY DEFINER mit festem search_path', () => {
  for (const col of ['is_public', 'show_school', 'show_interests', 'show_projects', 'show_activity']) {
    assert.match(sql, new RegExp(`${col}\\s+boolean not null default false`), col);
  }
  assert.match(sql, /alter table public\.profile_sharing enable row level security/);
  assert.match(sql, /revoke all on public\.profile_sharing from public, anon, authenticated/);
  for (const fn of ['get_my_activity_stats()', 'list_public_profiles()', 'get_public_profile(uuid)',
    'save_profile_sharing(boolean, boolean, boolean, boolean, boolean)']) {
    assert.ok(sql.includes(`revoke execute on function public.${fn}`), fn);
  }
  const definers = sql.replace(/\r\n/g, '\n').match(/security definer\nset search_path = ''/g) ?? [];
  assert.equal(definers.length, 4);
  // Schreiben nur über die Funktion: keine insert/update-Rechte auf profile_sharing
  assert.ok(!/grant[^;]*(insert|update)[^;]*on public\.profile_sharing/i.test(sql));
  // Klasse (grade) wird nie öffentlich ausgegeben
  const publicPart = sql.slice(sql.indexOf('4) Öffentliche Profile'), sql.indexOf('5) Ausführrechte'));
  assert.ok(!/grade/.test(publicPart), 'grade darf in öffentlichen Funktionen nicht vorkommen');
  // Fremde Profile nur mit is_public
  assert.match(publicPart, /p\.id = uid or coalesce\(s\.is_public, false\)/);
  // Keine Änderung an den Policies von profiles
  assert.ok(!/policy[^;]*on public\.profiles/i.test(sql));
});

test('Navigation: Profilseiten gehören zu Community bzw. Mein Bereich', () => {
  assert.equal(sectionForPath('/community/people'), 'community');
  assert.equal(sectionForPath('/community/people/abc'), 'community');
  assert.equal(sectionForPath('/me/sharing'), 'me');
});
