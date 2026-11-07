import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { schools as localSchools } from '../data/schools.js';
import { AUTH_LIMITS, GRADES, authErrorKey, validateRegistration } from '../lib/authValidation.js';
import PageHeader from '../components/PageHeader.jsx';
import AccountCard from '../components/AccountCard.jsx';
import Icon from '../components/Icon.jsx';

const FALLBACK_SCHOOLS = localSchools.map((s) => ({ id: s.id, name: s.name }));

/**
 * Schulen für die Auswahl – aus der Tabelle "schools".
 * Besucher ohne Login dürfen dort nur id, name, short_name, city lesen
 * (Migration 003). Deshalb NUR diese Spalten abfragen, nie "select *".
 * Schlägt die Abfrage fehl (offline, Migration fehlt), nutzen wir die lokale
 * Liste src/data/schools.js – ihre IDs stimmen mit der Datenbank überein.
 * Eine falsche ID würde die Datenbank ohnehin ablehnen (Fremdschlüssel).
 */
function useSchoolOptions() {
  const [options, setOptions] = useState(FALLBACK_SCHOOLS);
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase
      .from('schools')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data?.length) setOptions(data);
        else if (import.meta.env.DEV) console.warn('[Auth] Schulen aus lokaler Liste (Fallback):', error?.message ?? 'keine Daten');
      });
    return () => {
      active = false;
    };
  }, []);
  return options;
}

export default function RegisterPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const schoolOptions = useSchoolOptions();
  const formRef = useRef(null);
  const [values, setValues] = useState({
    firstName: '',
    email: '',
    password: '',
    schoolId: '',
    grade: '',
    consent: false,
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [done, setDone] = useState(false);

  const header = <PageHeader title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')} backTo="/me" />;
  const schoolIds = schoolOptions.map((s) => s.id);

  // Fertig: E-Mail bestätigen
  if (done) {
    return (
      <div className="page page--narrow">
        {header}
        <section className="card settings-block" role="status">
          <h2>{t('auth.checkEmailTitle')}</h2>
          <p>{t('auth.checkEmailText')}</p>
          <Link to="/login" className="btn btn--primary btn--sm">
            {t('auth.toLogin')}
          </Link>
        </section>
      </div>
    );
  }

  // Registrierung gesperrt, nicht konfiguriert oder schon angemeldet
  if (!auth.isSignupEnabled || auth.loading || auth.user) {
    return (
      <div className="page page--narrow">
        {header}
        <section className="card settings-block">
          {!auth.isSignupEnabled && auth.isConfigured && !auth.user ? (
            <>
              <p className="muted">{t('auth.signupClosed')}</p>
              <Link to="/login" className="btn btn--secondary btn--sm">
                {t('auth.toLogin')}
              </Link>
            </>
          ) : (
            <AccountCard />
          )}
        </section>
      </div>
    );
  }

  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateRegistration(next, schoolIds));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const found = validateRegistration(values, schoolIds);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector(`[data-field="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    const result = await auth.signUp(values);
    setBusy(false);
    if (result.error) {
      setServerError(authErrorKey(result.error));
      return;
    }
    // Wurde die E-Mail-Bestätigung im Dashboard abgeschaltet, ist man sofort angemeldet
    // → dann zeigt diese Seite automatisch die Konto-Karte.
    if (result.needsConfirmation) setDone(true);
  };

  const errorCount = Object.keys(errors).length;
  const fieldProps = (name) => ({
    'data-field': name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const ErrorText = ({ name }) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field__error">
        {t(errors[name])}
      </p>
    ) : null;

  return (
    <div className="page page--narrow">
      {header}
      <form ref={formRef} className="form card" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        {submitted && errorCount > 0 && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t('auth.errorSummary', { count: errorCount })}
          </p>
        )}
        {serverError && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t(serverError)}
          </p>
        )}

        <div className="field">
          <label htmlFor="reg-first-name">{t('auth.firstNameLabel')}</label>
          <p className="field__hint">{t('auth.firstNameHint')}</p>
          <input
            id="reg-first-name"
            type="text"
            autoComplete="given-name"
            maxLength={AUTH_LIMITS.firstNameMax}
            value={values.firstName}
            onChange={(e) => update('firstName', e.target.value)}
            {...fieldProps('firstName')}
          />
          <ErrorText name="firstName" />
        </div>

        <div className="field">
          <label htmlFor="reg-email">{t('auth.emailLabel')}</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            {...fieldProps('email')}
          />
          <ErrorText name="email" />
        </div>

        <div className="field">
          <label htmlFor="reg-password">{t('auth.passwordLabel')}</label>
          <p className="field__hint">{t('auth.passwordHint', { min: AUTH_LIMITS.passwordMin })}</p>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            {...fieldProps('password')}
          />
          <ErrorText name="password" />
        </div>

        <div className="field">
          <label htmlFor="reg-school">{t('auth.schoolLabel')}</label>
          <select
            id="reg-school"
            value={values.schoolId}
            onChange={(e) => update('schoolId', e.target.value)}
            {...fieldProps('schoolId')}
          >
            <option value="">{t('auth.schoolPlaceholder')}</option>
            {schoolOptions.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <ErrorText name="schoolId" />
        </div>

        <div className="field">
          <label htmlFor="reg-grade">{t('auth.gradeLabel')}</label>
          <select
            id="reg-grade"
            value={values.grade}
            onChange={(e) => update('grade', e.target.value)}
            {...fieldProps('grade')}
          >
            <option value="">{t('auth.gradePlaceholder')}</option>
            {GRADES.map((grade) => (
              <option key={grade} value={grade}>
                {t('profile.grade', { grade })}
              </option>
            ))}
          </select>
          <ErrorText name="grade" />
        </div>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={values.consent}
              onChange={(e) => update('consent', e.target.checked)}
              {...fieldProps('consent')}
            />
            <span>{t('auth.consentLabel')}</span>
          </label>
          <ErrorText name="consent" />
        </div>

        <div className="form__actions">
          <Link to="/login" className="btn btn--ghost">
            {t('auth.toLogin')}
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="check" size={18} />
            {busy ? t('auth.loading') : t('auth.submitRegister')}
          </button>
        </div>
      </form>
    </div>
  );
}
