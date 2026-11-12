import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAppState } from './AppStateContext.jsx';
import { useRemote } from './useRemote.js';
import { canMarkRead, chatErrorKey, chatTarget, markReadOutcome } from '../lib/chat.js';
import {
  fetchBlocks,
  fetchChatStatus,
  fetchConversation,
  fetchConversations,
  fetchInboxState,
  fetchRequests,
  fetchRoom,
  fetchRoomMembers,
  fetchRooms,
  loadMessages,
  markRead,
} from '../lib/chatApi.js';

/**
 * Hooks für den Chatroom (Migration 014).
 * Ergebnis wie useRemote: { status, data, errorKey, reload, refreshing }
 *   status: 'guest' (nicht angemeldet) | 'loading' | 'ready' | 'error' | 'notInstalled'
 * errorKey 'chat.errors.disabled' = Chat ist (noch) ausgeschaltet.
 */
const useChatRemote = (load, deps) => useRemote(load, () => null, deps, chatErrorKey);

/** Neu-Laden zusammenfassen, damit viele Realtime-Signale nicht viele Anfragen auslösen. */
function useDebounced(fn, delay = 300) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useRef(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(), delay);
  }).current;
}

/**
 * Realtime: auf Änderungen in Tabellen lauschen und dann `onChange` aufrufen (das lädt über die
 * geprüften Datenbank-Funktionen neu – der Inhalt des Signals wird nicht angezeigt).
 * Welche Zeilen ein Signal auslösen, entscheidet Supabase anhand der RLS-Policies aus 014.
 * Sicherheitsnetz: Ist Realtime nicht verbunden, wird alle 20 s neu geladen (sonst alle 60 s).
 *
 * subscriptions: [{ table, filter? }]
 */
export function useChatRealtime(name, subscriptions, onChange, enabled = true) {
  const trigger = useDebounced(onChange);
  const [connected, setConnected] = useState(false);
  const key = JSON.stringify(subscriptions);

  useEffect(() => {
    if (!enabled || !supabase) return undefined;
    const channel = supabase.channel(`chat:${name}`);
    for (const sub of subscriptions) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: sub.table, ...(sub.filter ? { filter: sub.filter } : {}) },
        () => trigger(),
      );
    }
    channel.subscribe((status) => setConnected(status === 'SUBSCRIBED'));
    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
    // subscriptions werden über key verglichen
  }, [name, key, enabled, trigger]);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') trigger();
    }, connected ? 60000 : 20000);
    return () => clearInterval(interval);
  }, [enabled, connected, trigger]);

  return connected;
}

export function useChatStatus() {
  const { user } = useAppState();
  return useChatRemote(fetchChatStatus, [user.id]);
}

/**
 * live = true (nur Chat-Übersicht): bei neuer Nachricht / Beitritt neu laden, damit die Zeit der
 * letzten Nachricht aktuell bleibt. Signale gibt es nur für Zeilen, die man laut RLS lesen darf;
 * geladen wird wie immer über chat_list_rooms(). Andere Stellen (Projekt-Link) brauchen das nicht.
 */
export function useChatRooms({ live = false } = {}) {
  const { user, mode } = useAppState();
  const rooms = useChatRemote(fetchRooms, [user.id]);
  useChatRealtime(
    'rooms',
    [{ table: 'chat_messages' }, { table: 'chat_room_members' }],
    () => rooms.reload(),
    live && mode === 'account',
  );
  return rooms;
}

export function useChatRoom(roomId) {
  const { user, mode } = useAppState();
  const detail = useChatRemote((client) => fetchRoom(client, roomId), [user.id, roomId]);
  // Nachrichten/Mitglieder erst laden, wenn der Raum bekannt ist. Darf die Person nicht lesen
  // (kein Mitglied), meldet die Datenbank DC042 → die Seite bietet „Beitreten“ an.
  const ready = detail.status === 'ready' && Boolean(detail.data);
  const membership = detail.data?.isMember === true;
  const loaded = useChatRemote(
    (client) =>
      ready ? loadMessages(client, { roomId }) : Promise.resolve({ target: chatTarget(roomId), messages: [], readToken: null }),
    [user.id, roomId, ready, membership],
  );
  const messages = asMessages(loaded);
  const markDisplayed = useReadTracking(chatTarget(roomId), loaded);
  const members = useChatRemote(
    (client) => (ready ? fetchRoomMembers(client, roomId) : Promise.resolve([])),
    [user.id, roomId, ready, membership],
  );
  const live = useChatRealtime(
    `room:${roomId}`,
    [{ table: 'chat_messages', filter: `room_id=eq.${roomId}` }, { table: 'chat_reactions' }, { table: 'chat_room_members' }],
    () => {
      detail.reload();
      loaded.reload();
      members.reload();
    },
    mode === 'account' && Boolean(roomId),
  );
  return { detail, messages, members, live, markDisplayed };
}

export function useChatConversations() {
  const { user, mode } = useAppState();
  const conversations = useChatRemote(fetchConversations, [user.id]);
  const requests = useChatRemote(fetchRequests, [user.id]);
  useChatRealtime(
    'inbox',
    [{ table: 'chat_requests' }, { table: 'chat_conversations' }, { table: 'chat_messages' }],
    () => {
      conversations.reload();
      requests.reload();
    },
    mode === 'account',
  );
  return { conversations, requests };
}

