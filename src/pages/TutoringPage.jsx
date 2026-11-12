import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useTutoring } from '../state/TutoringContext.jsx';
import {
  TUTOR_FORMATS,
  TUTOR_LANGUAGES,
  TUTORING_TABS,
  countOpenIncoming,
  filterTutoringEntries,
  sortRequests,
  subjectOptions,
} from '../lib/tutoring.js';
import PageHeader from '../components/PageHeader.jsx';
import Tabs from '../components/Tabs.jsx';
import SearchField from '../components/SearchField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import TutoringCard from '../components/tutoring/TutoringCard.jsx';
import RequestCard from '../components/tutoring/RequestCard.jsx';
import TutoringStatusNotice from '../components/tutoring/TutoringStatusNotice.jsx';

const EMPTY_FILTERS = { query: '', subject: '', language: '', format: '' };

/**
 * Nachhilfe-Börse (Aufbau aus der Codex-Version): Angebote · Gesuche · Meine · Gemerkt · Kontaktanfragen.
 * Der Tab steht in der URL (?tab=), damit „Zurück“ funktioniert.
 */
export default function TutoringPage() {
  const { t, language } = useI18n();
  const [params] = useSearchParams();
  const tab = TUTORING_TABS.includes(params.get('tab')) ? params.get('tab') : 'offers';
  const { status, entries, requests, readOnly } = useTutoring();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const change = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const isGuest = status === 'guest';
  const openIncoming = countOpenIncoming(requests);

  const tabs = TUTORING_TABS.filter((id) => !isGuest || !['saved', 'contacts'].includes(id)).map((id) => ({
    id,
    label: t(`tutoring.tabs.${id}`),
    count: id === 'contacts' && openIncoming > 0 ? openIncoming : undefined,
  }));
  const visible = filterTutoringEntries(entries, tab, filters, language);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="page">
      <PageHeader
        title={t('tutoring.title')}
        subtitle={t('tutoring.subtitle')}
        actions={
          !readOnly && (
            <div className="page-header__buttons">
              <Link to="/tutoring/new?kind=request" className="btn btn--primary btn--sm">
                <Icon name="plus" size={18} />
                {t('tutoring.newRequest')}
              </Link>
              <Link to="/tutoring/new?kind=offer" className="btn btn--secondary btn--sm">
                {t('tutoring.newOffer')}
              </Link>
            </div>
          )
        }
      />
      <TutoringStatusNotice />
      <Tabs label={t('tutoring.tabsLabel')} active={tab} tabs={tabs} />

      {tab === 'contacts' ? (
        <Contacts requests={requests} />
      ) : (
        <>
          <SearchField
            label={t('tutoring.search')}
            placeholder={t('tutoring.search')}
            value={filters.query}
            onChange={(value) => change('query', value)}
            clearLabel={t('common.clearSearch')}
          />
          <div className="filter-grid">
            <label className="field">
              <span>{t('tutoring.subject')}</span>
              <select value={filters.subject} onChange={(e) => change('subject', e.target.value)}>
                <option value="">{t('tutoring.allSubjects')}</option>
                {subjectOptions(entries, language).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('tutoring.languagesLabel')}</span>
              <select value={filters.language} onChange={(e) => change('language', e.target.value)}>
                <option value="">{t('tutoring.allLanguages')}</option>
                {TUTOR_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {t(`tutoring.languages.${code}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('tutoring.formatLabel')}</span>
              <select value={filters.format} onChange={(e) => change('format', e.target.value)}>
                <option value="">{t('tutoring.allFormats')}</option>
                {TUTOR_FORMATS.map((code) => (
                  <option key={code} value={code}>
                    {t(`tutoring.formats.${code}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hasFilters && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('tutoring.clearFilters')}
            </button>
          )}

          {visible.length > 0 ? (
            <div className="card-grid">
              {visible.map((entry) => (
                <TutoringCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            status === 'ready' && (
              <EmptyState icon="lightbulb" title={t(tab === 'saved' ? 'tutoring.emptySaved' : 'tutoring.empty')} />
            )
          )}
        </>
      )}
      <p className="module-note">{t('tutoring.rulesHint')}</p>
    </div>
  );
}

function Contacts({ requests }) {
  const { t } = useI18n();
  const incoming = sortRequests(requests.filter((r) => r.direction === 'incoming'));
  const outgoing = sortRequests(requests.filter((r) => r.direction === 'outgoing'));
  return (
    <div className="stack">
      <section className="stack" aria-labelledby="incoming-title">
        <h2 id="incoming-title">{t('tutoring.incoming')}</h2>
        {incoming.length ? (
          incoming.map((request) => <RequestCard key={request.id} request={request} />)
        ) : (
          <EmptyState icon="mail" title={t('tutoring.noIncoming')} />
        )}
      </section>
      <section className="stack" aria-labelledby="outgoing-title">
        <h2 id="outgoing-title">{t('tutoring.outgoing')}</h2>
        {outgoing.length ? (
          outgoing.map((request) => <RequestCard key={request.id} request={request} />)
        ) : (
          <EmptyState icon="mail" title={t('tutoring.noOutgoing')} />
        )}
      </section>
    </div>
  );
}
