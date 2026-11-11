// Kein Demo-Modus mehr: Gäste sehen keine erfundenen Inhalte; „npm run dev“ nutzt nur das freigegebene Projekt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUEST_USER } from '../src/lib/accountProfile.js';
import { APPROVED_PUBLIC_HOST, FORBIDDEN_PROJECT_REFS } from '../scripts/publicEnv.mjs';
import { demoProfiles } from './fixtures/profiles.js';
import { events as fixtureEvents } from './fixtures/events.js';
import { demoTutoringEntries } from './fixtures/tutoring.js';
import viteConfig from '../vite.config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(jsx?|mjs)$/.test(name) ? [p] : [];
  });
}
const srcFiles = sourceFiles(join(root, 'src'));
const srcCode = srcFiles.map((p) => readFileSync(p, 'utf8')).join('\n');

test('Gast ist neutral: kein Name, keine Schule, keine Anmeldungen, keine Inhalte', () => {
  assert.equal(GUEST_USER.firstName, '');
  assert.equal(GUEST_USER.schoolId, null);
  assert.equal(GUEST_USER.isRealAccount, false);
  assert.equal(GUEST_USER.isGuest, true);
  assert.deepEqual(GUEST_USER.interests, []);
  assert.deepEqual(GUEST_USER.registrations, {});
  assert.deepEqual(GUEST_USER.supportedIdeas, []);
  assert.ok(Object.isFrozen(GUEST_USER));
});

test('App-Code enthält keine Demo-Daten mehr (liegen nur noch unter tests/fixtures)', () => {
  for (const name of ['events', 'ideas', 'profiles', 'publicProfiles', 'tutoring', 'projects']) {
    assert.doesNotMatch(srcCode, new RegExp(`data/${name}\\.js`), `src importiert ${name}.js nicht mehr`);
  }
  // Erfundene Personen, Events und Nachhilfe-Einträge der früheren Demo kommen im App-Code nicht vor
  for (const person of demoProfiles) assert.ok(!srcCode.includes(`'${person.lastName}'`), person.lastName);
  for (const event of fixtureEvents.slice(0, 5)) assert.ok(!srcCode.includes(event.title.de), event.title.de);
  for (const entry of demoTutoringEntries.slice(0, 3)) assert.ok(!srcCode.includes(entry.description.de ?? entry.description));
  // Keine Demo-Bausteine mehr
  assert.doesNotMatch(srcCode, /DemoNotice|ProfileSwitcher|DemoBadge|resetDemo|switchProfile|deutschconnect\.demoState/);
  assert.doesNotMatch(srcCode, /status:\s*'demo'|=== 'demo'/);
});

test('Sprachdateien: kein Demo-/Beispiel-Text mehr, Gast-Texte in allen drei Sprachen', () => {
  for (const lang of ['de', 'en', 'tr']) {
    const text = read('src', 'locales', `${lang}.json`);
    assert.doesNotMatch(text, /demo|fiktiv|fictional|kurgusal/i, lang);
    const data = JSON.parse(text);
    assert.ok(data.guest.loginRequiredTitle && data.guest.welcomeTitle.includes('Connect/ED'), lang);
  }
});

test('Seiten für Mitglieder liegen hinter RequireAccount; Start, Spiele, Login, Hilfe, Über bleiben öffentlich', () => {
  const app = read('src', 'App.jsx');
  const gateStart = app.indexOf('<Route element={<RequireAccount />}>');
  const gateEnd = app.indexOf('</Route>', gateStart);
  assert.ok(gateStart > 0 && gateEnd > gateStart);
  const gated = app.slice(gateStart, gateEnd);
  for (const path of ['discover', 'events', 'events/:eventId', 'ideas', 'ideas/new', 'ideas/:ideaId', 'tutoring',
    'tutoring/new', 'community/groups', 'community/people', 'community/people/:profileId', 'chat',
    'chat/rooms/:roomId', 'chat/conversations/:conversationId', 'chat/moderation', 'me', 'me/interests',
    'me/settings', 'me/sharing']) {
    assert.match(gated, new RegExp(`path="${path.replace(/[/:]/g, (c) => `\\${c}`)}"`), path);
  }
  const outside = app.slice(0, gateStart) + app.slice(gateEnd);
  for (const path of ['community', 'community/games', 'community/games/chess', 'login', 'register',
    'forgot-password', 'reset-password', 'about', 'help', 'admin']) {
    assert.match(outside, new RegExp(`path="${path.replace(/\//g, '\\/')}"`), path);
  }
  assert.match(app, /<Route index element={<HomePage \/>} \/>/);
  // Startseite: Gäste bekommen eine eigene Begrüßung, keine Dashboard-Daten
  assert.match(read('src', 'pages', 'HomePage.jsx'), /return mode === 'guest' \? <GuestHome \/> : <MemberHome \/>;/);
});

