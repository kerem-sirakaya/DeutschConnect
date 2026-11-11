import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import LanguageSwitcher from '../LanguageSwitcher.jsx';
import Icon from '../Icon.jsx';
import ProfileMenu from '../ProfileMenu.jsx';
import AccentPicker from '../AccentPicker.jsx';
import MainNav from './MainNav.jsx';
import { useAppState } from '../../state/AppStateContext.jsx';

/**
 * Kopfleiste im Stil der Codex-Version: Marke links, auf dem Desktop die Hauptnavigation
 * in der Mitte, rechts Sprache und Profilmenü (dort auch Admin-Link und Konto).
 */
export default function TopBar() {
  const { t } = useI18n();
  const { isRealAccount } = useAppState();
  const isStaging = import.meta.env.VITE_DC_TARGET === 'staging';
  return (
    <header className={`topbar${isStaging ? ' topbar--staging' : ''}`}>
      <div className="topbar__inner">
        <Link to="/" className="topbar__brand" aria-label={`Connect/ED · ${t('nav.home')}`}>
          <span className="brand-mark" aria-hidden="true">
            <Icon name="globe" size={22} />
          </span>
          <span className="topbar__brand-text">
            Connect<span className="brand-accent">/ED</span>
          </span>
        </Link>
        <MainNav variant="top" />
        <div className="topbar__actions">
          {/* Nur bei "npm run dev:staging": deutlich zeigen, dass das Test-Projekt aktiv ist */}
          {/* Auf schmalen Handys nur „STG“ (der volle Text bleibt für Screenreader erhalten) */}
          {isStaging && (
            <span className="demo-pill demo-pill--staging" title="DeutschConnect-Staging">
              <span className="demo-pill__long">STAGING</span>
              <span className="demo-pill__short" aria-hidden="true">STG</span>
            </span>
          )}
          {/* Wie bisher: Teile der Inhalte (z. B. Projekte im Netzwerk) sind auch angemeldet noch Demo. */}
          <span className="demo-pill" title={t(isRealAccount ? 'auth.demoStillActive' : 'demo.tooltip')}>
            {t('demo.label')}
          </span>
          <AccentPicker />
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
