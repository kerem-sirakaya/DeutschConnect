import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import Icon from './Icon.jsx';
import { isActive } from '../data/matching.js';
import { projectParticipation } from '../data/projectParticipation.js';
import ProfileLink from './ProfileLink.jsx';

export function ideaContent(idea, t) {
  if (typeof idea.title === 'string' && typeof idea.description === 'string') return idea;
  if (idea.seedKey) return t.app.seedCode;
  if (Number.isInteger(idea.seedIndex)) {
    const sample = t.ideasPage.samples[idea.seedIndex];
    return { title: sample.title, description: sample.text };
  }
  return idea;
}

export default function IdeaCard({ idea, returnTo = '/ideas/my' }) {
  const { t } = useLanguage();
  const { profile, access } = useDemo();
  const content = ideaContent(idea, t);
  const status = projectParticipation(idea, profile.id);
  const href = `#/ideas/${idea.id}?from=${encodeURIComponent(returnTo)}`;
  return <article className="task-card idea-card">
    <span className="activity-icon idea-icon"><Icon name="bulb" size={23} /></span>
    <div className="task-copy">
      <div className="task-eyebrow"><span>{t.categories[idea.category]}</span><span>{idea.seedKey || Number.isInteger(idea.seedIndex) ? t.ext.discover.demo : t.ext.discover.student}</span>{access.mode === 'guest' && <span className="demo-tag">DEMO</span>}</div>
      <h3><a href={href}>{content.title}</a></h3>
      <p className="small-text">{status !== 'none' ? t.personal.projectStates[status] : <>{t.app.authorLabel}: <ProfileLink id={idea.ownerId} /></>}</p>
      {status === 'owner' && idea.requestedIds?.length > 0 && <span className="participation-status">{t.personal.incomingRequests}: {idea.requestedIds.length}</span>}
      {!isActive(idea) && <span className="participation-status">{idea.lifecycle === 'withdrawn' ? t.quality.lifecycleWithdrawn : t.quality.lifecycleDeleted}</span>}
    </div>
    <span className="row-arrow" aria-hidden="true"><Icon name="chevron" size={17} /></span>
  </article>;
}
