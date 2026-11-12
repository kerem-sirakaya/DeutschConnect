import { Link } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { localize } from '../../i18n/localize.js';
import { getSchool, isHiddenSchool } from '../../data/schools.js';
import { DELETE_ACTION, canDeleteEvent, eventActionsFor } from '../../lib/adminEvents.js';
import { formatAnkaraDateTime } from '../../lib/eventForm.js';
import { StatusBadge } from '../Badges.jsx';
import Icon from '../Icon.jsx';

const BUTTON_CLASS = { primary: 'btn--primary', secondary: 'btn--secondary', danger: 'btn--danger' };

/**
 * Ein Event in der Admin-Liste. Zeigt nur Zahlen zu Anmeldungen – keine Namen.
 * `confirming` = Ziel-Status der offenen Bestätigung oder 'delete'.
 */
export default function AdminEventCard({ event, confirming, pending, errorKey, onAsk, onCancel, onConfirm }) {
  const { t, language, locale } = useI18n();
  const title = localize(event.title, language);
  const host = getSchool(event.hostSchoolId);
  const location = localize(event.location, language);
  const actions = eventActionsFor(event.status);
  const deletable = canDeleteEvent(event);
  const open =
    confirming === 'delete' ? (deletable ? DELETE_ACTION : null) : actions.find((action) => action.to === confirming) ?? null;

  return (
    <article className="card admin-idea">
      <div className="admin-idea__head">
        <h3 className="admin-idea__title">{title}</h3>
        <span className="badge-row">
          <StatusBadge type="event" status={event.status} />
          {/* Archiviert = eigener Zustand neben dem Status (Migration 008) */}
          {event.archivedAt && <span className="badge badge--muted">{t('admin.events.archived')}</span>}
        </span>
      </div>

      <ul className="admin-event__facts">
        <li>
          <Icon name="calendar" size={16} />
          <span>{t('admin.events.when', { date: formatAnkaraDateTime(event.start, locale) })}</span>
        </li>
        {/* Gastgeber nur, wenn die Schule angezeigt werden darf (ausgeblendet: src/data/schools.js) */}
        {!isHiddenSchool(event.hostSchoolId) && (
          <li>
            <Icon name="school" size={16} />
            <span>{t('admin.events.host', { school: host?.name ?? event.hostSchoolId })}</span>
          </li>
        )}
        <li>
          <Icon name="mapPin" size={16} />
          <span>{location || t('admin.events.noLocation')}</span>
        </li>
        <li>
          <Icon name={event.online ? 'video' : 'users'} size={16} />
          <span>
            {t(`formats.${event.format}`)} · {t(event.online ? 'events.online' : 'admin.events.offline')}
          </span>
        </li>
        <li>
          <Icon name="check" size={16} />
          <span>
            {t('admin.events.registered', { count: event.registeredCount })} ·{' '}
            {t('admin.events.interested', { count: event.interestedCount })} ·{' '}
            {event.capacity == null
              ? t('admin.events.noCapacity')
              : t('admin.events.capacity', { taken: event.registeredCount, capacity: event.capacity })}
          </span>
        </li>
      </ul>

      {/* Abgesagt: ursprüngliches Datum bleibt oben stehen, hier zusätzlich WANN abgesagt wurde (ab 008) */}
      {event.status === 'cancelled' && (
        <p className="notice notice--error admin-event__cancelled">
          <Icon name="close" size={16} />
          {event.cancelledAt
            ? t('admin.events.cancelledOn', { date: formatAnkaraDateTime(event.cancelledAt, locale) })
            : t('admin.events.cancelledNote')}
        </p>
      )}

      {event.archivedAt && (
        <p className="hint">
          <Icon name="folder" size={14} />
          {t('admin.events.archivedHint', { date: formatAnkaraDateTime(event.archivedAt, locale) })}
        </p>
      )}

      {event.status === 'draft' && (
        <p className="hint">
          <Icon name="info" size={14} />
          {t('admin.events.draftHint')}
        </p>
      )}

      {errorKey && (
        <p className="notice notice--error" role="alert">
          <Icon name="info" size={16} />
          {t(errorKey)}
        </p>
      )}

      {open ? (
        <div className={`confirm${open.tone === 'danger' ? '' : ' confirm--neutral'}`} role="group" aria-label={t(open.labelKey)}>
          <p>{t(open.confirmKey, { title })}</p>
          <div className="confirm__actions">
            <button
              type="button"
              className={`btn btn--sm ${BUTTON_CLASS[open.tone]}`}
              onClick={() => onConfirm(event.id, open === DELETE_ACTION ? 'delete' : open.to)}
              disabled={pending}
            >
              {pending ? t('admin.saving') : t(open.labelKey)}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={pending}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-idea__actions" role="group" aria-label={t('admin.actionsLabel', { title })}>
          <Link to={`/admin/events/${event.id}/edit`} className="btn btn--ghost btn--sm">
            {t('admin.events.actions.edit')}
          </Link>
          {actions.map((action) => (
            <button
              key={action.to}
              type="button"
              className={`btn btn--sm ${BUTTON_CLASS[action.tone]}`}
              onClick={() => onAsk(event.id, action.to)}
              disabled={pending}
            >
              {t(action.labelKey)}
            </button>
          ))}
          {deletable && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAsk(event.id, 'delete')} disabled={pending}>
              <Icon name="trash" size={16} />
              {t(DELETE_ACTION.labelKey)}
            </button>
          )}
        </div>
      )}
      {actions.length === 0 && (
        <p className="hint">
          <Icon name="check" size={14} />
          {t('admin.events.final')}
        </p>
      )}
    </article>
  );
}
