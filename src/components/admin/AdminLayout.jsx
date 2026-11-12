import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { AdminLoading } from './AdminRoute.jsx';

const ADMIN_NAV = [
  { to: '/admin', labelKey: 'admin.nav.overview', end: true },
  { to: '/admin/events', labelKey: 'admin.nav.events' },
  { to: '/admin/ideas', labelKey: 'admin.nav.ideas' },
  // Chat-Moderation liegt unter /chat/moderation (auch für Moderator:innen ohne Admin-Rolle)
  { to: '/chat/moderation', labelKey: 'admin.nav.chat' },
];

/**
 * Rahmen für alle Admin-Seiten: Kennzeichnung "Admin-Bereich" + eigene Unter-Navigation.
 * Liegt innerhalb der normalen AppShell (Kopfleiste, Haupt-Navigation bleiben),
 * nutzt die bestehenden Klassen (page, tabs, badge) – kein eigenes CSS nötig.
 */
export default function AdminLayout() {
  const { t } = useI18n();
  return (
    <div className="page">
      <p>
        <span className="badge badge--warning">{t('admin.badge')}</span>
      </p>
      {/* NavLink setzt aria-current="page" selbst – das nutzt die bestehende .tabs-Gestaltung */}
      <nav className="tabs" aria-label={t('admin.navLabel')}>
        {ADMIN_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="tabs__item">
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<AdminLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
