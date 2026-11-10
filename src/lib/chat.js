/**
 * Chatroom (Migration 014_chat.sql) – reine Hilfsfunktionen ohne Netzwerk
 * (getestet in tests/chat.test.js).
 *
 * Konzepte nach Kerems Codex-Version (Branch `codex-version-1.0`: Themenräume general/learning/
 * projects/events, Projekt-/Eventgruppen, Melden, Blockieren, Kontaktdaten-Schutz) – Speicherung
 * und Rechte aber relational in Supabase (Tabellen + RLS + Datenbank-Funktionen).
 */

/** Feste Emoji-Auswahl – identisch mit der Prüfregel in 014 (chat_reactions.emoji). */
export const CHAT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

/** Die vier Themenräume (slug in chat_rooms). */
export const TOPIC_SLUGS = ['general', 'learning', 'projects', 'events'];

/** Meldegründe – identisch mit chat_reports.category. */
export const REPORT_CATEGORIES = ['language', 'harassment', 'discrimination', 'privacy', 'spam', 'other'];

/** Vorgeschlagene Sperrdauern in Minuten (+ „eigene Dauer“ im Formular). */
export const BAN_DURATIONS = [
  { id: '1h', minutes: 60 },
  { id: '24h', minutes: 24 * 60 },
  { id: '3d', minutes: 3 * 24 * 60 },
  { id: '7d', minutes: 7 * 24 * 60 },
  { id: '14d', minutes: 14 * 24 * 60 },
  { id: '30d', minutes: 30 * 24 * 60 },
];

/** Höchstdauer einer Sperre: Moderator:innen 7 Tage, Admins 365 Tage (wie chat_mod_ban). */
export const maxBanMinutes = (role) => (role === 'admin' ? 365 * 24 * 60 : 7 * 24 * 60);

export const MESSAGE_MAX = 1000;
export const INTRO_MAX = 500;

const NOT_INSTALLED = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);

/**
 * Datenbank-Fehler → { key, params } für die Anzeige.
 * DC041 (Sperre) bringt das Ende in error.details und den Bereich in error.hint mit.
 */
export function chatError(error) {
  const code = error?.code;
  if (NOT_INSTALLED.has(code)) return { key: 'chat.errors.notInstalled' };
  switch (code) {
    case '42501': return { key: 'chat.errors.notAllowed' };
    case 'P0002': return { key: 'chat.errors.notFound' };
    case '22023': return { key: 'chat.errors.invalid' };
    case 'DC040': return { key: 'chat.errors.disabled' };
    case 'DC041':
      return { key: error?.hint === 'room' ? 'chat.errors.bannedRoom' : 'chat.errors.banned', until: error?.details ?? null };
    case 'DC042': return { key: 'chat.errors.noAccess' };
    case 'DC043': return { key: 'chat.errors.contactData' };
    case 'DC044': return { key: 'chat.errors.rateLimit' };
    case 'DC045': return { key: 'chat.errors.blocked' };
    case 'DC046':
      return { key: error?.hint === 'outgoing' ? 'chat.errors.requestPendingOutgoing' : 'chat.errors.requestPendingIncoming' };
    case 'DC047': return { key: 'chat.errors.cooldown', until: error?.details ?? null };
    case 'DC048': return { key: 'chat.errors.conversationExists', conversationId: error?.details ?? null };
    case 'DC049': return { key: 'chat.errors.unreachable' };
    case 'DC050': return { key: 'chat.errors.archived' };
    case 'DC051': return { key: 'chat.errors.eventDeleted' };
    default: return { key: 'chat.errors.generic' };
  }
}

// ---------- Lesestand (Migration 020) ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Eindeutiger Schlüssel für ein Ziel: 'room:<id>' oder 'conversation:<id>'. */
export const chatTarget = (roomId, conversationId) =>
  roomId ? `room:${roomId}` : conversationId ? `conversation:${conversationId}` : null;

/**
 * Antwort von chat_load_messages → { target, messages, readToken }.
 * Ein Token, das nicht wie eine UUID aussieht, wird verworfen (dann wird nichts markiert).
 */
export function mapLoadResult(data, target) {
  const token = typeof data?.read_token === 'string' && UUID.test(data.read_token) ? data.read_token : null;
  const rows = Array.isArray(data?.messages) ? data.messages : [];
  return { target, messages: rows.map(mapMessage), readToken: token };
}

