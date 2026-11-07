import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { authErrorKey } from '../lib/authValidation.js';
import Icon from './Icon.jsx';

/** Konto-Status: angemeldet (mit Abmelden) oder Links zu Login/Registrierung. */
export default function AccountCard() {
  const { t } = useI18n();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!auth.isConfigured) return <p className="muted">{t('auth.notConfigured')}</p>;
  if (auth.loading) return <p className="muted" role="status">{t('auth.loading')}</p>;

  if (!auth.user) {
    return (
      <>
        <p className="muted">{t('auth.accountSignedOut')}</p>
        <div className="form__actions">
          {auth.isSignupEnabled && (
            <Link to="/register" className="btn btn--secondary btn--sm">
              {t('auth.toRegister')}
            </Link>
          )}
          <Link to="/login" className="btn btn--primary btn--sm">
            <Icon name="user" size={16} />
            {t('auth.toLogin')}
          </Link>
        </div>
      </>
    );
  }

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    const result = await auth.signOut();
    setBusy(false);
    if (result.error) setError(authErrorKey(result.error));
  };

  const { profile } = auth;
  return (
    <>
      {auth.profileLoading && <p className="muted" role="status">{t('auth.profileLoading')}</p>}
      {profile && (
        <p>
          <strong>{t('auth.signedInAs', { name: profile.first_name })}</strong>
          <br />
          <span className="muted">
            {profile.school?.name ?? profile.school_id}
            {profile.grade ? ` · ${t('profile.grade', { grade: profile.grade })}` : ''}
          </span>
        </p>
      )}
      {(auth.profileError || (!auth.profileLoading && !profile)) && (
        <p className="notice notice--error" role="alert">
          <Icon name="info" size={16} />
          {t('auth.profileMissing')}
        </p>
      )}
      <p className="hint">
        <Icon name="info" size={14} />
        {t('auth.demoStillActive')}
      </p>
      {error && (
        <p className="notice notice--error" role="alert">
          <Icon name="info" size={16} />
          {t(error)}
        </p>
      )}
      <button type="button" className="btn btn--secondary btn--sm" onClick={handleSignOut} disabled={busy}>
        {busy ? t('auth.loading') : t('auth.logout')}
      </button>
    </>
  );
}