export function useChatConversation(conversationId) {
  const { user, mode } = useAppState();
  const detail = useChatRemote((client) => fetchConversation(client, conversationId), [user.id, conversationId]);
  const loaded = useChatRemote(
    (client) =>
      detail.status === 'ready'
        ? loadMessages(client, { conversationId })
        : Promise.resolve({ target: chatTarget(null, conversationId), messages: [], readToken: null }),
    [user.id, conversationId, detail.status === 'ready'],
  );
  const messages = asMessages(loaded);
  const markDisplayed = useReadTracking(chatTarget(null, conversationId), loaded);
  const live = useChatRealtime(
    `conversation:${conversationId}`,
    [
      { table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      { table: 'chat_reactions' },
      { table: 'chat_conversations', filter: `id=eq.${conversationId}` },
    ],
    () => {
      detail.reload();
      loaded.reload();
    },
    mode === 'account' && Boolean(conversationId),
  );
  return { detail, messages, live, markDisplayed };
}

export function useChatBlocks() {
  const { user } = useAppState();
  return useChatRemote(fetchBlocks, [user.id]);
}

// ---------- Lesestand (Migration 020) ----------

/** Ergebnis von loadMessages → wie bisher: messages.data ist die Liste der Nachrichten. */
function asMessages(loaded) {
  return { ...loaded, data: loaded.status === 'ready' ? loaded.data?.messages ?? [] : loaded.data };
}

// Seiten melden „Lesestand geändert“ → offene Übersichten laden chat_inbox_state neu.
const inboxListeners = new Set();
export const notifyInboxChanged = () => inboxListeners.forEach((fn) => fn());

// Token, die schon eingelöst wurden oder gerade werden – modulweit, damit doppelt laufende
// Effekte (React StrictMode) oder schnelle Wiederholungen ein Token nie zweimal schicken.
const attemptedTokens = new Set();

/**
 * Lesestand für einen offenen Raum / ein offenes Gespräch.
 * Gibt markDisplayed() zurück: die Nachrichtenliste ruft es auf, NACHDEM sie die geladenen
 * Nachrichten angezeigt hat. Erst dann – und nur, wenn
 *   – das Token zu GENAU diesem Raum/Gespräch gehört (keine veraltete Antwort nach schnellem Wechsel),
 *   – der Tab sichtbar ist (sonst sobald er wieder sichtbar wird),
 *   – das Token noch nicht versucht wurde,
 * wird chat_mark_read(token) aufgerufen. Danach: Übersicht neu laden.
 * Abgelaufenes Token (DC061): einmal neu laden → neues Token. Andere Fehler: still ignorieren.
 */
function useReadTracking(target, loaded) {
  const result = loaded.status === 'ready' ? loaded.data : null;
  const targetRef = useRef(target);
  targetRef.current = target;
  const reloadRef = useRef(loaded.reload);
  reloadRef.current = loaded.reload;
  const pending = useRef(null);

  // Seite verlassen oder Ziel gewechselt: wartendes Markieren (unsichtbarer Tab) verwerfen
  useEffect(() => () => {
    if (pending.current) document.removeEventListener('visibilitychange', pending.current);
    pending.current = null;
  }, [target]);

  return useCallback(() => {
    if (!supabase || !result?.readToken) return;
    const attempt = () => {
      const visible = document.visibilityState === 'visible';
      if (!canMarkRead({ result, currentTarget: targetRef.current, visible, attempted: attemptedTokens })) return false;
      attemptedTokens.add(result.readToken);
      markRead(supabase, result.readToken)
        .then(() => notifyInboxChanged())
        .catch((error) => {
          if (markReadOutcome(error) === 'reload' && targetRef.current === result.target) reloadRef.current();
        });
      return true;
    };
    if (attempt() || document.visibilityState === 'visible') return;
    // Tab im Hintergrund: erst markieren, wenn er wieder sichtbar ist
    if (pending.current) document.removeEventListener('visibilitychange', pending.current);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      pending.current = null;
      attempt();
    };
    pending.current = onVisible;
    document.addEventListener('visibilitychange', onVisible);
  }, [result]);
}

/**
 * Übersicht (chat_inbox_state): Map target → Vorschau + ungelesen; null = nicht verfügbar
 * (020 fehlt oder Fehler – dann zeigt die Übersicht alles wie bisher, nur ohne Punkte).
 * Lädt neu bei neuen Nachrichten (Realtime + Sicherheitsnetz) und wenn eine Seite gelesen markiert.
 * Markiert selbst NIE etwas als gelesen.
 */
export function useChatInbox() {
  const { user, mode } = useAppState();
  const inbox = useChatRemote((client) => fetchInboxState(client).catch(() => null), [user.id]);
  const { reload } = inbox;
  useEffect(() => {
    inboxListeners.add(reload);
    return () => inboxListeners.delete(reload);
  }, [reload]);
  useChatRealtime('inbox-state', [{ table: 'chat_messages' }, { table: 'chat_room_members' }], reload, mode === 'account');
  return inbox.status === 'ready' ? inbox.data : null;
}
