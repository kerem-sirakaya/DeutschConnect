import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAppState } from './AppStateContext.jsx';
import { demoTutoringFor } from '../data/tutoring.js';
import {
  createTutoringEntry,
  deleteTutoringEntry,
  fetchTutoringState,
  respondTutoringRequest,
  sendTutoringRequest,
  setTutoringEntryStatus,
  setTutoringSaved,
  tutoringErrorKey,
  updateTutoringEntry,
  withdrawTutoringRequest,
} from '../lib/tutoringApi.js';

/**
 * Nachhilfe-Daten für die ganze App (Startseite + Nachhilfe-Seiten).
 *
 * - Demo (abgemeldet): fiktive Einträge, NUR LESEN. Nichts wird gesendet oder gespeichert.
 * - Konto: echte Daten aus Supabase (Migration 011). Nach JEDER Änderung wird der echte
 *   Stand neu geladen – eine Aktion gilt erst als erfolgreich, wenn die Datenbank sie bestätigt.
 *   Neue eingehende Anfragen erscheinen beim Öffnen der Seite und wenn das Fenster wieder
 *   aktiv wird (kein Push/Realtime).
 * - Fehlt Migration 011 in der Datenbank, steht status auf 'notInstalled'. Der Rest der App
 *   funktioniert weiter (bewusst NICHT im ProfileGate, damit ein fehlendes Modul nicht alles blockiert).
 *
 * status: 'demo' | 'loading' | 'ready' | 'error' | 'notInstalled'
 */
const TutoringContext = createContext(null);
const EMPTY = { userId: null, entries: [], requests: [], error: null };

export function TutoringProvider({ children }) {
  const { mode, user } = useAppState();
  const isAccount = mode === 'account';
  const userId = isAccount ? user.id : null;
  const schoolId = isAccount ? user.schoolId : null;
  const [result, setResult] = useState(EMPTY);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let active = true;
    fetchTutoringState(supabase)
      .then((state) => active && setResult({ userId, ...state, error: null }))
      .catch((error) => active && setResult({ userId, entries: [], requests: [], error }));
    return () => {
      active = false;
    };
  }, [userId, reloadToken]);

  // Beim Zurückkehren ins Fenster neu laden → neue Anfragen werden sichtbar.
  useEffect(() => {
    if (!userId) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setReloadToken((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  const refresh = useCallback(async () => {
    const state = await fetchTutoringState(supabase);
    setResult((prev) => (prev.userId === userId ? { ...prev, ...state, error: null } : prev));
  }, [userId]);

  /** Führt eine Änderung aus und lädt danach neu. Ergebnis: { ok: true, value } oder { errorKey }. */
  const run = useCallback(
    async (operation) => {
      if (!userId || !supabase) return { errorKey: 'tutoring.errors.loginRequired' };
      let value;
      try {
        value = await operation();
      } catch (error) {
        try {
          await refresh();
        } catch {
          // Neu laden fehlgeschlagen – die Fehlermeldung der Aktion reicht
        }
        return { errorKey: tutoringErrorKey(error) };
      }
      try {
        await refresh();
      } catch {
        // Gespeichert, aber Neuladen fehlgeschlagen: Erfolg melden, Daten beim nächsten Laden
      }
      return { ok: true, value };
    },
    [userId, refresh],
  );

  const value = useMemo(() => {
    if (!isAccount) {
      return {
        status: 'demo',
        readOnly: true,
        entries: demoTutoringFor(user.id),
        requests: [],
        errorKey: null,
        reload: () => {},
        actions: null,
      };
    }
    let status = 'loading';
    let errorKey = null;
    if (result.userId === userId) {
      if (!result.error) status = 'ready';
      else {
        errorKey = tutoringErrorKey(result.error);
        status = errorKey === 'tutoring.errors.notInstalled' ? 'notInstalled' : 'error';
      }
    }
    const ready = status === 'ready';
    return {
      status,
      readOnly: !ready,
      entries: ready ? result.entries : [],
      requests: ready ? result.requests : [],
      errorKey,
      reload: () => {
        setResult(EMPTY);
        setReloadToken((n) => n + 1);
      },
      actions: {
        createEntry: (values) => run(() => createTutoringEntry(supabase, userId, schoolId, values)),
        updateEntry: (id, values) => run(() => updateTutoringEntry(supabase, id, values)),
        setEntryStatus: (id, status) => run(() => setTutoringEntryStatus(supabase, id, status)),
        deleteEntry: (id) => run(() => deleteTutoringEntry(supabase, id)),
        setSaved: (id, saved) => run(() => setTutoringSaved(supabase, userId, id, saved)),
        sendRequest: (entryId, message) => run(() => sendTutoringRequest(supabase, entryId, message)),
        respond: (requestId, accept, note) => run(() => respondTutoringRequest(supabase, requestId, accept, note)),
        withdraw: (requestId) => run(() => withdrawTutoringRequest(supabase, requestId)),
      },
    };
  }, [isAccount, user.id, userId, schoolId, result, run]);

  return <TutoringContext.Provider value={value}>{children}</TutoringContext.Provider>;
}

export function useTutoring() {
  const context = useContext(TutoringContext);
  if (!context) throw new Error('useTutoring muss innerhalb von <TutoringProvider> verwendet werden.');
  return context;
}
