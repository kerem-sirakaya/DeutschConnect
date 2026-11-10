// Chatroom: „Beitreten“ / „Raum betreten“ / „Verlassen“ + Profilbild in Nachrichten.
// Datenbank-Prüfung (Rechte, RLS, Verlassen): supabase/tests/014_chat_room_access_test.sql
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapMessage, roomActions } from '../src/lib/chat.js';

const read = (...parts) => readFileSync(new URL(`../${parts.join('/')}`, import.meta.url), 'utf8');

test('Themenraum: kein Mitglied -> nur „Beitreten“; Mitglied -> „Raum betreten“ + „Verlassen“', () => {
  assert.deepEqual(roomActions({ kind: 'topic', isMember: false, archived: false }), ['join']);
  assert.deepEqual(roomActions({ kind: 'topic', isMember: true, archived: false }), ['enter', 'leave']);
});

test('„Raum betreten“ gibt es nur für Mitglieder', () => {
  for (const kind of ['topic', 'project', 'event']) {
    for (const archived of [false, true]) {
      assert.ok(!roomActions({ kind, isMember: false, archived }).includes('enter'), `${kind}/${archived}`);
      assert.ok(roomActions({ kind, isMember: true, archived }).includes('enter'), `${kind}/${archived}`);
    }
  }
});

test('archivierter Themenraum: kein „Beitreten“; Mitglieder können weiter hinein und verlassen', () => {
  assert.deepEqual(roomActions({ kind: 'topic', isMember: false, archived: true }), []);
  assert.deepEqual(roomActions({ kind: 'topic', isMember: true, archived: true }), ['enter', 'leave']);
});

test('Projekt-/Eventgruppe: Mitgliedschaft kommt aus Team bzw. Anmeldung – kein Beitreten/Verlassen hier', () => {
  assert.deepEqual(roomActions({ kind: 'event', isMember: true }), ['enter']);
  assert.deepEqual(roomActions({ kind: 'project', isMember: false }), []);
  assert.deepEqual(roomActions(null), []);
});

test('Nachricht: Profilfarbe wird übernommen – nur gültige #rrggbb-Werte', () => {
  const base = { id: '1', sender_id: 'u', sender_name: 'Ada', is_own: false, body: 'Hi', created_at: '2026-11-10T10:00:00Z', reactions: [] };
  assert.equal(mapMessage({ ...base, sender_avatar_color: '#2f6fd6' }).senderAvatarColor, '#2f6fd6');
  assert.equal(mapMessage({ ...base, sender_avatar_color: 'red;background:url(x)' }).senderAvatarColor, null);
  assert.equal(mapMessage(base).senderAvatarColor, null);
  assert.equal(mapMessage(base).createdAt, '2026-11-10T10:00:00Z');
});

test('Übersicht und Raumseite nutzen dieselben Knöpfe; Raumseite sperrt nach Antwort der Datenbank', () => {
  const overview = read('src', 'pages', 'ChatPage.jsx');
  const roomPage = read('src', 'pages', 'ChatRoomPage.jsx');
  assert.match(overview, /<RoomActionButtons room=\{room\}/);
  assert.match(roomPage, /<RoomActionButtons room=\{room\}[^>]*showEnter=\{false\}/);
  assert.match(roomPage, /messages\.errorKey === 'chat\.errors\.noAccess'/);
  assert.match(roomPage, /if \(leaving\) navigate\('\/chat'\)/);
  assert.match(read('src', 'components', 'chat', 'MessageList.jsx'), /<Avatar profile=\{\{ firstName: message\.senderName, avatarColor: message\.senderAvatarColor/);
});

test('014: Nachrichtenlisten liefern die Profilfarbe; Funktionen werden vorher gelöscht (wiederholbar)', () => {
  const sql = read('supabase', 'migrations', '014_chat.sql');
  assert.equal((sql.match(/sender_name text, sender_avatar_color text, is_own boolean/g) ?? []).length, 3);
  for (const fn of ['chat_room_messages(uuid, timestamptz, integer)', 'chat_conversation_messages(uuid, timestamptz, integer)',
    'chat_message_rows(uuid, uuid, uuid, timestamptz, integer)']) {
    assert.ok(sql.indexOf(`drop function if exists public.${fn}`) < sql.indexOf(`function public.${fn.split('(')[0]}(p_`), fn);
  }
});

test('neue Texte in allen drei Sprachen', () => {
  for (const lang of ['de', 'en', 'tr']) {
    const chat = JSON.parse(read('src', 'locales', `${lang}.json`)).chat;
    for (const key of ['enter', 'join', 'leave', 'joined', 'liveOn', 'liveOff', 'lockedTitle', 'lockedGroupHint']) {
      assert.ok(chat[key], `${lang}: chat.${key}`);
    }
  }
});
