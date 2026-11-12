/**
 * Prüfregeln für Registrierung und Login (ohne React → mit `npm test` testbar).
 * Die Grenzen entsprechen den Regeln in der Datenbank (001_initial_schema.sql),
 * damit Fehler schon im Formular auffallen und nicht erst beim Server.
 */

export const AUTH_LIMITS = { firstNameMax: 40, passwordMin: 8, gradeMin: 5, gradeMax: 13 };

export const GRADES = Array.from(
  { length: AUTH_LIMITS.gradeMax - AUTH_LIMITS.gradeMin + 1 },
  (_, i) => AUTH_LIMITS.gradeMin + i,
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Gibt ein Objekt { feldname: übersetzungsschlüssel } zurück – leer = alles ok. */
export function validateRegistration(values, allowedSchoolIds) {
  const errors = {};
  const firstName = values.firstName.trim();
  if (firstName.length < 1 || firstName.length > AUTH_LIMITS.firstNameMax) errors.firstName = 'auth.errors.firstName';
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'auth.errors.email';
  if (values.password.length < AUTH_LIMITS.passwordMin) errors.password = 'auth.errors.password';
  if (!allowedSchoolIds.includes(values.schoolId)) errors.schoolId = 'auth.errors.school';
  if (!GRADES.includes(Number(values.grade))) errors.grade = 'auth.errors.grade';
  if (!values.consent) errors.consent = 'auth.errors.consent';
  return errors;
}

export function validateLogin(values) {
  const errors = {};
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'auth.errors.email';
  if (values.password.length === 0) errors.password = 'auth.errors.passwordRequired';
  return errors;
}

/**
 * Daten, die bei der Registrierung als "user metadata" an Supabase gehen.
 * Der Datenbank-Trigger handle_new_user() liest genau diese drei Felder
 * und legt daraus das Profil an.
 */
export function buildSignUpMetadata(values) {
  return {
    first_name: values.firstName.trim(),
    school_id: values.schoolId,
    grade: Number(values.grade),
  };
}

/** Übersetzt Supabase-Fehler in einen Übersetzungsschlüssel für die Oberfläche. */
export function authErrorKey(error) {
  if (!error) return null;
  const byCode = {
    invalid_credentials: 'auth.errors.invalidCredentials',
    email_not_confirmed: 'auth.errors.emailNotConfirmed',
    user_already_exists: 'auth.errors.userExists',
    email_exists: 'auth.errors.userExists',
    signup_disabled: 'auth.errors.signupDisabled',
    email_provider_disabled: 'auth.errors.signupDisabled',
    weak_password: 'auth.errors.weakPassword',
    over_email_send_rate_limit: 'auth.errors.rateLimit',
    over_request_rate_limit: 'auth.errors.rateLimit',
    email_address_invalid: 'auth.errors.emailInvalid',
    unexpected_failure: 'auth.errors.profileFailed',
  };
  if (byCode[error.code]) return byCode[error.code];
  // Schlägt der Profil-Trigger fehl (z. B. ungültige Schule), meldet Supabase "Database error saving new user".
  if (/database error/i.test(error.message ?? '')) return 'auth.errors.profileFailed';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'auth.errors.network';
  return 'auth.errors.generic';
}

/**
 * Ziel nach dem Login (z. B. zurück zu /admin). Nur Pfade INNERHALB der App sind erlaubt –
 * keine fremden Adressen ("//evil.example", "https://…"), keine Login-/Registrierungsseite.
 */
export function safeRedirectPath(from, fallback = '/me/settings') {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) {
    return fallback;
  }
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(from)) return fallback;
  return from;
}
