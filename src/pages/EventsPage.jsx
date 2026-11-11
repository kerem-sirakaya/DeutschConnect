import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
// Schul-Filter: nur sichtbare Schulen (ausgeblendete: src/data/schools.js → HIDDEN_SCHOOL_IDS)
import { visibleSchools as schools } from '../data/schools.js';
import { EVENT_FORMATS, TOPICS } from '../data/topics.js';
import {
  EVENT_STATUS_FILTERS,
  countEventsByStatusFilter,
  filterEvents,
  getEventRecommendations,
  getEventRole,
  getMyEvents,
} from '../lib/selectors.js';
import { describeMatch } from '../lib/reasons.js';
import PageHeader from '../components/PageHeader.jsx';
import SectionNav from '../components/SectionNav.jsx';
import Tabs from '../components/Tabs.jsx';
import EventCard from '../components/EventCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FilterChips from '../components/FilterChips.jsx';
import SearchField from '../components/SearchField.jsx';
import Icon from '../components/Icon.jsx';

const TABS = ['mine', 'foryou', 'all'];

export default function EventsPage() {
  const { t } = useI18n();
  const { user, events } = useAppState();
  const [params] = useSearchParams();
  const [now] = useState(() => new Date());
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'mine';

  const mine = getMyEvents(user, events, now);
  const recommendations = getEventRecommendations(user, events, now);

  return (
    <div className="page">
      <PageHeader title={t('events.title')} />
      <SectionNav section="discover" />
      <Tabs
        label={t('events.tabsLabel')}
        active={tab}
        tabs={[
          { id: 'mine', label: t('events.tabs.mine'), count: mine.upcoming.length },
          { id: 'foryou', label: t('events.tabs.foryou'), count: recommendations.length },
          { id: 'all', label: t('events.tabs.all') },
        ]}
      />
      {events.length === 0 ? (
        // Angemeldet und noch keine echten Events in der Datenbank (Demo-Events gibt es hier bewusst nicht).
        <EmptyState icon="calendar" title={t('events.noRealEventsTitle')} text={t('events.noRealEventsText')} />
      ) : (
        <>
          {tab === 'mine' && <MyEvents mine={mine} />}
          {tab === 'foryou' && <ForYou recommendations={recommendations} />}
          {tab === 'all' && <AllEvents now={now} />}
        </>
      )}
    </div>
  );
}

