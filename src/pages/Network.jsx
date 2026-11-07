import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import SchoolCard from '../components/SchoolCard.jsx';
import EventCard from '../components/EventCard.jsx';
import { EmptyState, ModuleTabs, PageIntro, SearchField, StatusBadge } from '../components/UI.jsx';
import { schools } from '../data/activities.js';
import NotFound from './NotFound.jsx';
import { DiscoverNavigation } from '../components/ModuleNavigation.jsx';
import { useRememberedState } from '../state/usePageMemory.js';

export default function Network({ section = 'directory', schoolId }) {
  const { t, language } = useLanguage();
  const { profile, activities } = useDemo();
  const [query, setQuery] = useRememberedState('schools', '');
  const school = schools.find((item) => item.id === schoolId);
  if (schoolId && !school) return <NotFound />;
  if (school) return <>
    <a className="text-link back-link" href="#/network">← {t.app.schoolDirectory}</a>
    <PageIntro eyebrow={profile.schoolId === school.id ? t.app.ownSchool : t.app.schoolProfile} title={school.name} description={t.schools[school.id].description} />
    <StatusBadge muted>{t.schools[school.id].status}</StatusBadge>
    <section className="section-block"><h2>{t.app.relatedEvents}</h2><div className="task-grid">{activities.filter((event) => event.hostSchoolId === school.id).map((activity) => <EventCard key={activity.id} activity={activity} returnTo={'/network/' + school.id} />)}</div></section>
    <a className="text-link" href="#/network/collaboration">{t.app.collaborations} →</a>
  </>;
  const visible = schools.filter((item) => (item.name + ' ' + item.city).toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)));
  return <>
    <PageIntro title={t.nav.network} />
    <DiscoverNavigation active="schools" />
    <ModuleTabs label={t.nav.network} items={[{ label: t.app.schoolDirectory, href: '#/network', active: section === 'directory' }, { label: t.app.collaborations, href: '#/network/collaboration', active: section === 'collaboration' }]} />
    {section === 'directory' ? <>
      <div className="search-toolbar"><SearchField label={t.app.searchSchools} value={query} onChange={setQuery} /></div>
      <div className="schools-grid">{visible.map((item) => <SchoolCard key={item.id} school={item} />)}</div>
      {!visible.length && <EmptyState icon="school" text={t.app.noResults} />}
    </> : <article className="content-card prose">
      <StatusBadge muted>{t.networkPage.projectStatus}</StatusBadge>
      <h2>{t.networkPage.projectTitle}</h2><p>{t.networkPage.projectText}</p>
      <details className="disclosure"><summary>{t.networkPage.nextTitle}</summary><ol className="next-steps">{t.networkPage.nextSteps.map((step, index) => <li key={index}><span>0{index + 1}</span>{step}</li>)}</ol></details>
      <p className="small-text">{t.networkPage.note}</p>
    </article>}
  </>;
}
