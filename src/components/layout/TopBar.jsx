import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import LanguageSwitcher from '../LanguageSwitcher.jsx';
import Icon from '../Icon.jsx';
import ProfileMenu from '../ProfileMenu.jsx';
import MainNav from './MainNav.jsx';
import { useAppState } from '../../state/AppStateContext.jsx';

/**
 * Kopfleiste im Stil der Codex-Version: Marke links, auf dem Desktop die Hauptnavigation
 * in der Mitte, rechts Sprache und Profilmenü (dort auch Admin-Link und Konto).
 */
export default function TopBar() {
  const { t } = useI18n();
  const { isRealAccount } = useAppState();
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="topbar__brand" aria-label={`DeutschConnect · ${t('nav.home')}`}>
          <span className="brand-mark" aria-hidden="true">
            <Icon name="globe" size={22} />
          </span>
          <span className="topbar__brand-text">
            Deutsch<span className="brand-accent">Connect</span>
          </span>
        </Link>
        <MainNav variant="top" />
        <div className="topbar__actions">
          {/* Wie bisher: Teile der Inhalte (z. B. Projekte im Netzwerk) sind auch angemeldet noch Demo. */}
          <span className="demo-pill" title={t(isRealAccount ? 'auth.demoStillActive' : 'demo.tooltip')}>
            {t('demo.label')}
          </span>
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
