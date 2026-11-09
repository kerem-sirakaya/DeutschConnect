import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { useTutoring } from '../state/TutoringContext.jsx';
import {
  SUBJECT_SUGGESTIONS,
  TUTOR_FORMATS,
  TUTOR_KINDS,
  TUTOR_LANGUAGES,
  TUTOR_LIMITS,
  validateTutoringEntry,
} from '../lib/tutoring.js';
import PageHeader from '../components/PageHeader.jsx';
import FilterChips from '../components/FilterChips.jsx';
import Icon from '../components/Icon.jsx';
import TutoringStatusNotice from '../components/tutoring/TutoringStatusNotice.jsx';
import NotFoundPage from './NotFoundPage.jsx';

const TEXT_FIELDS = [
  { name: 'subject', multiline: false },
  { name: 'topics', multiline: false },
  { name: 'description', multiline: true },
  { name: 'availability', multiline: false },
];

/** Nachhilfe anbieten / suchen (neu) oder eigenen Eintrag bearbeiten (/tutoring/:id/edit). */
export default function TutoringFormPage() {
  const { entryId } = useParams();
  const { t } = useI18n();
  const { entries, status } = useTutoring();
  if (!entryId) return <TutoringForm existing={null} />;
  // Bearbeiten: erst warten, bis die echten Daten geladen sind (Formular startet mit dem gespeicherten Stand)
  if (status !== 'ready') {
    return (
      <div className="page page--narrow">
        <PageHeader title={t('tutoring.editTitle')} backTo="/tutoring" />
        <TutoringStatusNotice />
      </div>
    );
  }
  const existing = entries.find((entry) => entry.id === entryId);
  if (!existing || !existing.isOwn) return <NotFoundPage titleKey="tutoring.notFound" backTo="/tutoring" />;
  return <TutoringForm key={existing.id} existing={existing} />;
}

function TutoringForm({ existing }) {
  const [params] = useSearchParams();
  const { t, language } = useI18n();
  const { user } = useAppState();
  const { actions, readOnly } = useTutoring();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const [values, setValues] = useState(() => ({
    kind: existing?.kind ?? (params.get('kind') === 'offer' ? 'offer' : 'request'),
    subject: existing?.subject ?? '',
    topics: existing?.topics ?? '',
    description: existing?.description ?? '',
    availability: existing?.availability ?? '',
    languages: existing?.languages ?? [TUTOR_LANGUAGES.includes(language) ? language : 'de'],
    format: existing?.format ?? 'either',
  }));
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);

  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validateTutoringEntry(next));
  };
  const toggleLanguage = (code) =>
    update('languages', values.languages.includes(code) ? values.languages.filter((l) => l !== code) : [...values.languages, code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || readOnly) return;
    setSubmitted(true);
    setServerError(null);
    const found = validateTutoringEntry(values);
    setErrors(found);
    if (Object.keys(found).length) {
      formRef.current?.querySelector(`[data-field="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    const result = existing ? await actions.updateEntry(existing.id, values) : await actions.createEntry(values);
    setBusy(false);
    if (result.errorKey) {
      setServerError(result.errorKey);
      return;
    }
    // replace: „Zurück“ öffnet danach nicht wieder das leere Formular
    navigate(`/tutoring/${existing ? existing.id : result.value}`, { replace: true, state: { saved: true } });
  };

  const fieldProps = (name) => ({
    'data-field': name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `tutor-${name}-error` : undefined,
  });
  const ErrorText = ({ name }) =>
    errors[name] ? (
      <p id={`tutor-${name}-error`} className="field__error">
        {t(errors[name])}
      </p>
    ) : null;

  const title = existing ? t('tutoring.editTitle') : t(values.kind === 'offer' ? 'tutoring.newOffer' : 'tutoring.newRequest');

  return (
    <div className="page page--narrow">
      <PageHeader title={title} subtitle={t('tutoring.formSubtitle', { school: user.school.shortName })} backTo="/tutoring" />
      <TutoringStatusNotice />

      <form ref={formRef} className="form card" onSubmit={handleSubmit} noValidate aria-busy={busy}>
        <fieldset className="form__fieldset" disabled={readOnly || busy}>
          {serverError && (
            <p className="notice notice--error" role="alert">
              <Icon name="info" size={16} />
              {t(serverError)}
            </p>
          )}

          <fieldset className="field" {...fieldProps('kind')} tabIndex={-1}>
            <legend>{t('tutoring.kindLabel')}</legend>
            <FilterChips
              label={t('tutoring.kindLabel')}
              value={values.kind}
              onChange={(kind) => update('kind', kind)}
              options={TUTOR_KINDS.map((id) => ({ value: id, label: t(`tutoring.kind.${id}`) }))}
            />
          </fieldset>

          {TEXT_FIELDS.map(({ name, multiline }) => {
            const [, max] = TUTOR_LIMITS[name];
            const Input = multiline ? 'textarea' : 'input';
            return (
              <div className="field" key={name}>
                <label htmlFor={`tutor-${name}`}>{t(`tutoring.fields.${name}`)}</label>
                <Input
                  id={`tutor-${name}`}
                  type={multiline ? undefined : 'text'}
                  rows={multiline ? 5 : undefined}
                  value={values[name]}
                  maxLength={max}
                  list={name === 'subject' ? 'tutor-subject-suggestions' : undefined}
                  onChange={(e) => update(name, e.target.value)}
                  {...fieldProps(name)}
                />
                <div className="field__meta">
                  <ErrorText name={name} />
                  <span className="field__counter">
                    {values[name].length}/{max}
                  </span>
                </div>
              </div>
            );
          })}
          <datalist id="tutor-subject-suggestions">
            {SUBJECT_SUGGESTIONS.map((id) => (
              <option key={id} value={t(`tutoring.subjects.${id}`)} />
            ))}
          </datalist>

          <fieldset className="field" {...fieldProps('languages')} tabIndex={-1}>
            <legend>{t('tutoring.languagesLabel')}</legend>
            <FilterChips
              multiple
              label={t('tutoring.languagesLabel')}
              value={values.languages}
              onChange={toggleLanguage}
              options={TUTOR_LANGUAGES.map((code) => ({ value: code, label: t(`tutoring.languages.${code}`) }))}
            />
            <ErrorText name="languages" />
          </fieldset>

          <div className="field">
            <label htmlFor="tutor-format">{t('tutoring.formatLabel')}</label>
            <select id="tutor-format" value={values.format} onChange={(e) => update('format', e.target.value)}>
              {TUTOR_FORMATS.map((code) => (
                <option key={code} value={code}>
                  {t(`tutoring.formats.${code}`)}
                </option>
              ))}
            </select>
          </div>

          <p className="hint">
            <Icon name="info" size={14} />
            {t('tutoring.privacyHint')}
          </p>

          <div className="form__actions">
            <Link to={existing ? `/tutoring/${existing.id}` : '/tutoring'} className="btn btn--ghost">
              {t('common.cancel')}
            </Link>
            <button type="submit" className="btn btn--primary" disabled={busy || readOnly}>
              <Icon name="check" size={18} />
              {busy ? t('auth.loading') : t('tutoring.save')}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
