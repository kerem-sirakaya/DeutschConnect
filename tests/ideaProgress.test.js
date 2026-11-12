// Prüft Fortschrittsanzeige und Hinweis der Ideen-Detailseite für alle Status.
// Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ideaProgressSteps, ownIdeaNotice } from '../src/lib/ideaProgress.js';

const states = (status) => ideaProgressSteps(status).map((step) => `${step.id}:${step.state}`);

test('submitted: erster Schritt aktuell, nichts erledigt', () => {
  assert.deepEqual(states('submitted'), [
    'submitted:current',
    'collecting:upcoming',
    'review:upcoming',
    'planned:upcoming',
  ]);
});

test('collecting: Eingereicht erledigt, Interesse sammeln aktuell', () => {
  assert.deepEqual(states('collecting'), ['submitted:done', 'collecting:current', 'review:upcoming', 'planned:upcoming']);
});

test('review: zwei Schritte erledigt', () => {
  assert.deepEqual(states('review'), ['submitted:done', 'collecting:done', 'review:current', 'planned:upcoming']);
});

test('planned: drei Schritte erledigt, Planung aktuell', () => {
  assert.deepEqual(states('planned'), ['submitted:done', 'collecting:done', 'review:done', 'planned:current']);
});

test('rejected: nur "Eingereicht" erledigt, Weg endet mit "Nicht freigegeben"', () => {
  const steps = ideaProgressSteps('rejected');
  assert.deepEqual(states('rejected'), ['submitted:done', 'rejected:rejected']);
  // Kein Freigabe-Schritt erscheint – erst recht nicht als erledigt
  assert.ok(!steps.some((step) => ['collecting', 'review', 'planned'].includes(step.id)));
  assert.equal(steps[1].labelKey, 'ideaDetail.steps.rejected');
});

test('unbekannter Status: nichts erledigt, nichts aktuell (wie bisher)', () => {
  assert.ok(ideaProgressSteps('xyz').every((step) => step.state === 'upcoming'));
});

test('Hinweis: abgelehnt statt "Wartet auf Freigabe"', () => {
  const own = { isOwn: true, isRealAccount: true };
  assert.equal(ownIdeaNotice({ ...own, status: 'rejected' }), 'rejected');
  assert.equal(ownIdeaNotice({ ...own, status: 'submitted' }), 'awaitingApproval');
  for (const status of ['collecting', 'review', 'planned']) {
    assert.equal(ownIdeaNotice({ ...own, status }), null, status);
  }
});

test('Hinweis nur für die eigene Idee im echten Konto', () => {
  for (const status of ['rejected', 'submitted']) {
    assert.equal(ownIdeaNotice({ status, isOwn: false, isRealAccount: true }), null);
    assert.equal(ownIdeaNotice({ status, isOwn: true, isRealAccount: false }), null);
  }
});

test('Texte für abgelehnte Ideen existieren in de, tr und en', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  for (const lang of ['de', 'tr', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'src', 'locales', `${lang}.json`), 'utf8'));
    for (const key of ['ideaDetail.steps.rejected', 'ideaDetail.rejectedText', 'status.idea.rejected']) {
      const value = key.split('.').reduce((node, part) => node?.[part], dict);
      assert.equal(typeof value, 'string', `${lang}: ${key} fehlt`);
      assert.ok(value.trim().length > 0, `${lang}: ${key} ist leer`);
    }
  }
});
