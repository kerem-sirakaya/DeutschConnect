import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { TOPICS } from '../data/topics.js';
import { filterIdeas, getMyIdeas } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import Tabs from '../components/Tabs.jsx';
import IdeaCard from '../components/IdeaCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FilterChips from '../components/FilterChips.jsx';
import SearchField from '../components/SearchField.jsx';
import Section from '../components/Section.jsx';
import Icon from '../components/Icon.jsx';

const TABS = ['discover', 'mine'];

export default function IdeasPage() {
  const { t } = useI18n();
  const { user, ideas } = useAppState();
  const [params] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'discover';
  const mine = getMyIdeas(user, ideas);

  return (
    <div className="page">
      <PageHeader
        title={t('ideas.title')}
        actions={
          <Link to="/ideas/new" className="btn btn--primary btn--sm">
            <Icon name="plus" size={18} />
            {t('ideas.newIdea')}
          </Link>
        }
      />
      <Tabs
        label={t('ideas.tabsLabel')}
        active={tab}
        tabs={[
          { id: 'discover', label: t('ideas.tabs.discover') },
          { id: 'mine', label: t('ideas.tabs.mine'), count: mine.authored.length + mine.supported.length },
        ]}
      />
      {tab === 'discover' ? <DiscoverIdeas /> : <MyIdeas mine={mine} />}
    </div>
  );
}

function DiscoverIdeas() {
  const { t } = useI18n();
  const { ideas, supportCounts, isRealAccount } = useAppState();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [sort, setSort] = useState('popular');
  const results = filterIdeas(ideas, { query, topic, sort }, supportCounts);

  // Angemeldet und noch keine (sichtbaren) echten Ideen – Demo-Ideen gibt es hier bewusst nicht.
  if (isRealAccount && ideas.length === 0) {
    return (
      <EmptyState
        icon="lightbulb"
        title={t('ideas.noRealIdeasTitle')}
        text={t('ideas.noRealIdeasText')}
        action={
          <Link to="/ideas/new" className="btn btn--primary btn--sm">
            <Icon name="plus" size={18} />
            {t('ideas.newIdea')}
          </Link>
        }
      />
    );
  }

  return (
    <div className="stack">
      <SearchField
        label={t('ideas.searchLabel')}
        placeholder={t('ideas.searchPlaceholder')}
        value={query}
        onChange={setQuery}
        clearLabel={t('common.clearSearch')}
      />
      <FilterChips
        label={t('events.filterTopic')}
        value={topic}
        onChange={setTopic}
        options={[{ value: 'all', label: t('events.all') }, ...TOPICS.map((id) => ({ value: id, label: t(`topics.${id}`) }))]}
      />
      <div className="list-header">
        <p className="result-count" role="status">
          {t('ideas.results', { count: results.length })}
        </p>
        <FilterChips
          label={t('ideas.sortLabel')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'popular', label: t('ideas.sort.popular') },
            { value: 'new', label: t('ideas.sort.new') },
          ]}
        />
      </div>

      {results.length > 0 ? (
        <div className="card-grid">
          {results.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      ) : (
        <EmptyState icon="search" title={t('ideas.noResultsTitle')} text={t('ideas.noResultsText')} />
      )}

      <p className="hint">
        <Icon name="info" size={14} />
        {t('ideas.supportHint')}
      </p>
    </div>
  );
}

function MyIdeas({ mine }) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <Section title={t('ideas.authored')} icon="lightbulb">
        {mine.authored.length > 0 ? (
          <div className="card-grid">
            {mine.authored.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="lightbulb"
            title={t('ideas.noOwnTitle')}
            text={t('ideas.noOwnText')}
            action={
              <Link to="/ideas/new" className="btn btn--primary btn--sm">
                <Icon name="plus" size={18} />
                {t('ideas.newIdea')}
              </Link>
            }
          />
        )}
      </Section>
      <Section title={t('ideas.supportedSection')} icon="heart">
        {mine.supported.length > 0 ? (
          <div className="card-grid">
            {mine.supported.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        ) : (
          <EmptyState icon="heart" title={t('ideas.noSupportedText')} />
        )}
      </Section>
    </div>
  );
}
