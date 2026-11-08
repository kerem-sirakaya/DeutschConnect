/**
 * Logik der Admin-Event-Verwaltung – ohne React, deshalb testbar (tests/adminEvents.test.js).
 *
 * Die erlaubten Statuswechsel sind eine KOPIE der Regeln aus admin_set_event_status()
 * (Migration 006). Sie steuern nur, welche Knöpfe angezeigt werden. Zeit-Regeln
 * (Datum in der Vergangenheit DC002, noch nicht begonnen DC007) prüft NUR die Datenbank –
 * so kann eine falsch gestellte Uhr im Browser nichts blockieren oder erlauben.
 */
import {
  ADMIN_EVENT_STATUSES,
  adminErrorKey,
  createAdminEvent,
  deleteAdminEvent,
  fetchAdminEvents,
  setAdminEventStatus,
  updateAdminEvent,
} from './adminApi.js';

const PUBLISH = { id: 'publish', labelKey: 'admin.events.actions.publish', confirmKey: 'admin.events.confirm.publish' };
const PUBLISH_CONFIRMED = {
  id: 'publishConfirmed',
  labelKey: 'admin.events.actions.publishConfirmed',
  confirmKey: 'admin.events.confirm.publishConfirmed',
};
const CONFIRM = { id: 'confirm', labelKey: 'admin.events.actions.confirm', confirmKey: 'admin.events.confirm.confirm' };
const CANCEL = { id: 'cancel', labelKey: 'admin.events.actions.cancel', confirmKey: 'admin.events.confirm.cancel' };
const COMPLETE = { id: 'complete', labelKey: 'admin.events.actions.complete', confirmKey: 'admin.events.confirm.complete' };

/** Genau die Wechsel aus Migration 006. `tone` = Farbe des Knopfs. */
export const EVENT_ACTIONS = [
  { from: 'draft', to: 'planned', tone: 'primary', ...PUBLISH },
  { from: 'draft', to: 'confirmed', tone: 'secondary', ...PUBLISH_CONFIRMED },
  { from: 'planned', to: 'confirmed', tone: 'primary', ...CONFIRM },
  { from: 'planned', to: 'completed', tone: 'secondary', ...COMPLETE },
  { from: 'planned', to: 'cancelled', tone: 'danger', ...CANCEL },
  { from: 'confirmed', to: 'completed', tone: 'secondary', ...COMPLETE },
  { from: 'confirmed', to: 'cancelled', tone: 'danger', ...CANCEL },
];

/** Löschen – eigene Aktion (keine Statusänderung). */
export const DELETE_ACTION = {
  id: 'delete',
  tone: 'danger',
  labelKey: 'admin.events.actions.delete',
  confirmKey: 'admin.events.confirm.delete',
};

export const EVENT_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'admin.events.filters.all' },
  ...ADMIN_EVENT_STATUSES.map((status) => ({ value: status, labelKey: `status.event.${status}` })),
  // Archiviert ist KEIN Status, sondern ein eigener Zustand (archived_at, Migration 008).
  // Archivierte Events erscheinen zusätzlich weiter unter "Alle" und ihrem Status.
  { value: 'archived', labelKey: 'admin.events.filters.archived' },
];
export const EVENT_FILTERS = EVENT_FILTER_OPTIONS.map((option) => option.value);

/** Kennzahlen oben auf der Seite */
export const EVENT_STATS = [
  { key: 'all', labelKey: 'admin.events.stats.all' },
  { key: 'draft', labelKey: 'status.event.draft' },
  { key: 'planned', labelKey: 'status.event.planned' },
  { key: 'confirmed', labelKey: 'status.event.confirmed' },
  { key: 'completed', labelKey: 'status.event.completed' },
  { key: 'cancelled', labelKey: 'status.event.cancelled' },
];

export function isAllowedEventTransition(from, to) {
  return EVENT_ACTIONS.some((action) => action.from === from && action.to === to);
}

export function eventActionsFor(status) {
  return EVENT_ACTIONS.filter((action) => action.from === status);
}

/** Löschbar nur: Entwurf ohne Anmeldungen und ohne Interessierte (Datenbank prüft DC003/DC001). */
export function canDeleteEvent(event) {
  return event.status === 'draft' && event.registeredCount === 0 && event.interestedCount === 0;
}

export function normalizeEventFilter(value) {
  return EVENT_FILTERS.includes(value) ? value : 'all';
}

/** Von der Datenbank archiviert (für Schüler:innen ausgeblendet)? */
export function isArchivedEvent(event) {
  return Boolean(event?.archivedAt);
}

export function filterEvents(events, filter) {
  const normalized = normalizeEventFilter(filter);
  if (normalized === 'all') return events;
  if (normalized === 'archived') return events.filter(isArchivedEvent);
  return events.filter((event) => event.status === normalized);
}

export function countEventsByStatus(events) {
  const counts = Object.fromEntries(EVENT_FILTERS.map((filter) => [filter, 0]));
  for (const event of events) {
    counts.all += 1;
    if (ADMIN_EVENT_STATUSES.includes(event.status)) counts[event.status] += 1;
    if (isArchivedEvent(event)) counts.archived += 1;
  }
  return counts;
}

export function eventEmptyKey(filter) {
  return filter === 'all' ? 'admin.events.empty.all' : 'admin.events.empty.filtered';
}

/** Alle Events laden (gefiltert wird im Browser – Filterwechsel ohne neue Anfrage). */
export async function loadAdminEvents(client) {
  try {
    return { events: await fetchAdminEvents(client), errorKey: null };
  } catch (error) {
    return { events: null, errorKey: adminErrorKey(error) };
  }
}