/** Zeile aus chat_inbox_state → Eintrag für die Übersicht. */
export function mapInboxRow(row) {
  return {
    target: chatTarget(row.room_id, row.conversation_id),
    lastMessageAt: row.last_message_at ?? null,
    lastBody: typeof row.last_body === 'string' ? row.last_body : null,
    lastSenderName: typeof row.last_sender_name === 'string' ? row.last_sender_name : null,
    lastIsOwn: row.last_is_own === true,
    hasUnread: row.has_unread === true,
  };
}

/** Alle Zeilen → Map target → Eintrag (für schnellen Zugriff je Karte). */
export function buildInbox(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const entry = mapInboxRow(row);
    if (entry.target) map.set(entry.target, entry);
  }
  return map;
}

/** „Ben: Hallo“ / „Du: Hallo“ – oder null, wenn es noch keine Nachricht gibt. */
export function inboxPreview(entry, youLabel) {
  if (!entry?.lastMessageAt || entry.lastBody === null) return null;
  const who = entry.lastIsOwn ? youLabel : entry.lastSenderName || '–';
  return { who, text: entry.lastBody.replace(/\s+/g, ' ').trim() };
}

/**
 * Was tun, wenn chat_mark_read scheitert?
 *   'reload' – Token abgelaufen (DC061): Nachrichten neu laden → neues Token → erneut markieren
 *   'ignore' – unbekannt/fremd (DC060), schon eingelöst (DC062), kein Zugriff mehr (DC042), sonstiges
 * Nie eine Fehlermeldung anzeigen – der Lesestand ist eine Komfortfunktion.
 */
export function markReadOutcome(error) {
  return error?.code === 'DC061' ? 'reload' : 'ignore';
}

/**
 * Darf jetzt markiert werden? Nur wenn
 *   – ein Token da ist, das zu GENAU dem offenen Raum/Gespräch gehört (keine veraltete Antwort),
 *   – die Seite sichtbar ist und
 *   – dieses Token noch nicht versucht wurde (einmalig, auch bei doppelt laufenden Effekten).
 */
export function canMarkRead({ result, currentTarget, visible, attempted }) {
  return Boolean(result?.readToken) && result.target === currentTarget && visible === true
    && !attempted.has(result.readToken);
}

/** Für useRemote: nur der Schlüssel. */
export const chatErrorKey = (error) => chatError(error).key;

const asReactions = (value) =>
  (Array.isArray(value) ? value : [])
    .filter((r) => CHAT_EMOJIS.includes(r?.emoji))
    .map((r) => ({ emoji: r.emoji, count: Number(r.count) || 0, mine: r.mine === true }));

export function mapMessage(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: String(row.sender_name ?? '').trim() || '–',
    // Profilfarbe für das Kürzel-Bild; nur echte #rrggbb-Werte (kommt als CSS-Variable in die Seite)
    senderAvatarColor: /^#[0-9a-fA-F]{6}$/.test(row.sender_avatar_color ?? '') ? row.sender_avatar_color : null,
    isOwn: row.is_own === true,
    body: row.deleted ? '' : String(row.body ?? ''),
    censored: row.censored === true,
    createdAt: row.created_at,
    deleted: row.deleted === true,
    reactions: asReactions(row.reactions),
  };
}

/**
 * Welche Knöpfe zeigt ein Raum? (Übersicht und Raumseite)
 *   Themenraum, Mitglied:          ['enter', 'leave']
 *   Themenraum, kein Mitglied:     ['join']  (archiviert: [] – Beitreten ist dann gesperrt)
 *   Projekt-/Eventgruppe, Mitglied: ['enter'] (Mitgliedschaft kommt aus Projekt-Team bzw. Anmeldung)
 *   sonst:                          []
 * Nur Anzeige – ob jemand wirklich lesen/schreiben darf, prüft die Datenbank (DC042).
 */
export function roomActions(room) {
  if (!room) return [];
  if (room.kind === 'topic') {
    if (room.isMember) return ['enter', 'leave'];
    return room.archived ? [] : ['join'];
  }
  return room.isMember ? ['enter'] : [];
}

