// Hauptnavigation (Codex-Struktur): fünf Bereiche, aktiver Bereich aus der URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS, sectionForPath } from '../src/components/layout/navigation.js';

test('genau fünf Hauptbereiche in Codex-Reihenfolge', () => {
  assert.deepEqual(NAV_ITEMS.map((item) => item.id), ['home', 'discover', 'tutoring', 'community', 'me']);
});

test('bestehende Routen gehören zum richtigen Bereich', () => {
  assert.equal(sectionForPath('/'), 'home');
  assert.equal(sectionForPath('/discover'), 'discover');
  assert.equal(sectionForPath('/events'), 'discover');
  assert.equal(sectionForPath('/events/abc-123'), 'discover');
  assert.equal(sectionForPath('/ideas/new'), 'discover');
  assert.equal(sectionForPath('/network/schools/ers'), 'discover');
  assert.equal(sectionForPath('/tutoring/xyz/edit'), 'tutoring');
  assert.equal(sectionForPath('/community'), 'community');
  assert.equal(sectionForPath('/me/settings'), 'me');
  assert.equal(sectionForPath('/login'), 'me');
  assert.equal(sectionForPath('/events/'), 'discover');
});

test('kein falscher Treffer über Präfixe und eigener Admin-Bereich', () => {
  assert.equal(sectionForPath('/eventsfoo'), null);
  assert.equal(sectionForPath('/admin'), null);
  assert.equal(sectionForPath('/admin/events'), null);
});
