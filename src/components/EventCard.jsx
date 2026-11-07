import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { formatDateLong, formatMonthShort, formatWeekdayTime } from '../lib/format.js';
import { RoleBadge, SchoolTags, StatusBadge } from './Badges.jsx';
import Icon from './Icon.jsx';

/** Kompakte Event-Zeile: Datum links, Infos in der Mitte, ganze Karte klickbar. */
export default function EventCard({ event, role, reason, ownSchoolId }) {
  const { t, language, locale } = useI18n();
  const start = new Date(event.start);
  const place = event.online ? t('events.online') : localize(event.location, language);

  return (
    <Link to={`/events/${event.id}`} className="event-card">
      <span className="date-block" aria-hidden="true">
        <span className="date-block__month">{formatMonthShort(start, locale)}</span>
        <span className="date-block__day">{start.getDate()}</span>
      </span>
      <span className="event-card__body">
        <span className="event-card__title">{localize(event.title, language)}</span>
        <span className="event-card__meta">
          <span className="visually-hidden">{formatDateLong(start, locale)}, </span>
          {formatWeekdayTime(start, locale)} · {place}
        </span>
        <span className="event-card__tags">
          <SchoolTags schoolIds={event.schoolIds} highlightId={ownSchoolId} />
          {role ? <RoleBadge role={role} /> : <StatusBadge type="event" status={event.status} />}
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
