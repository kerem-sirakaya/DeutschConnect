// Community → Projekt- und Eventgruppen: Auswahl aus den Chat-Räumen (Migration 014), keine eigenen Daten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { communityGroups, normalizeGroupFilter } from '../src/lib/communityGroups.js';

const read = (...parts) => readFileSync(join(import.meta.dirname, '..', ...parts), 'utf8');
const rooms = [
  { id: 't1', kind: 'topic', slug: 'exchange', lastMessageAt: '2026-11-10T10:00:00Z' },
  { id: 'p1', kind: 'project', ideaTitle: 'Wandbild', lastMessageAt: '2026-11-09T10:00:00Z' },
  { id: 'e1', kind: 'event', eventTitle: { de: 'Sprachcafé' }, lastMessageAt: '2026-11-10T09:00:00Z' },
  { id: 'p2', kind: 'project', ideaTitle: 'Podcast', lastMessageAt: null },
  { id: 'x1', kind: 'private' },
  { id: 'p1', kind: 'project', ideaTitle: 'Wandbild (doppelt)', lastMessageAt: '2026-11-09T10:00:00Z' },
];

test('nur Projekt- und Eventgruppen, neueste Aktivität zuerst, keine Doppelten', () => {
  assert.deepEqual(communityGroups(rooms).map((r) => r.id), ['e1', 'p1', 'p2']);
  assert.deepEqual(communityGroups(rooms, 'project').map((r) => r.id), ['p1', 'p2']);
  assert.deepEqual(communityGroups(rooms, 'event').map((r) => r.id), ['e1']);
});

test('ungültige Filter und fehlende Daten sind sicher', () => {
  for (const bad of [null, undefined, '', 'topic', 'private', 'PROJECT']) assert.equal(normalizeGroupFilter(bad), 'all');
  assert.deepEqual(communityGroups(null), []);
  assert.deepEqual(communityGroups(undefined, 'event'), []);
  assert.deepEqual(communityGroups(rooms, 'topic').map((r) => r.id), ['e1', 'p1', 'p2']);
});

test('Community verlinkt die Gruppen; Gruppen öffnen den bestehenden Chat-Raum', () => {
  assert.match(read('src', 'pages', 'CommunityPage.jsx'), /to="\/community\/groups"/);
  assert.match(read('src', 'App.jsx'), /path="community\/groups" element=\{<CommunityGroupsPage \/>\}/);
  const page = read('src', 'pages', 'CommunityGroupsPage.jsx');
  assert.match(page, /useChatRooms\(/);
  assert.match(page, /to=\{`\/chat\/rooms\/\$\{room\.id\}`\}/);
});
