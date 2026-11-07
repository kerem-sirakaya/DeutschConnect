import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { tutoringContent } from '../data/modules.js';
import { PageIntro, StatusBadge } from '../components/UI.jsx';
import { TextField } from '../components/FormFields.jsx';
import ContentManagement from '../components/ContentManagement.jsx';
import { useFormDraft } from '../state/usePageMemory.js';
import NotFound from './NotFound.jsx';
import InterestToggle from '../components/InterestToggle.jsx';

export default function TutoringDetails({ id, returnTo = '/tutoring' }) {
  const { t } = useLanguage();
  const { state, profile, dispatch, access } = useDemo();
  const record = state.modules.tutoring.find((item) => item.id === id);
  const stored = state.modules.contactDrafts.find((item) => item.ownerId === profile.id && item.targetId === id);
  const { draft, setDraft, clearDraft, restored, hasDraft, storageAvailable } = useFormDraft('tutoring:contact:' + id, { note: stored?.note || '' });
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!record || record.lifecycle === 'deleted') return <NotFound />;
  const content = tutoringContent(record, t);
  const own = record.ownerId === profile.id;
  const inactive = record.lifecycle === 'closed';
  const interested = state.modules.interests[profile.id].includes('tutoring:' + id);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (draft.note.trim().length < 10 || draft.note.length > 600) {
      setError(true);
      event.currentTarget.elements.namedItem('contact-note')?.focus();
      return;
    }
    setError(false);
    setFailed(false);
    setBusy(true);
    try {
      const success = await dispatch({ type: 'saveContactDraft', targetId: id, note: draft.note });
      if (success) clearDraft({ note: draft.note.trim() });
      else setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <>
    <a className="text-link back-link" href={'#' + returnTo}>← {t.app.back}</a>
    <PageIntro eyebrow={(access.mode === 'guest' ? t.ext.discover.demo : t.ext.discover.student) + ' · ' + t.ext.tutoring[record.kind]} title={content.subject + ' · ' + content.topics} />
    <div className="details-layout">
      <article className="content-card prose">
        {inactive && <StatusBadge muted>{t.quality.closed}</StatusBadge>}
        <h2>{t.ext.tutoring.support}</h2><p className="user-content">{content.description}</p>
        <dl className="record-facts"><dt>{t.ext.tutoring.languages}</dt><dd>{record.languages.map((key) => t.ext.languages[key]).join(' · ')}</dd><dt>{t.ext.tutoring.format}</dt><dd>{t.ext.formats[record.format]}</dd><dt>{t.ext.tutoring.availability}</dt><dd>{content.availability}</dd></dl>
        <p className="small-text">{state.profiles[record.ownerId]?.displayName || t.app.community} · {record.schoolId === 'ers' ? 'ERS' : 'Anka Bilim'}{access.mode === 'guest' ? ' · DEMO' : ''}</p>
      </article>
      {own ? <aside className="content-card">
        <p className="participation-status">{t.ext.tutoring.own}</p>
        <ContentManagement editHref={'#/tutoring/' + id + '/edit'} inactive={inactive} inactiveLabel={t.quality.close} onWithdraw={() => dispatch({ type: 'closeTutoring', id, expectedRecord: JSON.stringify(record) })} onDelete={async () => { const success = await dispatch({ type: 'removeTutoring', id, expectedRecord: JSON.stringify(record) }); if (success) window.location.hash = '/tutoring/my'; return success; }} />
      </aside> : <form className="content-card app-form" onSubmit={submit} noValidate aria-busy={busy}>
        <fieldset className="app-form form-controls" disabled={busy} aria-label={t.ext.tutoring.contact}>
        <InterestToggle targetType="tutoring" targetId={id} label={t.ext.tutoring.interest} withdraw={t.ext.tutoring.withdraw} disabled={inactive && !interested} />
        {inactive ? <p className="form-notice" role="status">{t.quality.inactiveHint}</p> : <>
          <h2>{t.ext.tutoring.contact}</h2><p className="form-notice">{t.ext.tutoring.contactHint}</p>
          {restored && <p className="save-status" role="status">{t.quality.draftRestored}</p>}
          <TextField id="contact-note" label={t.ext.tutoring.contactNote} value={draft.note} onChange={(note) => setDraft({ note })} maxLength={600} multiline error={error ? t.ext.tutoring.contactValidation : undefined} />
          {hasDraft && <p className="small-text">{storageAvailable ? t.quality.savedDraft : t.quality.unsavedWarning}</p>}
          <div className="form-actions"><button className="button button-secondary" type="submit" disabled={busy}>{busy ? t.quality.saving : t.ext.tutoring.saveContact}</button>{hasDraft && <button type="button" className="text-button" disabled={busy} onClick={() => clearDraft({ note: stored?.note || '' })}>{t.quality.discardDraft}</button>}</div>
        </>}
        {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
        {stored && stored.note === draft.note.trim() && <p className="save-status" role="status">{t.ext.tutoring.contactSaved}</p>}
        </fieldset>
      </form>}
    </div><p className="module-note">{t.ext.tutoring.localHint}</p>
  </>;
}
