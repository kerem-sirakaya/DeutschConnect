import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAppState } from './AppStateContext.jsx';
import { useRemote as useRemoteData } from './useRemote.js';
import { isProfileId, profileErrorKey } from '../lib/profiles.js';
import { isHiddenSchool } from '../data/schools.js';
import { visibleContent } from '../lib/schoolVisibility.js';
import {
  fetchMySharing,
  fetchMyStats,
  fetchPublicProfile,
  fetchPublicProfiles,
  saveMySharing,
} from '../lib/profilesApi.js';

/**
 * Hooks für Profile + Statistik (Migration 012).
 *
 * Gemeinsames Ergebnis: { status, data, errorKey, reload }
 *   status: 'guest' | 'loading' | 'ready' | 'error' | 'notInstalled'
 *   - guest:        nicht angemeldet → keine Daten (null), nichts wird geladen oder gespeichert
 *   - notInstalled: Migration 012 fehlt in der Datenbank → Seite zeigt einen Hinweis,
 *                   der Rest der App funktioniert weiter
 *
 * Bewusst KEIN globaler Context: Die Daten werden nur auf den Seiten geladen, die sie brauchen.
 */
const useRemote = (load, deps) => useRemoteData(load, () => null, deps, profileErrorKey);

/** Eigene Statistik (Datenbank-Funktion get_my_activity_stats). */
export function useMyStats() {
  const { user } = useAppState();
  return useRemote(fetchMyStats, [user.id]);
}

// Personen ausgeblendeter Schulen (src/data/schools.js → HIDDEN_SCHOOL_IDS) nicht anzeigen – nur Anzeige,
// Profile und Freigaben in der Datenbank bleiben unverändert.
// Ausnahme: das EIGENE Profil (ownId) sieht die Person selbst immer – andere sehen es nicht.
const hideHiddenSchools = (list, ownId) =>
  Array.isArray(list) ? list.filter((p) => p?.id === ownId || !isHiddenSchool(p?.schoolId)) : list;
const hideIfHiddenSchool = (profile, ownId) => {
  if (profile && profile.id === ownId) return profile;
  if (!profile || isHiddenSchool(profile.schoolId)) return profile ? null : profile;
  // Projektvorschläge der Person: Inhalte ausgeblendeter Schulen (Titel/Schule) weglassen
  return Array.isArray(profile.projects) ? { ...profile, projects: visibleContent(profile.projects) } : profile;
};

/** Verzeichnis öffentlicher Profile. */
export function usePublicProfiles() {
  const { user } = useAppState();
  return useRemote((client) => fetchPublicProfiles(client).then((list) => hideHiddenSchools(list, user.id)), [user.id]);
}

/** Ein Profil (data = null: privat oder nicht vorhanden – bewusst nicht unterscheidbar). */
export function usePublicProfile(profileId) {
  const { user } = useAppState();
  const load = (client) =>
    isProfileId(profileId)
      ? fetchPublicProfile(client, profileId).then((profile) => hideIfHiddenSchool(profile, user.id))
      : Promise.resolve(null);
  return useRemote(load, [user.id, profileId]);
}

/**
 * Eigene Freigaben lesen + speichern.
 * save(sharing) → { ok: true } oder { errorKey }. Erfolg erst, wenn die Datenbank bestätigt.
 * Gast: keine Daten, Speichern nicht möglich.
 */
export function useMySharing() {
  const { user, mode } = useAppState();
  const result = useRemote((client) => fetchMySharing(client, user.id), [user.id]);
  const { reload } = result;
  const save = useCallback(
    async (sharing) => {
      if (mode !== 'account' || !supabase) return { errorKey: 'guest.loginRequiredText' };
      try {
        await saveMySharing(supabase, sharing);
        reload();
        return { ok: true };
      } catch (error) {
        return { errorKey: profileErrorKey(error) };
      }
    },
    [mode, user.id, reload],
  );
  return { ...result, save };
}
