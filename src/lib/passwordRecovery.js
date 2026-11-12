/**
 * Passwort vergessen / neues Passwort setzen – Regeln ohne React (mit `npm test` testbar).
 *
 * Ablauf (Supabase Auth, supabase-js v2, Standard-Flow „implicit“):
 *   1. /forgot-password: resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })
 *   2. Supabase schickt eine E-Mail mit Link → zurück auf /reset-password#access_token=…&type=recovery
 *   3. supabase-js liest den Link selbst aus, legt eine Wiederherstellungs-Sitzung an, löscht die
 *      Token aus der Adresse und meldet das Ereignis PASSWORD_RECOVERY.
 *   4. /reset-password: updateUser({ password }) → danach abmelden → /login mit Erfolgsmeldung.
 * Abgelaufene/ungültige Links kommen als #error=…&error_code=otp_expired zurück.
 * Token werden NIE von uns gespeichert – nur ein Merker „Wiederherstellung läuft für Konto X“.
 *
 * Freigabe des Formulars NUR über das Ereignis PASSWORD_RECOVERY (createRecoveryStore). Der Link beim
 * Start (parseAuthRedirect) schaltet das Formular NICHT frei – er sorgt nur dafür, dass bis zum Ereignis
 * „lädt …“ statt „ungültig“ erscheint. Sonst würde eine spätere normale Anmeldung im selben Tab das
 * Formular wieder öffnen (Review M1).
 */
import { AUTH_LIMITS } from './authValidation.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RESET_PASSWORD_PATH = '/reset-password';
export const FORGOT_PASSWORD_PATH = '/forgot-password';
/** sessionStorage-Schlüssel: nur die Konto-ID (kein Token), damit ein Neuladen den Ablauf nicht abbricht. */
export const RECOVERY_FLAG_KEY = 'connected.passwordRecovery';

/**
 * Echter Verbindungsfehler? supabase-js meldet Netzwerkfehler mit status 0. Achtung: Auch JEDEN 5xx-Fehler
 * des Servers meldet es als AuthRetryableFetchError – dann aber mit dem HTTP-Status (z. B. 500).
 */
const isNetworkError = (error) => error.status === 0 || (error.name === 'AuthRetryableFetchError' && !error.status);

/** Ziel-Adresse im E-Mail-Link (muss in Supabase unter „Redirect URLs“ erlaubt sein). */
export function resetRedirectUrl(origin) {
  return `${String(origin).replace(/\/+$/, '')}${RESET_PASSWORD_PATH}`;
}

/** Formular „Passwort vergessen“: { email?: Übersetzungsschlüssel } – leer = ok. */
export function validateResetRequest(values) {
  const errors = {};
  if (!EMAIL_PATTERN.test(String(values?.email ?? '').trim())) errors.email = 'auth.errors.email';
  return errors;
}

/** Formular „Neues Passwort“: gleiche Mindestlänge wie bei der Registrierung + Bestätigung. */
export function validateNewPassword(values) {
  const errors = {};
  const password = String(values?.password ?? '');
  const confirm = String(values?.confirm ?? '');
  if (password.length < AUTH_LIMITS.passwordMin) errors.password = 'auth.errors.password';
  if (!confirm) errors.confirm = 'auth.reset.errors.confirmRequired';
  else if (confirm !== password) errors.confirm = 'auth.reset.errors.mismatch';
  return errors;
}

