import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { AUTH_LIMITS } from '../lib/authValidation.js';
import { FORGOT_PASSWORD_PATH, recoveryView, updatePasswordErrorKey, validateNewPassword } from '../lib/passwordRecovery.js';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';

/**
 * Ziel des Links aus der E-Mail „Passwort zurücksetzen“. supabase-js hat den Link beim Start
 * bereits ausgewertet (Wiederherstellungs-Sitzung). Hier wird nur das neue Passwort gesetzt.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const busyRef = useRef(false);
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  const header = <PageHeader title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} backTo="/login" />;

  if (!auth.isConfigured) {
    return (
      <div className="page page--narrow">
        {header}
        <p className="notice">{t('auth.notConfigured')}</p>
      </div>
    );
  }

  const state = recoveryView({
    loading: auth.loading,
    userId: auth.user?.id ?? null,
    recovery: auth.recovery,
    initialRedirect: auth.initialAuthRedirect,
  });

  if (state.view === 'loading') {
    return (
      <div className="page page--narrow">
        {header}
        <p className="muted" role="status">
          {t('auth.loading')}
        </p>
      </div>
    );
  }

  // busyRef: Während des Speicherns meldet updatePassword ab – das Formular bleibt bis zur Weiterleitung stehen.
  if (state.view === 'invalid' && !busyRef.current) {
    return (
      <div className="page page--narrow">
        {header}
        <section className="card stack">
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t(state.errorKey)}
          </p>
          <div className="form__actions">
            <Link to="/login" className="btn btn--ghost">
              {t('auth.forgot.backToLogin')}
            </Link>
            <Link to={FORGOT_PASSWORD_PATH} className="btn btn--primary">
              {t('auth.reset.requestNew')}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateNewPassword(next));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    setSubmitted(true);
    setServerError(null);
    const found = validateNewPassword(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector(`[data-field="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const { error } = await auth.updatePassword(values.password);
    if (error) {
      busyRef.current = false;
      setBusy(false);
      setServerError(updatePasswordErrorKey(error));
      return;
    }
    navigate('/login', { replace: true, state: { passwordReset: true } });
  };

  const fieldProps = (name) => ({
    'data-field': name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `reset-${name}-error` : undefined,
  });
  const ErrorText = ({ name }) =>
    errors[name] ? (
      <p id={`reset-${name}-error`} className="field__error">
        {t(errors[name])}
      </p>
    ) : null;

  return (
    <div className="page page--narrow">
      {header}
      <form ref={formRef} className="form card" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        {serverError && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t(serverError)}
          </p>
        )}
        <div className="field">
          <label htmlFor="reset-password">{t('auth.reset.newPasswordLabel')}</label>
          <p className="field__hint">{t('auth.passwordHint', { min: AUTH_LIMITS.passwordMin })}</p>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            {...fieldProps('password')}
          />
          <ErrorText name="password" />
        </div>
        <div className="field">
          <label htmlFor="reset-confirm">{t('auth.reset.confirmLabel')}</label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            value={values.confirm}
            onChange={(e) => update('confirm', e.target.value)}
            {...fieldProps('confirm')}
          />
          <ErrorText name="confirm" />
        </div>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="check" size={18} />
            {busy ? t('auth.loading') : t('auth.reset.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