/**
 * Status ändern. Nicht erlaubter Wechsel: keine Anfrage. Fehler: Liste unverändert.
 * @returns {Promise<{ events, errorKey, action }>}
 */
export async function changeEventStatus(client, events, eventId, toStatus) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return { events, errorKey: 'admin.errors.notFound', action: null };
  const action = EVENT_ACTIONS.find((item) => item.from === event.status && item.to === toStatus);
  if (!action) return { events, errorKey: 'admin.errors.transition', action: null };

  const { error } = await setAdminEventStatus(client, eventId, toStatus);
  if (error) return { events, errorKey: adminErrorKey(error), action: null };
  return {
    events: events.map((item) => (item.id === eventId ? { ...item, status: toStatus } : item)),
    errorKey: null,
    action,
  };
}

/** Entwurf löschen. Nur Entwürfe ohne Einträge – sonst keine Anfrage. */
export async function removeEvent(client, events, eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return { events, errorKey: 'admin.errors.notFound' };
  if (event.status !== 'draft') return { events, errorKey: 'admin.errors.onlyDrafts' };
  if (!canDeleteEvent(event)) return { events, errorKey: 'admin.errors.hasEntries' };

  const { error } = await deleteAdminEvent(client, eventId);
  if (error) return { events, errorKey: adminErrorKey(error) };
  return { events: events.filter((item) => item.id !== eventId), errorKey: null };
}

/**
 * Event speichern. Ohne `eventId` = neu (immer Entwurf, bestimmt die Datenbank),
 * mit `eventId` = bearbeiten (vollständiges Event wird geschickt, Status bleibt).
 * @returns {Promise<{ id: string|null, errorKey: string|null }>}
 */
export async function saveEvent(client, input, eventId = null) {
  if (eventId) {
    const { error } = await updateAdminEvent(client, eventId, input);
    return { id: error ? null : eventId, errorKey: adminErrorKey(error) };
  }
  const result = await createAdminEvent(client, input);
  return { id: result.id ?? null, errorKey: adminErrorKey(result.error) };
}

// ---------------------------------------------------------------------------
// Gruppen der Admin-Events-Seite (zwei Spalten: Geplant | Abgesagt)
// ---------------------------------------------------------------------------

/**
 * Jede Gruppe der Seite. `column` = eine der beiden Hauptspalten.
 * Jedes Event gehört zu GENAU EINER Gruppe (siehe eventGroupOf) – nie doppelt.
 */
export const EVENT_GROUPS = [
  { key: 'planned', column: true, titleKey: 'admin.events.groups.planned.title', emptyKey: 'admin.events.groups.planned.empty' },
  { key: 'cancelled', column: true, titleKey: 'admin.events.groups.cancelled.title', emptyKey: 'admin.events.groups.cancelled.empty' },
  { key: 'draft', column: false, titleKey: 'admin.events.groups.draft.title', emptyKey: 'admin.events.groups.draft.empty' },
  { key: 'completed', column: false, titleKey: 'admin.events.groups.completed.title', emptyKey: 'admin.events.groups.completed.empty' },
  { key: 'archived', column: false, titleKey: 'admin.events.groups.archived.title', emptyKey: 'admin.events.groups.archived.empty' },
];

/**
 * Zu welcher Gruppe gehört ein Event?
 *   archiviert (archived_at gesetzt) -> 'archived'  (Vorrang – Status bleibt unverändert)
 *   planned / confirmed              -> 'planned'
 *   cancelled                        -> 'cancelled'
 *   draft                            -> 'draft'
 *   completed                        -> 'completed'
 * Ohne Migration 008 gibt es kein archivedAt -> nichts ist archiviert.
 */
export function eventGroupOf(event) {
  if (isArchivedEvent(event)) return 'archived';
  if (event?.status === 'planned' || event?.status === 'confirmed') return 'planned';
  if (event?.status === 'cancelled') return 'cancelled';
  if (event?.status === 'draft') return 'draft';
  if (event?.status === 'completed') return 'completed';
  return null;
}

/** Welche Gruppen zeigt welcher Filter? (Reihenfolge = Anzeige-Reihenfolge) */
const FILTER_GROUPS = {
  all: ['planned', 'cancelled', 'draft', 'completed', 'archived'],
  planned: ['planned', 'archived'],
  confirmed: ['planned', 'archived'],
  cancelled: ['cancelled', 'archived'],
  draft: ['draft'],
  completed: ['completed', 'archived'],
  archived: ['archived'],
};

/**
 * Events für die Seite aufteilen: erst wie bisher filtern (filterEvents), dann jedes
 * Event genau einer Gruppe zuordnen. Reihenfolge innerhalb der Gruppe bleibt (nach Beginn).
 *
 * Rückgabe: [{ key, column, titleKey, emptyKey, events, alwaysShow }]
 *   alwaysShow: die beiden Spalten erscheinen auch leer (mit Hinweis), Zusatz-Gruppen nur
 *   mit Inhalt – außer sie sind die einzige Gruppe des Filters.
 */
export function groupEventsForFilter(events, filter) {
  const normalized = normalizeEventFilter(filter);
  const keys = FILTER_GROUPS[normalized];
  const buckets = Object.fromEntries(keys.map((key) => [key, []]));
  for (const event of filterEvents(events, normalized)) {
    const key = eventGroupOf(event);
    if (key in buckets) buckets[key].push(event);
  }
  return keys.map((key) => {
    const group = EVENT_GROUPS.find((item) => item.key === key);
    return { ...group, events: buckets[key], alwaysShow: group.column || keys.length === 1 };
  });
}
