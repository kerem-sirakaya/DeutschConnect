import { tutoringContent } from '../data/modules.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import Icon from './Icon.jsx';
import { isActive } from '../data/matching.js';

export default function TutoringCard({ record, returnTo = '/tutoring' }) {
  const { t } = useLanguage();
  const { profile, access } = useDemo();
  const content = tutoringContent(record, t);
  const href = '#/tutoring/' + record.id + '?from=' + encodeURIComponent(returnTo);
  return <article className="task-card">
    <span className="activity-icon"><Icon name="bulb" size={23} /></span>
    <div className="task-copy"><div className="task-eyebrow"><span>{t.ext.tutoring[record.kind]}</span>{access.mode === 'guest' && <span className="demo-tag">DEMO</span>}</div>
      <h3><a href={href}>{content.subject} · {content.topics}</a></h3>
      <p className="small-text">{record.languages.map((key) => t.ext.languages[key]).join(' · ')} · {t.ext.formats[record.format]}</p>
      {record.ownerId === profile.id && <span className="participation-status">{t.ext.tutoring.own}</span>}
      {!isActive(record) && <span className="participation-status">{record.lifecycle === 'closed' ? t.quality.lifecycleClosed : t.quality.lifecycleDeleted}</span>}
    </div><span className="row-arrow" aria-hidden="true"><Icon name="chevron" size={17} /></span>
  </article>;
}
