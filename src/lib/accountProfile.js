import { getSchool } from '../data/schools.js';

/**
 * Hilfsfunktionen für das ECHTE Konto (Supabase) – ohne React, testbar.
 *
 * Trennung der Daten:
 *   - Name, Schule, Klasse, Avatar-Farbe, Interessen -> Supabase-Tabelle "profiles"
 *   - Event-Anmeldungen                               -> Supabase "event_registrations"
 *   - Ideen-Unterstützungen                           -> Supabase "idea_supports"
 *   - Projekt-Interesse, ausgeblendete Hinweise        -> vorerst nur im Browser,
 *     getrennt pro Konto (Projekte sind noch Demo-Inhalte)
 *   Die alten Felder "registrations", "supportedIdeas" und "customIdeas" im
 *   Browser-Speicher (aus der Zeit davor) werden nicht mehr gelesen, aber auch nicht gelöscht.
 * Demo-Profile und ihre Daten werden hier nie gelesen oder verändert.
 */

export const ACCOUNT_STORAGE_PREFIX = 'deutschconnect.accountState.v1.';

export function emptyAccountData() {
  return { registrations: {}, supportedIdeas: [], projectInterest: [], dismissedUpdates: [], customIdeas: [] };
}

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Übernimmt nur gültige Felder aus gespeicherten Daten (Schutz vor kaputtem localStorage). */
export function sanitizeAccountData(saved) {
  const data = emptyAccountData();
  if (!saved || typeof saved !== 'object') return data;
  if (saved.registrations && typeof saved.registrations === 'object' && !Array.isArray(saved.registrations)) {
    for (const [eventId, status] of Object.entries(saved.registrations)) {
      if (status === 'registered' || status === 'interested') data.registrations[eventId] = status;
    }
  }
  for (const key of ['supportedIdeas', 'projectInterest', 'dismissedUpdates']) {
    if (isStringArray(saved[key])) data[key] = [...saved[key]];
  }
  if (Array.isArray(saved.customIdeas)) {
    data.customIdeas = saved.customIdeas.filter((idea) => idea && typeof idea.id === 'string');
  }
  return data;
}

/**
 * Baut aus dem Supabase-Profil das "user"-Objekt, das alle Seiten erwarten
 * (gleiche Form wie bei den Demo-Profilen).
 * registrations: { [eventId]: 'registered' | 'interested' } aus event_registrations
 * supportedIdeas: [ideaId, ...] aus idea_supports
 */
export function buildAccountUser(userId, profile, data, registrations, supportedIdeas) {
  const localSchool = getSchool(profile.school_id);
  const school = localSchool ?? {
    id: profile.school_id,
    name: profile.school?.name ?? profile.school_id,
    shortName: profile.school?.short_name ?? profile.school_id,
  };
  return {
    id: userId,
    firstName: profile.first_name,
    lastName: '', // wird bewusst nicht gespeichert (Datensparsamkeit)
    schoolId: profile.school_id,
    grade: profile.grade,
    avatarColor: profile.avatar_color,
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    invitations: [],
    registrations: registrations ?? {},
    supportedIdeas: supportedIdeas ?? [],
    projectInterest: data.projectInterest,
    dismissedUpdates: data.dismissedUpdates,
    school,
    isRealAccount: true,
  };
}
