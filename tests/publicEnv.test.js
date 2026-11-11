// Öffentlicher Build (npm run build = build:public): nur das freigegebene Supabase-Projekt, nie das alte Live-Projekt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  APPROVED_PUBLIC_HOST,
  FORBIDDEN_PROJECT_REFS,
  checkPublicBundle,
  checkPublicEnv,
  isHostedBuild,
  loadPublicEnv,
} from '../scripts/publicEnv.mjs';

// Fiktive Werte – keine echten Keys im Test
const GOOD = {
  VITE_SUPABASE_URL: `https://${APPROVED_PUBLIC_HOST}`,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TESTWERT',
  VITE_ENABLE_SIGNUP: 'true',
};
const LIVE_URL = `https://${FORBIDDEN_PROJECT_REFS[0]}.supabase.co`;

test('freigegebenes Projekt + publishable Key → erlaubt, Ziel „public“ (kein STAGING-Kennzeichen)', () => {
  const report = checkPublicEnv(GOOD);
  assert.equal(report.ok, true, report.problems.join('; '));
  assert.equal(report.host, APPROVED_PUBLIC_HOST);
  assert.equal(report.env.VITE_DC_TARGET, 'public');
  assert.equal(report.env.VITE_ENABLE_SIGNUP, 'true');
  assert.deepEqual(Object.keys(report.env).sort(), [
    'VITE_DC_TARGET',
    'VITE_ENABLE_SIGNUP',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_URL',
  ]);
});

test('Abbruch: fehlende URL oder fehlender Key', () => {
  assert.equal(checkPublicEnv({ ...GOOD, VITE_SUPABASE_URL: '' }).ok, false);
  assert.equal(checkPublicEnv({ ...GOOD, VITE_SUPABASE_PUBLISHABLE_KEY: '' }).ok, false);
  assert.equal(checkPublicEnv({}).ok, false);
});

test('Abbruch: altes Live-Projekt', () => {
  const report = checkPublicEnv({ ...GOOD, VITE_SUPABASE_URL: LIVE_URL });
  assert.equal(report.ok, false);
  assert.match(report.problems.join(' '), /ALTE LIVE/);
});

test('Abbruch: jedes andere Projekt, http statt https, ähnliche Hosts', () => {
  for (const url of [
    'https://abcdefghijklmnopqrst.supabase.co',
    `http://${APPROVED_PUBLIC_HOST}`,
    `https://${APPROVED_PUBLIC_HOST}.evil.example`,
    `https://x${APPROVED_PUBLIC_HOST}`,
    'keine-url',
  ]) {
    assert.equal(checkPublicEnv({ ...GOOD, VITE_SUPABASE_URL: url }).ok, false, url);
  }
});

test('Abbruch: geheimer Key, service_role oder kein publishable Key', () => {
  for (const key of ['sb_secret_TESTWERT', 'eyJ.service_role.x', 'irgendwas']) {
    assert.equal(checkPublicEnv({ ...GOOD, VITE_SUPABASE_PUBLISHABLE_KEY: key }).ok, false, key);
  }
});

test('VITE_ENABLE_SIGNUP: Pflicht, nur true/false – keine stille Voreinstellung', () => {
  assert.equal(checkPublicEnv({ ...GOOD, VITE_ENABLE_SIGNUP: 'ja' }).ok, false);
  const { VITE_ENABLE_SIGNUP, ...withoutSignup } = GOOD;
  const missing = checkPublicEnv(withoutSignup);
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join(' '), /VITE_ENABLE_SIGNUP fehlt/);
  assert.equal(checkPublicEnv({ ...GOOD, VITE_ENABLE_SIGNUP: 'false' }).env.VITE_ENABLE_SIGNUP, 'false');
});

test('Quelle: Umgebungsvariablen vor .env.staging.local – .env.local wird nie gelesen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'connected-public-'));
  // .env.local (alt: Live) liegt daneben und darf NICHT benutzt werden
  writeFileSync(join(dir, '.env.local'), `VITE_SUPABASE_URL=${LIVE_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_LIVE\n`);
  const missing = loadPublicEnv(dir, {});
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join(' '), /\.env\.staging\.local/);

  writeFileSync(join(dir, '.env.staging.local'), Object.entries(GOOD).map(([k, v]) => `${k}=${v}`).join('\n'));
  const fromFile = loadPublicEnv(dir, {});
  assert.equal(fromFile.ok, true);
  assert.equal(fromFile.source, '.env.staging.local');

  const fromEnvironment = loadPublicEnv(dir, { ...GOOD, VITE_ENABLE_SIGNUP: 'false' });
  assert.equal(fromEnvironment.ok, true);
  assert.equal(fromEnvironment.source, 'environment');
  assert.equal(fromEnvironment.env.VITE_ENABLE_SIGNUP, 'false');

  // Umgebungsvariable zeigt auf Live → Abbruch (kein stilles Ausweichen auf eine Datei)
  const liveEnvironment = loadPublicEnv(dir, { ...GOOD, VITE_SUPABASE_URL: LIVE_URL });
  assert.equal(liveEnvironment.ok, false);
  // Nur EINE der beiden Variablen gesetzt → Abbruch statt Mischung mit der Datei
  assert.equal(loadPublicEnv(dir, { VITE_SUPABASE_URL: GOOD.VITE_SUPABASE_URL }).ok, false);
});

