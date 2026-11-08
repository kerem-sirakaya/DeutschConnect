import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { myEvents, myIdeas, recommendedEvents } from '../data/demoState.js';
import HeroSection from '../components/HeroSection.jsx';
import EventCard from '../components/EventCard.jsx';
import IdeaCard from '../components/IdeaCard.jsx';
import Icon from '../components/Icon.jsx';
import { EmptyState, SectionHeading } from '../components/UI.jsx';
import { matchingTutoring } from '../data/modules.js';
import { discoverTutoring } from '../data/matching.js';
import TutoringCard from '../components/TutoringCard.jsx';

export default function Home() {
  const { t } = useLanguage();
  const { profile, participation, state, activities } = useDemo();
  const events = myEvents(profile, participation, activities);
  const ideas = myIdeas(profile, state.ideas);
  const recommendations = recommendedEvents(profile, participation, activities);
  const tutoring = matchingTutoring(profile, state.modules);
  const discovery = tutoring.length ? [] : discoverTutoring(profile, state.modules);
  const tutoringSuggestions = tutoring.length ? tutoring : discovery;
  const ownPosts = state.modules.messages.filter((message) => message.ownerId === profile.id);
  return <>
    <HeroSection />
    <div className="dashboard-grid">
      <section className="dashboard-module">
        <SectionHeading title={t.app.myEvents} href="#/me/activities" link={t.app.viewAll} />
        <div className="task-list">{events.slice(0, 2).map((activity) => <EventCard key={activity.id} activity={activity} returnTo="/" />)}</div>
        {!events.length && <EmptyState text={t.app.emptyMyEvents} href="#/events/all" action={t.app.browseEvents} />}
      </section>
      <section className="dashboard-module dashboard-ideas">
        <SectionHeading title={t.app.myIdeas} href="#/me/projects" link={t.app.viewAll} />
        <div className="task-list">{ideas.slice(0, 2).map((idea) => <IdeaCard key={idea.id} idea={idea} returnTo="/" />)}</div>
        {!ideas.length && <EmptyState icon="bulb" text={t.app.emptyMyIdeas} href="#/ideas/new" action={t.app.newIdea} />}
      </section>
      <section className="dashboard-module dashboard-recommendations">
        <SectionHeading title={t.app.forYou} href="#/events/recommended" link={t.app.viewAll} />
        <div className="task-list">{recommendations.slice(0, 2).map((activity) => <EventCard key={activity.id} activity={activity} recommended returnTo="/" />)}</div>
        {!recommendations.length && <EmptyState icon="spark" text={t.app.emptyRecommendations} href="#/me" action={t.app.preferences} />}
      </section>
      <section className="dashboard-module dashboard-tutoring"><SectionHeading title={tutoring.length ? t.ext.tutoring.matches : t.quality.discovery} description={discovery.length ? t.quality.discoveryHint : undefined} href="#/tutoring/my" link={t.ext.dashboard.myTutoring} /><div className="task-list">{tutoringSuggestions.slice(0, 2).map((record) => <TutoringCard key={record.id} record={record} returnTo="/" />)}</div>{!tutoringSuggestions.length && <EmptyState icon="bulb" text={t.ext.tutoring.empty} href="#/tutoring" action={t.app.viewAll} />}</section>
      {ownPosts.length > 0 && <section className="dashboard-module"><SectionHeading title={t.ext.dashboard.community} href="#/community/my" link={t.app.viewAll} /><div className="task-list">{ownPosts.slice(-2).map((message) => <a className="content-card text-link" href={'#/community/rooms/' + message.roomId} key={message.id}>{t.ext.roomNames[message.roomId] || state.modules.groups?.find((g)=>g.id===message.roomId)?.title || t.real.groups}<Icon name="arrow" size={16} /></a>)}</div></section>}
    </div>
  </>;
}
