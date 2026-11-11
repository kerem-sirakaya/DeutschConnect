import { createClient } from '@supabase/supabase-js';
import { RESET_PASSWORD_PATH, createRecoveryStore, parseAuthRedirect } from './passwordRecovery.js';

/**
 * Supabase-Verbindung.
 *
 * Die Werte kommen aus .env.local (wird NICHT ins Git hochgeladen).
 * Der "publishable" Key darf im Browser stehen – die Sicherheit entsteht durch
 * Row Level Security in der Datenbank (supabase/migrations/001_initial_schema.sql).
 *
 * Fehlen die Werte, ist `supabase` = null: keine Anmeldung möglich (Builds/Start brechen vorher ab).
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Schutz vor einem Versehen: Ein geheimer Key darf NIE im Browser landen.
const looksSecret = typeof key === 'string' && (key.startsWith('sb_secret_') || key.includes('service_role'));
if (looksSecret) {
  console.error(
    'VITE_SUPABASE_PUBLISHABLE_KEY enthält einen GEHEIMEN Key. Bitte den "publishable" Key verwenden ' +
      'und den geheimen Key im Supabase-Dashboard neu erzeugen. Supabase wird deaktiviert.',
  );
}

export const isSupabaseConfigured = Boolean(url && key && !looksSecret);

/**
 * Passwort-Wiederherstellung: Die Adresse VOR dem Start von supabase-js auswerten – supabase-js
 * entfernt die Token danach aus der Adresse. Gespeichert wird nur die Art ('recovery'/'error'/'none'),
 * nie ein Token. Landet ein Wiederherstellungs-Link auf einer anderen Seite (z. B. der Startseite,
 * weil die Ziel-Adresse in Supabase nicht erlaubt ist), wechseln wir vorher auf /reset-password.
 */
export const initialAuthRedirect =
  typeof window === 'undefined' ? { kind: 'none' } : parseAuthRedirect(window.location.href);
if (initialAuthRedirect.kind === 'recovery' && window.location.pathname !== RESET_PASSWORD_PATH) {
  window.history.replaceState(window.history.state, '', `${RESET_PASSWORD_PATH}${window.location.search}${window.location.hash}`);
}

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;

/**
 * Zustand der Passwort-Wiederherstellung. Der Listener wird SOFORT nach createClient angemeldet –
 * vor React –, damit das Ereignis PASSWORD_RECOVERY (kommt beim Einlösen des Links) nie verpasst wird.
 * Nur dieses Ereignis schaltet das Formular frei; SIGNED_OUT beendet die Wiederherstellung.
 */
function tabStorage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
export const recoveryStore = createRecoveryStore({
  storage: tabStorage(),
  pendingLink: Boolean(supabase) && initialAuthRedirect.kind === 'recovery',
});
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    // Hier KEINE Supabase-Aufrufe – nur Zustand setzen.
    recoveryStore.handleAuthEvent(event, session);
    // PASSWORD_RECOVERY folgt direkt nach dem Start (eigener Timer in supabase-js). Kam es nicht,
    // war der Link ungültig → nach kurzer Wartezeit „ungültig“ statt „lädt …“ zeigen.
    if (event === 'INITIAL_SESSION') setTimeout(() => recoveryStore.settleLink(), 300);
  });
}

/**
 * Prüft (nur zur Entwicklung), ob die Verbindung zu Supabase klappt.
 * Geprüft wird die PRIVATE Tabelle "profiles": Ohne Login ist "permission denied"
 * das ERWARTETE Ergebnis. Es beweist, dass URL + Key stimmen, die Tabellen
 * existieren und RLS Fremde aussperrt. ("schools" ist seit Migration 003 teilweise
 * öffentlich und eignet sich deshalb nicht mehr für diesen Test.)
 * Ändert nichts an der Oberfläche – Ausgabe nur in der Browser-Konsole.
 */
export async function checkSupabaseConnection() {
  if (!supabase) {
    console.info('[Supabase] Nicht konfiguriert – Anmeldung nicht möglich.');
    return 'not-configured';
  }
  const { error } = await supabase.from('profiles').select('id').limit(1);
  if (!error) {
    console.warn('[Supabase] Verbunden – ABER anonyme Besucher können "profiles" lesen. RLS/Grants prüfen!');
    return 'open';
  }
  if (error.code === '42501') {
    console.info('[Supabase] Verbunden ✓ Tabellen vorhanden, RLS blockiert anonyme Zugriffe (gewollt).');
    return 'ok';
  }
  if (error.code === 'PGRST205' || error.code === '42P01') {
    console.warn('[Supabase] Verbunden, aber Tabellen fehlen. supabase/migrations/*.sql im SQL Editor ausführen.');
    return 'missing-schema';
  }
  console.error('[Supabase] Verbindung fehlgeschlagen:', error.message);
  return 'error';
}
