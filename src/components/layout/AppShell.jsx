import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import BottomNav from './BottomNav.jsx';
import SideNav from './SideNav.jsx';
import TopBar from './TopBar.jsx';

/**
 * Grundgerüst der App: Kopfleiste, Inhalt, Navigation.
 * Smartphone/Tablet: Bottom-Navigation · Desktop: Seitenleiste links.
 */
export default function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const isFirstRender = useRef(true);

  // Bei Seitenwechsel nach oben scrollen und den Fokus auf die Überschrift setzen
  // (wichtig für Tastatur- und Screenreader-Nutzung).
  useEffect(() => {
    window.scrollTo(0, 0);
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t('common.skipToContent')}
      </a>
      <SideNav />
      <div className="app__body">
        <TopBar />
        <main id="main" ref={mainRef} className="app__main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
