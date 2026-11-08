import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import EventCard from '../components/EventCard.jsx';
import { EmptyState, ModuleTabs, PageIntro, SearchField } from '../components/UI.jsx';
import { filterEvents, schools } from '../data/activities.js';
import { DiscoverNavigation } from '../components/ModuleNavigation.jsx';
import { myEvents, recommendedEvents } from '../data/demoState.js';
import { useRememberedState } from '../state/usePageMemory.js';

export default function Events({ mode = 'my' }) {
  const { t, language } = useLanguage();
  const { profile, participation, activities, access } = useDemo();
  const [filters, setFilters] = useRememberedState('events:' + mode, { category: 'all', school: 'all', query: '' });
  const { category, school, query } = filters;
  const change = (key, value) => setFilters({ ...filters, [key]: value });
  const source = mode === 'my' ? myEvents(profile, participation, activities) : mode === 'recommended' ? recommendedEvents(profile, participation, activities) : activities;
  const visible = filterEvents(source, { category, school, query }, t, language);
  const filtered = query || category !== 'all' || school !== 'all';
  function reset() { setFilters({ category: 'all', school: 'all', query: '' }); }

  return <>
    <PageIntro title={t.nav.events} description={t.app.eventsSubtitle} />
    <DiscoverNavigation active="events" />{access.mode === 'account' && <a className="button button-secondary module-action" href="#/events/new">{t.real.createEvent}</a>}
    <ModuleTabs label={t.nav.events} items={Object.entries(t.app.eventTabs).filter(([key]) => key !== 'my').map(([key, label]) => ({ label, href: '#/events/' + key, active: mode === key }))} />
    <a className="text-link module-action" href="#/me/activities">{t.personal.tabs.activities}</a>
    <div className="search-toolbar">
      <SearchField label={t.app.searchEvents} value={query} onChange={(value) => change('query', value)} />
      <label className="select-field"><span>{t.quality.hostSchool}</span><select value={school} onChange={(event) => change('school', event.target.value)}><option value="all">{t.app.allSchools}</option>{schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div className="filter-chips" role="group" aria-label={t.eventsPage.filterLabel}>
      {Object.entries(t.categories).filter(([key]) => key !== 'open').map(([key, label]) => <button type="button" key={key} aria-pressed={category === key} className={category === key ? 'selected' : ''} onClick={() => change('category', key)}>{label}</button>)}
    </div>
    <div className="task-grid">{visible.map((activity) => <EventCard key={activity.id} activity={activity} recommended={mode === 'recommended'} returnTo={'/events/' + mode} />)}</div>
    {!visible.length && <EmptyState text={filtered ? t.app.noResults : mode === 'my' ? t.app.emptyMyEvents : t.app.emptyRecommendations} href={!filtered && mode !== 'all' ? '#/events/all' : undefined} action={t.app.browseEvents} />}
    {filtered && <button className="text-button" type="button" onClick={reset}>{t.app.clearFilters}</button>}
  </>;
}
