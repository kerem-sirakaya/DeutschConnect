import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { TOPICS } from '../data/topics.js';
import { getEventRecommendations } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import FilterChips from '../components/FilterChips.jsx';
import Icon from '../components/Icon.jsx';

/** Interessen bearbeiten – wirkt sofort auf alle Empfehlungen. */
export default function InterestsPage() {
  const { t } = useI18n();
  const { user, actions, events, isRealAccount } = useAppState();
  const { interestsSaveError } = useAuth();
  const matching = getEventRecommendations(user, events).length;

  return (
    <div className="page page--narrow">
      <PageHeader title={t('interests.title')} subtitle={t('interests.intro')} backTo="/me" />

      <div className="card stack">
        {isRealAccount && interestsSaveError && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t('auth.errors.interestsSave')}
          </p>
        )}
        <FilterChips
          wrap
          multiple
          label={t('interests.groupLabel')}
          value={user.interests}
          onChange={actions.toggleInterest}
          options={TOPICS.map((id) => ({ value: id, label: t(`topics.${id}`) }))}
        />
        <p className="context-line" role="status">
          <Icon name="sparkles" size={16} />
          <span>{t('interests.matching', { count: matching })}</span>
        </p>
        {isRealAccount && (
          <p className="hint">
            <Icon name="check" size={14} />
            {t('interests.savedToAccount')}
          </p>
        )}
        <Link to="/events?tab=foryou" className="btn btn--primary">
          {t('interests.showRecs')}
          <Icon name="arrowRight" size={18} />
        </Link>
      </div>
    </div>
  );
}
