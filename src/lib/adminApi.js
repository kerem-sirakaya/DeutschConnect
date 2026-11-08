/**
 * Admin-Funktionen (Migration 005 + 006) – NUR über RPC, nie direkt auf Tabellen.
 *
 * Reine Funktionen: Der Supabase-Client wird übergeben (wie in eventsApi.js), damit
 * sie sich mit einem nachgebauten Client testen lassen (tests/adminApi.test.js).
 *
 * Sicherheit: Jede admin_*()-Funktion prüft in der Datenbank selbst is_admin() und
 * antwortet sonst mit 42501. Was hier im Browser passiert, ist nur Komfort – die
 * Datenbank entscheidet. Die Listen enthalten bewusst KEINE Personen-Daten
 * (keine author_id, keine Namen, nur Zahlen).
 *
 * Konventionen (wie eventsApi.js / ideasApi.js):
 *   - Lesen (fetch…)  -> gibt Daten zurück, wirft bei Fehler
 *   - Ändern          -> gibt { error } zurück (error = null bei Erfolg)
 */
import { mapDbEvent } from './eventsApi.js';

/** Alle Status, die die Datenbank kennt (Migration 006). */
export const ADMIN_EVENT_STATUSES = ['draft', 'planned', 'confirmed', 'completed', 'cancelled'];
export const ADMIN_IDEA_STATUSES = ['submitted', 'collecting', 'review', 'planned', 'rejected'];

// ---------------------------------------------------------------------------
// Umwandlung
// ---------------------------------------------------------------------------

/** Zeile aus admin_list_events() -> Event-Form der App + Zählungen. */
export function mapAdminEvent(row) {
  return {
    ...mapDbEvent(row),
    createdAt: row.created_at,
    registeredCount: Number(row.registered_count) || 0,
    interestedCount: Number(row.interested_count) || 0,
  };
}

/** Zeile aus admin_list_ideas() -> Ideen-Form der App (ohne authorId) + Unterstützerzahl. */
export function mapAdminIdea(row) {
  return {
    id: row.id,
    schoolId: row.school_id,
    title: row.title,
    summary: row.summary ?? '',
    description: row.description ?? '',
    topics: Array.isArray(row.topics) ? row.topics : [],
    format: row.format,
    schoolIds: Array.isArray(row.school_ids) ? row.school_ids : [],
    status: row.status,
    createdAt: row.created_at,
    supporters: Number(row.supporters) || 0,
    isDemo: false,
  };
}

/**
 * Mehrsprachiger Text -> Wert für die Datenbank.
 * Leere Sprachen werden weggelassen, ganz leere Texte werden null
 * (die Datenbank lehnt leere Texte mit 22023 ab).
 */