function MyEvents({ mine }) {
  const { t } = useI18n();
  const { user } = useAppState();
  const [roleFilter, setRoleFilter] = useState('all');
  const visible = mine.upcoming.filter((e) => roleFilter === 'all' || getEventRole(user, e) === roleFilter);

  return (
    <div className="stack">
      {mine.upcoming.length > 0 && (
        <FilterChips
          label={t('events.roleFilterLabel')}
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: 'all', label: t('events.all') },
            { value: 'registered', label: t('roles.registered') },
            { value: 'interested', label: t('roles.interested') },
            { value: 'organizer', label: t('roles.organizer') },
          ]}
        />
      )}

      {visible.length > 0 ? (
        <div className="card-list">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} role={getEventRole(user, event)} ownSchoolId={user.schoolId} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="calendar"
          title={t('events.mineEmptyTitle')}
          text={t('events.mineEmptyText')}
          action={
            <Link to="?tab=all" replace className="btn btn--secondary btn--sm">
              {t('quick.discover')}
            </Link>
          }
        />
      )}

      {mine.past.length > 0 && (
        <details className="disclosure">
          <summary>
            <Icon name="chevronDown" size={18} className="disclosure__chevron" />
            {t('events.past', { count: mine.past.length })}
          </summary>
          <div className="card-list">
            {mine.past.map((event) => (
              <EventCard key={event.id} event={event} role={getEventRole(user, event)} ownSchoolId={user.schoolId} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ForYou({ recommendations }) {
  const { t } = useI18n();
  const { user } = useAppState();
  const interestNames = user.interests.map((id) => t(`topics.${id}`)).join(', ');

  return (
    <div className="stack">
      <p className="context-line">
        <Icon name="sparkles" size={16} />
        <span>
          {user.interests.length ? t('recommend.basedOn', { topics: interestNames }) : t('recommend.noInterests')}{' '}
          <Link to="/me/interests">{t('recommend.editInterests')}</Link>
        </span>
      </p>
      {recommendations.length > 0 ? (
        <div className="card-list">
          {recommendations.map((rec) => (
            <EventCard key={rec.event.id} event={rec.event} reason={describeMatch(rec, t)} ownSchoolId={user.schoolId} />
          ))}
        </div>
      ) : (
        <EmptyState icon="sparkles" title={t('home.noRecsTitle')} text={t('home.noRecsText')} />
      )}
    </div>
  );
}

const FILTER_DEFAULTS = { q: '', time: 'upcoming', school: 'all', topic: 'all', format: 'all', status: 'all' };

// Feste Schlüssel, damit der i18n-Test jeden Text findet
const STATUS_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'events.statusFilter.all' },
  { value: 'scheduled', labelKey: 'events.statusFilter.scheduled' },
  { value: 'cancelled', labelKey: 'events.statusFilter.cancelled' },
];

function AllEvents({ now }) {
  const { t } = useI18n();
  const { user, events } = useAppState();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filter stehen in der URL – so bleiben sie beim Zurück-Navigieren erhalten.
  const filters = Object.fromEntries(
    Object.entries(FILTER_DEFAULTS).map(([key, fallback]) => [key, params.get(key) ?? fallback]),
  );
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === FILTER_DEFAULTS[key]) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const resetFilters = () => {
    const next = new URLSearchParams();
    next.set('tab', 'all');
    setParams(next, { replace: true });
  };
  const activeFilterCount = ['time', 'school', 'topic', 'format'].filter(
    (key) => filters[key] !== FILTER_DEFAULTS[key],
  ).length;

  const status = EVENT_STATUS_FILTERS.includes(filters.status) ? filters.status : 'all';
  const baseFilters = { query: filters.q, timeframe: filters.time, schoolId: filters.school, topic: filters.topic, format: filters.format };
  const results = filterEvents(events, { ...baseFilters, status }, now);
  // Zahlen je Status – mit denselben übrigen Filtern, aus den für Schüler:innen sichtbaren Events
  const statusCounts = countEventsByStatusFilter(events, baseFilters, now);

  const all = { value: 'all', label: t('events.all') };

  return (
    <div className="stack">
      <div className="toolbar">
        <SearchField
          label={t('events.searchLabel')}
          placeholder={t('events.searchPlaceholder')}
          value={filters.q}
          onChange={(value) => setFilter('q', value)}
          clearLabel={t('common.clearSearch')}
        />
        <button
          type="button"
          className={`btn btn--secondary toolbar__filter${activeFilterCount ? ' has-active' : ''}`}
          aria-expanded={filtersOpen}
          aria-controls="event-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Icon name="sliders" size={18} />
          <span>{activeFilterCount ? t('events.filtersActive', { count: activeFilterCount }) : t('events.filters')}</span>
        </button>
      </div>

      {/* Status: Alle | Geplant (planned + confirmed) | Abgesagt – Wechsel ohne Neuladen (?status=…) */}
      <div className="tabs tabs--status" role="group" aria-label={t('events.statusFilter.label')}>
        {STATUS_FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`tabs__item tabs__item--${option.value}`}
            aria-pressed={status === option.value}
            onClick={() => setFilter('status', option.value)}
          >
            <span>{t(option.labelKey)}</span>
            <span className="tabs__count">{statusCounts[option.value]}</span>
          </button>
        ))}
      </div>

      <FilterChips
        label={t('events.filterTime')}
        value={filters.time}
        onChange={(value) => setFilter('time', value)}
        options={['upcoming', 'week', 'month', 'past'].map((value) => ({ value, label: t(`events.time.${value}`) }))}
      />

      {filtersOpen && (
        <div id="event-filters" className="filter-panel">
          <FilterChips
            showLabel
            label={t('events.filterSchool')}
            value={filters.school}
            onChange={(value) => setFilter('school', value)}
            options={[all, ...schools.map((s) => ({ value: s.id, label: s.shortName }))]}
          />
          <FilterChips
            showLabel
            label={t('events.filterTopic')}
            value={filters.topic}
            onChange={(value) => setFilter('topic', value)}
            options={[all, ...TOPICS.map((id) => ({ value: id, label: t(`topics.${id}`) }))]}
          />
          <FilterChips
            showLabel
            label={t('events.filterFormat')}
            value={filters.format}
            onChange={(value) => setFilter('format', value)}
            options={[all, ...EVENT_FORMATS.map((id) => ({ value: id, label: t(`formats.${id}`) }))]}
          />
          {activeFilterCount > 0 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters}>
              <Icon name="refresh" size={16} />
              {t('events.resetFilters')}
            </button>
          )}
        </div>
      )}

      <p className="result-count" role="status">
        {t('events.results', { count: results.length })}
      </p>

      {results.length > 0 ? (
        <div className="card-list">
          {results.map((event) => (
            <EventCard key={event.id} event={event} role={getEventRole(user, event)} ownSchoolId={user.schoolId} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="search"
          title={t(status === 'cancelled' ? 'events.noCancelledTitle' : 'events.noResultsTitle')}
          text={t(status === 'cancelled' ? 'events.noCancelledText' : 'events.noResultsText')}
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={resetFilters}>
              {t('events.resetFilters')}
            </button>
          }
        />
      )}
    </div>
  );
}
