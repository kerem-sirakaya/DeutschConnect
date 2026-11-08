import { useLanguage } from '../i18n/LanguageContext.jsx';
import { StatusBadge } from './UI.jsx';
import Icon from './Icon.jsx';
import { useDemo } from '../state/DemoContext.jsx';

export default function SchoolCard({ school, compact = false }) {
  const { t } = useLanguage();
  const { profile } = useDemo();
  return <article className={`school-card ${compact ? 'school-compact' : ''}`}>
    <div className={`school-initials school-${school.id}`}>{school.initials}</div>
    <div className="school-copy"><h3><a href={'#/network/' + school.id}>{school.name}</a></h3><p><Icon name="pin" size={14} />{school.city}{profile.schoolId === school.id && <span> · {t.app.ownSchool}</span>}</p>{!compact && <p className="school-description">{t.schools[school.id].description}</p>}</div>
    <StatusBadge muted={school.id === 'anka'}>{t.schools[school.id].status}</StatusBadge>
  </article>;
}
