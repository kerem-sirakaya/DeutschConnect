import { useLocation, useNavigate } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { backFallbackForPath, hasAppHistory } from './layout/navigation.js';
import Icon from './Icon.jsx';

/** Gemeinsamer Rückweg für Seitenköpfe sowie Lade-, Fehler- und Anmeldeansichten. */
export default function BackButton({ fallback }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const target = fallback ?? backFallbackForPath(pathname);
  if (!target) return null;

  function goBack() {
    // BrowserRouter zählt nur App-Navigationen. REPLACE (z. B. alte Spiele-Links)
    // erzeugt zwar einen neuen location.key, aber keinen vorherigen App-Eintrag.
    if (hasAppHistory(window.history.state)) navigate(-1);
    else navigate(target, { replace: true });
  }

  return (
    <button type="button" className="btn btn--secondary back-button" onClick={goBack}>
      <Icon name="chevronLeft" size={20} />
      <span>{t('common.back')}</span>
    </button>
  );
}
