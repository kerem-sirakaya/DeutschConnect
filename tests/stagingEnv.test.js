// Staging-Zugang: sichere Prüfung ohne Keys. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStagingEnv, parseEnv } from '../scripts/stagingEnv.mjs';

const live = { VITE_SUPABASE_URL: 'https://liveproject.supabase.co' };
const good = { VITE_SUPABASE_URL: 'https://stagingproject.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };

test('.env-Parser: Kommentare, Anführungszeichen, Leerzeilen', () => {
  assert.deepEqual(parseEnv('# Kommentar\n\nA=1\r\nB="zwei"\nC = \'drei\'\nkaputt\n'), { A: '1', B: 'zwei', C: 'drei' });
});

test('gültiger Staging-Zugang, nur erlaubte Variablen für die App', () => {
  const report = checkStagingEnv({ ...good, OTHER: 'x' }, live);
  assert.equal(report.ok, true);
  assert.equal(report.stagingHost, 'stagingproject.supabase.co');
  assert.equal(report.differsFromLive, true);
  assert.deepEqual(Object.keys(report.env).sort(),
    ['VITE_DC_TARGET', 'VITE_ENABLE_SIGNUP', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL']);
  assert.equal(report.env.VITE_DC_TARGET, 'staging');
});

test('Abbruch: gleiche URL wie Live', () => {
  const report = checkStagingEnv({ ...good, VITE_SUPABASE_URL: 'https://LIVEPROJECT.supabase.co/' }, live);
  assert.equal(report.ok, false);
  assert.match(report.problems.join(), /LIVE/);
});

test('Abbruch: geheimer Key, Passwort-Variablen, fehlende Werte', () => {
  assert.equal(checkStagingEnv({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }, live).ok, false);
  assert.equal(checkStagingEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: 'x' }, live).ok, false);
  assert.equal(checkStagingEnv({ ...good, DB_PASSWORD: 'x' }, live).ok, false);
  assert.equal(checkStagingEnv({ VITE_SUPABASE_URL: good.VITE_SUPABASE_URL }, live).ok, false);
  assert.equal(checkStagingEnv({ ...good, VITE_SUPABASE_URL: 'https://example.com' }, live).ok, false);
});

test('Problemtexte enthalten nie den Key', () => {
  const report = checkStagingEnv({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_TOPSECRET' }, live);
  assert.ok(!report.problems.join().includes('TOPSECRET'));
});
