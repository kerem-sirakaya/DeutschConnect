import { Suspense } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { useAppState } from '../../state/AppStateContext.jsx';
import { useIsAdmin } from '../../state/AdminStatusContext.jsx';
import { resolveAdminAccess } from '../../lib/adminAccess.js';
import { adminErrorKey } from '../../lib/adminApi.js';
import PageHeader from '../PageHeader.jsx';
import EmptyState from '../EmptyState.jsx';
import Icon from '../Icon.jsx';

/**
 * Schützt alle Seiten unter /admin – aber NUR in der Oberfläche.
 * Die echte Sicherheitsgrenze ist die Datenbank: Jede admin_*()-Funktion prüft
 * is_admin() selbst. Wer diese Komponente umgeht, bekommt trotzdem nur 42501.
 *
 * Die Admin-Seiten werden erst geladen (lazy), wenn der Zugriff erlaubt ist –
 * Schüler:innen laden den Admin-Code also gar nicht herunter.
 */
export default function AdminRoute() {
  const { mode } = useAppState();
  const admin = useIsAdmin();
  const location = useLocation();

  const access = resolveAdminAccess({
    isAuthenticated: mode === 'account',
    adminStatus: admin.status,
    isAdmin: admin.isAdmin,
  });

  if (access === 'login') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (access === 'loading') return <AdminLoading />;
  if (access === 'error') return <AdminStatusError error={admin.error} onRetry={admin.retry} />;
  if (access === 'denied') return <AdminAccessDenied />;

  return (
    <Suspense fallback={<AdminLoading />}>
      <Outlet />
    </Suspense>
  );
}

export function AdminLoading() {
  const { t } = useI18n();
  return (
    <div className="page page--narrow">
      <section className="card settings-block" role="status" aria-live="polite">
        <p>{t('admin.loading')}</p>
      </section>
    </div>
  );
}

function AdminAccessDenied() {
  const { t } = useI18n();
  return (
    <div className="page page--narrow">
      <PageHeader title={t('admin.denied.title')} />
      <EmptyState
        icon="shield"
        title={t('admin.denied.text')}
        text={t('admin.denied.hint')}
        action={
          <Link to="/" className="btn btn--primary btn--sm">
            {t('notFound.home')}
          </Link>
        }
      />
    </div>
  );
}

function AdminStatusError({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="page page--narrow">
      <PageHeader title={t('admin.statusError.title')} />
      <section className="card settings-block" role="alert">
        <p className="notice notice--error">
          <Icon name="info" size={16} />
          {t(adminErrorKey(error) ?? 'admin.errors.generic')}
        </p>
        <div className="form__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onRetry}>
            {t('admin.statusError.retry')}
          </button>
          <Link to="/" className="btn btn--secondary btn--sm">
            {t('notFound.home')}
          </Link>
        </div>
      </section>
    </div>
  );
}
