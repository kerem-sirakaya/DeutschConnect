import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import Icon from '../Icon.jsx';

/**
 * Ehrlicher Hinweis zum Datenstand der Profile/Statistik:
 * nicht angemeldet · lädt · Backend fehlt (Migration 012) · Ladefehler.
 * Gibt null zurück, wenn echte Daten bereitstehen.
 */
export default function ProfileStatusNotice({ status, errorKey, reload }) {
  const { t } = useI18n();
  if (status === 'ready') return null;
  if (status === 'guest') {
    return (
      <p className="notice notice--info">
        <Icon name="info" size={16} />
        <span>
          {t('profiles.guestHint')}{' '}
          <Link to="/login" className="text-link">
            {t('profiles.loginLink')}
          </Link>
        </span>
      </p>
    );
  }
  if (status === 'loading') {
    return (
      <p className="notice" role="status">
        <Icon name="refresh" size={16} />
        {t('profiles.loading')}
      </p>
    );
  }
  return (
    <div className="notice notice--error" role="alert">
      <Icon name="info" size={16} />
      <div>
        <p>{t(errorKey ?? 'profiles.errors.generic')}</p>
        {status === 'error' && reload && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={reload}>
            {t('profiles.retry')}
          </button>
        )}
      </div>
    </div>
  );
}
