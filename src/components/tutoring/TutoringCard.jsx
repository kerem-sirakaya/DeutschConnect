import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { getSchool, isHiddenSchool } from '../../data/schools.js';
import { entryText } from '../../lib/tutoring.js';
import Icon from '../Icon.jsx';
import { DemoBadge } from '../Badges.jsx';

/** Karte eines Nachhilfeeintrags (Aufbau wie die Codex-„task-card“). */
export default function TutoringCard({ entry }) {
  const { t, language } = useI18n();
  const school = getSchool(entry.schoolId);
  return (
    <Link to={`/tutoring/${entry.id}`} className="task-card">
      <span className={`task-card__icon task-card__icon--${entry.kind}`} aria-hidden="true">
        <Icon name="lightbulb" size={22} />
      </span>
      <span className="task-card__body">
        <span className="task-card__eyebrow">
          <span>{t(`tutoring.kind.${entry.kind}`)}</span>
          {/* ausgeblendete Schule (src/data/schools.js): weder Name noch ID anzeigen */}
          {!isHiddenSchool(entry.schoolId) && <span>{school?.shortName ?? entry.schoolId}</span>}
          {entry.isDemo && <DemoBadge />}
        </span>
        <span className="task-card__title">
          {entryText(entry, 'subject', language)} · {entryText(entry, 'topics', language)}
        </span>
        <span className="task-card__meta">
          {entry.languages.map((code) => t(`tutoring.languages.${code}`)).join(' · ')} · {t(`tutoring.formats.${entry.format}`)}
        </span>
        <span className="task-card__tags">
          {entry.isOwn && <span className="badge badge--info">{t('tutoring.own')}</span>}
          {entry.status === 'closed' && <span className="badge badge--muted">{t('tutoring.closed')}</span>}
          {entry.isSaved && <span className="badge badge--neutral">{t('tutoring.saved')}</span>}
          {entry.myRequestStatus && (
            <span className="badge badge--neutral">{t(`tutoring.requestStatus.${entry.myRequestStatus}`)}</span>
          )}
          {entry.isOwn && entry.incomingPending > 0 && (
            <span className="badge badge--warning">{t('tutoring.openRequests', { count: entry.incomingPending })}</span>
          )}
        </span>
      </span>
      <Icon name="chevronRight" size={17} />
    </Link>
  );
}