function readParams(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return new URLSearchParams();
  }
  const merged = new URLSearchParams(url.search);
  for (const [key, value] of new URLSearchParams(url.hash.replace(/^#/, ''))) merged.set(key, value);
  return merged;
}

/**
 * Was bringt die Adresse beim Start mit? (vor supabase-js auslesen – das entfernt die Token danach)
 * Gibt { kind: 'recovery' | 'error' | 'none', errorKey? } zurück – NIE die Token selbst.
 */
export function parseAuthRedirect(href) {
  const params = readParams(href);
  const errorCode = params.get('error_code');
  if (params.get('error') || errorCode || params.get('error_description')) {
    return {
      kind: 'error',
      errorKey: errorCode === 'otp_expired' ? 'auth.reset.errors.linkExpired' : 'auth.reset.errors.linkInvalid',
    };
  }
  if (params.get('type') === 'recovery' && (params.get('access_token') || params.get('code') || params.get('token_hash'))) {
    return { kind: 'recovery' };
  }
  return { kind: 'none' };
}

/**
 * Antwort auf „Passwort vergessen“.
 * Supabase antwortet für unbekannte Adressen mit Erfolg, für bestehende Konten aber bei einer zweiten
 * Anfrage kurz danach mit 429 (Wartezeit). Würde die App dann „zu viele Versuche“ zeigen, verriete sie,
 * dass es das Konto gibt (Review M2). Deshalb: 429 / Wartezeit → DIESELBE neutrale Bestätigung wie bei
 * Erfolg (der Hinweistext erklärt die mögliche Wartezeit für alle gleich).
 * Echte Netzwerk- und unerwartete Serverfehler werden weiterhin gemeldet – nie mit Rohdaten von Supabase.
 */
export function resetRequestOutcome(error) {
  if (!error) return { sent: true };
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429) {
    return { sent: true };
  }
  if (isNetworkError(error)) return { sent: false, errorKey: 'auth.errors.network' };
  return { sent: false, errorKey: 'auth.errors.generic' };
}

/** Fehler beim Speichern des neuen Passworts → Übersetzungsschlüssel. */
export function updatePasswordErrorKey(error) {
  if (!error) return null;
  const byCode = {
    same_password: 'auth.reset.errors.samePassword',
    weak_password: 'auth.errors.weakPassword',
    session_not_found: 'auth.reset.errors.linkInvalid',
    session_expired: 'auth.reset.errors.linkExpired',
    reauthentication_needed: 'auth.reset.errors.linkInvalid',
    over_request_rate_limit: 'auth.errors.rateLimit',
  };
  if (byCode[error.code]) return byCode[error.code];
  if (error.name === 'AuthSessionMissingError') return 'auth.reset.errors.linkInvalid';
  if (isNetworkError(error)) return 'auth.errors.network';
  return 'auth.errors.generic';
}

/**
 * Zustand der Passwort-Wiederherstellung (ohne React, testbar).
 *   userId      – Konto, für das ein Wiederherstellungs-Link eingelöst wurde (Ereignis PASSWORD_RECOVERY).
 *                 Wird in `storage` (sessionStorage) gemerkt, damit Neuladen den Ablauf nicht abbricht.
 *   linkPending – beim Start lag ein Link in der Adresse, das Ereignis steht aber noch aus.
 * Gelöscht wird bei SIGNED_OUT und nach dem Speichern (clear). Eine normale Anmeldung (SIGNED_IN)
 * schaltet NICHTS frei.
 */
export function createRecoveryStore({ storage = null, pendingLink = false } = {}) {
  const read = () => {
    try {
      return storage?.getItem(RECOVERY_FLAG_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const write = (userId) => {
    try {
      if (userId) storage?.setItem(RECOVERY_FLAG_KEY, userId);
      else storage?.removeItem(RECOVERY_FLAG_KEY);
    } catch {
      // Speicher nicht verfügbar (z. B. privates Fenster) – ohne Neuladen klappt der Ablauf trotzdem
    }
  };
  let state = { userId: read(), linkPending: Boolean(pendingLink) };
  const listeners = new Set();
  const set = (next) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Supabase-Ereignis (onAuthStateChange) verarbeiten. */
    handleAuthEvent(event, session) {
      if (event === 'PASSWORD_RECOVERY' && session?.user?.id) {
        write(session.user.id);
        set({ userId: session.user.id, linkPending: false });
      } else if (event === 'SIGNED_OUT') {
        write(null);
        set({ userId: null, linkPending: false });
      }
    },
    /** Der Link beim Start ist abgearbeitet (kam kein PASSWORD_RECOVERY, war er ungültig). */
    settleLink() {
      if (state.linkPending) set({ ...state, linkPending: false });
    },
    /** Nach erfolgreichem Speichern: Wiederherstellung beenden. */
    clear() {
      write(null);
      set({ userId: null, linkPending: false });
    },
  };
}

/**
 * Was zeigt /reset-password?
 *   recovery = Zustand aus createRecoveryStore, initialRedirect = parseAuthRedirect beim Start.
 * Formular NUR, wenn die angemeldete Sitzung genau die eingelöste Wiederherstellungs-Sitzung ist.
 */
export function recoveryView({ loading, userId, recovery, initialRedirect }) {
  if (initialRedirect?.kind === 'error') return { view: 'invalid', errorKey: initialRedirect.errorKey };
  if (loading || recovery?.linkPending) return { view: 'loading' };
  if (userId && recovery?.userId === userId) return { view: 'form' };
  return { view: 'invalid', errorKey: 'auth.reset.errors.linkInvalid' };
}
