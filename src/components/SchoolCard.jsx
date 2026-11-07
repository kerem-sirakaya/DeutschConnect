import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { projects } from '../data/projects.js';
import { isUpcoming } from '../lib/selectors.js';
import { StatusBadge } from './Badges.jsx';
import Icon from './Icon.jsx';

export default function SchoolCard({ school }) {
  const { t } = useI18n();
  const { user, events } = useAppState();
  const eventCount = events.filter((e) => e.schoolIds.includes(school.id) && isUpcoming(e)).length;
  const projectCount = projects.filter((p) => p.schoolIds.includes(school.id)).length;
  const isOwn = user.schoolId === school.id;

  return (
    <Link to={`/network/schools/${school.id}`} className="card-link school-card">
      <span className="school-mark" style={{ '--school-color': school.color }} aria-hidden="true">
        <Icon name="school" size={22} />
      </span>
      <span className="card-link__body">
        <span className="card-link__title">{school.name}</span>
        <span className="card-link__text">
          {school.city} · {t('network.eventsCount', { count: eventCount })} · {t('network.projectsCount', { count: projectCount })}
        </span>
        <span className="event-card__tags">
          <StatusBadge type="partnership" status={school.partnershipStatus} />
          {isOwn && <span className="badge badge--role">{t('common.yourSchool')}</span>}
        </span>
      </span>
      <Icon name="chevronRight" size={18} className="event-card__chevron" />
    </Link>
  );
}
