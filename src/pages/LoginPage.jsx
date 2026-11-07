import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { authErrorKey, validateLogin } from '../lib/authValidation.js';
import PageHeader from '../components/PageHeader.jsx';
import AccountCard from '../components/AccountCard.jsx';
import Icon from '../components/Icon.jsx';

export default function LoginPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  const header = <PageHeader title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} backTo="/me" />;

  // Nicht konfiguriert, Sitzung lädt noch oder schon angemeldet → Konto-Karte zeigen.
  if (!auth.isConfigured || auth.loading || auth.user) {
    return (
      <div className="page page--narrow">
        {header}
        <section className="card settings-block">
          <AccountCard />
        </section>
      </div>
    );
  }

  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateLogin(next));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const found = validateLogin(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector(`[data-field="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    const { error } = await auth.signIn(values);
    setBusy(false);
    if (error) {
      setServerError(authErrorKey(error));
      return;
    }
    navigate('/me/settings', { replace: true });
  };

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
        {serverError && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t(serverError)}
          </p>
        )}

        <div className="field">
          <label htmlFor="login-email">{t('auth.emailLabel')}</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            {...fieldProps('email')}
          />
          <ErrorText name="email" />
        </div>

        <div className="field">
          <label htmlFor="login-password">{t('auth.passwordLabel')}</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            {...fieldProps('password')}
          />
          <ErrorText name="password" />
        </div>

        <div className="form__actions">
          {auth.isSignupEnabled && (
            <Link to="/register" className="btn btn--ghost">
              {t('auth.toRegister')}
            </Link>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="user" size={18} />
            {busy ? t('auth.loading') : t('auth.submitLogin')}
          </button>
        </div>
      </form>
    </div>
  );
}
