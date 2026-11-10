// Chatroom (Migration 014). Ausführen mit: npm test
// Ohne Datenbank: Logik, API-Aufrufe (Test-Client) und statische Prüfungen der Migration.
// Die SQL-Funktionen selbst prüft supabase/tests/014_chat_test.sql (Staging bzw. lokale Test-Datenbank).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BAN_DURATIONS,
  CHAT_EMOJIS,
  REPORT_CATEGORIES,
  TOPIC_SLUGS,
  chatError,
  chatErrorKey,
  isStaffRole,
  isValidSearch,
  mapConversation,
  mapMessage,
  mapRequest,
  mapStatus,
  maxBanMinutes,
  roomTitle,
  validateMessage,
} from '../src/lib/chat.js';
import * as api from '../src/lib/chatApi.js';
import { NAV_ITEMS, sectionForPath } from '../src/components/layout/navigation.js';

const raw = readFileSync(new URL('../supabase/migrations/014_chat.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sql = raw.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

// ---------- Logik ----------
test('Fehlercodes → verständliche Meldungen (inkl. Sperre, Wartezeit, bestehendes Gespräch)', () => {
  assert.equal(chatErrorKey({ code: 'DC040' }), 'chat.errors.disabled');
  assert.deepEqual(chatError({ code: 'DC041', details: '2026-11-10T10:00:00Z', hint: 'global' }), {
    key: 'chat.errors.banned',
    until: '2026-11-10T10:00:00Z',
  });
  assert.equal(chatError({ code: 'DC041', hint: 'room' }).key, 'chat.errors.bannedRoom');
  assert.equal(chatError({ code: 'DC046', hint: 'outgoing' }).key, 'chat.errors.requestPendingOutgoing');
  assert.equal(chatError({ code: 'DC046', hint: 'incoming' }).key, 'chat.errors.requestPendingIncoming');
  assert.equal(chatError({ code: 'DC047', details: 'x' }).until, 'x');
  assert.equal(chatError({ code: 'DC048', details: 'conv-id' }).conversationId, 'conv-id');
  assert.equal(chatErrorKey({ code: 'PGRST202' }), 'chat.errors.notInstalled');
  assert.equal(chatErrorKey({ code: '42501' }), 'chat.errors.notAllowed');
  assert.equal(chatErrorKey(new Error('offline')), 'chat.errors.generic');
});

test('jeder Fehlercode der Migration hat eine eigene Meldung', () => {
  const codes = [...new Set([...sql.matchAll(/errcode = '(DC\d{3})'/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 10);
  for (const code of codes) assert.notEqual(chatErrorKey({ code }), 'chat.errors.generic', code);
});

test('Zeilen werden sicher übernommen (gelöschte Nachricht ohne Text, nur erlaubte Emojis)', () => {
  const m = mapMessage({
    id: '1', sender_id: 's', sender_name: ' Ada ', is_own: true, body: 'geheim', censored: true, created_at: 't', deleted: true,
    reactions: [{ emoji: '👍', count: 2, mine: true }, { emoji: '💩', count: 9, mine: false }],
  });
  assert.equal(m.body, '', 'gelöschte Nachricht zeigt keinen Text');
  assert.equal(m.senderName, 'Ada');
  assert.deepEqual(m.reactions, [{ emoji: '👍', count: 2, mine: true }]);
  assert.equal(mapRequest({ direction: 'x', other_name: '' }).direction, 'outgoing');
  assert.equal(mapConversation({ other_name: null }).otherName, '–');
  assert.deepEqual(mapStatus({ enabled: true, role: 'root', ban_ends_at: null, cooldown_hours: 168 }), {
    enabled: true, role: 'user', banEndsAt: null, cooldownHours: 168,
  });
});

test('Rollen, Sperrdauern, Eingaben', () => {
  assert.equal(isStaffRole('admin'), true);
  assert.equal(isStaffRole('moderator'), true);
  assert.equal(isStaffRole('user'), false);
  assert.equal(maxBanMinutes('moderator'), 7 * 24 * 60);
  assert.equal(maxBanMinutes('admin'), 365 * 24 * 60);
  assert.deepEqual(BAN_DURATIONS.map((d) => d.id), ['1h', '24h', '3d', '7d', '14d', '30d']);
  assert.equal(validateMessage('   '), 'chat.errors.empty');
  assert.equal(validateMessage('x'.repeat(1001)), 'chat.errors.tooLong');
  assert.equal(validateMessage('Hallo'), null);
  assert.equal(isValidSearch('a'), false);
  assert.equal(isValidSearch('ab'), true);
  assert.equal(isValidSearch('x'.repeat(101)), false);
});

test('Raumtitel: Themenraum übersetzt, Projekt/Event aus den Daten', () => {
  const t = (key) => `T(${key})`;
  assert.equal(roomTitle({ kind: 'topic', slug: 'general' }, t, () => ''), 'T(chat.rooms.general.title)');
  assert.equal(roomTitle({ kind: 'project', ideaTitle: 'Robotik' }, t, () => ''), 'Robotik');
  assert.equal(roomTitle({ kind: 'event', eventTitle: { de: 'Fest' } }, t, (v) => v.de), 'Fest');
  assert.equal(roomTitle({ kind: 'event', eventTitle: null }, t, () => ''), 'T(chat.rooms.eventFallback)');
});

test('Navigation: /chat ist der eigene Hauptbereich „chat“ (siebter Bereich, vor „Spiele“)', () => {
  assert.equal(sectionForPath('/chat'), 'chat');
  assert.equal(sectionForPath('/chat/rooms/abc'), 'chat');
  assert.equal(sectionForPath('/chat/moderation'), 'chat');
  assert.equal(sectionForPath('/chatroom'), null);
  assert.equal(NAV_ITEMS.length, 7);
  const ids = NAV_ITEMS.map((item) => item.id);
  assert.ok(ids.indexOf('chat') < ids.indexOf('games'), 'chat steht vor games');
});

// ---------- API mit Test-Client ----------
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({ name, params: params ?? {} });
      return responses[name] ?? { data: [], error: null };
    },
  };
}

test('API: richtige Datenbank-Funktionen, nie die eigene Nutzer-ID', async () => {
  const client = fakeClient({
    chat_send_room_message: { data: [{ id: 'm1', censored: true }], error: null },
    chat_send_request: { data: [{ id: 'r1', censored: false }], error: null },
    chat_respond_request: { data: 'c1', error: null },
  });
  assert.deepEqual(await api.sendRoomMessage(client, 'room', 'Hallo'), { id: 'm1', censored: true });
  assert.deepEqual(await api.sendRequest(client, 'person-b', 'Hi'), { id: 'r1', censored: false });
  assert.equal(await api.respondRequest(client, 'r1', true), 'c1');
  await api.toggleReaction(client, 'm1', '👍');
  await api.searchMessages(client, 'Bibliothek');
  await api.modBan(client, { userId: 'u', scope: 'room', roomId: 'x', minutes: 60, reason: 'Spam' });
  await api.adminDeleteConversation(client, 'c1', 'Grund');
  const names = client.calls.map((c) => c.name);
  assert.deepEqual(names, [
    'chat_send_room_message', 'chat_send_request', 'chat_respond_request', 'chat_toggle_reaction',
    'chat_search', 'chat_mod_ban', 'chat_admin_delete_conversation',
  ]);
  for (const call of client.calls) {
    assert.ok(!Object.keys(call.params).some((key) => /^p_(sender|uid|actor|me|self)$/.test(key)), `${call.name}: keine eigene ID`);
  }
  assert.deepEqual(client.calls[5].params, { p_user: 'u', p_scope: 'room', p_room: 'x', p_minutes: 60, p_reason: 'Spam' });
});

test('API: Datenbank-Fehler werden weitergegeben', async () => {
  const client = fakeClient({ chat_send_room_message: { data: null, error: { code: 'DC041', hint: 'global' } } });
  await assert.rejects(() => api.sendRoomMessage(client, 'room', 'x'), (e) => e.code === 'DC041');
});

test('jede API-Funktion ruft eine Funktion auf, die 014 (oder 020: Lesestand) für authenticated freigibt', () => {
  const source = readFileSync(new URL('../src/lib/chatApi.js', import.meta.url), 'utf8');
  const used = [...new Set([...source.matchAll(/'(chat_[a-z_]+)'/g)].map((m) => m[1]))];
  const granted = [...sql.match(/user_functions text\[\] := array\[([\s\S]*?)\];/)[1].matchAll(/public\.(chat_[a-z_]+)\(/g)].map((m) => m[1]);
  const sql020 = readFileSync(new URL('../supabase/migrations/020_chat_read_state.sql', import.meta.url), 'utf8');
  const granted020 = [...sql020.matchAll(/grant execute on function public\.(chat_[a-z_]+)\([^)]*\) to authenticated/g)].map((m) => m[1]);
  assert.deepEqual(granted020.sort(), ['chat_inbox_state', 'chat_load_messages', 'chat_mark_read']);
  for (const name of used) assert.ok(granted.includes(name) || granted020.includes(name), `${name} ist nicht freigegeben`);
});

// ---------- Migration 014 (statisch) ----------
test('014: Emojis und Meldegründe identisch zur Datenbank', () => {
  assert.ok(sql.includes(`emoji in (${CHAT_EMOJIS.map((e) => `'${e}'`).join(', ')})`));
  assert.ok(sql.includes(`category in (${REPORT_CATEGORIES.map((c) => `'${c}'`).join(', ')})`));
  assert.ok(sql.includes(`values ${TOPIC_SLUGS.map((s) => `('topic', '${s}')`).join(', ')}`));
});

test('014: RLS überall, nur Lese-Policies, Chat standardmäßig aus', () => {
  const tables = [...sql.matchAll(/create table if not exists public\.(chat_\w+)/g)].map((m) => m[1]);
  assert.equal(tables.length, 13);
  const rlsList = sql.match(/foreach t in array array\[([\s\S]*?)\] loop\s+execute format\('alter table/)[1];
  for (const table of tables) assert.ok(rlsList.includes(`'${table}'`), `${table}: RLS`);
  const policies = [...sql.matchAll(/create policy "[^"]+" on public\.(chat_\w+) for (\w+)/g)];
  assert.equal(policies.length, 5);
  assert.ok(policies.every((p) => p[2] === 'select'), 'nur SELECT-Policies');
  assert.ok(!/grant (insert|update|delete|all)/i.test(sql), 'keine Schreibrechte für Rollen');
  assert.ok(sql.includes('enabled                boolean not null default false'));
  assert.ok(!/service_role/.test(sql), 'kein Service-Role-Bezug');
  assert.ok(!/\bemail\b/i.test(sql), 'keine E-Mail-Adressen');
  assert.ok(!/cron\.|admin_get_overview_stats|events\.archived_at/.test(sql), 'braucht 008–010 nicht');
});

test('014: alle Funktionen mit festem search_path; Benutzer-Funktionen SECURITY DEFINER mit auth.uid()', () => {
  const functions = [...sql.matchAll(/create or replace function (public\.chat_\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)];
  assert.ok(functions.length >= 60, `gefunden: ${functions.length}`);
  for (const [, name, , body] of functions) {
    assert.ok(/set search_path = ''/.test(body), `${name}: search_path`);
    if (!['public.chat_norm', 'public.chat_require_reason'].includes(name)) {
      assert.ok(/security definer/.test(body), `${name}: security definer`);
    }
  }
  // Die eigene Identität kommt immer aus auth.uid() (chat_require_user/staff/admin bzw. Policies)
  assert.ok(/uid uuid := auth\.uid\(\);/.test(sql));
  const userFns = sql.match(/user_functions text\[\] := array\[([\s\S]*?)\];/)[1];
  assert.ok(!/chat_censor|chat_audit\(|chat_is_staff|chat_message_rows/.test(userFns), 'interne Hilfen nicht freigegeben');
});

test('014: Wortfilter läuft auf dem Server vor dem Speichern; Rohtext wird nicht gespeichert', () => {
  for (const fn of ['chat_send_room_message', 'chat_send_conversation_message', 'chat_send_request']) {
    const body = sql.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`))[0];
    assert.ok(body.includes('public.chat_clean_text('), `${fn}: Filter`);
    assert.ok(/values \([^)]*clean\.body/.test(body), `${fn}: speichert die gefilterte Fassung`);
    assert.ok(!/values \([^)]*p_(body|intro)/.test(body), `${fn}: speichert nie den Rohtext`);
  }
  assert.ok(sql.includes("raise exception 'Kontaktdaten sind nicht erlaubt' using errcode = 'DC043'"));
  // Wortliste wird nicht ins Protokoll geschrieben
  const termFn = sql.match(/create or replace function public\.chat_admin_set_term[\s\S]*?\$\$;/)[0];
  assert.ok(/chat_audit\(uid, [^;]*'term', null, null/.test(termFn), 'Wort selbst nicht im Audit');
});

test('014: Anfrage ≠ Gespräch; eindeutige Paare; Sperren bei jeder Schreibaktion', () => {
  assert.ok(sql.includes('constraint chat_conversations_unique_pair unique (user_a, user_b)'));
  assert.ok(sql.includes('constraint chat_conversations_pair check (user_a < user_b)'));
  assert.ok(/create unique index if not exists chat_requests_one_pending_per_pair[\s\S]*?where status = 'pending'/.test(sql));
  for (const fn of ['chat_send_room_message', 'chat_send_conversation_message', 'chat_send_request', 'chat_toggle_reaction',
    'chat_create_project_room', 'chat_respond_request']) {
    const body = sql.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`))[0];
    assert.ok(body.includes('public.chat_require_not_banned('), `${fn}: Sperre geprüft`);
  }
  // Gespräch nur über Annahme (chat_respond_request) – sonst nirgends ein INSERT in chat_conversations
  const inserts = [...sql.matchAll(/insert into public\.chat_conversations/g)];
  assert.equal(inserts.length, 1);
});
