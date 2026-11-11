// Hauptnavigation (Codex-Struktur + „Chatroom“): sechs Bereiche, aktiver Bereich aus der URL.
// Entscheidung Ege (2026-11-11): Spiele sind wieder ein Unterbereich von Community (/community/games).
// Entscheidung Ege (2026-11-10): Chatroom ist dauerhaft ein eigener Hauptbereich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS, sectionForPath } from '../src/components/layout/navigation.js';

test('genau sechs Hauptbereiche: Codex-Reihenfolge plus „Chatroom“ vor „Mein Bereich“', () => {
  assert.deepEqual(NAV_ITEMS.map((item) => item.id), ['home', 'discover', 'tutoring', 'community', 'chat', 'me']);
  assert.deepEqual(NAV_ITEMS.find((item) => item.id === 'chat'), {
    id: 'chat',
    to: '/chat',
    labelKey: 'nav.chat',
    icon: 'chat',
  });
  assert.equal(NAV_ITEMS.find((item) => item.id === 'games'), undefined, 'kein eigener Hauptbereich „Spiele“');
  assert.equal(new Set(NAV_ITEMS.map((item) => item.to)).size, NAV_ITEMS.length, 'keine doppelten Ziele');
});

test('Spiele gehören zu Community; Nachhilfe bleibt ein eigener Bereich', () => {
  assert.equal(sectionForPath('/community/games'), 'community');
  assert.equal(sectionForPath('/community/games/chess'), 'community');
  assert.equal(sectionForPath('/community/games/symbol-pairs'), 'community');
  // Alte Adressen /games/… leiten auf /community/games/… um – bis dahin ist Community aktiv
  assert.equal(sectionForPath('/games'), 'community');
  assert.equal(sectionForPath('/games/chess'), 'community');
  assert.equal(sectionForPath('/gamesfoo'), null);
  assert.equal(sectionForPath('/community/people'), 'community');
  assert.equal(sectionForPath('/tutoring'), 'tutoring');
  assert.equal(sectionForPath('/tutoring/new'), 'tutoring');
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
