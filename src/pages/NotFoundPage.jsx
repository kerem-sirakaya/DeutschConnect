import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';

/** Wird für unbekannte Adressen und nicht gefundene Events/Ideen/Schulen genutzt. */
export default function NotFoundPage({ titleKey = 'notFound.title', backTo }) {
  const { t } = useI18n();
  return (
    <div className="page page--narrow">
      <PageHeader title={t(titleKey)} backTo={backTo} />
      <EmptyState
        icon="search"
        title={t('notFound.text')}
        action={
          <Link to="/" className="btn btn--primary btn--sm">
            {t('notFound.home')}
          </Link>
        }
      />
    </div>
  );
}
