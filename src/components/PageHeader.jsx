import { useLocation, useNavigate } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import Icon from './Icon.jsx';

/**
 * Kopfbereich jeder Seite. Unterseiten erhalten einen Zurück-Button:
 * Er geht im Verlauf zurück, wenn man aus der App kam – sonst zur Elternseite (backTo).
 */
export default function PageHeader({ title, subtitle, backTo, actions }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  usePageTitle(title);

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(backTo);
  };

  return (
    <div className="page-header">
      {backTo && (
        <button type="button" className="back-button" onClick={goBack}>
          <Icon name="chevronLeft" size={18} />
          <span>{t('common.back')}</span>
        </button>
      )}
      <div className="page-header__row">
        <div className="page-header__text">
          <h1 tabIndex={-1}>{title}</h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </div>
  );
}
