import { Link, Outlet, useLocation } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import Icon from './Icon.jsx';

/**
 * Seiten für Mitglieder (Events, Ideen, Nachhilfe, Profile, Gruppen, Chat, Mein Bereich).
 * Gäste sehen stattdessen einen ehrlichen Hinweis mit Anmelden/Registrieren – keine erfundenen Inhalte.
 * Nur Anzeige: Die Datenbank (RLS) gibt Gästen diese Inhalte ohnehin nicht heraus.
 * Nach dem Anmelden geht es zur ursprünglich gewünschten Seite zurück (state.from → LoginPage).
 */
export default function RequireAccount() {
  const { mode } = useAppState();
  if (mode !== 'guest') return <Outlet />;
  return <LoginRequired />;
}

export function LoginRequired() {
  const { t } = useI18n();
  const auth = useAuth();
  const location = useLocation();
  usePageTitle(t('guest.loginRequiredTitle'));
  const from = `${location.pathname}${location.search}`;
  return (
    <div className="page page--narrow">
      <section className="card stack guest-gate" aria-labelledby="guest-gate-title">
        <span className="guest-gate__icon" aria-hidden="true">
          <Icon name="user" size={28} />
        </span>
        <h1 id="guest-gate-title" tabIndex={-1}>
          {t('guest.loginRequiredTitle')}
        </h1>
        <p>{t('guest.loginRequiredText')}</p>
        <div className="form__actions guest-gate__actions">
          {auth.isSignupEnabled && (
            <Link to="/register" className="btn btn--secondary">
              {t('auth.toRegister')}
            </Link>
          )}
          <Link to="/login" state={{ from }} className="btn btn--primary">
            <Icon name="user" size={18} />
            {t('auth.toLogin')}
          </Link>
        </div>
        <p className="muted small">
          <Link to="/about" className="text-link">
            {t('guest.aboutLink')}
          </Link>
          {' · '}
          <Link to="/community/games" className="text-link">
            {t('guest.gamesLink')}
          </Link>
        </p>
      </section>
    </div>
  );
}
