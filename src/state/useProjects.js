import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useRemote } from './useRemote.js';
import { projectErrorKey } from '../lib/projects.js';
import { isProfileId } from '../lib/profiles.js';
import {
  cancelJoinRequest,
  fetchMyMemberships,
  fetchProjectState,
  fetchPublicMemberships,
  leaveProject,
  requestJoin,
  reviewJoinRequest,
} from '../lib/projectsApi.js';

/**
 * Hooks für Projekt-Mitwirkung (Migration 013). Demo-Modus: keine Mitwirkung (nur Hinweis) –
 * es gibt bewusst keine vorgetäuschten Anfragen.
 */
const useProjectRemote = (load, deps) => useRemote(load, () => null, deps, projectErrorKey);

/**
 * Zustand + Aktionen für EIN Projekt (eine Idee).
 * Aktionen geben { ok: true } oder { errorKey } zurück und laden danach immer neu –
 * eine Aktion gilt erst als erfolgreich, wenn die Datenbank sie bestätigt.
 */
export function useProjectParticipation(ideaId) {
  const enabled = isProfileId(ideaId); // Demo-Ideen (i1, i2 …) gibt es in der Datenbank nicht
  const result = useProjectRemote(
    (client) => (enabled ? fetchProjectState(client, ideaId) : Promise.resolve(null)),
    [ideaId],
  );
  const [busy, setBusy] = useState(false);
  const { reload } = result;

  const run = useCallback(
    async (operation) => {
      if (!supabase || !enabled) return { errorKey: 'projects.errors.loginRequired' };
      setBusy(true);
      try {
        await operation(supabase);
        return { ok: true };
      } catch (error) {
        return { errorKey: projectErrorKey(error) };
      } finally {
        setBusy(false);
        reload();
      }
    },
    [enabled, reload],
  );

  const actions = {
    request: () => run((client) => requestJoin(client, ideaId)),
    cancel: () => run((client) => cancelJoinRequest(client, ideaId)),
    leave: () => run((client) => leaveProject(client, ideaId)),
    review: (userId, accept) => run((client) => reviewJoinRequest(client, ideaId, userId, accept)),
  };
  return { ...result, busy, actions };
}

/** Eigene Mitwirkungen (angefragt / Mitglied). Demo: null → Seite zeigt Demo-Projekte wie bisher. */
export function useMyMemberships() {
  return useProjectRemote((client) => fetchMyMemberships(client), []);
}

/** Mitgliedschaften im öffentlichen Profil (nur mit Freigabe, prüft die Datenbank). */
export function usePublicMemberships(profileId) {
  return useProjectRemote(
    (client) => (isProfileId(profileId) ? fetchPublicMemberships(client, profileId) : Promise.resolve([])),
    [profileId],
  );
}
