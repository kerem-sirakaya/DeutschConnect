import { useI18n } from '../i18n/LanguageContext.jsx';
import { getSchool } from '../data/schools.js';
import Icon from './Icon.jsx';

const STATUS_TONES = {
  event: { planned: 'neutral', confirmed: 'success', completed: 'muted', cancelled: 'danger' },
  idea: { submitted: 'info', collecting: 'info', review: 'warning', planned: 'success' },
  project: { active: 'success', planning: 'neutral' },
  partnership: { initiator: 'info', interest: 'warning', confirmed: 'success' },
};

export function StatusBadge({ type, status }) {
  const { t } = useI18n();
  const tone = STATUS_TONES[type]?.[status] ?? 'neutral';
  return <span className={`badge badge--${tone}`}>{t(`status.${type}.${status}`)}</span>;
}

const ROLE_ICONS = { organizer: 'users', registered: 'check', interested: 'star', member: 'users' };

/** Persönliche Rolle: angemeldet, interessiert, Organisator:in, Mitglied */
export function RoleBadge({ role }) {
  const { t } = useI18n();
  if (!role) return null;
  return (
    <span className={`badge badge--role badge--role-${role}`}>
      <Icon name={ROLE_ICONS[role] ?? 'check'} size={13} />
      {t(`roles.${role}`)}
    </span>
  );
}

export function DemoBadge({ labelKey = 'demo.example' }) {
  const { t } = useI18n();
  return <span className="badge badge--demo">{t(labelKey)}</span>;
}

export function SchoolTags({ schoolIds, highlightId }) {
  const { t } = useI18n();
  return (
    <span className="school-tags">
      {schoolIds.map((id) => {
        const school = getSchool(id);
        if (!school) return null;
        const isOwn = id === highlightId;
        return (
          <span
            key={id}
            className={`school-tag${isOwn ? ' school-tag--own' : ''}`}
            style={{ '--school-color': school.color }}
            title={isOwn ? `${school.name} (${t('common.yourSchool')})` : school.name}
          >
            {school.shortName}
          </span>
        );
      })}
    </span>
  );
}

export function TopicTags({ topics, highlight = [] }) {
  const { t } = useI18n();
  return (
    <ul className="topic-tags">
      {topics.map((topic) => (
        <li key={topic} className={`topic-tag${highlight.includes(topic) ? ' topic-tag--match' : ''}`}>
          {t(`topics.${topic}`)}
        </li>
      ))}
    </ul>
  );
}
