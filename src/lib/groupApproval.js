/**
 * Projekt-/Eventgruppen erst nach Admin-Freigabe (Hinweis im Frontend).
 *
 * Die eigentliche Sperre liegt in der Datenbank (Migration 014): chat_create_project_room und
 * chat_create_event_room prüfen den Status selbst, und direkte Schreibzugriffe auf chat_rooms sind
 * entzogen. Diese Datei spiegelt nur dieselben Status-Listen, damit die App den Hinweis schon VOR
 * dem Serveraufruf zeigen kann. tests/groupApproval.test.js prüft, dass beide Listen übereinstimmen.
 *
 * Bestehender Freigabeprozess (kein neues System):
 *   Ideen  (Migration 006, Admin → Ideen): submitted = wartet auf Admin · collecting = freigegeben
 *          → review → planned · rejected = abgelehnt
 *   Events (Migration 006, Admin → Events): draft = nicht veröffentlicht · planned/confirmed = veröffentlicht
 *          · cancelled = abgesagt · completed = vorbei
 */
export const GROUP_READY_IDEA_STATUSES = ['collecting', 'review', 'planned'];
export const GROUP_READY_EVENT_STATUSES = ['planned', 'confirmed'];

export const canCreateProjectGroup = (ideaStatus) => GROUP_READY_IDEA_STATUSES.includes(ideaStatus);
export const canCreateEventGroup = (eventStatus) => GROUP_READY_EVENT_STATUSES.includes(eventStatus);

/**
 * Hat der Server das Anlegen wegen fehlender Freigabe abgelehnt?
 * Projektgruppe: 42501 (Status nicht freigegeben – Autor:in-Prüfung besteht der Knopf ohnehin, er
 * erscheint nur für die Autor:in). Eventgruppe: P0002 („Event nicht gefunden“ = nicht veröffentlicht/abgesagt).
 */
export function isApprovalRejection(kind, error) {
  const code = error?.code;
  return kind === 'project' ? code === '42501' : kind === 'event' ? code === 'P0002' : false;
}
