import { NavLink } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import Icon from '../Icon.jsx';
import { NAV_ITEMS } from './navigation.js';

/** Feste untere Navigation für Smartphone und Tablet (auf dem Desktop ausgeblendet). */
export default function BottomNav() {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" aria-label={t('nav.mainLabel')}>
      <ul className="bottom-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className="bottom-nav__link">
              <Icon name={item.icon} size={22} />
              <span className="bottom-nav__label">{t(item.shortKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
