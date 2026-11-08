/**
 * Logik der Admin-Übersicht (/admin) – ohne React, deshalb testbar (tests/adminOverview.test.js).
 *
 * Daten NUR über sichere Admin-RPCs:
 *   * Kennzahlen:  admin_get_overview_stats (Migration 010) – nur Zahlen
 *   * Aktivitäten: admin_list_events + admin_list_ideas (Migration 006) – neu angelegte
 *                  Events und eingereichte Ideen. KEIN vollständiges Protokoll
 *                  (Statuswechsel o. Ä. werden nirgends gespeichert).
 */
import { adminErrorKey, fetchAdminEvents, fetchAdminIdeas, fetchAdminOverviewStats } from './adminApi.js';

// ---------------------------------------------------------------------------
// Konfiguration (Ziele sind bestehende Routen und Filter – siehe Tests)
// ---------------------------------------------------------------------------

export const OVERVIEW_STATS = [
  {
    key: 'totalStudents',
    icon: 'users',
    labelKey: 'admin.overview.stats.students.label',
    descKey: 'admin.overview.stats.students.desc',
    to: null, // keine Schülerverwaltung – bewusst kein Link
  },
  {
    key: 'upcomingEvents',
    icon: 'calendar',
    labelKey: 'admin.overview.stats.upcoming.label',
    descKey: 'admin.overview.stats.upcoming.desc',
    to: '/admin/events',
  },
  {
    key: 'totalRegistrations',
    icon: 'check',
    labelKey: 'admin.overview.stats.registrations.label',
    descKey: 'admin.overview.stats.registrations.desc',
    to: '/admin/events',
  },
  {
    key: 'ideasPendingReview',
    icon: 'lightbulb',
    labelKey: 'admin.overview.stats.pending.label',
    descKey: 'admin.overview.stats.pending.desc',
    to: '/admin/ideas?status=submitted',
  },
  {
    key: 'archivedEvents',
    icon: 'folder',
    labelKey: 'admin.overview.stats.archived.label',
    descKey: 'admin.overview.stats.archived.desc',
    unavailableKey: 'admin.overview.stats.archived.unavailable',
    to: '/admin/events?status=archived',
  },
];

export const OVERVIEW_QUICK_ACTIONS = [
  {
    to: '/admin/events/new',
    icon: 'plus',
    labelKey: 'admin.overview.quick.createEvent.label',
    descKey: 'admin.overview.quick.createEvent.desc',
    primary: true,
  },
  { to: '/admin/events', icon: 'calendar', labelKey: 'admin.overview.quick.manageEvents.label', descKey: 'admin.overview.quick.manageEvents.desc' },
  {
    to: '/admin/ideas?status=submitted',
    icon: 'lightbulb',
    labelKey: 'admin.overview.quick.reviewIdeas.label',
    descKey: 'admin.overview.quick.reviewIdeas.desc',
  },
  { to: '/admin/ideas', icon: 'sliders', labelKey: 'admin.overview.quick.manageIdeas.label', descKey: 'admin.overview.quick.manageIdeas.desc' },
];

export const RECENT_ACTIVITY_LIMIT = 5;

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------

/** Fehlt die Funktion in der Datenbank? (Migration 010 noch nicht ausgeführt) */
export function isMissingFunctionError(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/**
 * Lädt die Kennzahlen.
 * @returns {Promise<{ status: 'ready'|'unavailable'|'error', stats: object|null, errorKey: string|null }>}
 *   unavailable = Migration 010 fehlt (Hinweis statt erfundener Zahlen)
 */
export async function loadOverviewStats(client) {
  if (!client) return { status: 'error', stats: null, errorKey: 'admin.errors.generic' };
  try {
    return { status: 'ready', stats: await fetchAdminOverviewStats(client), errorKey: null };
  } catch (error) {
    if (isMissingFunctionError(error)) return { status: 'unavailable', stats: null, errorKey: null };
    return { status: 'error', stats: null, errorKey: adminErrorKey(error) };
  }
}

/** Anzeige-Wert einer Kennzahl: Zahl (auch 0) oder null = "nicht verfügbar". */
export function statValue(stats, key) {
  const value = stats?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Aktivitäten
// ---------------------------------------------------------------------------

const toTime = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
};

/**
 * Events + Ideen -> chronologische Liste (neueste zuerst), höchstens `limit` Einträge.
 * Nur echte Zeitstempel (created_at); Einträge ohne gültiges Datum werden weggelassen.
 * Enthält keine Personendaten (die Admin-RPCs liefern auch keine).
 */
export function buildRecentActivity(events, ideas, limit = RECENT_ACTIVITY_LIMIT) {
  const items = [
    ...(events ?? []).map((event) => ({
      type: 'event',
      id: event.id,
      title: event.title,
      status: event.status,
      createdAt: event.createdAt,
      archived: Boolean(event.archivedAt),
      to: `/admin/events/${event.id}/edit`,
    })),
    ...(ideas ?? []).map((idea) => ({
      type: 'idea',
      id: idea.id,
      title: idea.title,
      status: idea.status,
      createdAt: idea.createdAt,
      archived: false,
      to: `/admin/ideas?status=${idea.status}`,
    })),
  ].filter((item) => toTime(item.createdAt) != null);

  items.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt) || `${a.type}${a.id}`.localeCompare(`${b.type}${b.id}`));
  return items.slice(0, limit);
}

/**
 * Lädt die Aktivitäten (Events und Ideen parallel). Schlägt eine Quelle fehl,
 * gilt der ganze Abschnitt als fehlerhaft – keine halbe Liste, die "vollständig" aussieht.
 * @returns {Promise<{ status: 'ready'|'error', items: object[], errorKey: string|null }>}
 */
export async function loadRecentActivity(client, limit = RECENT_ACTIVITY_LIMIT) {
  if (!client) return { status: 'error', items: [], errorKey: 'admin.errors.generic' };
  try {
    const [events, ideas] = await Promise.all([fetchAdminEvents(client), fetchAdminIdeas(client)]);
    return { status: 'ready', items: buildRecentActivity(events, ideas, limit), errorKey: null };
  } catch (error) {
    return { status: 'error', items: [], errorKey: adminErrorKey(error) };
  }
}
