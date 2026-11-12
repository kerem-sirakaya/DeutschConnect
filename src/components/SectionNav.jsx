import { Link, useLocation } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';

// Unterbereiche eines Hauptbereichs (Muster „ModuleNavigation“ aus der Codex-Version).
// Zeigt auf jeder Unterseite, wo man sich gerade befindet.
export const SECTION_LINKS = {
  discover: [
    { to: '/discover', labelKey: 'discover.overview', exact: true },
    { to: '/events', labelKey: 'nav.events' },
    { to: '/ideas', labelKey: 'nav.ideas' },
  ],
};

export default function SectionNav({ section }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const links = SECTION_LINKS[section] ?? [];
  const isActive = (link) => (link.exact ? pathname === link.to : pathname === link.to || pathname.startsWith(`${link.to}/`));

  return (
    <nav className="section-nav" aria-label={t(`nav.${section}`)}>
      {links.map((link) => (
        <Link key={link.to} to={link.to} className="section-nav__link" aria-current={isActive(link) ? 'page' : undefined}>
          {t(link.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
