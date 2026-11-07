import { useState } from 'react';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { authErrorKey } from '../lib/authValidation.js';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

/**
 * Wird statt der App gezeigt, solange das echte Profil, die Events oder die Ideen
 * laden oder nicht geladen werden konnten. So sieht man nie kurz ein falsches
 * (Demo-)Profil und nie Demo-Inhalte als stillen Ersatz.
 */
export default function ProfileGate({ status, titleKey, messageKey, onRetry }) {
  const { t } = useI18n();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await auth.signOut();
    setBusy(false);
  };

  return (
    <main id="main" className="app__main">
      <div className="page page--narrow">
        {status === 'loading' ? (
          <section className="card settings-block" role="status" aria-live="polite">
            <Logo size={32} />
            <p>{t('auth.gateLoading')}</p>
          </section>
        ) : (
          <section className="card settings-block" role="alert">
            <h1>{t(titleKey ?? 'auth.gateErrorTitle')}</h1>
            <p className="notice notice--error">
              <Icon name="info" size={16} />
              {t(messageKey ?? (auth.profileError ? authErrorKey(auth.profileError) : 'auth.profileMissing'))}
            </p>
            <p className="muted">{t('auth.gateErrorText')}</p>
            <div className="form__actions">
              <button type="button" className="btn btn--secondary btn--sm" onClick={signOut} disabled={busy}>
                {busy ? t('auth.loading') : t('auth.logout')}
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={onRetry ?? auth.reloadProfile} disabled={busy}>
                <Icon name="refresh" size={16} />
                {t('auth.retry')}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
