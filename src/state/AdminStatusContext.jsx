import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { fetchIsAdmin } from '../lib/adminApi.js';
import { deriveAdminStatus } from '../lib/adminAccess.js';
import { useAppState } from './AppStateContext.jsx';

/**
 * "Ist die angemeldete Person Admin?" – EINMAL pro Konto geprüft und für die ganze
 * App geteilt (Admin-Route, Seitenleiste, Profilmenü).
 *
 * - Geprüft wird nur mit einem echten, fertig geladenen Konto (mode === 'account').
 *   Gäste (nicht angemeldet) sind nie Admins – es gibt dann keine Anfrage.
 * - Das Ergebnis liegt NUR im Arbeitsspeicher (kein localStorage/sessionStorage).
 *   Nach Abmelden oder Kontowechsel wird es automatisch verworfen.
 * - Das ist nur für die Anzeige. Die Datenbank prüft bei jeder admin_*()-Funktion selbst.
 */
const AdminStatusContext = createContext(null);

const EMPTY_RESULT = { userId: null, isAdmin: false, error: null };

export function AdminStatusProvider({ children }) {
  const { mode } = useAppState();
  const auth = useAuth();
  const userId = mode === 'account' ? auth.user?.id ?? null : null;
  const [result, setResult] = useState(EMPTY_RESULT);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let active = true;
    fetchIsAdmin(supabase)
      .then((isAdmin) => active && setResult({ userId, isAdmin, error: null }))
      .catch((error) => active && setResult({ userId, isAdmin: false, error }));
    return () => {
      active = false;
    };
  }, [userId, reloadToken]);

  const value = useMemo(() => {
    const { status, isAdmin } = deriveAdminStatus(userId, result);
    return {
      status,
      isAdmin,
      error: status === 'error' ? result.error : null,
      /** Erneut prüfen (z. B. nach einem Netzwerkfehler). */
      retry() {
        setResult(EMPTY_RESULT);
        setReloadToken((n) => n + 1);
      },
    };
  }, [userId, result]);

  return <AdminStatusContext.Provider value={value}>{children}</AdminStatusContext.Provider>;
}

/** { status: 'none'|'loading'|'error'|'ready', isAdmin, error, retry } */
export function useIsAdmin() {
  const context = useContext(AdminStatusContext);
  if (!context) throw new Error('useIsAdmin muss innerhalb von <AdminStatusProvider> verwendet werden.');
  return context;
}
