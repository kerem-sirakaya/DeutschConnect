/**
 * Archivierung von Events für die Schüler:innen-Ansicht – ohne React, deshalb testbar
 * (tests/eventArchive.test.js).
 *
 * Gleiche Regeln wie die Datenbank-Funktion archive_finished_events (Migration 008):
 *   * cancelled:                       24 h nach cancelledAt
 *   * planned / confirmed / completed: 24 h nach dem ENDE (Start + Dauer;
 *                                      ohne Dauer: Mitternacht nach dem Starttag in Ankara)
 *   * draft und alles andere:          nie
 *
 * Die Datenbank archiviert stündlich (archived_at) und liefert archivierte Events nicht
 * mehr an Schüler:innen aus (RLS). Diese Funktionen blenden ein Event zusätzlich PÜNKTLICH
 * aus – auch in der Stunde, bis der Zeitplan das nächste Mal läuft.
 *
 * Nichts hiervon löscht Daten. Anmeldungen bleiben unberührt.
 */

export const ARCHIVE_DELAY_MS = 24 * 60 * 60 * 1000;
const ANKARA_OFFSET_MS = 3 * 60 * 60 * 1000; // Türkei: dauerhaft UTC+3 (siehe eventForm.js)
const FINISHABLE_STATUSES = ['planned', 'confirmed', 'completed'];

const toTime = (value) => {
  if (value == null) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/** Ende eines Events als Zeitstempel (ms) – oder null, wenn kein Start bekannt ist. */
export function eventEndsAt(event) {
  const start = toTime(event?.start);
  if (start == null) return null;
  if (event.durationMinutes != null && event.durationMinutes > 0) return start + event.durationMinutes * 60 * 1000;
  // Ohne Dauer: Mitternacht nach dem Starttag in Ankara-Zeit
  const ankara = new Date(start + ANKARA_OFFSET_MS);
  return Date.UTC(ankara.getUTCFullYear(), ankara.getUTCMonth(), ankara.getUTCDate() + 1) - ANKARA_OFFSET_MS;
}

/** Ab wann ist das Event für Schüler:innen archiviert? Zeitstempel (ms) oder null = nie. */
export function studentArchiveDueAt(event) {
  if (!event) return null;
  if (event.status === 'cancelled') {
    const cancelled = toTime(event.cancelledAt);
    return cancelled == null ? null : cancelled + ARCHIVE_DELAY_MS;
  }
  if (FINISHABLE_STATUSES.includes(event.status)) {
    const end = eventEndsAt(event);
    return end == null ? null : end + ARCHIVE_DELAY_MS;
  }
  return null;
}

/** Für Schüler:innen ausgeblendet? (von der Datenbank archiviert ODER 24 h abgelaufen) */
export function isArchivedForStudents(event, now = new Date()) {
  if (event?.archivedAt) return true;
  const due = studentArchiveDueAt(event);
  return due != null && due <= now.getTime();
}

/** Liste ohne archivierte Events. Verändert die übergebene Liste nicht. */
export function visibleToStudents(events, now = new Date()) {
  return (events ?? []).filter((event) => !isArchivedForStudents(event, now));
}