test('Gehosteter Build (CI/VERCEL/NETLIFY): nur Umgebungsvariablen, alle drei Pflicht, keine Datei', () => {
  assert.equal(isHostedBuild({}), false);
  assert.equal(isHostedBuild({ CI: 'false' }), false);
  assert.equal(isHostedBuild({ CI: '0' }), false);
  for (const name of ['CI', 'VERCEL', 'NETLIFY']) assert.equal(isHostedBuild({ [name]: name === 'CI' ? 'true' : '1' }), true, name);

  const dir = mkdtempSync(join(tmpdir(), 'connected-hosted-'));
  // Eine (gültige) Staging-Datei liegt da – im gehosteten Build darf sie NICHT benutzt werden
  writeFileSync(join(dir, '.env.staging.local'), Object.entries(GOOD).map(([k, v]) => `${k}=${v}`).join('\n'));
  const noVariables = loadPublicEnv(dir, { CI: 'true' });
  assert.equal(noVariables.ok, false);
  assert.equal(noVariables.source, 'environment');
  assert.equal(noVariables.problems.filter((p) => p.startsWith('Gehosteter Build')).length, 3);

  for (const name of Object.keys(GOOD)) {
    const { [name]: _removed, ...rest } = GOOD;
    const report = loadPublicEnv(dir, { VERCEL: '1', ...rest });
    assert.equal(report.ok, false, `ohne ${name}`);
    assert.match(report.problems.join(' '), new RegExp(name));
  }
  assert.equal(loadPublicEnv(dir, { NETLIFY: 'true', ...GOOD, VITE_SUPABASE_URL: LIVE_URL }).ok, false);
  const ok = loadPublicEnv(dir, { CI: 'true', ...GOOD });
  assert.equal(ok.ok, true);
  assert.equal(ok.hosted, true);
  // Meldungen enthalten nie den Key
  assert.doesNotMatch(JSON.stringify(loadPublicEnv(dir, { CI: '1', ...GOOD, VITE_SUPABASE_URL: LIVE_URL }).problems), /TESTWERT/);
});

test('Prüfung des fertigen Builds: Host vorhanden, kein Live-Projekt, kein STAGING-Kennzeichen, kein Secret', () => {
  const ok = `const u="https://${APPROVED_PUBLIC_HOST}";`;
  assert.deepEqual(checkPublicBundle(ok), []);
  assert.equal(checkPublicBundle('const u="x";').length, 1);
  assert.equal(checkPublicBundle(`${ok}"${FORBIDDEN_PROJECT_REFS[0]}"`).length, 1);
  assert.equal(checkPublicBundle(`${ok}className:"demo-pill demo-pill--staging"`).length, 1);
  assert.equal(checkPublicBundle(`${ok}"sb_secret_abc"`).length, 1);
  // Die Schutzprüfung im Client-Code (startsWith("sb_secret_")) ist KEIN Secret
  assert.deepEqual(checkPublicBundle(`${ok}k.startsWith("sb_secret_")`), []);
});

test('vite.config.js: Modus „public“ nutzt nur geprüfte Werte, leeren envDir und die Build-Prüfung; npm run build = öffentlich', () => {
  const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(config, /mode === 'public'/);
  assert.match(config, /loadPublicEnv\(root\)/);
  assert.match(config, /plugins: \[react\(\), verifyPublicBundle\(\)\]/);
  assert.match(config, /envDir: emptyEnvDir/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['build:public'], 'vite build --mode public');
  assert.equal(pkg.scripts.build, 'vite build --mode public', 'Standard-Build ist der öffentliche Build');
  assert.equal(pkg.scripts['dev:staging'], 'vite --mode staging', 'Staging-Start unverändert');
  assert.ok(Object.values(pkg.scripts).every((cmd) => !/^vite build\s*$/.test(cmd)), 'kein Build ohne Modus');
});

test('„vite build“ ohne Modus (würde .env.local laden) bricht ab, bevor etwas gebaut wird', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = join(mkdtempSync(join(tmpdir(), 'connected-nomode-')), 'dist');
  const run = spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', out], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '', VERCEL: '', NETLIFY: '' },
    timeout: 60000,
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr + run.stdout, /Build im Modus "production" abgebrochen/);
  assert.equal(existsSync(out), false, 'kein Build-Ordner entstanden');
});

test('STAGING-Kennzeichen erscheint nur bei VITE_DC_TARGET === "staging"', () => {
  const topBar = readFileSync(new URL('../src/components/layout/TopBar.jsx', import.meta.url), 'utf8');
  assert.match(topBar, /const isStaging = import\.meta\.env\.VITE_DC_TARGET === 'staging';/);
  assert.match(topBar, /\{isStaging && \(/);
});
