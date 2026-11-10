// Hauptnavigation (Codex-Struktur + „Chatroom“ + „Spiele“): sieben Bereiche, aktiver Bereich aus der URL.
// Entscheidung Ege (2026-11-10): Chatroom ist dauerhaft ein eigener, siebter Hauptbereich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS, sectionForPath } from '../src/components/layout/navigation.js';

test('genau sieben Hauptbereiche: Codex-Reihenfolge plus „Chatroom“ und „Spiele“ vor „Mein Bereich“', () => {
  assert.deepEqual(NAV_ITEMS.map((item) => item.id), ['home', 'discover', 'tutoring', 'community', 'chat', 'games', 'me']);
  assert.deepEqual(NAV_ITEMS.find((item) => item.id === 'chat'), {
    id: 'chat',
    to: '/chat',
    labelKey: 'nav.chat',
    icon: 'chat',
  });
  assert.deepEqual(NAV_ITEMS.find((item) => item.id === 'games'), {
    id: 'games',
    to: '/games',
    labelKey: 'nav.games',
    icon: 'gamepad',
  });
});

test('Spiele sind ein eigener Bereich, nicht mehr Teil von Community', () => {
  assert.equal(sectionForPath('/games'), 'games');
  assert.equal(sectionForPath('/games/chess'), 'games');
  assert.equal(sectionForPath('/games/symbol-pairs'), 'games');
  assert.equal(sectionForPath('/gamesfoo'), null);
  assert.equal(sectionForPath('/community/people'), 'community');
});

test('bestehende Routen gehören zum richtigen Bereich', () => {
  assert.equal(sectionForPath('/'), 'home');
  assert.equal(sectionForPath('/discover'), 'discover');
  assert.equal(sectionForPath('/events'), 'discover');
  assert.equal(sectionForPath('/events/abc-123'), 'discover');
  assert.equal(sectionForPath('/ideas/new'), 'discover');
  assert.equal(sectionForPath('/network/schools/ers'), null); // Netzwerk entfernt → Weiterleitung auf /discover (App.jsx)
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
