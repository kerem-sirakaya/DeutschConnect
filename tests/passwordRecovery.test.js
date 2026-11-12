// Passwort vergessen / neues Passwort (B3): Regeln + Einbindung in Seiten und AuthContext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORGOT_PASSWORD_PATH,
  RECOVERY_FLAG_KEY,
  createRecoveryStore,
  RESET_PASSWORD_PATH,
  parseAuthRedirect,
  recoveryView,
  resetRedirectUrl,
  resetRequestOutcome,
  updatePasswordErrorKey,
  validateNewPassword,
  validateResetRequest,
} from '../src/lib/passwordRecovery.js';
import { safeRedirectPath } from '../src/lib/authValidation.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Login-Seite zeigt den Link „Passwort vergessen?“ und die Erfolgsmeldung nach dem Zurücksetzen', () => {
  const login = read('src/pages/LoginPage.jsx');
  assert.match(login, /<Link to=\{FORGOT_PASSWORD_PATH\}[^>]*>\s*\{t\('auth\.forgot\.link'\)\}/);
  assert.match(login, /location\.state\?\.passwordReset === true/);
  assert.match(login, /t\('auth\.reset\.success'\)/);
  const app = read('src/App.jsx');
  assert.match(app, /<Route path="forgot-password" element=\{<ForgotPasswordPage \/>\} \/>/);
  assert.match(app, /<Route path="reset-password" element=\{<ResetPasswordPage \/>\} \/>/);
  assert.equal(FORGOT_PASSWORD_PATH, '/forgot-password');
  assert.equal(RESET_PASSWORD_PATH, '/reset-password');
});

test('E-Mail-Prüfung im Formular „Passwort vergessen“', () => {
  assert.deepEqual(validateResetRequest({ email: 'test@example.org' }), {});
  assert.deepEqual(validateResetRequest({ email: '  test@example.org ' }), {});
  for (const email of ['', 'test', 'test@', '@example.org', 'a b@example.org']) {
    assert.deepEqual(validateResetRequest({ email }), { email: 'auth.errors.email' }, email);
  }
});

test('Anfrage erfolgreich → neutrale Bestätigung', () => {
  assert.deepEqual(resetRequestOutcome(null), { sent: true });
});

