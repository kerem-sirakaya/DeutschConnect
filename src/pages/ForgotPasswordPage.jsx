import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { resetRequestOutcome, validateResetRequest } from '../lib/passwordRecovery.js';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';

/**
 * „Passwort vergessen?“ – E-Mail mit Link zum Zurücksetzen anfordern (Supabase Auth).
 * Die Bestätigung ist immer gleich – egal, ob es zu der Adresse ein Konto gibt.
 */
export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [sent, setSent] = useState(false);

  const header = <PageHeader title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} backTo="/login" />;

  if (!auth.isConfigured) {
    return (
      <div className="page page--narrow">
        {header}
        <p className="notice">{t('auth.notConfigured')}</p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="page page--narrow">
        {header}
        <section className="card stack" aria-live="polite">
          <p className="notice notice--success" role="status">
            <Icon name="check" size={16} />
            {t('auth.forgot.sentText')}
          </p>
          <p className="muted">{t('auth.forgot.sentHint')}</p>
          <div className="form__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSent(false);
                setSubmitted(false);
              }}
            >
              {t('auth.forgot.again')}
            </button>
            <Link to="/login" className="btn btn--primary">
              {t('auth.forgot.backToLogin')}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busyRef.current) return; // kein doppeltes Absenden (auch bei schnellem Doppelklick)
    setSubmitted(true);
    setServerError(null);
    const found = validateResetRequest({ email });
    setErrors(found);
    if (found.email) {
      inputRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const { error } = await auth.requestPasswordReset(email);
    busyRef.current = false;
    setBusy(false);
    const outcome = resetRequestOutcome(error);
    if (outcome.sent) setSent(true);
    else setServerError(outcome.errorKey);
  };

  return (
    <div className="page page--narrow">
      {header}
      <form className="form card" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        {serverError && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t(serverError)}
          </p>
        )}
        <p className="muted">{t('auth.forgot.intro')}</p>
        <div className="field">
          <label htmlFor="forgot-email">{t('auth.emailLabel')}</label>
          <input
            ref={inputRef}
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (submitted) setErrors(validateResetRequest({ email: e.target.value }));
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'forgot-email-error' : undefined}
          />
          {errors.email && (
            <p id="forgot-email-error" className="field__error">
              {t(errors.email)}
            </p>
          )}
        </div>
        <div className="form__actions">
          <Link to="/login" className="btn btn--ghost">
            {t('auth.forgot.backToLogin')}
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="mail" size={18} />
            {busy ? t('auth.loading') : t('auth.forgot.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