export function cleanText(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() ? value : null;
  const entries = Object.entries(value).filter(([, text]) => typeof text === 'string' && text.trim());
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * Event aus dem Formular (gleiche Feldnamen wie mapDbEvent) -> RPC-Parameter.
 * Parameternamen exakt wie in admin_create_event / admin_update_event (Migration 006).
 * `start` muss ein ISO-Zeitpunkt MIT Zeitzone sein (z. B. "2026-12-01T14:00:00+03:00").
 */
export function toEventParams(input) {
  return {
    p_title: cleanText(input.title),
    p_start_at: input.start ?? null,
    p_host_school_id: input.hostSchoolId ?? null,
    p_school_ids: input.schoolIds ?? null,
    p_summary: cleanText(input.summary),
    p_description: cleanText(input.description),
    p_location: cleanText(input.location),
    p_audience: cleanText(input.audience),
    p_duration_minutes: input.durationMinutes ?? null,
    p_capacity: input.capacity ?? null,
    p_online: Boolean(input.online),
    p_topics: input.topics ?? [],
    p_format: input.format ?? 'meetup',
  };
}

// ---------------------------------------------------------------------------
// Admin-Prüfung (Migration 005)
// ---------------------------------------------------------------------------

/** Ist die angemeldete Person Admin? Nur `true` zählt – alles andere ist "nein". */
export async function fetchIsAdmin(client) {
  const { data, error } = await client.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

// ---------------------------------------------------------------------------
// Events (Migration 006)
// ---------------------------------------------------------------------------

/** Alle Events inkl. Entwürfe, sortiert nach Beginn (sortiert die Datenbank). */
export async function fetchAdminEvents(client) {
  const { data, error } = await client.rpc('admin_list_events');
  if (error) throw error;
  return (data ?? []).map(mapAdminEvent);
}

/** Neues Event – die Datenbank legt es IMMER als Entwurf an. Gibt { id } oder { error } zurück. */
export async function createAdminEvent(client, input) {
  const { data, error } = await client.rpc('admin_create_event', toEventParams(input));
  if (error) return { error };
  return { id: data, error: null };
}

/**
 * Event bearbeiten. ACHTUNG: überschreibt ALLE Felder – immer das vollständige Event schicken.
 * Status und Anmeldungen ändert die Datenbank hier nie.
 */
export async function updateAdminEvent(client, eventId, input) {
  const { error } = await client.rpc('admin_update_event', { p_id: eventId, ...toEventParams(input) });
  return { error: error ?? null };
}

/** Status ändern (veröffentlichen, absagen, abschließen). Erlaubte Wechsel prüft die Datenbank. */
export async function setAdminEventStatus(client, eventId, status) {
  const { error } = await client.rpc('admin_set_event_status', { p_id: eventId, p_status: status });
  return { error: error ?? null };
}

/** Löschen – die Datenbank erlaubt es nur für leere Entwürfe. */
export async function deleteAdminEvent(client, eventId) {
  const { error } = await client.rpc('admin_delete_event', { p_id: eventId });
  return { error: error ?? null };
}

// ---------------------------------------------------------------------------
// Ideen (Migration 006)
// ---------------------------------------------------------------------------

/** Alle Ideen (neueste zuerst), optional nur ein Status. Ohne Autor:innen-Daten. */
export async function fetchAdminIdeas(client, status = null) {
  const { data, error } = await client.rpc('admin_list_ideas', { p_status: status ?? null });
  if (error) throw error;
  return (data ?? []).map(mapAdminIdea);
}

/** Status ändern (freigeben, ablehnen, wiedereröffnen …). Erlaubte Wechsel prüft die Datenbank. */
export async function setAdminIdeaStatus(client, ideaId, status) {
  const { error } = await client.rpc('admin_set_idea_status', { p_id: ideaId, p_status: status });
  return { error: error ?? null };
}

/**
 * Idee endgültig löschen – samt Unterstützungen (Migration 007).
 * Die Datenbank erlaubt es nur für collecting, review, planned und rejected (sonst DC010).
 */
export async function deleteAdminIdea(client, ideaId) {
  const { error } = await client.rpc('admin_delete_idea', { p_id: ideaId });
  return { error: error ?? null };
}

// ---------------------------------------------------------------------------
// Übersicht (Migration 010)
// ---------------------------------------------------------------------------

/** Zahl oder null (null = unbekannt – z. B. archived_events vor Migration 008). Nie still 0. */
const countOrNull = (value) => (value == null || Number.isNaN(Number(value)) ? null : Number(value));

/** Zeile aus admin_get_overview_stats() -> Kennzahlen. Nur Zahlen, keine Personendaten. */
export function mapOverviewStats(row) {
  return {
    totalStudents: countOrNull(row?.total_students),
    upcomingEvents: countOrNull(row?.upcoming_events),
    totalRegistrations: countOrNull(row?.total_registrations),
    ideasPendingReview: countOrNull(row?.ideas_pending_review),
    archivedEvents: countOrNull(row?.archived_events),
  };
}

/** Kennzahlen der Admin-Übersicht (eine Zeile). Wirft bei Fehlern. */
export async function fetchAdminOverviewStats(client) {
  const { data, error } = await client.rpc('admin_get_overview_stats');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw { code: 'no_data', message: 'admin_get_overview_stats lieferte keine Zeile' };
  return mapOverviewStats(row);
}

// ---------------------------------------------------------------------------
// Fehler -> Übersetzungsschlüssel (Codes aus Migration 006)
// ---------------------------------------------------------------------------

const ADMIN_ERROR_KEYS = {
  '42501': 'admin.errors.notAllowed', // kein Admin
  '22023': 'admin.errors.invalid', // ungültige Eingabe (auch ungültiger Status)
  P0002: 'admin.errors.notFound', // Event/Idee nicht gefunden
  DC001: 'admin.errors.hasEntries', // Event hat Anmeldungen/Interessierte – nicht löschbar
  DC002: 'admin.errors.pastDate', // Datum liegt in der Vergangenheit
  DC003: 'admin.errors.onlyDrafts', // nur Entwürfe löschbar
  DC004: 'admin.errors.transition', // Statuswechsel nicht erlaubt
  DC005: 'admin.errors.capacityTooLow', // Plätze unter Zahl der Anmeldungen
  DC006: 'admin.errors.dateLocked', // Datum abgesagter/abgeschlossener Events fest
  DC007: 'admin.errors.notStarted', // noch nicht begonnen – nicht abschließbar
  DC008: 'admin.errors.full', // ausgebucht
  DC009: 'admin.errors.technical', // falsche Isolationsstufe (Datenbank-Problem)
  DC010: 'admin.errors.ideaNotDeletable', // Idee in diesem Status nicht löschbar (Migration 007)
  PGRST202: 'admin.errors.unavailable', // Funktion fehlt (Migration nicht ausgeführt?)
  '23514': 'admin.errors.invalid', // Prüfregel der Tabelle verletzt
  '23503': 'admin.errors.invalid', // unbekannte Schule o. Ä.
  '22P02': 'admin.errors.invalid', // ungültiges Format (z. B. keine UUID)
};

export function adminErrorKey(error) {
  if (!error) return null;
  const key = ADMIN_ERROR_KEYS[error.code];
  if (key) return key;
  if (error.name === 'TypeError' || /fetch|network/i.test(error.message ?? '')) return 'admin.errors.network';
  return 'admin.errors.generic';
}
