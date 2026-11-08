// Prüft die Regeln für Registrierung/Login. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authErrorKey,
  buildSignUpMetadata,
  safeRedirectPath,
  validateLogin,
  validateRegistration,
} from '../src/lib/authValidation.js';

const valid = {
  firstName: '  Ada ',
  email: 'ada@example.org',
  password: 'langes-passwort',
  schoolId: 'ers',
  grade: '10',
  consent: true,
};
const schoolIds = ['ers', 'anka'];

test('gültige Registrierung hat keine Fehler', () => {
  assert.deepEqual(validateRegistration(valid, schoolIds), {});
});

test('Registrierung meldet jedes fehlerhafte Feld', () => {
  const errors = validateRegistration(
    { firstName: ' ', email: 'kein-at', password: 'kurz', schoolId: 'fremd', grade: '4', consent: false },
    schoolIds,
  );
  assert.deepEqual(Object.keys(errors).sort(), ['consent', 'email', 'firstName', 'grade', 'password', 'schoolId']);
});

test('Klasse 13 ist erlaubt, 14 nicht (wie in der Datenbank)', () => {
  assert.equal(validateRegistration({ ...valid, grade: '13' }, schoolIds).grade, undefined);
  assert.ok(validateRegistration({ ...valid, grade: '14' }, schoolIds).grade);
});

test('Metadaten passen zum Datenbank-Trigger handle_new_user()', () => {
  assert.deepEqual(buildSignUpMetadata(valid), { first_name: 'Ada', school_id: 'ers', grade: 10 });
});

test('Login braucht E-Mail und Passwort', () => {
  assert.deepEqual(Object.keys(validateLogin({ email: '', password: '' })).sort(), ['email', 'password']);
  assert.deepEqual(validateLogin({ email: 'a@b.de', password: 'x' }), {});
});

test('Supabase-Fehler werden übersetzbaren Texten zugeordnet', () => {
  assert.equal(authErrorKey({ code: 'invalid_credentials' }), 'auth.errors.invalidCredentials');
  assert.equal(authErrorKey({ message: 'Database error saving new user' }), 'auth.errors.profileFailed');
  assert.equal(authErrorKey({ name: 'AuthRetryableFetchError' }), 'auth.errors.network');
  assert.equal(authErrorKey({ message: '???' }), 'auth.errors.generic');
  assert.equal(authErrorKey(null), null);
});

test('safeRedirectPath erlaubt nur Pfade innerhalb der App', () => {
  assert.equal(safeRedirectPath('/admin'), '/admin');
  assert.equal(safeRedirectPath('/admin/events'), '/admin/events');
  assert.equal(safeRedirectPath(undefined), '/me/settings');
  assert.equal(safeRedirectPath(null), '/me/settings');
  assert.equal(safeRedirectPath('https://evil.example'), '/me/settings');
  assert.equal(safeRedirectPath('//evil.example'), '/me/settings');
  assert.equal(safeRedirectPath('/\\evil.example'), '/me/settings');
  assert.equal(safeRedirectPath('/login'), '/me/settings');
  assert.equal(safeRedirectPath('/register'), '/me/settings');
  assert.equal(safeRedirectPath({ pathname: '/admin' }), '/me/settings');
});
