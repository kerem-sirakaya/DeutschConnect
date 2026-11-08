import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { tutorFormats, tutorLanguages, tutorSubjects, tutoringContent, validTutoring } from '../data/modules.js';
import { normalizeSubject } from '../data/matching.js';
import { CheckOptions, TextField } from '../components/FormFields.jsx';
import { PageIntro } from '../components/UI.jsx';
import { useFormDraft } from '../state/usePageMemory.js';
import NotFound from './NotFound.jsx';
import BackLink from '../components/BackLink.jsx';
import { replaceRoute } from '../state/routeHistory.js';
import ProfileSchoolNotice from '../components/ProfileSchoolNotice.jsx';
import useActiveView from '../state/useActiveView.js';

export default function TutoringNew({ kind = 'request', id }) {
  const { t } = useLanguage();
  const { dispatch, profile, state } = useDemo();
  const existing = state.modules.tutoring.find((record) => record.id === id);
  const content = existing ? tutoringContent(existing, t) : {};
  const initial = { kind: existing?.kind || kind, subject: content.subject || '', topics: content.topics || '', description: content.description || '', availability: content.availability || '', format: existing?.format || 'either', languages: existing?.languages || [profile.language], expectedRecord: existing ? JSON.stringify(existing) : null };
  const { draft, setDraft, clearDraft, getSubmissionId, restored, hasDraft, storageAvailable } = useFormDraft(id ? 'tutoring:edit:' + id : 'tutoring:new:' + kind, initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const active=useActiveView();
  if (id && (!existing || existing.ownerId !== profile.id || existing.lifecycle === 'deleted')) return <NotFound />;
  if(!profile.schoolId)return <><BackLink fallback="/tutoring" /><PageIntro title={id?t.quality.edit:kind==='offer'?t.ext.tutoring.newOffer:t.ext.tutoring.newRequest} /><ProfileSchoolNotice /></>;
  const change = (key, value) => setDraft({ ...draft, [key]: value });
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const nextErrors = {};
    if (draft.subject.trim().length < 2 || draft.subject.length > 80) nextErrors['tutor-subject'] = t.quality.validationSubject;
    if (draft.topics.trim().length < 3 || draft.topics.length > 200) nextErrors['tutor-topics'] = t.quality.validationTopics;
    if (draft.description.trim().length < 20 || draft.description.length > 1000) nextErrors['tutor-support'] = t.quality.validationDescription;
    if (!draft.languages.length) nextErrors['tutor-languages'] = t.quality.validationLanguages;
    if (draft.availability.trim().length < 3 || draft.availability.length > 200) nextErrors['tutor-availability'] = t.quality.validationAvailability;
    if (!Object.keys(nextErrors).length && !validTutoring(draft)) nextErrors['tutor-subject'] = t.ext.tutoring.validation;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { document.getElementById(Object.keys(nextErrors)[0])?.focus(); return; }
    const targetId = id || getSubmissionId();
    const normalized = normalizeSubject(draft.subject);
    const subjectKey = tutorSubjects.includes(normalized) ? normalized : undefined;
    setBusy(true);
    setFailed(false);
    try {
      const { expectedRecord, ...fields } = draft;
      const success = await dispatch({ type: id ? 'updateTutoring' : 'submitTutoring', id: targetId, record: { ...fields, subjectKey }, ...(id ? { expectedRecord } : {}) });
      if (success && active.current) { clearDraft(); replaceRoute(window, '/tutoring/' + targetId + '?from=' + encodeURIComponent('/tutoring/my')); }
      else setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <>
    <BackLink fallback={id ? '/tutoring/' + id : '/tutoring'} />
    <PageIntro title={id ? t.quality.edit : draft.kind === 'offer' ? t.ext.tutoring.newOffer : t.ext.tutoring.newRequest} />
    <form className="content-card app-form" noValidate onSubmit={submit} aria-busy={busy}>
      <fieldset className="app-form form-controls" disabled={busy} aria-label={id ? t.quality.edit : draft.kind === 'offer' ? t.ext.tutoring.newOffer : t.ext.tutoring.newRequest}>
      <p className="form-notice">{t.ext.tutoring.localHint}</p>
      {restored && <p className="save-status" role="status">{t.quality.draftRestored}</p>}
      <label htmlFor="tutor-kind">{t.ext.tutoring.kind}</label><select id="tutor-kind" value={draft.kind} onChange={(event) => change('kind', event.target.value)}>{['offer', 'request'].map((key) => <option key={key} value={key}>{t.ext.tutoring[key]}</option>)}</select>
      <TextField id="tutor-subject" label={t.ext.tutoring.subject} value={draft.subject} onChange={(value) => change('subject', value)} maxLength={80} required error={errors['tutor-subject']} />
      <TextField id="tutor-topics" label={t.ext.tutoring.topics} value={draft.topics} onChange={(value) => change('topics', value)} maxLength={200} required error={errors['tutor-topics']} />
      <TextField id="tutor-support" label={t.ext.tutoring.support} value={draft.description} onChange={(value) => change('description', value)} maxLength={1000} multiline required error={errors['tutor-support']} />
      <CheckOptions id="tutor-languages" legend={t.ext.tutoring.languages} options={tutorLanguages.map((key) => ({ key, label: t.ext.languages[key] }))} value={draft.languages} onChange={(value) => change('languages', value)} error={errors['tutor-languages']} />
      <label htmlFor="tutor-format">{t.ext.tutoring.format}</label><select id="tutor-format" value={draft.format} onChange={(event) => change('format', event.target.value)}>{tutorFormats.map((key) => <option key={key} value={key}>{t.ext.formats[key]}</option>)}</select>
      <TextField id="tutor-availability" label={t.ext.tutoring.availability} value={draft.availability} onChange={(value) => change('availability', value)} maxLength={200} required error={errors['tutor-availability']} />
      <p className="small-text">{t.app.privacyHint}</p>
      {hasDraft && <p className="small-text">{storageAvailable ? t.quality.savedDraft : t.quality.unsavedWarning}</p>}
      {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
      <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? t.quality.saving : id ? t.quality.save : t.ext.tutoring.submit}</button>{hasDraft && <button className="text-button" type="button" disabled={busy} onClick={() => { clearDraft(initial); setErrors({}); }}>{t.quality.discardDraft}</button>}</div>
      </fieldset>
    </form>
  </>;
}
