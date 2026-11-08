import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { formatDateLong, formatMonthShort, formatWeekdayTime } from '../lib/format.js';
import { formatAnkaraDateTime } from '../lib/eventForm.js';
import { RoleBadge, SchoolTags, StatusBadge } from './Badges.jsx';
import Icon from './Icon.jsx';

/**
 * Kompakte Event-Zeile: Datum links, Infos in der Mitte, ganze Karte klickbar.
 *
 * Zwei GETRENNTE Angaben:
 *   * Event-Status (aus der Datenbank): Geplant / Bestätigt / Abgesagt / Abgeschlossen – immer sichtbar
 *   * eigene Teilnahme (role): Angemeldet / Interessiert / Organisierst du – nur wenn vorhanden
 * Abgesagte Events sehen nie wie normale bevorstehende Events aus: rote Markierung + Hinweis.
 */
export default function EventCard({ event, role, reason, ownSchoolId }) {
  const { t, language, locale } = useI18n();
  const start = new Date(event.start);
  const place = event.online ? t('events.online') : localize(event.location, language);
  const cancelled = event.status === 'cancelled';

  return (
    <Link to={`/events/${event.id}`} className={`event-card${cancelled ? ' event-card--cancelled' : ''}`}>
      <span className="date-block" aria-hidden="true">
        <span className="date-block__month">{formatMonthShort(start, locale)}</span>
        <span className="date-block__day">{start.getDate()}</span>
      </span>
      <span className="event-card__body">
        <span className="event-card__title">{localize(event.title, language)}</span>
        {/* Ursprüngliches Datum bleibt sichtbar – auch bei Absage */}
        <span className="event-card__meta">
          <span className="visually-hidden">{formatDateLong(start, locale)}, </span>
          {formatWeekdayTime(start, locale)} · {place}
        </span>
        <span className="event-card__tags">
          <SchoolTags schoolIds={event.schoolIds} highlightId={ownSchoolId} />
          <span className="event-card__state">
            {role && <span className="event-card__state-label">{t('events.card.eventStatus')}</span>}
            <span className="visually-hidden">{t('events.card.eventStatusSr')} </span>
            <StatusBadge type="event" status={event.status} />
          </span>
          {role && (
            <span className="event-card__state">
              <span className="event-card__state-label">{t('events.card.yourStatus')}</span>
              <span className="visually-hidden">{t('events.card.yourStatusSr')} </span>
              <RoleBadge role={role} />
            </span>
          )}
        </span>
        {cancelled && (
          <span className="event-card__cancelled">
            <Icon name="close" size={14} />
            {event.cancelledAt
              ? t('events.card.cancelledOn', { date: formatAnkaraDateTime(event.cancelledAt, locale) })
              : t('events.card.cancelled')}
          </span>
        )}
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
