/**
 * Community → Projekt- und Eventgruppen. Reine Hilfsfunktionen ohne Netzwerk (getestet in
 * tests/communityGroups.test.js).
 *
 * Es gibt KEINE eigene Gruppen-Tabelle: Die Gruppen sind die Projekt-/Eventräume aus dem Chat
 * (Migration 014, chat_list_rooms). Welche Räume jemand sieht, entscheidet die Datenbank
 * (nur Gruppen, in denen man Mitglied ist bzw. die man lesen darf). Beiträge = Chat-Nachrichten im Raum.
 */
import { sortByActivity } from './chat.js';
import { mentionsHiddenSchool } from './schoolVisibility.js';

export const GROUP_KINDS = ['project', 'event'];
export const GROUP_FILTERS = ['all', ...GROUP_KINDS];

/** Nur die drei erlaubten Filterwerte – alles andere → „all“. */
export function normalizeGroupFilter(value) {
  return GROUP_FILTERS.includes(value) ? value : 'all';
}

/** Projekt- und Eventgruppen (keine Themenräume, keine privaten Chats), neueste Aktivität zuerst. */
export function communityGroups(rooms, filter = 'all') {
  const kind = normalizeGroupFilter(filter);
  const groups = (Array.isArray(rooms) ? rooms : []).filter(
    (room) =>
      GROUP_KINDS.includes(room?.kind) &&
      (kind === 'all' || room.kind === kind) &&
      // Gruppen zu Ideen/Events einer ausgeblendeten Schule (Titel nennt sie) nicht anzeigen – nur Anzeige
      !mentionsHiddenSchool(room.ideaTitle, room.eventTitle),
  );
  // Doppelte Einträge (gleiche Raum-ID) nur einmal zeigen
  const seen = new Set();
  return sortByActivity(groups.filter((room) => (seen.has(room.id) ? false : seen.add(room.id))));
}
