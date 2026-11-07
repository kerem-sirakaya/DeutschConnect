import { Link, NavLink } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { useAppState } from '../../state/AppStateContext.jsx';
import Avatar from '../Avatar.jsx';
import Icon from '../Icon.jsx';
import Logo from '../Logo.jsx';
import { NAV_ITEMS } from './navigation.js';

/** Seitenleiste für große Bildschirme (ab 960 px). */
export default function SideNav() {
  const { t } = useI18n();
  const { user, isRealAccount } = useAppState();

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar__brand">
        <Logo size={32} />
        <span>DeutschConnect</span>
      </Link>

      <nav aria-label={t('nav.mainLabel')}>
        <ul className="sidebar__list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className="sidebar__link">
                <Icon name={item.icon} size={20} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <NavLink to="/about" className="sidebar__link sidebar__link--small">
          <Icon name="info" size={18} />
          <span>{t('nav.about')}</span>
        </NavLink>
        <Link to="/me" className="sidebar__profile">
          <Avatar profile={user} size="sm" />
          <span className="sidebar__profile-text">
            <span className="sidebar__profile-name">
              {user.firstName} {user.lastName}
            </span>
            <span className="sidebar__profile-meta">
              {user.school.shortName} · {t(isRealAccount ? 'profile.realAccount' : 'profile.demoProfile')}
            </span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
