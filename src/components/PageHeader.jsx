import { usePageTitle } from '../hooks/usePageTitle.js';
import BackButton from './BackButton.jsx';

/**
 * Kopfbereich jeder Seite. Unterseiten erhalten einen Zurück-Button:
 * Er geht im Verlauf zurück, wenn man aus der App kam – sonst zur Elternseite (backTo).
 */
export default function PageHeader({ title, subtitle, backTo, actions }) {
  usePageTitle(title);

  return (
    <div className="page-header">
      <BackButton fallback={backTo} />
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
