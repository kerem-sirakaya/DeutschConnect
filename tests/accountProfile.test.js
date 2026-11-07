// Prüft, wie aus dem Supabase-Profil das aktive Profil der App wird. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountUser, emptyAccountData, sanitizeAccountData } from '../src/lib/accountProfile.js';
import { getEventRole, getMyIdeas } from '../src/lib/selectors.js';

const profile = {
  first_name: 'Test',
  grade: 10,
  school_id: 'anka',
  avatar_color: '#123456',
  interests: ['music'],
  school: { name: 'Anka Bilim', short_name: 'Anka Bilim' },
};

test('Supabase-Profil wird zum aktiven Profil mit derselben Form wie Demo-Profile', () => {
  const user = buildAccountUser('uuid-1', profile, emptyAccountData());
  assert.equal(user.id, 'uuid-1');
  assert.equal(user.firstName, 'Test');
  assert.equal(user.schoolId, 'anka');
  assert.equal(user.school.shortName, 'Anka Bilim');
  assert.deepEqual(user.interests, ['music']);
  assert.deepEqual(user.invitations, []);
  assert.equal(user.isRealAccount, true);
});

test('unbekannte Schule: Name kommt aus der Datenbank', () => {
  const user = buildAccountUser('u', { ...profile, school_id: 'neu', school: { name: 'Neue Schule', short_name: 'NS' } }, emptyAccountData());
  assert.equal(user.school.name, 'Neue Schule');
  assert.equal(user.school.shortName, 'NS');
});

test('echtes Konto übernimmt KEINE Demo-Daten (Anmeldungen, Unterstützungen, Ideen)', () => {
  const user = buildAccountUser('u', profile, emptyAccountData());
  assert.equal(getEventRole(user, { id: 'e1' }), null); // Demo-Profil "alex" ist für e1 angemeldet
  assert.deepEqual(user.supportedIdeas, []);
  assert.deepEqual(getMyIdeas(user, [{ id: 'i1', authorId: 'alex' }]).authored, []);
});

test('Anmeldungen kommen nur aus der Datenbank, nie aus dem alten Browser-Speicher', () => {
  const oldLocal = { ...emptyAccountData(), registrations: { e1: 'registered' } };
  const user = buildAccountUser('u', profile, oldLocal, { 'uuid-1': 'interested' });
  assert.deepEqual(user.registrations, { 'uuid-1': 'interested' });
  assert.deepEqual(buildAccountUser('u', profile, oldLocal).registrations, {});
});

test('Unterstützungen kommen nur aus der Datenbank, nie aus dem alten Browser-Speicher', () => {
  const oldLocal = { ...emptyAccountData(), supportedIdeas: ['i1'] };
  assert.deepEqual(buildAccountUser('u', profile, oldLocal, {}, ['uuid-idea']).supportedIdeas, ['uuid-idea']);
  assert.deepEqual(buildAccountUser('u', profile, oldLocal).supportedIdeas, []);
});

test('kaputte gespeicherte Konto-Daten werden bereinigt', () => {
  assert.deepEqual(sanitizeAccountData(null), emptyAccountData());
  const cleaned = sanitizeAccountData({
    registrations: { e1: 'registered', e2: 'hacked' },
    supportedIdeas: ['i1', 5],
    customIdeas: [{ id: 'local-1' }, null, { title: 'ohne id' }],
  });
  assert.deepEqual(cleaned.registrations, { e1: 'registered' });
  assert.deepEqual(cleaned.supportedIdeas, []);
  assert.deepEqual(cleaned.customIdeas, [{ id: 'local-1' }]);
});
