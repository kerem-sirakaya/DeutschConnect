import { useLanguage } from '../i18n/LanguageContext.jsx';
import { safeReturnTo } from '../data/navigation.js';

export default function BackLink({ fallback }) {
  const { t } = useLanguage();
  return <a className="text-link back-link" href={'#' + (safeReturnTo(fallback) || '/')} onClick={(event) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (window.history.state?.dcPrevious) { event.preventDefault(); window.history.back(); }
  }}>← {t.app.back}</a>;
}
