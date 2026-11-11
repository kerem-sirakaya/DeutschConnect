/**
 * Echte Events + eigene Event-Anmeldungen aus Supabase.
 *
 * Reine Funktionen: Der Supabase-Client wird übergeben. So lassen sie sich mit
 * einem nachgebauten Client testen (tests/eventsApi.test.js).
 *
 * Datenbank-Regeln (RLS, siehe supabase/migrations/001 + 002):
 *   - events: alle Angemeldeten dürfen lesen
 *   - event_registrations: nur EIGENE Zeilen lesen/anlegen/löschen;
 *     anlegen nur für bevorstehende Events mit Status planned/confirmed;
 *     ändern nur die Spalte "status"
 *
 * status in event_registrations:
 *   'registered' = verbindliche Anmeldung
 *   'interested' = nur Interesse – zählt NICHT als Anmeldung
 */

/** Spalten bis Migration 007 */
export const EVENT_COLUMNS_BASE =
  'id, title, summary, description, location, audience, start_at, duration_minutes, capacity, online, topics, format, host_school_id, school_ids, status';
/** Ab Migration 008: zusätzlich Absage- und Archiv-Zeitpunkt */
export const EVENT_COLUMNS = `${EVENT_COLUMNS_BASE}, cancelled_at, archived_at`;

/** Datenbank-Zeile -> Event-Objekt der App (gleiche Form wie die Testdaten in tests/fixtures/events.js). */
export function mapDbEvent(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? '',
    description: row.description ?? '',
    location: row.location ?? '',
    audience: row.audience ?? '',
    start: row.start_at,
    durationMinutes: row.duration_minutes ?? null,
    capacity: row.capacity ?? null,
    online: Boolean(row.online),
    topics: Array.isArray(row.topics) ? row.topics : [],
    format: row.format,
    hostSchoolId: row.host_school_id,
    schoolIds: Array.isArray(row.school_ids) ? row.school_ids : [],
    status: row.status,
    cancelledAt: row.cancelled_at ?? null, // ab Migration 008
    archivedAt: row.archived_at ?? null, // ab Migration 008
    organizerIds: [],
    isDemo: false,
  };
}

/** [{ event_id, status }] -> { [eventId]: status } (Form von user.registrations) */
export function registrationsToMap(rows) {
  const map = {};
  for (const row of rows ?? []) {
    if (row.status === 'registered' || row.status === 'interested') map[row.event_id] = row.status;
  }
  return map;
}

export async function fetchEvents(client) {
  const load = (columns) => client.from('events').select(columns).order('start_at', { ascending: true });
  let { data, error } = await load(EVENT_COLUMNS);
  // 42703 = Spalte existiert nicht: Migration 008 ist noch nicht ausgeführt.
  // Dann ohne die neuen Spalten laden, damit die App für Schüler:innen weiter funktioniert.
  if (error?.code === '42703') ({ data, error } = await load(EVENT_COLUMNS_BASE));
  if (error) throw error;
  return (data ?? []).map(mapDbEvent);
}

export async function fetchMyRegistrations(client, userId) {
  const { data, error } = await client.from('event_registrations').select('event_id, status').eq('user_id', userId);
  if (error) throw error;
  return registrationsToMap(data);
}

/** Welcher Datenbank-Befehl ist nötig? 'insert' | 'update' | 'delete' | null */
export function planRegistrationChange(current, next) {
  if ((current ?? null) === (next ?? null)) return null;
  if (!current) return 'insert';
  if (!next) return 'delete';
  return 'update';
}

/** Speichert eine Änderung. Gibt { error } zurück (error = null bei Erfolg). */
export async function saveRegistration(client, { userId, eventId, current, next }) {
  const table = client.from('event_registrations');
  switch (planRegistrationChange(current, next)) {
    case 'insert':
      return table.insert({ event_id: eventId, user_id: userId, status: next });
    case 'update':
      return table.update({ status: next }).eq('event_id', eventId).eq('user_id', userId);
    case 'delete':
      return table.delete().eq('event_id', eventId).eq('user_id', userId);
    default:
      return { error: null };
  }
}

/** Fehler beim Speichern -> Übersetzungsschlüssel */
export function registrationErrorKey(error) {
  if (!error) return null;
  // DC008 = ausgebucht (Platzprüfung im Trigger event_registrations_guard, Migration 006)
  if (error.code === 'DC008') return 'eventDetail.errors.full';
  // DC009 = falsche Isolationsstufe in der Datenbank – kein Fehler der Nutzer:in
  if (error.code === 'DC009') return 'eventDetail.errors.technical';
  // 42501 = von RLS oder dem Trigger abgelehnt, z. B. Event hat schon begonnen oder ist abgesagt
  if (error.code === '42501') return 'eventDetail.errors.closed';
  // 23505 = Eintrag existiert schon (z. B. in einem zweiten Tab angemeldet)
  if (error.code === '23505') return 'eventDetail.errors.conflict';
  if (error.name === 'TypeError' || /fetch|network/i.test(error.message ?? '')) return 'eventDetail.errors.network';
  return 'eventDetail.errors.generic';
}
