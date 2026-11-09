import { Link, useLocation } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import Icon from '../Icon.jsx';
import { NAV_ITEMS, sectionForPath } from './navigation.js';

/**
 * Hauptnavigation mit den fünf Bereichen.
 * variant="bottom": schwebende Leiste unten (Smartphone/Tablet)
 * variant="top":    in der Kopfleiste (Desktop ab 1050 px)
 * Der aktive Bereich wird aus der URL abgeleitet (sectionForPath), nicht nur aus dem exakten Pfad.
 */
export default function MainNav({ variant = 'bottom' }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const active = sectionForPath(pathname);

  return (
    <nav className={`main-nav main-nav--${variant}`} aria-label={t('nav.mainLabel')}>
      <ul className="main-nav__list">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                className={`main-nav__link${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon name={item.icon} size={variant === 'top' ? 18 : 21} />
                <span className="main-nav__label">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
