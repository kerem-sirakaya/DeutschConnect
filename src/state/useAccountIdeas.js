import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import {
  addSupport,
  createIdea as createIdeaApi,
  deleteOwnIdea,
  fetchIdeasState,
  ideaErrorKey,
  removeSupport,
} from '../lib/ideasApi.js';

const EMPTY = { userId: null, ideas: [], supported: [], counts: {}, error: null };

/**
 * Lädt für ein angemeldetes Konto die ECHTEN Ideen, die eigenen Unterstützungen
 * und die Unterstützer-Zahlen. Für abgemeldete Besucher (userId = null) passiert
 * nichts – Gäste sehen keine Ideen.
 *
 * status: 'idle' | 'loading' | 'error' | 'ready'
 * Bei einem Fehler gibt es KEINEN Rückfall auf erfundene Ideen.
 */
export function useAccountIdeas(userId) {
  const [result, setResult] = useState(EMPTY);
  const [reloadToken, setReloadToken] = useState(0);
  const [pending, setPending] = useState({}); // { [ideaId]: true } während des Speicherns
  const [saveError, setSaveError] = useState(null); // { ideaId, key }

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let active = true;
    fetchIdeasState(supabase, userId)
      .then((state) => active && setResult({ userId, ...state, error: null }))
      .catch((error) => active && setResult({ ...EMPTY, userId, error }));
    return () => {
      active = false;
    };
  }, [userId, reloadToken]);

  let status = 'idle';
  if (userId) {
    if (result.userId !== userId) status = 'loading';
    else status = result.error ? 'error' : 'ready';
  }

  const reload = useCallback(() => {
    setResult(EMPTY);
    setSaveError(null);
    setReloadToken((n) => n + 1);
  }, []);

  /** Echten Stand neu laden, ohne Ladebildschirm. Gibt einen Fehler zurück oder null. */
  const refresh = useCallback(async () => {
    try {
      const state = await fetchIdeasState(supabase, userId);
      setResult((prev) => (prev.userId === userId ? { ...prev, ...state, error: null } : prev));
      return null;
    } catch (error) {
      return error;
    }
  }, [userId]);

  const markPending = (ideaId, on) =>
    setPending((p) => {
      const copy = { ...p };
      if (on) copy[ideaId] = true;
      else delete copy[ideaId];
      return copy;
    });

  const toggleSupport = useCallback(
    async (ideaId) => {
      if (!userId || pending[ideaId]) return;
      const supported = result.supported.includes(ideaId);
      setSaveError(null);
      markPending(ideaId, true);
      const { error } = supported
        ? await removeSupport(supabase, { userId, ideaId })
        : await addSupport(supabase, { userId, ideaId });
      if (error) setSaveError({ ideaId, key: ideaErrorKey(error) });
      const refreshError = await refresh();
      if (!error && refreshError) setSaveError({ ideaId, key: ideaErrorKey(refreshError) });
      markPending(ideaId, false);
    },
    [userId, pending, result.supported, refresh],
  );

  /** Gibt { id } oder { errorKey } zurück. */
  const createIdea = useCallback(
    async (idea, schoolId) => {
      if (!userId) return { errorKey: 'ideas.errors.generic' };
      const { idea: created, error } = await createIdeaApi(supabase, { userId, schoolId, idea });
      if (error) return { errorKey: ideaErrorKey(error) };
      // Neue Idee sofort in die Liste übernehmen, danach echten Stand nachladen.
      setResult((prev) => (prev.userId === userId ? { ...prev, ideas: [created, ...prev.ideas] } : prev));
      await refresh();
      return { id: created.id };
    },
    [userId, refresh],
  );

  /** Gibt {} oder { errorKey } zurück. */
  const deleteIdea = useCallback(
    async (ideaId) => {
      if (!userId) return { errorKey: 'ideas.errors.generic' };
      markPending(ideaId, true);
      const { error } = await deleteOwnIdea(supabase, { userId, ideaId });
      await refresh();
      markPending(ideaId, false);
      return error ? { errorKey: ideaErrorKey(error) } : {};
    },
    [userId, refresh],
  );

  const ready = status === 'ready';
  return {
    status,
    ideas: ready ? result.ideas : [],
    supported: ready ? result.supported : [],
    counts: ready ? result.counts : {},
    error: status === 'error' ? result.error : null,
    pending,
    saveError,
    reload,
    toggleSupport,
    createIdea,
    deleteIdea,
  };
}