test('M2: Wartezeit (429) → GENAU dieselbe neutrale Bestätigung wie bei Erfolg (verrät kein Konto)', () => {
  const success = resetRequestOutcome(null);
  for (const error of [
    { code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 42 seconds.' },
    { code: 'over_request_rate_limit', status: 429 },
    { status: 429 },
  ]) {
    assert.deepEqual(resetRequestOutcome(error), success, JSON.stringify(error));
  }
});

test('Echte Netzwerk- und unerwartete Serverfehler werden gemeldet – nur als Übersetzungsschlüssel', () => {
  assert.deepEqual(resetRequestOutcome({ name: 'AuthRetryableFetchError', status: 0 }), { sent: false, errorKey: 'auth.errors.network' });
  assert.deepEqual(resetRequestOutcome({ code: 'unexpected_failure', status: 500, message: 'Database error' }), {
    sent: false,
    errorKey: 'auth.errors.generic',
  });
  assert.deepEqual(resetRequestOutcome({ status: 400, message: 'irgendwas' }), { sent: false, errorKey: 'auth.errors.generic' });
  // supabase-js meldet 5xx als AuthRetryableFetchError MIT Status → Serverfehler, nicht „keine Verbindung“
  assert.deepEqual(resetRequestOutcome({ name: 'AuthRetryableFetchError', status: 500 }), { sent: false, errorKey: 'auth.errors.generic' });
  assert.deepEqual(resetRequestOutcome({ name: 'AuthRetryableFetchError', status: 503 }), { sent: false, errorKey: 'auth.errors.generic' });
  // Kein Text aus dem Supabase-Fehler gelangt in das Ergebnis
  assert.doesNotMatch(JSON.stringify(resetRequestOutcome({ status: 500, message: 'GEHEIM-DETAIL' })), /GEHEIM/);
});

test('Link in der E-Mail führt auf /reset-password der aktuellen Adresse', () => {
  assert.equal(resetRedirectUrl('https://connected.example'), 'https://connected.example/reset-password');
  assert.equal(resetRedirectUrl('http://localhost:5173/'), 'http://localhost:5173/reset-password');
});

test('Neues Passwort: Mindestlänge und Bestätigung', () => {
  assert.deepEqual(validateNewPassword({ password: 'abcdefgh', confirm: 'abcdefgh' }), {});
  assert.deepEqual(validateNewPassword({ password: 'kurz', confirm: 'kurz' }), { password: 'auth.errors.password' });
  assert.deepEqual(validateNewPassword({ password: 'abcdefgh', confirm: '' }), { confirm: 'auth.reset.errors.confirmRequired' });
  assert.deepEqual(validateNewPassword({ password: 'abcdefgh', confirm: 'abcdefgi' }), { confirm: 'auth.reset.errors.mismatch' });
  assert.deepEqual(validateNewPassword({}), { password: 'auth.errors.password', confirm: 'auth.reset.errors.confirmRequired' });
});

test('Fehler beim Speichern werden übersetzbaren Texten zugeordnet', () => {
  assert.equal(updatePasswordErrorKey(null), null);
  assert.equal(updatePasswordErrorKey({ code: 'same_password' }), 'auth.reset.errors.samePassword');
  assert.equal(updatePasswordErrorKey({ code: 'weak_password' }), 'auth.errors.weakPassword');
  assert.equal(updatePasswordErrorKey({ name: 'AuthSessionMissingError' }), 'auth.reset.errors.linkInvalid');
  assert.equal(updatePasswordErrorKey({ code: 'session_expired' }), 'auth.reset.errors.linkExpired');
  assert.equal(updatePasswordErrorKey({ name: 'AuthRetryableFetchError', status: 0 }), 'auth.errors.network');
  assert.equal(updatePasswordErrorKey({ name: 'AuthRetryableFetchError', status: 500 }), 'auth.errors.generic');
  assert.equal(updatePasswordErrorKey({ code: 'irgendwas' }), 'auth.errors.generic');
});

test('Start-Adresse: Wiederherstellungs-Link, abgelaufener und ungültiger Link – ohne Token herauszugeben', () => {
  const recovery = parseAuthRedirect('https://x.example/reset-password#access_token=GEHEIM&refresh_token=R&type=recovery&expires_in=3600');
  assert.deepEqual(recovery, { kind: 'recovery' });
  assert.equal(JSON.stringify(recovery).includes('GEHEIM'), false);
  assert.deepEqual(
    parseAuthRedirect('https://x.example/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    { kind: 'error', errorKey: 'auth.reset.errors.linkExpired' },
  );
  assert.deepEqual(parseAuthRedirect('https://x.example/reset-password?error=server_error&error_description=x'), {
    kind: 'error',
    errorKey: 'auth.reset.errors.linkInvalid',
  });
  assert.deepEqual(parseAuthRedirect('https://x.example/reset-password'), { kind: 'none' });
  // Anmelde-Link (kein recovery) zählt nicht
  assert.deepEqual(parseAuthRedirect('https://x.example/#access_token=A&type=signup'), { kind: 'none' });
  assert.deepEqual(parseAuthRedirect('kaputt'), { kind: 'none' });
});

// Kleiner Ersatz für sessionStorage
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}
const session = (id) => ({ user: { id } });
const NONE = { kind: 'none' };
const view = (store, userId, initialRedirect = NONE, loading = false) =>
  recoveryView({ loading, userId, recovery: store.getState(), initialRedirect });

test('Gültiger Link: „lädt …“ bis PASSWORD_RECOVERY, dann Formular; Merker nur mit Konto-ID', () => {
  const storage = memoryStorage();
  const store = createRecoveryStore({ storage, pendingLink: true });
  const link = { kind: 'recovery' };
  assert.equal(view(store, null, link, true).view, 'loading');
  // Sitzung ist schon da, Ereignis steht noch aus → kein „ungültig“-Aufblitzen
  assert.equal(view(store, 'u1', link).view, 'loading');
  store.handleAuthEvent('PASSWORD_RECOVERY', session('u1'));
  assert.equal(view(store, 'u1', link).view, 'form');
  assert.deepEqual([...storage.data], [[RECOVERY_FLAG_KEY, 'u1']]);
});

test('Neuladen während der Wiederherstellung: Formular bleibt (Merker), aber nur für dasselbe Konto', () => {
  const storage = memoryStorage();
  createRecoveryStore({ storage, pendingLink: true }).handleAuthEvent('PASSWORD_RECOVERY', session('u1'));
  const afterReload = createRecoveryStore({ storage, pendingLink: false });
  assert.equal(view(afterReload, 'u1').view, 'form');
  assert.equal(view(afterReload, 'u2').view, 'invalid');
  assert.equal(view(afterReload, null).view, 'invalid');
});

test('M1-Regression: Wiederherstellung → Passwort geändert → abgemeldet → normal angemeldet (selber Tab) → /reset-password = KEIN Formular', () => {
  const storage = memoryStorage();
  const link = { kind: 'recovery' }; // bleibt für die ganze Seitenlaufzeit so stehen
  const store = createRecoveryStore({ storage, pendingLink: true });
  store.handleAuthEvent('INITIAL_SESSION', session('u1'));
  store.handleAuthEvent('PASSWORD_RECOVERY', session('u1'));
  assert.equal(view(store, 'u1', link).view, 'form');
  // Erfolg: updatePassword → clear() → signOut → SIGNED_OUT
  store.clear();
  store.handleAuthEvent('SIGNED_OUT', null);
  assert.equal(view(store, null, link).view, 'invalid');
  // Normale Anmeldung im selben Tab (ohne Neuladen)
  store.handleAuthEvent('SIGNED_IN', session('u1'));
  assert.deepEqual(view(store, 'u1', link), { view: 'invalid', errorKey: 'auth.reset.errors.linkInvalid' });
  // Auch ein anderes Konto nicht
  store.handleAuthEvent('SIGNED_IN', session('u2'));
  assert.equal(view(store, 'u2', link).view, 'invalid');
  assert.equal(storage.data.size, 0, 'Merker gelöscht');
});

test('Abmelden bricht eine offene Wiederherstellung ab; normale Anmeldung schaltet nie etwas frei', () => {
  const storage = memoryStorage();
  const store = createRecoveryStore({ storage });
  store.handleAuthEvent('SIGNED_IN', session('u1'));
  store.handleAuthEvent('TOKEN_REFRESHED', session('u1'));
  assert.equal(view(store, 'u1').view, 'invalid');
  store.handleAuthEvent('PASSWORD_RECOVERY', session('u1'));
  store.handleAuthEvent('SIGNED_OUT', null);
  assert.equal(store.getState().userId, null);
  assert.equal(storage.data.size, 0);
});

test('Ungültiger Link (kein PASSWORD_RECOVERY) → nach dem Start „ungültig“, auch mit bestehender Anmeldung', () => {
  const store = createRecoveryStore({ storage: memoryStorage(), pendingLink: true });
  assert.equal(view(store, 'u-alt', { kind: 'recovery' }).view, 'loading');
  store.settleLink();
  assert.deepEqual(view(store, 'u-alt', { kind: 'recovery' }), { view: 'invalid', errorKey: 'auth.reset.errors.linkInvalid' });
});

test('Abgelaufener/ungültiger Link aus der Adresse → sofort Meldung', () => {
  const store = createRecoveryStore({ storage: memoryStorage() });
  assert.deepEqual(view(store, null, { kind: 'error', errorKey: 'auth.reset.errors.linkExpired' }, true), {
    view: 'invalid',
    errorKey: 'auth.reset.errors.linkExpired',
  });
});

test('Ohne verfügbaren Speicher (privates Fenster) läuft der Ablauf trotzdem', () => {
  const broken = {
    getItem() {
      throw new Error('x');
    },
    setItem() {
      throw new Error('x');
    },
    removeItem() {
      throw new Error('x');
    },
  };
  const store = createRecoveryStore({ storage: broken, pendingLink: true });
  store.handleAuthEvent('PASSWORD_RECOVERY', session('u1'));
  assert.equal(view(store, 'u1').view, 'form');
  store.clear();
  assert.equal(view(store, 'u1').view, 'invalid');
});

test('Seiten: Doppel-Absenden gesperrt, Ladezustand, Erfolg → Login', () => {
  const forgot = read('src/pages/ForgotPasswordPage.jsx');
  assert.match(forgot, /if \(busyRef\.current\) return;/);
  assert.match(forgot, /disabled=\{busy\}/);
  assert.match(forgot, /resetRequestOutcome\(error\)/);
  assert.match(forgot, /t\('auth\.forgot\.sentText'\)/);
  const reset = read('src/pages/ResetPasswordPage.jsx');
  assert.match(reset, /if \(busyRef\.current\) return;/);
  assert.match(reset, /validateNewPassword\(values\)/);
  assert.match(reset, /navigate\('\/login', \{ replace: true, state: \{ passwordReset: true \} \}\)/);
  assert.match(reset, /autoComplete="new-password"/);
});

test('AuthContext nutzt nur Supabase Auth (resetPasswordForEmail, updateUser) und speichert keine Token', () => {
  const ctx = read('src/auth/AuthContext.jsx');
  assert.match(ctx, /supabase\.auth\.resetPasswordForEmail\(email\.trim\(\), \{\s*redirectTo: resetRedirectUrl\(window\.location\.origin\),/);
  assert.match(ctx, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(ctx, /recoveryStore\.clear\(\);\s*\/\/ Abmelden/);
  // Listener direkt nach createClient (vor React), damit PASSWORD_RECOVERY nie verpasst wird
  const client = read('src/lib/supabaseClient.js');
  assert.ok(client.indexOf('createClient(url, key)') < client.indexOf('supabase.auth.onAuthStateChange'));
  assert.match(client, /recoveryStore\.handleAuthEvent\(event, session\)/);
  for (const file of ['src/auth/AuthContext.jsx', 'src/pages/ResetPasswordPage.jsx', 'src/pages/ForgotPasswordPage.jsx', 'src/lib/supabaseClient.js']) {
    assert.doesNotMatch(read(file), /(local|session)Storage\.setItem\([^)]*(token|access)/i, file);
  }
});

test('Nach dem Login nie zurück auf Passwort-Seiten', () => {
  assert.equal(safeRedirectPath('/forgot-password'), '/me/settings');
  assert.equal(safeRedirectPath('/reset-password'), '/me/settings');
  assert.equal(safeRedirectPath('/chat'), '/chat');
});
