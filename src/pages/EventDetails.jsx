import { useLanguage } from '../i18n/LanguageContext.jsx';
import { eventContent, eventDate, schools } from '../data/activities.js';
import Icon from '../components/Icon.jsx';
import ParticipationControl from '../components/ParticipationControl.jsx';
import { PageIntro } from '../components/UI.jsx';
import NotFound from './NotFound.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import ActionButton from '../components/ActionButton.jsx';
import ProfileLink from '../components/ProfileLink.jsx';
import BackLink from '../components/BackLink.jsx';

export default function EventDetails({ id, returnTo = '/events/my' }) {
  const { t, language } = useLanguage();
  const { activities, access, state, profile } = useDemo();
  const activity = activities.find((item) => item.id === id);
  if (!activity) return <NotFound />;
  const content = eventContent(activity, t);
  return <>
    <BackLink fallback={returnTo} />
    <PageIntro eyebrow={(access.mode === 'guest' ? t.example : activity.approval === 'confirmed' ? t.real.eventConfirmed : t.real.eventProposal) + ' · ' + t.categories[activity.category]} title={content.title} description={content.description} />
    <div className="details-layout">
      <article className="content-card prose">
        <div className="detail-facts">
          <p><Icon name="calendar" /><span><strong>{eventDate(activity, language, { hour: '2-digit', minute: '2-digit' })}</strong><small>{access.mode === 'guest' ? t.app.demoSchedule : t.real.eventDate} · Ankara</small></span></p>
          <p><Icon name="school" /><a className="text-link" href={'#/network/' + activity.hostSchoolId}>{schools.find((school) => school.id === activity.hostSchoolId).name}</a></p>
        </div>
        <h2>{t.eventsPage.about}</h2><p>{content.detail || content.description}</p>
        {activity.ownerId && <p>{t.app.authorLabel}: <ProfileLink id={activity.ownerId} /></p>}
        <details className="disclosure"><summary>{t.eventsPage.organization}</summary><p>{access.mode === 'guest' ? t.eventsPage.organizationText : t.real.createEventHint}</p></details>
        <p className="small-text">{access.mode === 'guest' ? t.demoNotice : activity.approval === 'confirmed' ? t.real.registrationHint : t.real.eventNotOpen}</p>
      </article>
      <ParticipationControl eventId={id} />
    </div>
    {access.mode === 'account' && activity.approval === 'confirmed' && (activity.ownerId === profile.id || profile.isModerator) && !state.modules.groups.some((g) => g.contextId === id) && <ActionButton action={{ type:'createEventGroup',eventId:id }}>{t.real.createGroup}</ActionButton>}
    {state.modules.groups?.some((g) => g.contextId === id && g.memberIds.includes(profile.id)) && <a className="button button-secondary" href={'#/community/rooms/event-'+id}>{t.real.groups}</a>}
  </>;
}
