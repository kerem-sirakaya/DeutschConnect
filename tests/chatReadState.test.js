// Lesestand im Frontend (Migration 020): Laden + Token, Markieren nach dem Anzeigen, Übersicht.
// Datenbank-Seite: supabase/tests/020_chat_read_state_test.sql
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInbox, canMarkRead, chatTarget, inboxPreview, mapLoadResult, markReadOutcome } from '../src/lib/chat.js';
import { fetchInboxState, loadMessages, markRead, resetReadTrackingCheck } from '../src/lib/chatApi.js';

const read = (...parts) => readFileSync(new URL(`../${parts.join('/')}`, import.meta.url), 'utf8');
const TOKEN = '3f2b6c1e-8a4d-4e2f-9b7a-1c2d3e4f5a6b';
const msg = (id, body) => ({ id, sender_id: 'u', sender_name: 'Ben', is_own: false, body, created_at: '2026-11-10T10:00:00Z', reactions: [] });

function fakeClient(handler) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push([name, params]);
      try {
        return { data: await handler(name, params), error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
}

test('Ziel-Schlüssel: Raum und Gespräch sind nie verwechselbar', () => {
  assert.equal(chatTarget('r1'), 'room:r1');
  assert.equal(chatTarget(null, 'c1'), 'conversation:c1');
  assert.equal(chatTarget(null, null), null);
});

test('chat_load_messages-Antwort: Nachrichten + Token; ungültiges Token wird verworfen', () => {
  const ok = mapLoadResult({ read_token: TOKEN, messages: [msg('m1', 'Hallo')] }, 'room:r1');
  assert.equal(ok.target, 'room:r1');
  assert.equal(ok.readToken, TOKEN);
  assert.equal(ok.messages[0].body, 'Hallo');
  assert.equal(mapLoadResult({ read_token: '1:2:', messages: [] }, 'room:r1').readToken, null);
  assert.equal(mapLoadResult({ read_token: 42 }, 'room:r1').readToken, null);
  assert.deepEqual(mapLoadResult(null, 'room:r1').messages, []);
});

test('Übersicht: Einträge je Ziel, Vorschau „Du:“ / Vorname, leere Räume ohne Vorschau', () => {
  const inbox = buildInbox([
    { room_id: 'r1', conversation_id: null, last_message_at: '2026-11-10T10:00:00Z', last_body: 'Hallo\n  zusammen',
      last_sender_name: 'Ben', last_is_own: false, has_unread: true },
    { room_id: null, conversation_id: 'c1', last_message_at: '2026-11-10T11:00:00Z', last_body: 'Bis morgen',
      last_sender_name: 'Ada', last_is_own: true, has_unread: false },
    { room_id: 'r2', conversation_id: null, last_message_at: null, last_body: null, last_sender_name: null,
      last_is_own: null, has_unread: false },
  ]);
  assert.equal(inbox.size, 3);
  assert.deepEqual(inboxPreview(inbox.get('room:r1'), 'Du'), { who: 'Ben', text: 'Hallo zusammen' });
  assert.equal(inbox.get('room:r1').hasUnread, true);
  assert.deepEqual(inboxPreview(inbox.get('conversation:c1'), 'Du'), { who: 'Du', text: 'Bis morgen' });
  assert.equal(inboxPreview(inbox.get('room:r2'), 'Du'), null);
  assert.equal(inbox.get('room:r2').hasUnread, false);
  assert.equal(inbox.get('room:c1'), undefined, 'Gespräch nie unter Raum-Schlüssel');
});

test('Markieren nur mit Token für GENAU das offene Ziel, nur sichtbar, nur einmal', () => {
  const result = { target: 'room:r1', readToken: TOKEN };
  const base = { result, currentTarget: 'room:r1', visible: true, attempted: new Set() };
  assert.equal(canMarkRead(base), true);
  assert.equal(canMarkRead({ ...base, currentTarget: 'room:r2' }), false, 'veraltete Antwort nach Raumwechsel');
  assert.equal(canMarkRead({ ...base, currentTarget: 'conversation:r1' }), false);
  assert.equal(canMarkRead({ ...base, visible: false }), false, 'Tab im Hintergrund');
  assert.equal(canMarkRead({ ...base, attempted: new Set([TOKEN]) }), false, 'Token schon versucht');
  assert.equal(canMarkRead({ ...base, result: { target: 'room:r1', readToken: null } }), false, 'ohne 020 kein Token');
  assert.equal(canMarkRead({ ...base, result: null }), false);
});

test('Fehler beim Markieren: abgelaufen → neu laden, sonst still ignorieren', () => {
  assert.equal(markReadOutcome({ code: 'DC061' }), 'reload');
  for (const code of ['DC060', 'DC062', 'DC042', 'DC040', 'XX000', undefined]) assert.equal(markReadOutcome({ code }), 'ignore');
});

test('loadMessages: Raum und Gespräch rufen chat_load_messages mit genau einem Ziel', async () => {
  resetReadTrackingCheck();
  const client = fakeClient(() => ({ read_token: TOKEN, messages: [msg('m1', 'x')] }));
  const room = await loadMessages(client, { roomId: 'r1' });
  const conv = await loadMessages(client, { conversationId: 'c1' });
  assert.deepEqual(client.calls[0], ['chat_load_messages', { p_room: 'r1', p_conversation: null, p_before: null, p_limit: 100 }]);
  assert.deepEqual(client.calls[1], ['chat_load_messages', { p_room: null, p_conversation: 'c1', p_before: null, p_limit: 100 }]);
  assert.equal(room.target, 'room:r1');
  assert.equal(conv.target, 'conversation:c1');
  assert.equal(room.readToken, TOKEN);
});

test('ohne Migration 020: Laden wie bisher (014), kein Token, Übersicht ohne Punkte, nur EIN Fehlversuch', async () => {
  resetReadTrackingCheck();
  const client = fakeClient((name) => {
    if (name === 'chat_load_messages' || name === 'chat_inbox_state') throw { code: 'PGRST202' };
    return [msg('m1', 'aus 014')];
  });
  const first = await loadMessages(client, { roomId: 'r1' });
  const second = await loadMessages(client, { conversationId: 'c1' });
  assert.equal(first.readToken, null);
  assert.equal(first.messages[0].body, 'aus 014');
  assert.equal(second.readToken, null);
  assert.equal(await fetchInboxState(client), null);
  assert.deepEqual(client.calls.map((c) => c[0]), ['chat_load_messages', 'chat_room_messages', 'chat_conversation_messages']);
  resetReadTrackingCheck();
});

test('andere Fehler beim Laden werden NICHT verschluckt (z. B. kein Zugriff → gesperrte Ansicht)', async () => {
  resetReadTrackingCheck();
  const client = fakeClient(() => {
    throw { code: 'DC042' };
  });
  await assert.rejects(() => loadMessages(client, { roomId: 'r1' }), (e) => e.code === 'DC042');
  assert.deepEqual(client.calls.map((c) => c[0]), ['chat_load_messages']);
});

test('markRead schickt nur das Token', async () => {
  const client = fakeClient(() => '2026-11-10T10:00:00Z');
  await markRead(client, TOKEN);
  assert.deepEqual(client.calls, [['chat_mark_read', { p_token: TOKEN }]]);
});

test('Verdrahtung: markiert wird erst nach dem Anzeigen – nie aus der Übersicht', () => {
  const list = read('src', 'components', 'chat', 'MessageList.jsx');
  assert.match(list, /useEffect\(\(\) => \{\s*onDisplayed\?\.\(\);\s*\}, \[onDisplayed\]\);/);
  // Effekt steht VOR dem frühen return – auch eine leere Liste gilt als angezeigt
  assert.ok(list.indexOf('onDisplayed?.()') < list.indexOf('if (!count) return'));
  assert.match(read('src', 'pages', 'ChatRoomPage.jsx'), /onDisplayed=\{markDisplayed\}/);
  assert.match(read('src', 'pages', 'ChatConversationPage.jsx'), /onDisplayed=\{markDisplayed\}/);
  const hooks = read('src', 'state', 'useChat.js');
  assert.match(hooks, /canMarkRead\(\{ result, currentTarget: targetRef\.current, visible, attempted: attemptedTokens \}\)/);
  assert.match(hooks, /\.then\(\(\) => notifyInboxChanged\(\)\)/);
  assert.doesNotMatch(read('src', 'pages', 'ChatPage.jsx'), /markRead|chat_mark_read|markDisplayed/);
  assert.match(read('src', 'pages', 'ChatPage.jsx'), /useChatInbox\(\)/);
});

test('neuer Text in allen drei Sprachen', () => {
  for (const lang of ['de', 'en', 'tr']) {
    const chat = JSON.parse(read('src', 'locales', `${lang}.json`)).chat;
    assert.ok(chat.unread && chat.you && chat.noMessagesYet, lang);
  }
});
