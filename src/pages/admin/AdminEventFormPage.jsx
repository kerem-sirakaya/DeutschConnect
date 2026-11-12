import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { localize } from '../../i18n/localize.js';
import { supabase } from '../../lib/supabaseClient.js';
import { isHiddenSchool, schools as allSchools, visibleSchools as schools } from '../../data/schools.js';
import { schoolsIncludingExisting } from '../../lib/schoolVisibility.js';
import { EVENT_FORMATS, TOPICS } from '../../data/topics.js';
import { loadAdminEvents, saveEvent } from '../../lib/adminEvents.js';
import {
  EVENT_NUMBER_LIMITS,
  EVENT_TEXT_LIMITS,
  emptyEventForm,
  eventToForm,
  formToEventInput,
  isEventDateLocked,
  validateEventForm,
} from '../../lib/eventForm.js';
import PageHeader from '../../components/PageHeader.jsx';
import FilterChips from '../../components/FilterChips.jsx';
import Icon from '../../components/Icon.jsx';
import { StatusBadge } from '../../components/Badges.jsx';
import LocalizedTextField from '../../components/admin/LocalizedTextField.jsx';
import NotFoundPage from '../NotFoundPage.jsx';

// Schulen aus src/data/schools.js – dieselben IDs wie in der Tabelle "schools".
// Eine unbekannte ID würde die Datenbank ohnehin ablehnen (22023).
// Prüfung: ALLE Schulen erlaubt – sonst könnte ein bestehendes Event mit ausgeblendeter Schule nicht gespeichert werden.
// Anzeige (Ankreuzfelder, Gastgeber-Auswahl, Vorbelegung): nur sichtbare Schulen. Bereits gespeicherte
// ausgeblendete Schulen bleiben im Formularwert erhalten (werden nicht entfernt).
const ALLOWED_SCHOOL_IDS = allSchools.map((school) => school.id);
const VISIBLE_SCHOOL_IDS = schools.map((school) => school.id);

/**
 * Event anlegen (/admin/events/new) oder bearbeiten (/admin/events/:eventId/edit).
 *
 * Bearbeiten: admin_update_event ÜBERSCHREIBT ALLE FELDER. Deshalb wird das vollständige
 * Event geladen, komplett ins Formular übernommen und komplett zurückgeschickt.
 * Der Status wird hier nie geändert (das geht nur über die Aktionen in der Liste).
 */
export default function AdminEventFormPage() {
  const { eventId } = useParams();
  const isEdit = Boolean(eventId);
  const [loaded, setLoaded] = useState(
    isEdit ? { status: 'loading', event: null, errorKey: null } : { status: 'ready', event: null, errorKey: null },
  );
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    loadAdminEvents(supabase).then((result) => {
      if (!active) return;
      if (result.errorKey) setLoaded({ status: 'error', event: null, errorKey: result.errorKey });
      else {
        const event = result.events.find((item) => item.id === eventId) ?? null;
        setLoaded({ status: event ? 'ready' : 'notFound', event, errorKey: null });
      }
    });
    return () => {
      active = false;
    };
  }, [isEdit, eventId, reloadToken]);

  if (loaded.status === 'notFound') return <NotFoundPage titleKey="eventDetail.notFound" backTo="/admin/events" />;
  if (loaded.status === 'loading' || loaded.status === 'error') {
    return (
      <LoadState
        errorKey={loaded.errorKey}
        onRetry={() => {
          setLoaded({ status: 'loading', event: null, errorKey: null });
          setReloadToken((n) => n + 1);
        }}
      />
    );
  }
  // key: Formular startet neu, wenn ein anderes Event geladen wird
  return <EventForm key={loaded.event?.id ?? 'new'} original={loaded.event} />;
}

function LoadState({ errorKey, onRetry }) {
  const { t } = useI18n();
  if (!errorKey) {
    return (
      <section className="card settings-block" role="status" aria-live="polite">
        <p>{t('admin.events.loading')}</p>
      </section>
    );
  }
  return (
    <section className="card settings-block" role="alert">
      <p className="notice notice--error">
        <Icon name="info" size={16} />
        {t(errorKey)}
      </p>
      <button type="button" className="btn btn--primary btn--sm" onClick={onRetry}>
        {t('admin.statusError.retry')}
      </button>
    </section>
  );
}

