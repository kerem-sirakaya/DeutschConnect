import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { localize } from '../../i18n/localize.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  EVENT_FILTER_OPTIONS,
  EVENT_STATS,
  changeEventStatus,
  countEventsByStatus,
  eventEmptyKey,
  groupEventsForFilter,
  loadAdminEvents,
  normalizeEventFilter,
  removeEvent,
} from '../../lib/adminEvents.js';
import PageHeader from '../../components/PageHeader.jsx';
import FilterChips from '../../components/FilterChips.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import AdminEventCard from '../../components/admin/AdminEventCard.jsx';

/**
 * Events verwalten (Phase 1, Schritt 5).
 * Daten NUR über admin_list_events / admin_set_event_status / admin_delete_event.
 * Aufbau wie "Ideen moderieren": Kennzahlen, Filter (?status=…), Karten mit Bestätigung.
 */
export default function AdminEventsPage() {
  const { t, language } = useI18n();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filter = normalizeEventFilter(params.get('status') ?? 'all');

  const [list, setList] = useState({ status: 'loading', events: [], errorKey: null });
  const [reloadToken, setReloadToken] = useState(0);
  const [confirming, setConfirming] = useState(null); // { eventId, to } – to = Status oder 'delete'
  const [pendingId, setPendingId] = useState(null);
  const [cardError, setCardError] = useState(null); // { eventId, key }
  // Erfolgsmeldung – auch nach dem Speichern im Formular (kommt über location.state)
  const [success, setSuccess] = useState(() =>
    location.state?.saved ? t(location.state.saved, { title: location.state.title ?? '' }) : null,
  );

  useEffect(() => {
    let active = true;
    loadAdminEvents(supabase).then((result) => {
      if (!active) return;
      setList(
        result.errorKey
          ? { status: 'error', events: [], errorKey: result.errorKey }
          : { status: 'ready', events: result.events, errorKey: null },
      );
    });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = () => {
    setList((prev) => ({ ...prev, status: 'loading' }));
    setSuccess(null);
    setReloadToken((n) => n + 1);
  };

  const setFilter = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
    setConfirming(null);
  };

  const confirm = useCallback(
    async (eventId, to) => {
      setPendingId(eventId);
      setCardError(null);
      setSuccess(null);
      const event = list.events.find((item) => item.id === eventId);
      const title = localize(event?.title, language);
      const result =
        to === 'delete'
          ? await removeEvent(supabase, list.events, eventId)
          : await changeEventStatus(supabase, list.events, eventId, to);
      setPendingId(null);
      if (result.errorKey) {
        // Fehler: angezeigte Daten bleiben unverändert
        setCardError({ eventId, key: result.errorKey });
        return;
      }
      setConfirming(null);
      setList((prev) => ({ ...prev, events: result.events }));
      setSuccess(
        to === 'delete'
          ? t('admin.events.deleted', { title })
          : t('admin.events.statusChanged', { title, status: t(`status.event.${to}`) }),
      );
      // Frisch laden (z. B. neue Anmeldezahlen). Schlägt das fehl, bleibt die aktualisierte Liste.
      const fresh = await loadAdminEvents(supabase);
      if (!fresh.errorKey) setList((prev) => ({ ...prev, events: fresh.events }));
    },
    [list.events, t, language],
  );

  const counts = countEventsByStatus(list.events);
  // Jedes Event genau einmal: Spalten (Geplant | Abgesagt) + weitere Gruppen mit Inhalt
  const groups = groupEventsForFilter(list.events, filter).filter((group) => group.alwaysShow || group.events.length > 0);
  const columnGroups = groups.filter((group) => group.column);
  const otherGroups = groups.filter((group) => !group.column);

  const renderCard = (event) => (
    <AdminEventCard
      key={event.id}
      event={event}
      confirming={confirming?.eventId === event.id ? confirming.to : null}
      pending={pendingId === event.id}
      errorKey={cardError?.eventId === event.id ? cardError.key : null}
      onAsk={(eventId, to) => {
        setCardError(null);
        setConfirming({ eventId, to });
      }}
      onCancel={() => setConfirming(null)}
      onConfirm={confirm}
    />
  );
  const filterOptions = EVENT_FILTER_OPTIONS.map((option) => ({
    value: option.value,
    label: `${t(option.labelKey)} (${counts[option.value]})`,
  }));

  return (
    <>
      <PageHeader
        title={t('admin.events.title')}
        subtitle={t('admin.events.subtitle')}
        actions={
          <>
            <Link to="/admin/events/new" className="btn btn--primary btn--sm">
              <Icon name="plus" size={16} />
              {t('admin.events.new')}
            </Link>
            <button type="button" className="btn btn--secondary btn--sm" onClick={reload} disabled={list.status === 'loading'}>
              <Icon name="refresh" size={16} />
              {t('admin.refresh')}
            </button>
          </>
        }
      />

      {list.status === 'loading' && (
        <section className="card settings-block" role="status" aria-live="polite">
          <p>{t('admin.events.loading')}</p>
        </section>
      )}

      {list.status === 'error' && (
        <section className="card settings-block" role="alert">
          <p className="notice notice--error">
            <Icon name="info" size={16} />
            {t(list.errorKey)}
          </p>
          <button type="button" className="btn btn--primary btn--sm" onClick={reload}>
            {t('admin.statusError.retry')}
          </button>
        </section>
      )}

      {list.status === 'ready' && (
        <>
          <section aria-label={t('admin.events.statsTitle')}>
            <ul className="stats">
              {EVENT_STATS.map((item) => (
                <li key={item.key} className="stat">
                  <span className="stat__value">{counts[item.key]}</span>
                  <span className="stat__label">{t(item.labelKey)}</span>
                </li>
              ))}
            </ul>
          </section>

          <FilterChips label={t('admin.filtersLabel')} options={filterOptions} value={filter} onChange={setFilter} />

          <div aria-live="polite">
            {success && (
              <p className="notice notice--success">
                <Icon name="check" size={16} />
                {success}
              </p>
            )}
          </div>

          {list.events.length === 0 ? (
            // Noch gar keine Events: wie bisher mit "Neues Event"
            <EmptyState
              icon="calendar"
              title={t(eventEmptyKey('all'))}
              action={
                <Link to="/admin/events/new" className="btn btn--primary btn--sm">
                  {t('admin.events.new')}
                </Link>
              }
            />
          ) : (
            <>
              {/* Zwei Spalten: Geplante Events | Abgesagte Events (je nach Filter eine oder beide) */}
              {columnGroups.length > 0 && (
                <div className={`admin-event-columns${columnGroups.length === 1 ? ' admin-event-columns--single' : ''}`}>
                  {columnGroups.map((group) => (
                    <EventGroup key={group.key} group={group} renderCard={renderCard} />
                  ))}
                </div>
              )}
              {/* Weitere Gruppen (Entwürfe, Abgeschlossen, Archiviert) – jedes Event nur einmal */}
              {otherGroups.map((group) => (
                <EventGroup key={group.key} group={group} renderCard={renderCard} />
              ))}
            </>
          )}

          <p className="hint">
            <Icon name="info" size={14} />
            {t('admin.events.timeZoneNote')}
          </p>
        </>
      )}
    </>
  );
}

/** Eine Gruppe (Spalte oder Zusatz-Gruppe) mit Überschrift, Anzahl und Leerzustand. */
function EventGroup({ group, renderCard }) {
  const { t } = useI18n();
  const headingId = `admin-events-group-${group.key}`;
  return (
    <section className={`admin-event-group admin-event-group--${group.key}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="admin-event-group__title">
        <span>{t(group.titleKey)}</span>
        <span className="admin-event-group__count">
          <span aria-hidden="true">{group.events.length}</span>
          <span className="visually-hidden">{t('admin.events.groupCount', { count: group.events.length })}</span>
        </span>
      </h2>
      {group.events.length === 0 ? (
        <p className="admin-event-group__empty">{t(group.emptyKey)}</p>
      ) : (
        <div className="card-list">{group.events.map(renderCard)}</div>
      )}
    </section>
  );
}
