// Anka Bilim auf der Website ausblenden (Entscheidung Ege, 2026-11-10) – nur Anzeige, keine Daten gelöscht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  HIDDEN_SCHOOL_IDS,
  getSchool,
  getSchoolRecord,
  isHiddenSchool,
  schools,
  visibleSchoolIds,
  visibleSchools,
} from '../src/data/schools.js';
import { events } from '../src/data/events.js';
import { seedIdeas } from '../src/data/ideas.js';
import { demoProfiles } from '../src/data/profiles.js';
import { demoTutoringEntries } from '../src/data/tutoring.js';
import {
  isVisibleContent,
  isVisibleDemoProfile,
  matchesSchoolName,
  mentionsHiddenSchool,
  publicOnly,
  schoolsIncludingExisting,
  visibleContent,
  visibleDemoProfiles,
  visibleOrOwn,
} from '../src/lib/schoolVisibility.js';
import { communityGroups } from '../src/lib/communityGroups.js';
import { filterEvents, filterIdeas, getEventRecommendations, getMyEvents, getMyIdeas } from '../src/lib/selectors.js';
import { filterTutoringEntries, matchTutoring } from '../src/lib/tutoring.js';

const root = join(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const NAME = /anka\s*[-_]?\s*bilim/i;
const allTexts = (item) => JSON.stringify([item.title, item.summary, item.description, item.location]);

test('Daten bleiben vollständig erhalten – nur ausgeblendet', () => {
  assert.deepEqual(HIDDEN_SCHOOL_IDS, ['anka']);
  assert.ok(getSchoolRecord('anka'), 'Eintrag in schools.js bleibt');
  assert.ok(schools.some((s) => s.id === 'anka'));
  assert.ok(demoProfiles.some((p) => p.schoolId === 'anka'), 'Demo-Profil bleibt in den Daten');
  assert.ok(events.some((e) => e.hostSchoolId === 'anka'), 'Demo-Events bleiben in den Daten');
  assert.equal(isHiddenSchool('anka'), true);
  assert.equal(isHiddenSchool('ers'), false);
});

test('Anzeige-Zugriffe liefern Anka Bilim nicht mehr', () => {
  assert.equal(getSchool('anka'), undefined);
  assert.equal(getSchool('ers').id, 'ers');
  assert.deepEqual(visibleSchools.map((s) => s.id), ['ers']);
  assert.deepEqual(visibleSchoolIds(['ers', 'anka']), ['ers']);
  assert.deepEqual(visibleSchoolIds(null), []);
});

test('Erkennung des Namens: Schreibweisen und Sprachen', () => {
  for (const text of ['Anka Bilim', 'ANKA BILIM', 'AnkaBilim', 'anka-bilim', 'Treffpunkt: Anka Bilim, Haupteingang']) {
    assert.equal(mentionsHiddenSchool(text), true, text);
  }
  assert.equal(mentionsHiddenSchool({ de: 'x', tr: 'Anka Bilim korosu' }), true);
  // „Ankara“ (Stadt, Zeitzone) ist KEIN Bezug
  for (const text of ['Ernst-Reuter-Schule Ankara', 'Ankara-Zeit (UTC+3)', null, undefined, '']) {
    assert.equal(mentionsHiddenSchool(text), false, String(text));
  }
});

test('Demo-Inhalte: alles mit Bezug zu Anka Bilim ausgeblendet, gemeinsame Inhalte bleiben', () => {
  for (const list of [events, seedIdeas, demoTutoringEntries]) {
    const shown = visibleContent(list);
    for (const item of shown) {
      assert.ok(!isHiddenSchool(item.hostSchoolId) && !isHiddenSchool(item.schoolId), item.id);
      assert.doesNotMatch(allTexts(item), NAME, item.id);
    }
  }
  // gemeinsame ERS-Events mit Anka als Partnerschule bleiben (nur das Kennzeichen fällt weg)
  assert.ok(visibleContent(events).some((e) => e.hostSchoolId === 'ers' && e.schoolIds.includes('anka')));
  assert.equal(isVisibleContent(null), false);
  assert.deepEqual(visibleContent(undefined), []);
});

test('Demo-Profile: Personen von Anka Bilim nicht wählbar und nicht im Verzeichnis', () => {
  assert.ok(visibleDemoProfiles.length > 0);
  assert.ok(visibleDemoProfiles.every((p) => p.schoolId !== 'anka'));
  assert.equal(isVisibleDemoProfile('elif'), false);
  assert.equal(isVisibleDemoProfile('alex'), true);
  assert.equal(isVisibleDemoProfile('unbekannt'), false);
});

test('Community-Gruppen: Gruppen, deren Titel Anka Bilim nennt, werden nicht gelistet', () => {
  const rooms = [
    { id: 'p1', kind: 'project', ideaTitle: 'Sprach-Tandem ERS × Anka Bilim' },
    { id: 'p2', kind: 'project', ideaTitle: 'Podcast' },
    { id: 'e1', kind: 'event', eventTitle: { de: 'Chor von Anka Bilim' } },
  ];
  assert.deepEqual(communityGroups(rooms).map((r) => r.id), ['p2']);
});

test('Übersetzungen enthalten Anka Bilim nicht mehr', () => {
  for (const lang of ['de', 'en', 'tr']) assert.doesNotMatch(read('src', 'locales', `${lang}.json`), NAME, lang);
});

test('Auswahllisten und Anzeigen nutzen die gefilterten Schulen', () => {
  for (const page of ['AboutPage.jsx', 'EventsPage.jsx', 'NewIdeaPage.jsx']) {
    assert.match(read('src', 'pages', page), /import \{ visibleSchools as schools \} from '\.\.\/data\/schools\.js';/, page);
  }
  assert.match(read('src', 'pages', 'RegisterPage.jsx'), /filter\(\(school\) => !isHiddenSchool\(school\.id\)\)/);
  const admin = read('src', 'pages', 'admin', 'AdminEventFormPage.jsx');
  assert.match(admin, /const ALLOWED_SCHOOL_IDS = allSchools\.map/, 'Prüfung erlaubt weiter alle Schulen (kein Datenverlust beim Speichern)');
  assert.match(admin, /emptyEventForm\(\{ schoolIds: \[\.\.\.VISIBLE_SCHOOL_IDS\] \}\)/);
});

test('keine Anka-Bilim-Texte im Code der Oberfläche (Komponenten, Seiten, Stile, index.html)', () => {
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
  const files = walk('src').filter((f) => !f.startsWith(join('src', 'data')) && /\.(jsx?|css|json)$/.test(f));
  for (const file of [...files, 'index.html']) assert.doesNotMatch(read(file), NAME, file);
});

// ---------------------------------------------------------------------------
// Erweiterung (Entscheidungen A–D, 2026-11-10)
// ---------------------------------------------------------------------------

test('A) Zielgruppe, Fach, Themen und Verfügbarkeit werden ebenfalls geprüft', () => {
  const base = { schoolId: 'ers', hostSchoolId: 'ers', title: 'x' };
  assert.equal(isVisibleContent({ ...base, audience: { de: 'Für Schüler:innen von Anka Bilim' } }), false);
  assert.equal(isVisibleContent({ ...base, subject: { tr: 'Anka Bilim ile Almanca' } }), false);
  assert.equal(isVisibleContent({ ...base, topics: 'Treffen mit AnkaBilim' }), false);
  assert.equal(isVisibleContent({ ...base, availability: { en: 'after school at Anka Bilim' } }), false);
  // Themen-Listen (IDs) und normale Texte bleiben sichtbar
  assert.equal(isVisibleContent({ ...base, topics: ['language', 'music'], audience: { de: 'Klassen 9–12' } }), true);
});

test('B) Namenserkennung: ganze Wörter, Schreibweisen, türkische Buchstaben – Ankara bleibt', () => {
  for (const text of ['Anka Bilim', 'ANKA BİLİM', 'anka-bilim', 'AnkaBilim', 'anka_bilim', "Anka Bilim'de", '(Anka Bilim)', 'Ánka Bílim']) {
    assert.equal(mentionsHiddenSchool(text), true, text);
  }
  for (const text of ['Ankara', 'Ankara Bilim Merkezi', 'Ankaralı', 'Ernst-Reuter-Schule Ankara', 'Ankabilimsel', 'Sankabilim']) {
    assert.equal(mentionsHiddenSchool(text), false, text);
  }
  // kurze Namen (z. B. „ERS“, falls je ausgeblendet) treffen keine Wortteile mehr
  assert.equal(matchesSchoolName('Anders als sonst', 'ERS'), false);
  assert.equal(matchesSchoolName('Personen und Versuche', 'ERS'), false);
  assert.equal(matchesSchoolName('Treffen der ERS-Klasse', 'ERS'), true);
  assert.equal(matchesSchoolName('ers', 'ERS'), true);
});

test('C) eigene Inhalte bleiben für die Person erhalten (ownOnly) – öffentliche Listen bleiben ohne', () => {
  const now = new Date('2030-01-01T08:00:00Z');
  const ev = (id, extra) => ({ id, title: 'E', start: '2030-01-05T10:00:00Z', status: 'planned', topics: ['language'],
    schoolIds: ['ers'], hostSchoolId: 'ers', format: 'meetup', ...extra });
  const raw = [ev('ers'), ev('anka-reg', { hostSchoolId: 'anka', schoolIds: ['anka'] }), ev('anka-other', { hostSchoolId: 'anka' })];
  const registrations = { 'anka-reg': 'registered' };
  const events = visibleOrOwn(raw, (e) => Boolean(registrations[e.id]));
  assert.deepEqual(events.map((e) => [e.id, Boolean(e.ownOnly)]), [['ers', false], ['anka-reg', true]]);
  const user = { id: 'u', schoolId: 'anka', interests: ['language'], registrations };
  assert.deepEqual(getMyEvents(user, events, now).upcoming.map((e) => e.id), ['anka-reg'], '„Meine Events“ zeigt die eigene Anmeldung');
  assert.deepEqual(filterEvents(events, {}, now).map((e) => e.id), ['ers'], 'öffentliche Liste ohne ownOnly');
  assert.deepEqual(getEventRecommendations({ ...user, registrations: {} }, events, now).map((r) => r.event.id), ['ers']);
  assert.deepEqual(publicOnly(events).map((e) => e.id), ['ers']);
  // eine ANDERE Person (ohne Anmeldung) bekommt das Event nicht
  assert.deepEqual(visibleOrOwn(raw, () => false).map((e) => e.id), ['ers']);

  const ideas = visibleOrOwn(
    [
      { id: 'i-ers', schoolId: 'ers', authorId: 'x', title: 'A', summary: '', topics: [] },
      { id: 'i-own', schoolId: 'anka', authorId: 'u', title: 'B', summary: '', topics: [] },
      { id: 'i-foreign', schoolId: 'anka', authorId: 'y', title: 'C', summary: '', topics: [] },
    ],
    (idea) => idea.authorId === 'u',
  );
  assert.deepEqual(getMyIdeas({ id: 'u', supportedIdeas: [] }, ideas).authored.map((i) => i.id), ['i-own']);
  assert.deepEqual(filterIdeas(ideas).map((i) => i.id), ['i-ers'], 'öffentliche Ideen-Liste ohne eigene Anka-Idee');

  const t = (id, extra) => ({ id, kind: 'offer', status: 'active', schoolId: 'ers', isOwn: false, languages: ['de'], format: 'online',
    subject: { de: 'Mathe' }, topics: { de: 'x' }, description: { de: 'y' }, availability: { de: 'z' }, ...extra });
  const entries = visibleOrOwn([t('t-ers'), t('t-own', { schoolId: 'anka', isOwn: true }), t('t-other', { schoolId: 'anka' })],
    (e) => e.isOwn === true);
  assert.deepEqual(entries.map((e) => e.id), ['t-ers', 't-own']);
  assert.deepEqual(filterTutoringEntries(entries, 'my').map((e) => e.id), ['t-own'], 'eigener Eintrag unter „Meine“');
  assert.deepEqual(filterTutoringEntries(entries, 'offers').map((e) => e.id), ['t-ers'], 'nicht in öffentlichen Angeboten');
  assert.ok(!matchTutoring(entries).entries.some((e) => e.id === 't-own'));
});

test('C) Verdrahtung: eigene Ideen, Anmeldungen, Nachhilfe-Einträge, eigenes Profil', () => {
  const appState = read('src', 'state', 'AppStateContext.jsx');
  assert.match(appState, /const events = visibleOrOwn\(studentEvents, \(event\) => Boolean\(accountEvents\.registrations\[event\.id\]\)\);/);
  assert.match(appState, /ideas: visibleOrOwn\(accountIdeas\.ideas, \(idea\) => idea\.authorId === auth\.user\.id\)/);
  assert.match(read('src', 'state', 'TutoringContext.jsx'), /visibleOrOwn\(result\.entries, \(entry\) => entry\.isOwn === true\)/);
  assert.match(read('src', 'state', 'useProfiles.js'), /if \(profile && profile\.id === ownId\) return profile;/);
  // Detailseiten zeigen bei ausgeblendeter Schule weder Name noch ID
  assert.match(read('src', 'pages', 'TutoringDetailPage.jsx'), /isHiddenSchool\(entry\.schoolId\) \? \[\]/);
  assert.match(read('src', 'pages', 'EventDetailPage.jsx'), /isHiddenSchool\(event\.hostSchoolId\)\s*\? \[\]/);
});

test('D) Moderation nutzt Events ohne Schul-Ausblendung (staffEvents), Schüleransicht bleibt gefiltert', () => {
  assert.match(read('src', 'state', 'AppStateContext.jsx'), /staffEvents: studentEvents,/);
  const mod = read('src', 'pages', 'ChatModerationPage.jsx');
  assert.match(mod, /const \{ events: studentEvents, staffEvents \} = useAppState\(\);/);
  assert.match(mod, /const events = staffEvents \?\? studentEvents;/);
  // nirgends sonst verwendet
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
  const users = walk('src').filter((f) => /\.jsx?$/.test(f) && read(f).includes('staffEvents'));
  assert.deepEqual(users.map((f) => f.replace(/\\/g, '/')).sort(), ['src/pages/ChatModerationPage.jsx', 'src/state/AppStateContext.jsx']);
});

test('Abmelden von einem nur-für-mich-sichtbaren Event: verständliche Rückmeldung statt „nicht gefunden“', () => {
  const page = read('src', 'pages', 'EventDetailPage.jsx');
  // vor dem Speichern merken, bei Fehler zurücksetzen
  assert.match(page, /const leavingOwnOnly = event\.ownOnly === true && next === null;/);
  assert.match(page, /if \(leavingOwnOnly\) setLeftOwnOnlyId\(event\.id\);\s*const ok = await actions\.setRegistration/);
  assert.match(page, /if \(leavingOwnOnly\) setLeftOwnOnlyId\(null\);/);
  // nur für genau dieses Event; sonst weiterhin „nicht gefunden“
  assert.match(page, /if \(leftOwnOnlyId === eventId\) \{/);
  assert.match(page, /to="\/events\?tab=mine"/);
  for (const lang of ['de', 'en', 'tr']) {
    const d = JSON.parse(read('src', 'locales', `${lang}.json`));
    for (const key of ['title', 'text', 'toMine']) assert.ok(d.eventDetail.leftOwnOnly[key], `${lang}: eventDetail.leftOwnOnly.${key}`);
    assert.doesNotMatch(d.eventDetail.leftOwnOnly.text, NAME, 'kein Schulname im Text');
    assert.ok(d.admin.eventForm.hiddenSchool, `${lang}: admin.eventForm.hiddenSchool`);
  }
});

test('Admin-Formular: bestehende ausgeblendete Schule (Gastgeber/beteiligt) bleibt sichtbar – neue Events ohne', () => {
  // neues Event: nur sichtbare Schulen
  assert.deepEqual(schoolsIncludingExisting([]).map((s) => s.id), ['ers']);
  assert.deepEqual(schoolsIncludingExisting(undefined).map((s) => s.id), ['ers']);
  // bestehendes Event mit Gastgeber anka: anka erscheint (Reihenfolge wie schools.js)
  assert.deepEqual(schoolsIncludingExisting(['anka', 'anka', 'ers']).map((s) => s.id), ['ers', 'anka']);
  assert.deepEqual(schoolsIncludingExisting(['ers']).map((s) => s.id), ['ers']);
  const admin = read('src', 'pages', 'admin', 'AdminEventFormPage.jsx');
  assert.match(admin, /const formSchools = schoolsIncludingExisting\(\[original\?\.hostSchoolId, \.\.\.\(original\?\.schoolIds \?\? \[\]\)\]\);/);
  // Ankreuzfelder UND Gastgeber-Auswahl nutzen formSchools, ausgeblendete Schulen mit Zusatz gekennzeichnet
  assert.equal((admin.match(/formSchools/g) ?? []).length >= 3, true);
  assert.match(admin, /\$\{school\.name\} \(\$\{t\('admin\.eventForm\.hiddenSchool'\)\}\)/);
});
