// Prüft die Anzeige-Logik des Admin-Bereichs (Admin, Schüler:in, abgemeldet, Demo, Laden, Fehler).
// Die echte Sicherheit liegt in der Datenbank – hier wird nur geprüft, WAS angezeigt wird.
// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveAdminStatus, resolveAdminAccess } from '../src/lib/adminAccess.js';

const ok = (userId, isAdmin) => ({ userId, isAdmin, error: null });

test('deriveAdminStatus: ohne echtes Konto (Demo/abgemeldet) nie Admin, keine Prüfung', () => {
  assert.deepEqual(deriveAdminStatus(null, ok(null, false)), { status: 'none', isAdmin: false });
  // Selbst ein altes "true" von einem abgemeldeten Konto zählt nicht mehr
  assert.deepEqual(deriveAdminStatus(null, ok('konto-a', true)), { status: 'none', isAdmin: false });
});

test('deriveAdminStatus: lädt, solange kein Ergebnis für GENAU dieses Konto da ist', () => {
  assert.deepEqual(deriveAdminStatus('konto-a', ok(null, false)), { status: 'loading', isAdmin: false });
  assert.deepEqual(deriveAdminStatus('konto-a', null), { status: 'loading', isAdmin: false });
  // Kontowechsel A -> B: das Admin-Ergebnis von A gilt nicht für B
  assert.deepEqual(deriveAdminStatus('konto-b', ok('konto-a', true)), { status: 'loading', isAdmin: false });
});

test('deriveAdminStatus: Ergebnis für das aktuelle Konto', () => {
  assert.deepEqual(deriveAdminStatus('konto-a', ok('konto-a', true)), { status: 'ready', isAdmin: true });
  assert.deepEqual(deriveAdminStatus('konto-b', ok('konto-b', false)), { status: 'ready', isAdmin: false });
  // Nur echtes true zählt
  assert.deepEqual(deriveAdminStatus('konto-b', ok('konto-b', 'true')), { status: 'ready', isAdmin: false });
});

test('deriveAdminStatus: Fehler ist nie "Admin"', () => {
  const failed = { userId: 'konto-a', isAdmin: true, error: { code: 'PGRST301' } };
  assert.deepEqual(deriveAdminStatus('konto-a', failed), { status: 'error', isAdmin: false });
});

test('resolveAdminAccess: abgemeldet oder Demo -> zum Login', () => {
  for (const adminStatus of ['none', 'loading', 'ready', 'error']) {
    assert.equal(resolveAdminAccess({ isAuthenticated: false, adminStatus, isAdmin: true }), 'login');
  }
});

test('resolveAdminAccess: angemeldet – Laden, Fehler, Schüler:in, Admin', () => {
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'loading', isAdmin: false }), 'loading');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'none', isAdmin: false }), 'loading');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'error', isAdmin: false }), 'error');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'ready', isAdmin: false }), 'denied');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'ready', isAdmin: true }), 'allowed');
  // Kein "true" während des Ladens oder bei Fehlern
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'loading', isAdmin: true }), 'loading');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'error', isAdmin: true }), 'error');
  assert.equal(resolveAdminAccess({ isAuthenticated: true, adminStatus: 'ready', isAdmin: 'yes' }), 'denied');
});

// Statische Prüfungen am Quelltext: Schutzregeln, die sonst leicht versehentlich brechen
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...parts) => readFileSync(join(root, 'src', ...parts), 'utf8');

test('Admin-Seiten werden nur lazy geladen (nicht im Haupt-Bundle)', () => {
  const app = read('App.jsx');
  for (const name of ['AdminLayout', 'AdminOverviewPage', 'AdminEventsPage', 'AdminEventFormPage', 'AdminIdeasPage']) {
    assert.match(app, new RegExp(`const ${name} = lazy\\(\\(\\) => import\\(`), `${name} ist nicht lazy`);
    assert.doesNotMatch(app, new RegExp(`^import ${name} `, 'm'), `${name} wird direkt importiert`);
  }
});

test('Admin-Status wird nicht im Browser gespeichert und nicht über die Tabelle admins gelesen', () => {
  for (const file of [read('state', 'AdminStatusContext.jsx'), read('lib', 'adminAccess.js'), read('lib', 'adminApi.js')]) {
    assert.doesNotMatch(file, /\b(localStorage|sessionStorage)\s*[.[]/);
    assert.doesNotMatch(file, /from\(\s*['"]admins['"]/);
  }
});