function EventForm({ original }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const isEdit = Boolean(original);
  const [values, setValues] = useState(() =>
    original ? eventToForm(original) : emptyEventForm({ schoolIds: [...VISIBLE_SCHOOL_IDS] }),
  );
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  // Schulen im Formular: sichtbare Schulen + ausgeblendete Schulen, die DIESES bestehende Event schon enthält
  // (Gastgeber oder beteiligt) – sichtbar markiert und unverändert erhalten. Für neue Events nicht wählbar.
  const formSchools = schoolsIncludingExisting([original?.hostSchoolId, ...(original?.schoolIds ?? [])]);
  const schoolLabel = (school) =>
    isHiddenSchool(school.id) ? `${school.name} (${t('admin.eventForm.hiddenSchool')})` : school.name;

  const validate = (next) => validateEventForm(next, { allowedSchoolIds: ALLOWED_SCHOOL_IDS, original });
  const update = (key, value) => {
    const next = { ...values, [key]: value };
    // Gastgeber muss beteiligt sein – wird eine Schule abgewählt, auch als Gastgeber entfernen
    if (key === 'schoolIds' && !value.includes(next.hostSchoolId)) next.hostSchoolId = '';
    setValues(next);
    if (submitted) setErrors(validate(next));
  };
  const toggleIn = (key, item) =>
    update(key, values[key].includes(item) ? values[key].filter((x) => x !== item) : [...values[key], item]);

  const dateLocked = isEdit && isEventDateLocked(original.status);
  const registered = original?.registeredCount ?? 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setServerError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      formRef.current?.querySelector(`[data-field="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    const input = formToEventInput(values, original);
    const result = await saveEvent(supabase, input, original?.id ?? null);
    setBusy(false);
    if (result.errorKey) {
      setServerError(result.errorKey);
      formRef.current?.querySelector('[data-server-error]')?.focus();
      return;
    }
    navigate('/admin/events', {
      replace: true,
      state: { saved: isEdit ? 'admin.events.updated' : 'admin.events.created', title: localize(input.title, language) },
    });
  };

  const fieldProps = (name) => ({
    'data-field': name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const ErrorText = ({ name, vars }) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field__error">
        {t(errors[name], vars)}
      </p>
    ) : null;
  const errorCount = Object.keys(errors).length;

  return (
    <>
      <PageHeader
        title={t(isEdit ? 'admin.eventForm.editTitle' : 'admin.eventForm.newTitle')}
        subtitle={t(isEdit ? 'admin.eventForm.editSubtitle' : 'admin.eventForm.newSubtitle')}
        backTo="/admin/events"
      />

      <form ref={formRef} className="form card" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        {isEdit && (
          <p className="badge-row">
            <StatusBadge type="event" status={original.status} />
            <span className="muted">{t('admin.eventForm.statusNote')}</span>
          </p>
        )}

        {serverError && (
          <p className="notice notice--error" role="alert" tabIndex={-1} data-server-error>
            <Icon name="info" size={16} />
            {t(serverError)}
          </p>
        )}
        {submitted && errorCount > 0 && (
          <p className="notice notice--error" role="alert">
            <Icon name="info" size={16} />
            {t('newIdea.errorSummary', { count: errorCount })}
          </p>
        )}

        <LocalizedTextField
          name="title"
          required
          label={t('admin.eventForm.titleLabel')}
          hint={t('admin.eventForm.languagesHint')}
          value={values.title}
          maxLength={EVENT_TEXT_LIMITS.title}
          onChange={(value) => update('title', value)}
          errorKey={errors.title}
        />
        <LocalizedTextField
          name="summary"
          label={t('admin.eventForm.summaryLabel')}
          value={values.summary}
          maxLength={EVENT_TEXT_LIMITS.summary}
          onChange={(value) => update('summary', value)}
          errorKey={errors.summary}
        />
        <LocalizedTextField
          name="description"
          multiline
          label={t('admin.eventForm.descriptionLabel')}
          value={values.description}
          maxLength={EVENT_TEXT_LIMITS.description}
          onChange={(value) => update('description', value)}
          errorKey={errors.description}
        />

        <div className="field">
          <label htmlFor="event-start">{t('admin.eventForm.startLabel')}</label>
          <p className="field__hint" id="event-start-hint">
            {t(dateLocked ? 'admin.eventForm.startLocked' : 'admin.eventForm.startHint')}
          </p>
          <input
            id="event-start"
            type="datetime-local"
            value={values.startLocal}
            disabled={dateLocked}
            onChange={(e) => update('startLocal', e.target.value)}
            {...fieldProps('startLocal')}
            aria-describedby={errors.startLocal ? 'startLocal-error' : 'event-start-hint'}
          />
          <ErrorText name="startLocal" />
        </div>

        <div className="field">
          <label htmlFor="event-duration">
            {t('admin.eventForm.durationLabel')} <span className="muted">· {t('admin.eventForm.optional')}</span>
          </label>
          <input
            id="event-duration"
            type="number"
            inputMode="numeric"
            min={EVENT_NUMBER_LIMITS.durationMinutes.min}
            max={EVENT_NUMBER_LIMITS.durationMinutes.max}
            step={1}
            value={values.durationMinutes}
            onChange={(e) => update('durationMinutes', e.target.value)}
            {...fieldProps('durationMinutes')}
          />
          <ErrorText name="durationMinutes" />
        </div>

        {/* Maximale Teilnehmerzahl – direkt bei Datum/Dauer, damit sie nicht übersehen wird.
            Leer = keine Begrenzung (p_capacity = null). Nie unter der Zahl der Anmeldungen (DC005). */}
        <div className="field">
          <label htmlFor="event-capacity">
            {t('admin.eventForm.capacityLabel')} <span className="muted">· {t('admin.eventForm.optional')}</span>
          </label>
          <p className="field__hint" id="event-capacity-hint">
            {registered > 0
              ? t('admin.eventForm.capacityHintRegistered', { count: registered })
              : t('admin.eventForm.capacityHint')}
          </p>
          <input
            id="event-capacity"
            type="number"
            inputMode="numeric"
            min={Math.max(EVENT_NUMBER_LIMITS.capacity.min, registered)}
            max={EVENT_NUMBER_LIMITS.capacity.max}
            step={1}
            placeholder={t('admin.eventForm.capacityPlaceholder')}
            value={values.capacity}
            onChange={(e) => update('capacity', e.target.value)}
            {...fieldProps('capacity')}
            aria-describedby={errors.capacity ? 'capacity-error' : 'event-capacity-hint'}
          />
          <ErrorText name="capacity" vars={{ count: registered }} />
        </div>

        <LocalizedTextField
          name="location"
          label={t('admin.eventForm.locationLabel')}
          value={values.location}
          maxLength={EVENT_TEXT_LIMITS.location}
          onChange={(value) => update('location', value)}
          errorKey={errors.location}
        />

        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={values.online} onChange={(e) => update('online', e.target.checked)} />
            <span>{t('admin.eventForm.onlineLabel')}</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="event-format">{t('newIdea.formatLabel')}</label>
          <select id="event-format" value={values.format} onChange={(e) => update('format', e.target.value)} {...fieldProps('format')}>
            {EVENT_FORMATS.map((id) => (
              <option key={id} value={id}>
                {t(`formats.${id}`)}
              </option>
            ))}
          </select>
          <ErrorText name="format" />
        </div>

        <fieldset className="field" {...fieldProps('schoolIds')} tabIndex={-1}>
          <legend>{t('admin.eventForm.schoolsLabel')}</legend>
          <div className="checkbox-list">
            {formSchools.map((school) => (
              <label key={school.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={values.schoolIds.includes(school.id)}
                  onChange={() => toggleIn('schoolIds', school.id)}
                />
                <span>{schoolLabel(school)}</span>
              </label>
            ))}
          </div>
          <ErrorText name="schoolIds" />
        </fieldset>

        <div className="field">
          <label htmlFor="event-host">{t('admin.eventForm.hostLabel')}</label>
          <select
            id="event-host"
            value={values.hostSchoolId}
            onChange={(e) => update('hostSchoolId', e.target.value)}
            {...fieldProps('hostSchoolId')}
          >
            <option value="">{t('admin.eventForm.hostPlaceholder')}</option>
            {formSchools
              .filter((school) => values.schoolIds.includes(school.id))
              .map((school) => (
                <option key={school.id} value={school.id}>
                  {schoolLabel(school)}
                </option>
              ))}
          </select>
          <ErrorText name="hostSchoolId" />
        </div>

        <LocalizedTextField
          name="audience"
          label={t('admin.eventForm.audienceLabel')}
          value={values.audience}
          maxLength={EVENT_TEXT_LIMITS.audience}
          onChange={(value) => update('audience', value)}
          errorKey={errors.audience}
        />

        <fieldset className="field" {...fieldProps('topics')} tabIndex={-1}>
          <legend>
            {t('admin.eventForm.topicsLabel')} <span className="muted">· {t('admin.eventForm.optional')}</span>
          </legend>
          <FilterChips
            wrap
            multiple
            label={t('admin.eventForm.topicsLabel')}
            value={values.topics}
            onChange={(topic) => toggleIn('topics', topic)}
            options={TOPICS.map((id) => ({ value: id, label: t(`topics.${id}`) }))}
          />
          <ErrorText name="topics" />
        </fieldset>

        <p className="hint">
          <Icon name="info" size={14} />
          {t(isEdit ? 'admin.eventForm.editHint' : 'admin.eventForm.draftHint')}
        </p>

        <div className="form__actions">
          <Link to="/admin/events" className="btn btn--ghost">
            {t('common.cancel')}
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="check" size={18} />
            {busy ? t('admin.saving') : t(isEdit ? 'admin.eventForm.saveChanges' : 'admin.eventForm.saveDraft')}
          </button>
        </div>
      </form>
    </>
  );
}
