/**
 * Chatroom – Zugriff auf Supabase (Migration 014_chat.sql). Der Client wird übergeben
 * (testbar ohne echte Datenbank, siehe tests/chat.test.js).
 *
 * Alles läuft über Datenbank-Funktionen. Keine Funktion bekommt die EIGENE Nutzer-ID –
 * die Datenbank nimmt immer auth.uid(). Übergeben werden nur Ziele (Raum, Gespräch, Person).
 */
import {
  buildInbox,
  chatTarget,
  mapConversation,
  mapLoadResult,
  mapMessage,
  mapRequest,
  mapRoom,
  mapSearchResult,
  mapStatus,
} from './chat.js';

const first = (data) => (Array.isArray(data) ? data[0] : data);

async function call(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}

// ---------- Status, Räume ----------
export const fetchChatStatus = async (client) => mapStatus(first(await call(client, 'chat_status')));
export const fetchRooms = async (client) => ((await call(client, 'chat_list_rooms')) ?? []).map(mapRoom);
export const joinRoom = (client, roomId) => call(client, 'chat_join_room', { p_room: roomId });
export const leaveRoom = (client, roomId) => call(client, 'chat_leave_room', { p_room: roomId });
export const createProjectRoom = (client, ideaId) => call(client, 'chat_create_project_room', { p_idea: ideaId });
export const createEventRoom = (client, eventId) => call(client, 'chat_create_event_room', { p_event: eventId });

export async function fetchRoom(client, roomId) {
  const row = first(await call(client, 'chat_room_detail', { p_room: roomId }));
  return row ? mapRoom(row) : null;
}

export async function fetchRoomMembers(client, roomId) {
  return ((await call(client, 'chat_room_members', { p_room: roomId })) ?? []).map((r) => ({
    userId: r.user_id,
    firstName: r.first_name,
    isSelf: r.is_self === true,
  }));
}

// ---------- Lesestand (Migration 020) ----------
// Gibt es 020 in der Datenbank nicht (z. B. Live), merkt sich die App das für diese Sitzung und lädt
// wie bisher – dann ohne Lese-Token und ohne „ungelesen“-Punkte.
const MISSING = new Set(['PGRST202', '42883']);
let readTrackingMissing = false;
export const isReadTrackingAvailable = () => !readTrackingMissing;
/** Nur für Tests. */
export const resetReadTrackingCheck = () => {
  readTrackingMissing = false;
};

/**
 * Nachrichten + Lese-Token in EINER Datenbank-Abfrage (chat_load_messages). Ergebnis:
 * { target, messages, readToken } – readToken = null, wenn 020 fehlt.
 */
export async function loadMessages(client, { roomId = null, conversationId = null, limit = 100 }) {
  const target = chatTarget(roomId, conversationId);
  if (!readTrackingMissing) {
    try {
      const data = await call(client, 'chat_load_messages', {
        p_room: roomId, p_conversation: conversationId, p_before: null, p_limit: limit,
      });
      return mapLoadResult(data, target);
    } catch (error) {
      if (!MISSING.has(error?.code)) throw error;
      readTrackingMissing = true;
    }
  }
  const messages = roomId ? await fetchRoomMessages(client, roomId) : await fetchConversationMessages(client, conversationId);
  return { target, messages, readToken: null };
}

/** Token einlösen (nur nach dem Anzeigen der Nachrichten aufrufen). */
export const markRead = (client, readToken) => call(client, 'chat_mark_read', { p_token: readToken });

/** Übersicht: Map target → { lastBody, lastSenderName, lastIsOwn, lastMessageAt, hasUnread }; null, wenn 020 fehlt. */
export async function fetchInboxState(client) {
  if (readTrackingMissing) return null;
  try {
    return buildInbox(await call(client, 'chat_inbox_state'));
  } catch (error) {
    if (!MISSING.has(error?.code)) throw error;
    readTrackingMissing = true;
    return null;
  }
}

export async function fetchRoomMessages(client, roomId) {
  return ((await call(client, 'chat_room_messages', { p_room: roomId, p_before: null, p_limit: 100 })) ?? []).map(mapMessage);
}

export async function sendRoomMessage(client, roomId, body) {
  const row = first(await call(client, 'chat_send_room_message', { p_room: roomId, p_body: body }));
  return { id: row?.id ?? null, censored: row?.censored === true };
}

// ---------- Nachrichten ----------
export const deleteOwnMessage = (client, messageId) => call(client, 'chat_delete_own_message', { p_message: messageId });
export const toggleReaction = (client, messageId, emoji) =>
  call(client, 'chat_toggle_reaction', { p_message: messageId, p_emoji: emoji });

// ---------- Anfragen + Gespräche ----------
export async function sendRequest(client, recipientId, intro) {
  const row = first(await call(client, 'chat_send_request', { p_recipient: recipientId, p_intro: intro }));
  return { id: row?.id ?? null, censored: row?.censored === true };
}
export const fetchRequests = async (client) => ((await call(client, 'chat_list_requests')) ?? []).map(mapRequest);
export const respondRequest = (client, requestId, accept) =>
  call(client, 'chat_respond_request', { p_request: requestId, p_accept: accept === true });
