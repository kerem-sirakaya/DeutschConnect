import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { HELP_SECTIONS } from '../lib/help.js';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Hilfe & FAQ (/help). Aufklappbare Fragen mit <details>/<summary>:
 * funktioniert ohne zusätzliches JavaScript, mit Tastatur (Enter/Leertaste) und Screenreader.
 */
export default function HelpPage() {
  const { t } = useI18n();
  usePageTitle(t('help.title'));

  return (
    <div className="page page--narrow">
      <PageHeader title={t('help.title')} subtitle={t('help.subtitle')} />
      <p className="muted">{t('help.intro')}</p>
      {HELP_SECTIONS.map((section) => (
        <section key={section.id} className="stack help-section" aria-labelledby={`help-${section.id}`}>
          <h2 id={`help-${section.id}`}>{t(`help.sections.${section.id}.title`)}</h2>
          <div className="faq-list">
            {section.questions.map((question) => (
              <details key={question} className="card faq-item">
                <summary className="faq-item__question">{t(`help.sections.${section.id}.${question}.q`)}</summary>
                <p className="faq-item__answer">{t(`help.sections.${section.id}.${question}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="muted">
        <Link to="/about" className="text-link">
          {t('help.more')}
        </Link>
      </p>
    </div>
  );
}