test('Kopfzeile: kein Demo-Kennzeichen; STAGING nur bei VITE_DC_TARGET === "staging"', () => {
  const topBar = read('src', 'components', 'layout', 'TopBar.jsx');
  assert.doesNotMatch(topBar, /demo\.label|demo\.tooltip|demoStillActive/);
  assert.equal((topBar.match(/className="demo-pill[ "]/g) ?? []).length, 1, 'nur das STAGING-Kennzeichen');
  assert.match(topBar, /\{isStaging && \(\s*<span className="demo-pill demo-pill--staging"/);
});

// --- npm run dev: nur das freigegebene Projekt, nie .env.local --------------------------------------------
const VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_ENABLE_SIGNUP', 'CI', 'VERCEL', 'NETLIFY'];
function withEnv(values, fn) {
  const saved = Object.fromEntries(VARS.map((name) => [name, process.env[name]]));
  for (const name of VARS) delete process.env[name];
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    for (const name of VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}
const GOOD = {
  VITE_SUPABASE_URL: `https://${APPROVED_PUBLIC_HOST}`,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TESTWERT',
  VITE_ENABLE_SIGNUP: 'true',
};
const quiet = (fn) => {
  const info = console.info;
  console.info = () => {};
  try {
    return fn();
  } finally {
    console.info = info;
  }
};

test('npm run dev (Modus development): freigegebenes Projekt, kein STAGING-Kennzeichen, leerer envDir', () => {
  const config = withEnv(GOOD, () => quiet(() => viteConfig({ command: 'serve', mode: 'development', isPreview: false })));
  assert.equal(config.define['import.meta.env.VITE_SUPABASE_URL'], JSON.stringify(GOOD.VITE_SUPABASE_URL));
  assert.equal(config.define['import.meta.env.VITE_DC_TARGET'], JSON.stringify('development'));
  assert.match(config.envDir, /no-env/);
  assert.equal(JSON.parse(read('package.json')).scripts.dev, 'vite');
});

test('npm run dev bricht ab: altes Live-Projekt, anderes Projekt, fehlender Key, unbekannter Modus', () => {
  const live = { ...GOOD, VITE_SUPABASE_URL: `https://${FORBIDDEN_PROJECT_REFS[0]}.supabase.co` };
  assert.throws(() => withEnv(live, () => viteConfig({ command: 'serve', mode: 'development' })), /ALTE LIVE/);
  const other = { ...GOOD, VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co' };
  assert.throws(() => withEnv(other, () => viteConfig({ command: 'serve', mode: 'development' })), /nicht das freigegebene/);
  const { VITE_SUPABASE_PUBLISHABLE_KEY, ...noKey } = GOOD;
  assert.throws(() => withEnv(noKey, () => viteConfig({ command: 'serve', mode: 'development' })), /fehlt/);
  assert.throws(() => withEnv(GOOD, () => viteConfig({ command: 'serve', mode: 'irgendwas' })), /abgebrochen/);
  // Build ohne Modus bleibt verboten; „vite preview“ lädt keine Zugangsdaten
  assert.throws(() => withEnv(GOOD, () => viteConfig({ command: 'build', mode: 'production' })), /abgebrochen/);
  const preview = withEnv({}, () => viteConfig({ command: 'serve', mode: 'production', isPreview: true }));
  assert.equal(preview.define, undefined);
});

test('dev:staging behält das STAGING-Kennzeichen (Diagnose)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['dev:staging'], 'vite --mode staging');
  assert.match(read('scripts', 'stagingEnv.mjs'), /VITE_DC_TARGET: 'staging'/);
});
