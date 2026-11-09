/**
 * Freiwillige Schülerprofile + persönliche Statistik – reine Funktionen (ohne React, testbar).
 * Backend: supabase/migrations/012_profiles_stats.sql
 *
 * Grundsatz: PRIVAT IST STANDARD. Ohne Freigabe sieht niemand das Profil.
 * Mit Freigabe sehen andere angemeldete Schüler:innen den Vornamen; Schule, Interessen,
 * Projektvorschläge und Aktivitätszahlen jeweils nur, wenn sie zusätzlich freigegeben sind.
 * Klasse und Konto-Daten sind nie öffentlich.
 */
import { PUBLIC_IDEA_STATUSES } from './ideasApi.js';

/** Einzeln freigebbare Angaben (Reihenfolge = Reihenfolge im Formular). */
export const SHARING_FIELDS = ['school', 'interests', 'projects', 'activity'];

export const DEFAULT_SHARING = Object.freeze({
  isPublic: false,
  school: false,
  interests: false,
  projects: false,
  activity: false,
});

/** Zeile aus profile_sharing → Formularwerte (fehlende Zeile = alles privat). */
export function mapSharingRow(row) {
  if (!row) return { ...DEFAULT_SHARING };
  return {
    isPublic: row.is_public === true,
    school: row.show_school === true,
    interests: row.show_interests === true,
    projects: row.show_projects === true,
    activity: row.show_activity === true,
  };
}

/** Formularwerte → Spalten für upsert (user_id setzt profilesApi, RLS prüft ihn). */
export function sharingToRow(sharing) {
  return {
    is_public: sharing.isPublic === true,
    show_school: sharing.school === true,
    show_interests: sharing.interests === true,
    show_projects: sharing.projects === true,
    show_activity: sharing.activity === true,
  };
}

const toCount = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const toStringArray = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/** Zeile aus get_my_activity_stats() → Objekt. null = (noch) nicht verfügbar, z. B. ohne 011. */
export function mapStatsRow(row) {
  const r = row ?? {};
  return {
    eventsUpcoming: toCount(r.events_upcoming),
    eventsPast: toCount(r.events_past),
    eventsInterested: toCount(r.events_interested),
    ideasSubmitted: toCount(r.ideas_submitted),
    ideasPublished: toCount(r.ideas_published),
    ideasPlanned: toCount(r.ideas_planned),
    supportsGiven: toCount(r.supports_given),
    supportsReceived: toCount(r.supports_received),
    tutoringOffers: toCount(r.tutoring_offers),
    tutoringRequests: toCount(r.tutoring_requests),
    tutoringContacts: toCount(r.tutoring_contacts),
  };
}

/** Gruppen für die Anzeige in „Mein Bereich“. Werte mit null werden als „–“ gezeigt. */
export const STAT_GROUPS = [
  { id: 'events', keys: ['eventsUpcoming', 'eventsPast', 'eventsInterested'] },
  { id: 'ideas', keys: ['ideasSubmitted', 'ideasPublished', 'ideasPlanned', 'supportsGiven', 'supportsReceived'] },
  { id: 'tutoring', keys: ['tutoringOffers', 'tutoringRequests', 'tutoringContacts'] },
];

/** Statistik aus den Demo-Daten (nur Demo-Modus – echte Konten nutzen get_my_activity_stats). */
export function demoStats(user, ideas, events, now = new Date()) {
  const registrations = user.registrations ?? {};
  const eventById = new Map(events.map((event) => [event.id, event]));
  let upcoming = 0;
  let past = 0;
  let interested = 0;
  for (const [eventId, status] of Object.entries(registrations)) {
    const event = eventById.get(eventId);
    if (status === 'interested') interested += 1;
    if (!event || status !== 'registered' || event.status === 'cancelled') continue;
    if (new Date(event.start) > now) upcoming += 1;
    else past += 1;
  }
  const own = ideas.filter((idea) => idea.authorId === user.id);
  const published = own.filter((idea) => PUBLIC_IDEA_STATUSES.includes(idea.status));
  return {
    ...mapStatsRow(null),
    eventsUpcoming: upcoming,
    eventsPast: past,
    eventsInterested: interested,
    ideasSubmitted: own.length,
    ideasPublished: published.length,
    ideasPlanned: own.filter((idea) => idea.status === 'planned').length,
    supportsGiven: (user.supportedIdeas ?? []).length,
  };
}

/** Zeile aus list_public_profiles() → Verzeichnis-Eintrag. */
export function mapDirectoryRow(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: '',
    avatarColor: row.avatar_color,
    schoolId: row.school_id ?? null,
    interests: toStringArray(row.interests),
  };
}

/** Zeile aus get_public_profile() → Profil (nur freigegebene Angaben sind gesetzt). */
export function mapPublicProfileRow(row) {
  if (!row) return null;
  const projects = Array.isArray(row.projects) ? row.projects : [];
  return {
    ...mapDirectoryRow(row),
    isPublic: row.is_public === true,
    isSelf: row.is_self === true,
    showProjects: row.show_projects === true,
    showActivity: row.show_activity === true,
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      status: p.status,
      schoolId: p.school_id,
      topics: toStringArray(p.topics),
      createdAt: p.created_at,
    })),
    activity: row.show_activity === true
      ? {
          ideasPublished: toCount(row.ideas_published),
          eventsPast: toCount(row.events_past),
          supportsReceived: toCount(row.supports_received),
        }
      : null,
  };
}

/** Filter für das Verzeichnis: Suche über Vorname, Schule (nur wenn freigegeben) und Interessen. */
export function filterDirectory(profiles, { query = '', schoolId = '' } = {}, describe = (p) => '') {
  const q = query.trim().toLocaleLowerCase();
  return profiles.filter((profile) => {
    if (schoolId && profile.schoolId !== schoolId) return false;
    if (!q) return true;
    return `${profile.firstName} ${describe(profile)}`.toLocaleLowerCase().includes(q);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Nur echte Konto-IDs an die Datenbank schicken (Demo-IDs wie "elif" wären ein SQL-Fehler). */
export const isProfileId = (value) => typeof value === 'string' && UUID.test(value);

/** Supabase-Fehler → i18n-Schlüssel. "notInstalled" = Migration 012 fehlt in der Datenbank. */
export function profileErrorKey(error) {
  const code = error?.code;
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') return 'profiles.errors.notInstalled';
  if (code === '42501') return 'profiles.errors.notAllowed';
  return 'profiles.errors.generic';
}

/** Ist das Ergebnis ein „Migration fehlt“-Fehler? */
export const isNotInstalled = (error) => profileErrorKey(error) === 'profiles.errors.notInstalled';
