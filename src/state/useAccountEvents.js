import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { fetchEvents, fetchMyRegistrations, registrationErrorKey, saveRegistration } from '../lib/eventsApi.js';

/**
 * Lädt für ein angemeldetes Konto die ECHTEN Events und die EIGENEN Anmeldungen.
 * Wird nur von AppStateContext benutzt. Für abgemeldete Besucher (userId = null)
 * passiert hier nichts – dann gelten weiter die Demo-Events.
 *
 * status: 'idle' | 'loading' | 'error' | 'ready'
 * Bei einem Fehler gibt es KEINEN Rückfall auf Demo-Events.
 */
export function useAccountEvents(userId) {
  const [result, setResult] = useState({ userId: null, events: [], registrations: {}, error: null });
  const [reloadToken, setReloadToken] = useState(0);
  const [pending, setPending] = useState({}); // { [eventId]: true } während des Speicherns
  const [saveError, setSaveError] = useState(null); // { eventId, key }

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let active = true;
    Promise.all([fetchEvents(supabase), fetchMyRegistrations(supabase, userId)])
      .then(([events, registrations]) => active && setResult({ userId, events, registrations, error: null }))
      .catch((error) => active && setResult({ userId, events: [], registrations: {}, error }));
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
    setResult({ userId: null, events: [], registrations: {}, error: null });
    setSaveError(null);
    setReloadToken((n) => n + 1);
  }, []);

  /** next: 'registered' | 'interested' | null (= entfernen) */
  const setRegistration = useCallback(
    async (eventId, next) => {
      if (!userId || pending[eventId]) return false;
      const current = result.userId === userId ? result.registrations[eventId] ?? null : null;
      setSaveError(null);
      setPending((p) => ({ ...p, [eventId]: true }));
      const { error } = await saveRegistration(supabase, { userId, eventId, current, next });
      if (error) setSaveError({ eventId, key: registrationErrorKey(error) });
      // Immer den echten Stand aus der Datenbank neu laden (keine Annahmen).
      try {
        const registrations = await fetchMyRegistrations(supabase, userId);
        setResult((prev) => (prev.userId === userId ? { ...prev, registrations } : prev));
      } catch (reloadError) {
        if (!error) setSaveError({ eventId, key: registrationErrorKey(reloadError) });
      }
      setPending((p) => {
        const copy = { ...p };
        delete copy[eventId];
        return copy;
      });
      // true = von der Datenbank bestätigt gespeichert (für Erfolgsmeldungen)
      return !error;
    },
    [userId, pending, result],
  );

  return {
    status,
    events: status === 'ready' ? result.events : [],
    registrations: status === 'ready' ? result.registrations : {},
    error: status === 'error' ? result.error : null,
    pending,
    saveError,
    reload,
    setRegistration,
  };
}
