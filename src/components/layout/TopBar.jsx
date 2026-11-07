import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import LanguageSwitcher from '../LanguageSwitcher.jsx';
import Logo from '../Logo.jsx';
import ProfileMenu from '../ProfileMenu.jsx';
import { useAppState } from '../../state/AppStateContext.jsx';

export default function TopBar() {
  const { t } = useI18n();
  const { isRealAccount } = useAppState();
  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand">
        <Logo size={28} />
        <span>DeutschConnect</span>
      </Link>
      <div className="topbar__actions">
        {/* Inhalte sind auch angemeldet noch Demo-Daten – deshalb bleibt die Markierung. */}
        <span className="demo-pill" title={t(isRealAccount ? 'auth.demoStillActive' : 'demo.tooltip')}>
          {t('demo.label')}
        </span>
        <LanguageSwitcher />
        <ProfileMenu />
      </div>
    </header>
  );
}
