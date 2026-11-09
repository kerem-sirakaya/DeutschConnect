import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAppState } from './AppStateContext.jsx';
import { demoDirectory, demoPublicProfile, demoSharingFor } from '../data/publicProfiles.js';
import { demoStats, isNotInstalled, isProfileId, profileErrorKey } from '../lib/profiles.js';
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
 *   status: 'demo' | 'loading' | 'ready' | 'error' | 'notInstalled'
 *   - demo:         abgemeldet → fiktive Daten (aus Demo-Profilen), nichts wird gespeichert
 *   - notInstalled: Migration 012 fehlt in der Datenbank → Seite zeigt einen Hinweis,
 *                   der Rest der App funktioniert weiter
 *
 * Bewusst KEIN globaler Context: Die Daten werden nur auf den Seiten geladen, die sie brauchen.
 */
function useRemote(load, demoValue, deps) {
  const { mode } = useAppState();
  const isAccount = mode === 'account' && Boolean(supabase);
  const [state, setState] = useState({ key: null, status: 'loading', data: null, errorKey: null });
  const [token, setToken] = useState(0);
  const key = JSON.stringify([isAccount, token, ...deps]);

  useEffect(() => {
    if (!isAccount) return undefined;
    let active = true;
    load(supabase)
      .then((data) => active && setState({ key, status: 'ready', data, errorKey: null }))
      .catch((error) =>
        active &&
        setState({ key, status: isNotInstalled(error) ? 'notInstalled' : 'error', data: null, errorKey: profileErrorKey(error) }),
      );
    return () => {
      active = false;
    };
  }, [key]);

  const reload = useCallback(() => setToken((n) => n + 1), []);
  if (!isAccount) return { status: 'demo', data: demoValue(), errorKey: null, reload };
  // Noch nicht für die aktuellen Parameter geladen → loading (kein veralteter Stand)
  if (state.key !== key) return { status: 'loading', data: null, errorKey: null, reload };
  return { ...state, reload };
}

/** Eigene Statistik. Demo: aus den Demo-Daten berechnet. */
export function useMyStats() {
  const { user, ideas, events } = useAppState();
  return useRemote(fetchMyStats, () => demoStats(user, ideas, events), [user.id]);
}

/** Verzeichnis öffentlicher Profile. */
export function usePublicProfiles() {
  const { user } = useAppState();
  return useRemote(fetchPublicProfiles, () => demoDirectory(user.id), [user.id]);
}

/** Ein Profil (data = null: privat oder nicht vorhanden – bewusst nicht unterscheidbar). */
export function usePublicProfile(profileId) {
  const { user } = useAppState();
  const load = (client) => (isProfileId(profileId) ? fetchPublicProfile(client, profileId) : Promise.resolve(null));
  return useRemote(load, () => demoPublicProfile(profileId, user.id), [user.id, profileId]);
}

/**
 * Eigene Freigaben lesen + speichern.
 * save(sharing) → { ok: true } oder { errorKey }. Erfolg erst, wenn die Datenbank bestätigt.
 * Demo: nur lesen (fiktive Werte), Speichern ist gesperrt.
 */
export function useMySharing() {
  const { user, mode } = useAppState();
  const result = useRemote((client) => fetchMySharing(client, user.id), () => demoSharingFor(user.id), [user.id]);
  const { reload } = result;
  const save = useCallback(
    async (sharing) => {
      if (mode !== 'account' || !supabase) return { errorKey: 'profiles.errors.demoReadOnly' };
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
