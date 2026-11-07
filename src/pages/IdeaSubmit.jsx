import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { schools } from '../data/activities.js';
import { validIdeaInput } from '../data/demoState.js';
import { projectStatuses } from '../data/modules.js';
import { ModuleTabs, PageIntro } from '../components/UI.jsx';
import { CheckOptions, TextField } from '../components/FormFields.jsx';
import { ideaContent } from '../components/IdeaCard.jsx';
import { useFormDraft } from '../state/usePageMemory.js';
import NotFound from './NotFound.jsx';

export default function IdeaSubmit({ initiativeId, id }) {
  const { t } = useLanguage();
  const { dispatch, profile, state } = useDemo();
  const existing = state.ideas.find((idea) => idea.id === id);
  const content = existing ? ideaContent(existing, t) : {};
  const initial = { title: content.title || '', description: content.description || '', category: existing?.category || 'open', goals: existing?.goals || '', collaborators: existing?.collaborators || '', desiredSchoolIds: existing?.desiredSchoolIds || [profile.schoolId], projectStatus: existing?.projectStatus || 'proposal', topicsText: existing?.topics?.join(', ') || '', interview: existing?.initiativeId === 'interviews' || initiativeId === 'interviews', expectedRecord: existing ? JSON.stringify(existing) : null };
  const { draft, setDraft, clearDraft, getSubmissionId, restored, hasDraft, storageAvailable } = useFormDraft(id ? 'idea:edit:' + id : 'idea:new:' + (initiativeId || 'free'), initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (id && (!existing || existing.ownerId !== profile.id || existing.lifecycle === 'deleted')) return <NotFound />;
  const change = (key, value) => setDraft({ ...draft, [key]: value });

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const topics = draft.topicsText.split(',').map((topic) => topic.trim()).filter(Boolean);
    const idea = { title: draft.title, description: draft.description, category: draft.category, goals: draft.goals, collaborators: draft.collaborators, desiredSchoolIds: draft.desiredSchoolIds, projectStatus: draft.projectStatus, topics, ...(draft.interview ? { initiativeId: 'interviews' } : {}) };
    const nextErrors = {};
    if (idea.title.trim().length < 5 || idea.title.trim().length > 90) nextErrors.title = t.quality.validationTitle;
    if (idea.description.trim().length < 20 || idea.description.trim().length > 1000) nextErrors.description = t.quality.validationDescription;
    if (idea.goals.length > 600) nextErrors.goals = t.quality.validationGoals;
    if (idea.collaborators.length > 400) nextErrors.collaborators = t.quality.validationCollaborators;
    if (topics.length > 8 || topics.some((topic) => topic.length > 40)) nextErrors.topics = t.quality.validationFreeTopics;
    if (!Object.keys(nextErrors).length && !validIdeaInput(idea)) nextErrors.topics = t.ext.project.validation;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const input = event.currentTarget.elements.namedItem('idea-' + Object.keys(nextErrors)[0]);
      const section = input?.closest('details');
      if (section) section.open = true;
      input?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    const targetId = id || getSubmissionId();
    try {
      const success = await dispatch({ type: id ? 'updateIdea' : 'submitIdea', idea, id: targetId, ...(id ? { expectedRecord: draft.expectedRecord } : {}) });
      if (success) { clearDraft(); window.location.hash = '/ideas/' + targetId; }
      else setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <>
    <PageIntro title={id ? t.quality.edit : t.app.newIdea} description={t.app.newIdeaDescription} />
    {!id && <ModuleTabs label={t.nav.ideas} items={Object.entries(t.app.ideaTabs).map(([key, label]) => ({ label, href: '#/ideas/' + key, active: key === 'new' }))} />}
    <form className="content-card app-form" onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset className="app-form form-controls" disabled={busy} aria-label={id ? t.quality.edit : t.app.newIdea}>
      <p className="form-notice">{t.app.formHint}</p><p className="small-text">{t.ext.project.freeHint}</p>
      {initiativeId === 'interviews' && <p className="form-notice">{t.ext.discover.interviewContext}</p>}
      {restored && <p className="save-status" role="status">{t.quality.draftRestored}</p>}
      <TextField id="idea-title" label={t.app.titleLabel} value={draft.title} maxLength={90} required error={errors.title} onChange={(value) => change('title', value)} />
      <TextField id="idea-description" label={t.app.descriptionLabel} value={draft.description} maxLength={1000} multiline required error={errors.description} onChange={(value) => change('description', value)} />
      <details className="optional-fields">
        <summary>{t.quality.optionalDetails}</summary>
        <TextField id="idea-goals" label={t.ext.project.goals} value={draft.goals} onChange={(value) => change('goals', value)} maxLength={600} multiline error={errors.goals} />
        <TextField id="idea-collaborators" label={t.ext.project.collaborators} value={draft.collaborators} onChange={(value) => change('collaborators', value)} maxLength={400} error={errors.collaborators} />
        <TextField id="idea-topics" label={t.ext.project.topics} value={draft.topicsText} onChange={(value) => change('topicsText', value)} maxLength={327} hint={t.ext.project.topicHint} error={errors.topics} />
        <CheckOptions legend={t.ext.project.schools} options={schools.map((school) => ({ key: school.id, label: school.name }))} value={draft.desiredSchoolIds} onChange={(value) => change('desiredSchoolIds', value)} />
        <label htmlFor="project-status">{t.ext.project.status}</label><select id="project-status" value={draft.projectStatus} onChange={(event) => change('projectStatus', event.target.value)}>{projectStatuses.map((key) => <option key={key} value={key}>{t.ext.project.statuses[key]}</option>)}</select>
        <label className="checkbox-row"><input type="checkbox" checked={draft.interview} onChange={(event) => change('interview', event.target.checked)} /><span>{t.ext.project.initiative}</span></label>
      </details>
      <p className="small-text">{t.app.privacyHint}</p>
      {hasDraft && <p className="small-text">{storageAvailable ? t.quality.savedDraft : t.quality.unsavedWarning}</p>}
      {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
      <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? t.quality.saving : id ? t.quality.save : t.app.submitIdea}</button><a className="text-link" href={id ? '#/ideas/' + id : '#/ideas/my'}>{t.quality.cancel}</a>{hasDraft && <button type="button" className="text-button" disabled={busy} onClick={() => { clearDraft(initial); setErrors({}); }}>{t.quality.discardDraft}</button>}</div>
      </fieldset>
    </form>
  </>;
}
