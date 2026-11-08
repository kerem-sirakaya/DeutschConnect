import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getSchool } from '../data/schools.js';
import { getEventRole, isPast } from '../lib/selectors.js';
import { daysUntil, addMinutes } from '../lib/dates.js';
import { formatDateLong, formatRelativeDays, formatTime } from '../lib/format.js';
import { formatAnkaraDateTime } from '../lib/eventForm.js';
import PageHeader from '../components/PageHeader.jsx';
import InfoList from '../components/InfoList.jsx';
import Icon from '../components/Icon.jsx';
import { DemoBadge, RoleBadge, StatusBadge, TopicTags } from '../components/Badges.jsx';
import NotFoundPage from './NotFoundPage.jsx';

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { t, language, locale } = useI18n();
  const { user, actions, getEvent, isRealAccount, registrationSync } = useAppState();
  const [now] = useState(() => new Date());
  const event = getEvent(eventId);

  if (!event) return <NotFoundPage titleKey="eventDetail.notFound" backTo="/events" />;

  const role = getEventRole(user, event);
  const past = isPast(event, now);
  const cancelled = event.status === 'cancelled';
  const start = new Date(event.start);
  // Echte Events dürfen ohne Dauer eingetragen sein – dann nur die Startzeit zeigen.
  const end = event.durationMinutes ? addMinutes(start, event.durationMinutes) : null;
  const host = getSchool(event.hostSchoolId);
  const days = daysUntil(start, now);
  // Datenbank-Regel: NEUE Anmeldungen nur, solange das Event noch nicht begonnen hat
  // und geplant/bestätigt ist. Bestehende Einträge darf man trotzdem entfernen.
  const closedForNew = isRealAccount && !role && (start <= now || !['planned', 'confirmed'].includes(event.status));
  const saving = Boolean(registrationSync.pending[event.id]);
  const saveError = registrationSync.error?.eventId === event.id ? registrationSync.error.key : null;

  // Schule nicht in src/data/schools.js (z. B. neu in der Datenbank)? Dann nur die ID ohne Link.
  const schoolLink = (id) => {
    const school = getSchool(id);
    return school ? <Link to={`/network/schools/${id}`}>{school.name}</Link> : <span>{id}</span>;
  };

  const schoolLinks = event.schoolIds.map((id, index) => (
    <span key={id}>
      {index > 0 && ', '}
      {schoolLink(id)}
      {id === user.schoolId && <span className="muted"> ({t('common.yourSchool')})</span>}
    </span>
  ));

  const participationText = {
    registered: t('eventDetail.state.registered'),
    interested: t('eventDetail.state.interested'),
  }[role] ?? t('eventDetail.state.none');

  return (
    <div className="page">
      <PageHeader title={localize(event.title, language)} backTo="/events" />

      <div className="detail-layout">
        <div className="detail-main">
          <div className="badge-row">
            <StatusBadge type="event" status={event.status} />
            <RoleBadge role={role} />
            {event.isDemo && <DemoBadge labelKey="demo.exampleEvent" />}
          </div>

          <p className="lead">{localize(event.summary, language)}</p>

          <InfoList
            items={[
              {
                icon: 'calendar',
                label: t('eventDetail.when'),
                value: (
                  <>
                    {formatDateLong(start, locale)}
                    <br />
                    {formatTime(start, locale)}
                    {end && `–${formatTime(end, locale)}`}
                    {!past && <span className="muted"> · {formatRelativeDays(days, locale)}</span>}
                  </>
                ),
              },
              {
                icon: event.online ? 'video' : 'mapPin',
                label: t('eventDetail.where'),
                value: event.online ? t('events.online') : localize(event.location, language),
              },
              {
                icon: 'school',
                label: t('eventDetail.host'),
                value: host ? <Link to={`/network/schools/${host.id}`}>{host.name}</Link> : event.hostSchoolId,
              },
              { icon: 'network', label: t('eventDetail.schools'), value: schoolLinks },
              {
                icon: 'users',
                label: t('eventDetail.audience'),
                value:
                  [localize(event.audience, language), event.capacity ? t('eventDetail.capacity', { count: event.capacity }) : '']
                    .filter(Boolean)
                    .join(' · ') || '–',
              },
              { icon: 'tag', label: t('eventDetail.format'), value: t(`formats.${event.format}`) },
            ]}
          />

          <section className="detail-section">
            <h2>{t('eventDetail.about')}</h2>
            <p>{localize(event.description, language) || localize(event.summary, language)}</p>
            <TopicTags topics={event.topics} highlight={user.interests} />
          </section>
        </div>

        <aside className="detail-aside card" aria-labelledby="participation-title">
          <h2 id="participation-title">{t('eventDetail.yourParticipation')}</h2>

          {/* Abgesagt: Event-Status und eigene Anmeldung GETRENNT zeigen – die Anmeldung bleibt gespeichert.
              Keine Knöpfe zum Anmelden (die Datenbank würde es ohnehin ablehnen). */}
          {cancelled && (
            <div className="notice notice--error" role="status">
              <Icon name="close" size={18} />
              <div>
                <strong>{t('eventDetail.cancelledNote')}</strong>
                {event.cancelledAt && (
                  <p>{t('eventDetail.cancelledOn', { date: formatAnkaraDateTime(event.cancelledAt, locale) })}</p>
                )}
                {role && role !== 'organizer' && (
                  <p>{t('eventDetail.cancelledRegistrationKept', { role: t(`roles.${role}`) })}</p>
                )}
              </div>
            </div>
          )}
          {past && !cancelled && (
            <p>{role ? t('eventDetail.pastNoteParticipated') : t('eventDetail.pastNote')}</p>
          )}
          {!past && !cancelled && role === 'organizer' && <p>{t('eventDetail.organizerNote')}</p>}

          {!past && !cancelled && closedForNew && <p>{t('eventDetail.closedNote')}</p>}

          {!past && !cancelled && role !== 'organizer' && !closedForNew && (
            <>
              <p className={`participation-state participation-state--${role ?? 'none'}`} role="status">
                {role && <Icon name={role === 'registered' ? 'check' : 'star'} size={18} />}
                {participationText}
              </p>
              {saveError && (
                <p className="notice notice--error" role="alert">
                  <Icon name="info" size={16} />
                  {t(saveError)}
                </p>
              )}
              <div className="participation-actions" aria-busy={saving}>
                <button
                  type="button"
                  className={`btn btn--block ${role === 'registered' ? 'btn--secondary' : 'btn--primary'}`}
                  disabled={saving}
                  onClick={() => actions.setRegistration(event.id, role === 'registered' ? null : 'registered')}
                >
                  {saving
                    ? t('auth.loading')
                    : role === 'registered'
                      ? t('eventDetail.cancelRegistration')
                      : t('eventDetail.register')}
                </button>
                {role !== 'registered' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--block"
                    aria-pressed={role === 'interested'}
                    disabled={saving}
                    onClick={() => actions.setRegistration(event.id, role === 'interested' ? null : 'interested')}
                  >
                    <Icon name="star" size={18} />
                    {role === 'interested' ? t('eventDetail.removeInterest') : t('eventDetail.markInterest')}
                  </button>
                )}
              </div>
            </>
          )}

          <p className="hint">
            <Icon name="info" size={14} />
            {t(isRealAccount ? 'eventDetail.savedToAccount' : 'demo.localOnly')}
          </p>
        </aside>
      </div>
    </div>
  );
}
