import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getProjectRole } from '../lib/selectors.js';
import { RoleBadge, SchoolTags, StatusBadge } from './Badges.jsx';
import Icon from './Icon.jsx';

export default function ProjectCard({ project, reason }) {
  const { language } = useI18n();
  const { user } = useAppState();
  const role = getProjectRole(user, project);

  return (
    <Link to={`/network/projects/${project.id}`} className="card-link project-card">
      <span className="card-link__icon">
        <Icon name="folder" />
      </span>
      <span className="card-link__body">
        <span className="card-link__title">{localize(project.title, language)}</span>
        <span className="card-link__text">{localize(project.summary, language)}</span>
        <span className="event-card__tags">
          <SchoolTags schoolIds={project.schoolIds} highlightId={user.schoolId} />
          {role ? (
            <RoleBadge role={role === 'interested' ? 'interested' : 'member'} />
          ) : (
            <StatusBadge type="project" status={project.status} />
          )}
        </span>
        {reason && (
          <span className="event-card__reason">
            <Icon name="sparkles" size={14} />
            {reason}
          </span>
        )}
      </span>
      <Icon name="chevronRight" size={18} className="event-card__chevron" />
    </Link>
  );
}
