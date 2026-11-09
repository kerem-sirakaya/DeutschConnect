import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useAppState } from './AppStateContext.jsx';

const NOT_INSTALLED = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);

/** Fehlt die Funktion/Tabelle in der Datenbank (Migration noch nicht ausgeführt)? */
export const isMissingInDatabase = (error) => NOT_INSTALLED.has(error?.code);

/**
 * Lädt Daten aus Supabase – nur im Konto-Modus. Gemeinsam genutzt von Profilen (012) und Projekten (013).
 *
 *   const result = useRemote(load, demoValue, deps, errorKey)
 *   result: { status, data, errorKey, reload, refreshing }
 *   status: 'demo' | 'loading' | 'ready' | 'error' | 'notInstalled'
 *
 * - demo: abgemeldet → demoValue() (fiktive Daten), nichts wird geladen
 * - reload(): lädt neu; die bisherigen Daten bleiben bis dahin sichtbar (refreshing = true),
 *   damit nichts flackert. Ändern sich die Parameter (deps), gibt es dagegen nie veraltete
 *   Daten zu sehen – dann steht status auf 'loading'.
 */
export function useRemote(load, demoValue, deps, errorKey) {
  const { mode } = useAppState();
  const isAccount = mode === 'account' && Boolean(supabase);
  const [state, setState] = useState({ key: null, baseKey: null, status: 'loading', data: null, errorKey: null });
  const [token, setToken] = useState(0);
  const baseKey = JSON.stringify([isAccount, ...deps]);
  const key = JSON.stringify([baseKey, token]);

  useEffect(() => {
    if (!isAccount) return undefined;
    let active = true;
    load(supabase)
      .then((data) => active && setState({ key, baseKey, status: 'ready', data, errorKey: null }))
      .catch(
        (error) =>
          active &&
          setState({
            key,
            baseKey,
            status: isMissingInDatabase(error) ? 'notInstalled' : 'error',
            data: null,
            errorKey: errorKey(error),
          }),
      );
    return () => {
      active = false;
    };
    // load/errorKey sind pro Render neue Funktionen; maßgeblich sind nur die Parameter in key
  }, [key]);

  const reload = useCallback(() => setToken((n) => n + 1), []);
  if (!isAccount) return { status: 'demo', data: demoValue(), errorKey: null, reload, refreshing: false };
  if (state.key === key) return { ...state, reload, refreshing: false };
  if (state.baseKey === baseKey && state.status === 'ready') return { ...state, reload, refreshing: true };
  return { status: 'loading', data: null, errorKey: null, reload, refreshing: false };
}