export const cancelRequest = (client, requestId) => call(client, 'chat_cancel_request', { p_request: requestId });

export const fetchConversations = async (client) =>
  ((await call(client, 'chat_list_conversations')) ?? []).map(mapConversation);

export async function fetchConversation(client, conversationId) {
  const row = first(await call(client, 'chat_conversation_detail', { p_conversation: conversationId }));
  return row ? mapConversation(row) : null;
}

export async function fetchConversationMessages(client, conversationId) {
  return ((await call(client, 'chat_conversation_messages', {
    p_conversation: conversationId, p_before: null, p_limit: 100,
  })) ?? []).map(mapMessage);
}

export async function sendConversationMessage(client, conversationId, body) {
  const row = first(await call(client, 'chat_send_conversation_message', { p_conversation: conversationId, p_body: body }));
  return { id: row?.id ?? null, censored: row?.censored === true };
}

// ---------- Suche, Blockieren, Melden ----------
export const searchMessages = async (client, query) =>
  ((await call(client, 'chat_search', { p_query: query, p_limit: 30 })) ?? []).map(mapSearchResult);
export const setBlock = (client, userId, blocked) => call(client, 'chat_set_block', { p_user: userId, p_blocked: blocked === true });
export const fetchBlocks = async (client) =>
  ((await call(client, 'chat_list_blocks')) ?? []).map((r) => ({ userId: r.user_id, firstName: r.first_name, createdAt: r.created_at }));
export const report = (client, targetType, targetId, category, note) =>
  call(client, 'chat_report', { p_target_type: targetType, p_target_id: targetId, p_category: category, p_note: note || null });

// ---------- Moderation (Datenbank prüft die Rolle) ----------
export const modListReports = (client, status) => call(client, 'chat_mod_list_reports', { p_status: status ?? null });
export const modResolveReport = (client, reportId, status, resolution) =>
  call(client, 'chat_mod_resolve_report', { p_report: reportId, p_status: status, p_resolution: resolution });
export const modReportContext = (client, reportId, reason) =>
  call(client, 'chat_mod_report_context', { p_report: reportId, p_reason: reason });
export const modDeleteMessage = (client, messageId, reason) =>
  call(client, 'chat_mod_delete_message', { p_message: messageId, p_reason: reason });
export const modFindUsers = (client, query) => call(client, 'chat_mod_find_users', { p_query: query });
export const modBan = (client, { userId, scope, roomId, minutes, reason }) =>
  call(client, 'chat_mod_ban', { p_user: userId, p_scope: scope, p_room: roomId ?? null, p_minutes: minutes, p_reason: reason });
export const modEndBan = (client, banId, reason) => call(client, 'chat_mod_end_ban', { p_ban: banId, p_reason: reason });
export const modListBans = (client, activeOnly = true) => call(client, 'chat_mod_list_bans', { p_active_only: activeOnly });
export const modSetRoomArchived = (client, roomId, archived, reason) =>
  call(client, 'chat_mod_set_room_archived', { p_room: roomId, p_archived: archived === true, p_reason: reason });
export const modListAudit = (client, limit = 100) => call(client, 'chat_mod_list_audit', { p_limit: limit });
export const modListRooms = (client) => call(client, 'chat_mod_list_rooms');

// ---------- Nur Admins ----------
export const adminListConversations = (client) => call(client, 'chat_admin_list_conversations');
export const adminSetConversationArchived = (client, id, archived, reason) =>
  call(client, 'chat_admin_set_conversation_archived', { p_conversation: id, p_archived: archived === true, p_reason: reason });
export const adminDeleteConversation = (client, id, reason) =>
  call(client, 'chat_admin_delete_conversation', { p_conversation: id, p_reason: reason });
export const adminDeleteRoom = (client, id, reason) => call(client, 'chat_admin_delete_room', { p_room: id, p_reason: reason });
export const adminListStaff = (client) => call(client, 'chat_admin_list_staff');
export const adminSetModerator = (client, userId, moderator, note) =>
  call(client, 'chat_admin_set_moderator', { p_user: userId, p_moderator: moderator === true, p_note: note });
export const adminGetConfig = async (client) => first(await call(client, 'chat_admin_get_config'));
export const adminSetConfig = (client, { enabled, cooldownHours, requestsPerDay, messagesPerMinute, reason }) =>
  call(client, 'chat_admin_set_config', {
    p_enabled: enabled, p_cooldown_hours: cooldownHours, p_requests_per_day: requestsPerDay,
    p_messages_per_minute: messagesPerMinute, p_reason: reason,
  });
export const adminListTerms = (client) => call(client, 'chat_admin_list_terms');
export const adminSetTerm = (client, term, matchPrefix, language, add) =>
  call(client, 'chat_admin_set_term', { p_term: term, p_match_prefix: matchPrefix === true, p_language: language, p_add: add === true });