/**
 * Zeitpunkt der letzten Nachricht für die Übersicht – nur für Mitglieder.
 * (chat_list_rooms liefert last_message_at auch für Themenräume, in denen man nicht Mitglied ist;
 * die Übersicht zeigt dann nichts an.)
 */
export function roomPreviewTime(room) {
  return room?.isMember && room.lastMessageAt ? room.lastMessageAt : null;
}

/** Neueste Aktivität zuerst; Räume ohne Nachricht ans Ende (Reihenfolge sonst unverändert). */
export function sortByActivity(rooms) {
  const time = (room) => (room.lastMessageAt ? Date.parse(room.lastMessageAt) || 0 : 0);
  return [...rooms].sort((a, b) => time(b) - time(a));
}

export function mapRoom(row) {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug ?? null,
    ideaId: row.idea_id ?? null,
    ideaTitle: row.idea_title ?? null,
    eventId: row.event_id ?? null,
    eventTitle: row.event_title ?? null,
    isMember: row.is_member === true,
    memberCount: Number(row.member_count) || 0,
    archived: row.archived === true,
    lastMessageAt: row.last_message_at ?? null,
    canWrite: row.can_write === true,
    banEndsAt: row.ban_ends_at ?? null,
    banScope: row.ban_scope === 'room' ? 'room' : row.ban_ends_at ? 'global' : null,
  };
}

export function mapRequest(row) {
  return {
    id: row.id,
    direction: row.direction === 'incoming' ? 'incoming' : 'outgoing',
    otherId: row.other_id,
    otherName: String(row.other_name ?? '').trim() || '–',
    intro: String(row.intro ?? ''),
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
    conversationId: row.conversation_id ?? null,
  };
}

export function mapConversation(row) {
  return {
    id: row.id,
    otherId: row.other_id,
    otherName: String(row.other_name ?? '').trim() || '–',
    createdAt: row.created_at,
    archived: row.archived === true,
    lastMessageAt: row.last_message_at ?? null,
    lastBody: row.last_body ?? null,
    lastIsOwn: row.last_is_own === true,
    canWrite: row.can_write === true,
    banEndsAt: row.ban_ends_at ?? null,
  };
}

export function mapSearchResult(row) {
  return {
    messageId: row.message_id,
    roomId: row.room_id ?? null,
    roomKind: row.room_kind ?? null,
    roomSlug: row.room_slug ?? null,
    ideaTitle: row.idea_title ?? null,
    eventTitle: row.event_title ?? null,
    conversationId: row.conversation_id ?? null,
    otherName: row.other_name ?? null,
    senderName: String(row.sender_name ?? '').trim() || '–',
    body: String(row.body ?? ''),
    createdAt: row.created_at,
  };
}

export function mapStatus(row) {
  return {
    enabled: row?.enabled === true,
    role: ['admin', 'moderator'].includes(row?.role) ? row.role : 'user',
    banEndsAt: row?.ban_ends_at ?? null,
    cooldownHours: Number(row?.cooldown_hours) || 0,
  };
}

/** Kann die Rolle moderieren? (Anzeige-Komfort – die Datenbank prüft selbst.) */
export const isStaffRole = (role) => role === 'admin' || role === 'moderator';

/**
 * Titel eines Raums: Themenraum über Übersetzung, Projekt = Ideentitel, Event = Eventtitel (mehrsprachig).
 * localizeFn: (jsonbTitle) => string (aus src/i18n/localize.js).
 */
export function roomTitle(room, t, localizeFn) {
  if (!room) return '';
  if (room.kind === 'topic') return t(`chat.rooms.${room.slug}.title`);
  if (room.kind === 'project') return room.ideaTitle || t('chat.rooms.projectFallback');
  return (room.eventTitle && localizeFn(room.eventTitle)) || t('chat.rooms.eventFallback');
}

/** Clientseitige Vorprüfung (nur Komfort – die Datenbank prüft Länge, Kontaktdaten und filtert). */
export function validateMessage(body, max = MESSAGE_MAX) {
  const text = String(body ?? '').trim();
  if (!text) return 'chat.errors.empty';
  if (text.length > max) return 'chat.errors.tooLong';
  return null;
}

/** Suchbegriff: 2–100 Zeichen (wie chat_search). */
export const isValidSearch = (query) => {
  const q = String(query ?? '').trim();
  return q.length >= 2 && q.length <= 100;
};
