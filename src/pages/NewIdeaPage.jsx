import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
// Auswahl „Für Schulen“: nur sichtbare Schulen (ausgeblendete: src/data/schools.js → HIDDEN_SCHOOL_IDS)
import { visibleSchools as schools } from '../data/schools.js';
import { EVENT_FORMATS, TOPICS } from '../data/topics.js';
import PageHeader from '../components/PageHeader.jsx';
import FilterChips from '../components/FilterChips.jsx';
import Icon from '../components/Icon.jsx';

const LIMITS = { titleMin: 5, titleMax: 80, descriptionMin: 20, descriptionMax: 600, topicsMax: 3 };

function makeSummary(text, max = 140) {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : max)}…`;
}

function validate(values) {
  const errors = {};
  if (values.title.trim().length < LIMITS.titleMin) errors.title = 'newIdea.errors.title';
  if (values.description.trim().length < LIMITS.descriptionMin) errors.description = 'newIdea.errors.description';
  if (values.topics.length === 0) errors.topics = 'newIdea.errors.topicsRequired';
  if (values.topics.length > LIMITS.topicsMax) errors.topics = 'newIdea.errors.topicsMax';
  if (values.schoolIds.length === 0) errors.schoolIds = 'newIdea.errors.schools';
  if (!values.privacy) errors.privacy = 'newIdea.errors.privacy';
  return errors;
}

export default function NewIdeaPage() {
  const { t } = useI18n();
  const { user, actions } = useAppState();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [values, setValues] = useState({
    title: '',
    description: '',
    topics: [],
    format: 'meetup',
    schoolIds: schools.map((s) => s.id),
    privacy: false,
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validate(next));
  };
  const toggleIn = (key, item) =>
    update(key, values[key].includes(item) ? values[key].filter((x) => x !== item) : [...values[key], item]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setServerError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Fokus auf das erste fehlerhafte Feld
      const first = Object.keys(found)[0];
      formRef.current?.querySelector(`[data-field="${first}"]`)?.focus();
      return;
    }
    // Wird in Supabase gespeichert.
    setBusy(true);
    const result = await actions.addIdea({
      title: values.title.trim(),
      description: values.description.trim(),
      summary: makeSummary(values.description),
      topics: values.topics,
      format: values.format,
      schoolIds: values.schoolIds,
    });
    setBusy(false);
    if (result.errorKey) {
      setServerError(result.errorKey);
      return;
    }
    navigate(`/ideas/${result.id}`, { replace: true, state: { created: true } });
  };

  const errorCount = Object.keys(errors).length;
  const fieldProps = (name) => ({
    'data-field': name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const ErrorText = ({ name }) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field__error">
        {t(errors[name])}
      </p>
    ) : null;

  return (
    <div className="page page--narrow">
      {/* ohne (sichtbaren) Schulnamen kein halber Satz */}
      <PageHeader
        title={t('newIdea.title')}
        subtitle={user.school?.shortName ? t('newIdea.subtitle', { school: user.school.shortName }) : undefined}
        backTo="/ideas"
      />

      <form ref={formRef} className="form card" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        {serverError && (
          <p className="notice notice--error" role="alert">
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

        <div className="field">
          <label htmlFor="idea-title">{t('newIdea.titleLabel')}</label>
          <input
            id="idea-title"
            type="text"
            value={values.title}
            maxLength={LIMITS.titleMax}
            placeholder={t('newIdea.titlePlaceholder')}
            onChange={(e) => update('title', e.target.value)}
            {...fieldProps('title')}
          />
          <div className="field__meta">
            <ErrorText name="title" />
            <span className="field__counter">
              {values.title.length}/{LIMITS.titleMax}
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="idea-description">{t('newIdea.descriptionLabel')}</label>
          <p className="field__hint" id="idea-description-hint">
            {t('newIdea.descriptionHint')}
          </p>
          <textarea
            id="idea-description"
            rows={5}
            value={values.description}
            maxLength={LIMITS.descriptionMax}
            onChange={(e) => update('description', e.target.value)}
            {...fieldProps('description')}
            aria-describedby={errors.description ? 'description-error' : 'idea-description-hint'}
          />
          <div className="field__meta">
            <ErrorText name="description" />
            <span className="field__counter">
              {values.description.length}/{LIMITS.descriptionMax}
            </span>
          </div>
        </div>

        <fieldset className="field" {...fieldProps('topics')} tabIndex={-1}>
          <legend>{t('newIdea.topicsLabel')}</legend>
          <FilterChips
            wrap
            multiple
            label={t('newIdea.topicsLabel')}
            value={values.topics}
            onChange={(topic) => toggleIn('topics', topic)}
            options={TOPICS.map((id) => ({ value: id, label: t(`topics.${id}`) }))}
          />
          <ErrorText name="topics" />
        </fieldset>

        <div className="field">
          <label htmlFor="idea-format">{t('newIdea.formatLabel')}</label>
          <select id="idea-format" value={values.format} onChange={(e) => update('format', e.target.value)}>
            {EVENT_FORMATS.map((id) => (
              <option key={id} value={id}>
                {t(`formats.${id}`)}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="field" {...fieldProps('schoolIds')} tabIndex={-1}>
          <legend>{t('newIdea.schoolsLabel')}</legend>
          <div className="checkbox-list">
            {schools.map((school) => (
              <label key={school.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={values.schoolIds.includes(school.id)}
                  onChange={() => toggleIn('schoolIds', school.id)}
                />
                <span>{school.name}</span>
              </label>
            ))}
          </div>
          <ErrorText name="schoolIds" />
        </fieldset>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={values.privacy}
              onChange={(e) => update('privacy', e.target.checked)}
              {...fieldProps('privacy')}
            />
            <span>{t('newIdea.privacyLabel')}</span>
          </label>
          <ErrorText name="privacy" />
        </div>

        <p className="hint">
          <Icon name="info" size={14} />
          {t('newIdea.accountHint')}
        </p>

        <div className="form__actions">
          <Link to="/ideas" className="btn btn--ghost">
            {t('common.cancel')}
          </Link>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            <Icon name="check" size={18} />
            {busy ? t('auth.loading') : t('newIdea.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
