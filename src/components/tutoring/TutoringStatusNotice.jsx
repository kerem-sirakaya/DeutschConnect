import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { useTutoring } from '../../state/TutoringContext.jsx';
import Icon from '../Icon.jsx';

/**
 * Ehrlicher Hinweis zum Datenstand der Nachhilfe:
 * Demo (nur lesen) · lädt · Backend fehlt (Migration 011) · Ladefehler.
 * Gibt null zurück, wenn echte Daten bereitstehen.
 */
export default function TutoringStatusNotice() {
  const { t } = useI18n();
  const { status, errorKey, reload } = useTutoring();
  if (status === 'ready') return null;
  if (status === 'demo') {
    return (
      <p className="notice notice--info">
        <Icon name="info" size={16} />
        <span>
          {t('tutoring.demoHint')}{' '}
          <Link to="/login" className="text-link">
            {t('tutoring.loginLink')}
          </Link>
        </span>
      </p>
    );
  }
  if (status === 'loading') {
    return (
      <p className="notice" role="status">
        <Icon name="refresh" size={16} />
        {t('tutoring.loading')}
      </p>
    );
  }
  return (
    <div className="notice notice--error" role="alert">
      <Icon name="info" size={16} />
      <div>
        <p>{t(errorKey ?? 'tutoring.errors.generic')}</p>
        {status === 'error' && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={reload}>
            {t('tutoring.retry')}
          </button>
        )}
      </div>
    </div>
  );
}
