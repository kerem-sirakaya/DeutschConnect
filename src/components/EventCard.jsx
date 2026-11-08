import { useLanguage } from '../i18n/LanguageContext.jsx';
import Icon from './Icon.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { eventContent, eventDate } from '../data/activities.js';
import { recommendationReason } from '../data/demoState.js';

export default function EventCard({ activity, recommended = false, returnTo = '/events/my' }) {
  const { t, language } = useLanguage();
  const { profile, participation, access } = useDemo();
  const content = eventContent(activity, t);
  const status = participation[activity.id];
  const href = `#/events/${activity.id}?from=${encodeURIComponent(returnTo)}`;
  return <article className="event-card task-card">
    <span className={`activity-icon art-${activity.category}`}><Icon name={activity.icon} size={23} /></span>
    <div className="task-copy">
      <div className="task-eyebrow"><span>{t.categories[activity.category]}</span>{access.mode === 'guest' ? <span className="demo-tag">DEMO</span> : <span>{activity.approval === 'confirmed' ? t.real.eventConfirmed : t.real.eventProposal}</span>}</div>
      <h3><a href={href}>{content.title}</a></h3>
      <p className="event-meta"><span><Icon name="calendar" size={14} />{eventDate(activity, language)}</span><span>{activity.hostSchoolId === 'ers' ? 'ERS' : 'Anka Bilim'}</span></p>
      {status && <span className={`participation-status status-${status}`}><Icon name={status === 'joined' ? 'check' : 'calendar'} size={13} />{t.app.status[status]}</span>}
      {recommended && !status && <p className="recommendation-reason"><Icon name="spark" size={13} />{recommendationReason(activity, profile) === 'interest' ? t.app.interestReason : t.app.schoolReason}</p>}
    </div>
    <span className="row-arrow" aria-hidden="true"><Icon name="chevron" size={17} /></span>
  </article>;
}
