import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { selectPersonalArea } from '../data/personalArea.js';
import { PageIntro, EmptyState, SectionHeading } from '../components/UI.jsx';
import { useRememberedState } from '../state/usePageMemory.js';
import EventCard from '../components/EventCard.jsx';
import IdeaCard from '../components/IdeaCard.jsx';
import TutoringCard from '../components/TutoringCard.jsx';
import { MessageCard } from '../components/CommunityCards.jsx';
import Icon from '../components/Icon.jsx';
import PersonalSettings from './PersonalSettings.jsx';
import Account from './Account.jsx';
import Achievements from './Achievements.jsx';
import Moderation from './Moderation.jsx';
import BackLink from '../components/BackLink.jsx';
import ActivityStatistics from '../components/ActivityStatistics.jsx';
import ChessInvitations from '../components/ChessInvitations.jsx';


function CardList({ children, empty, href, action }) {
  return children.length ? <div className="task-list">{children}</div> : <EmptyState text={empty} href={href} action={action} icon="bulb" />;
}

export default function MyArea({ section = 'overview', view }) {
  const { t } = useLanguage();
  const { state, profile, participation, access } = useDemo();
  const model = selectPersonalArea(state, profile.id);
  const [filters, setFilters] = useRememberedState('personal:' + section, { status: 'all', projects: 'owned', tutoring: 'offers' });
  const [requestedView, setRequestedView] = useState(view);
  const selected = { ...filters };
  if (section === 'activities' && ['interested', 'joined', 'organized'].includes(requestedView)) selected.status = requestedView;
  if (section === 'projects' && ['owned', 'collaborating', 'requested', 'interested', 'completed'].includes(requestedView)) selected.projects = requestedView;
  if (section === 'tutoring' && ['offers', 'requests'].includes(requestedView)) selected.tutoring = requestedView;
  const p = t.personal;
  const contextualView = section === 'activities' ? selected.status : section === 'projects' ? selected.projects : section === 'tutoring' ? selected.tutoring : undefined;
  const personalRoute = '/me' + (section === 'overview' ? '' : '/' + section) + (contextualView ? '?view=' + contextualView : '');
  const eventCards = (events) => events.map((activity) => <EventCard key={activity.id} activity={activity} returnTo={personalRoute} />);
  const ideaCards = (ideas) => ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} returnTo={personalRoute} />);
  const tutorCards = (records) => records.map((record) => <TutoringCard key={record.id} record={record} returnTo={personalRoute} />);
  const change = (key, value) => { setRequestedView(undefined); setFilters({ ...selected, [key]: value }); };
  const activities = selected.status === 'all' ? model.events.upcoming : model.events.upcoming.filter((event) => participation[event.id] === selected.status || (selected.status === 'organized' && event.ownerId === profile.id));

  return <>
    {section !== 'overview' && <BackLink fallback="/me" />}
    <PageIntro eyebrow={p.guest + ' · ' + profile.displayName} title={section === 'overview' ? t.app.myArea : section === 'notifications' ? t.chessNotices.title : section === 'account' ? p.account.title : section === 'achievements' ? t.awards.title : section === 'moderation' ? t.real.moderation : p.tabs[section]} description={section === 'overview' ? p.subtitle : undefined} />
    {section === 'overview' && <>
      <div className="personal-identity content-card"><span className="avatar" aria-hidden="true">{profile.displayName.slice(0, 1)}</span><div><h2>{profile.displayName}</h2><p>{profile.schoolId === 'ers' ? 'Ernst-Reuter-Schule Ankara' : profile.schoolId === 'anka' ? 'Anka Bilim' : t.real.noSchool} · {p.guest}</p></div><a className="text-link" href="#/me/settings">{p.tabs.settings}<Icon name="arrow" size={16} /></a></div>
      <nav className="personal-links personal-menu" aria-label={t.app.myArea}>{['activities','projects','tutoring','saved','community','achievements','account'].map((key) => <a key={key} href={'#/me/' + key}><span>{key === 'achievements' ? t.awards.title : key === 'account' ? (access.mode === 'guest' ? t.real.signIn : t.real.account) : p.tabs[key]}</span><Icon name="chevron" size={17} /></a>)}</nav>
      <section className="section-block" aria-labelledby="personal-summary"><h2 id="personal-summary">{p.summary}</h2><ActivityStatistics counts={model.counts} /><p className="module-note">{p.statistics.hint} {access.mode === 'guest' ? p.statistics.demo : ''}</p></section>
      <div className="personal-next-grid"><section><SectionHeading title={p.nextEvent} /><CardList empty={p.noNextEvent} href="#/events/all" action={t.app.browseEvents}>{eventCards(model.events.upcoming.slice(0, 1))}</CardList></section><section><SectionHeading title={p.nextStep} /><CardList empty={p.noProjects} href="#/ideas/new" action={t.app.newIdea}>{ideaCards([...model.projects.requested, ...model.projects.owned].slice(0, 1))}</CardList></section></div>
      {profile.isModerator && <a className="text-link" href="#/me/moderation">{t.real.moderation}</a>}
    </>}
    {section === 'activities' && <>
      <div className="search-toolbar"><label className="select-field"><span>{p.activityStatus}</span><select value={selected.status} onChange={(event) => change('status', event.target.value)}><option value="all">{p.allStatuses}</option>{['interested', 'joined', 'organized'].map((key) => <option key={key} value={key}>{key === 'joined' ? p.registered : t.app.status[key]}</option>)}</select></label><a className="button button-secondary" href="#/events/all">{t.app.browseEvents}</a></div>
      <section><h2 className="personal-section-title">{p.upcoming}</h2><CardList empty={t.app.noResults}>{eventCards(activities)}</CardList></section>
      {model.events.pastDemo.length > 0 && <details className="disclosure"><summary>{p.pastDemo}</summary><div className="task-list">{eventCards(model.events.pastDemo)}</div></details>}
      <section className="content-card attendance-note"><h2>{p.attendance}</h2>{model.confirmedAttendance.length ? <div className="task-list">{eventCards(model.confirmedAttendance)}</div> : <p>{p.noAttendance}</p>}</section>
    </>}
    {section === 'projects' && <>
      <div className="search-toolbar"><label className="select-field"><span>{p.projectFilter}</span><select value={selected.projects} onChange={(event) => change('projects', event.target.value)}>{['owned', 'collaborating', 'requested', 'interested', 'completed'].map((key) => <option key={key} value={key}>{key === 'completed' ? p.profile.completed : key === 'requested' ? p.requests : p[key]}</option>)}</select></label><a className="button button-secondary" href="#/ideas/new">{t.app.newIdea}</a></div>
      <CardList empty={p.noProjects} href="#/ideas/all" action={t.app.viewAll}>{ideaCards(model.projects[selected.projects] || model.projects.owned)}</CardList><p className="module-note">{p.projectHint}</p>
    </>}
    {section === 'tutoring' && <>
      <div className="filter-chips" role="group" aria-label={p.tabs.tutoring}>{['offers', 'requests'].map((key) => <button type="button" key={key} aria-pressed={selected.tutoring === key} className={selected.tutoring === key ? 'selected' : ''} onClick={() => change('tutoring', key)}>{t.ext.tutoring[key]}</button>)}</div>
      <CardList empty={p.noTutoring}>{tutorCards(model.tutoring[selected.tutoring] || model.tutoring.offers)}</CardList><div className="form-actions"><a className="button button-secondary" href="#/tutoring/new?kind=offer">{t.ext.tutoring.newOffer}</a><a className="button button-secondary" href="#/tutoring/new?kind=request">{t.ext.tutoring.newRequest}</a><a className="text-link" href="#/tutoring/my">{t.ext.tutoring.drafts}<Icon name="arrow" size={16} /></a></div>
    </>}
    {section === 'saved' && <>
      <p className="module-note">{p.savedHint}</p>
      {model.counts.saved === 0 && <EmptyState text={p.noSaved} href="#/discover" action={t.nav.discover} />}
      {model.saved.events.length > 0 && <section className="section-block"><h2 className="personal-section-title">{p.eventInterests}</h2><div className="task-list">{eventCards(model.saved.events)}</div></section>}
      {model.saved.projects.length > 0 && <section className="section-block"><h2 className="personal-section-title">{p.interested}</h2><div className="task-list">{ideaCards(model.saved.projects)}</div></section>}
      {model.saved.tutoring.length > 0 && <section className="section-block"><h2 className="personal-section-title">{t.quality.savedTutoring}</h2><div className="task-list">{tutorCards(model.saved.tutoring)}</div></section>}
      {model.saved.initiatives.length > 0 && <section className="section-block"><h2 className="personal-section-title">{t.ext.dashboard.initiativeInterests}</h2><div className="personal-links">{model.saved.initiatives.map((item) => <a href={'#/discover/' + item.id} key={item.id}><span>{t.ext.initiatives[item.id].title}</span><Icon name="arrow" size={16} /></a>)}</div></section>}
    </>}
    {section === 'community' && <>
      <SectionHeading title={p.communityActivity} href="#/community/my" link={p.communityLink} />
      <section className="section-block"><h2 className="personal-section-title">{p.groups}</h2><CardList empty={p.noMemberships} href="#/community/projects" action={t.ext.community.projects}>{ideaCards(model.community.projectMemberships)}</CardList><p className="module-note">{p.groupsHint}</p></section>
      <section className="section-block"><h2 className="personal-section-title">{p.recentPosts}</h2><CardList empty={t.ext.community.noActivity}>{model.community.posts.slice(-3).reverse().map((message) => <MessageCard key={message.id} message={message} showRoom />)}</CardList></section><a className="text-link" href="#/community/rooms">{p.roomsLink}<Icon name="arrow" size={16} /></a>
    </>}
    {section === 'settings' && <PersonalSettings />}
    {section === 'notifications' && <ChessInvitations />}
    {section === 'achievements' && <Achievements />}
    {section === 'moderation' && <Moderation />}
    {section === 'account' && <><p className="form-notice">{access.mode === 'guest' ? p.account.guest : t.real.accountShort}</p><Account /></>}
  </>;
}
