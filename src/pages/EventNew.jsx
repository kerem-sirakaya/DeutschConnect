import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { PageIntro } from '../components/UI.jsx';
import { TextField } from '../components/FormFields.jsx';
import { schools, interests } from '../data/activities.js';
import { useFormDraft } from '../state/usePageMemory.js';

export default function EventNew() {
  const { t } = useLanguage(); const { profile,dispatch,access } = useDemo();
  const { draft,setDraft,clearDraft,getSubmissionId } = useFormDraft('event:new',{ title:'',description:'',startsAt:'',hostSchoolId:profile.schoolId || 'ers',category:'language' });
  const [error,setError] = useState(false), [busy,setBusy] = useState(false);
  const change = (key,value) => setDraft({ ...draft,[key]:value });
  async function save(event) {
    event.preventDefault(); if (busy) return;
    if (draft.title.trim().length < 5 || draft.description.trim().length < 20 || !Number.isFinite(Date.parse(draft.startsAt)) || Date.parse(draft.startsAt) <= Date.now()) { setError(true); return; }
    setBusy(true); setError(false);
    const id = getSubmissionId();
    try { if (await dispatch({ type:'createEvent', id,event:{ ...draft,startsAt:new Date(draft.startsAt).toISOString() } })) { clearDraft(); window.location.hash='/events/'+id; } else setError(true); } catch { setError(true); } finally { setBusy(false); }
  }
  return <><a className="text-link" href="#/events/all">← {t.nav.events}</a><PageIntro title={t.real.createEvent} description={t.real.createEventHint} />{access.mode === 'guest' ? <p className="form-notice">{t.real.eventAccountRequired} <a className="text-link" href="#/me/account">{t.real.signIn}</a></p> : <form className="content-card app-form" onSubmit={save} noValidate><fieldset disabled={busy} className="app-form form-controls"><TextField id="event-title" label={t.app.titleLabel} value={draft.title} onChange={(value)=>change('title',value)} maxLength={90} required /><TextField id="event-description" label={t.app.descriptionLabel} value={draft.description} onChange={(value)=>change('description',value)} maxLength={1500} multiline required /><label>{t.real.eventDate}<input type="datetime-local" value={draft.startsAt} required onChange={(event)=>change('startsAt',event.target.value)} /></label><label>{t.quality.hostSchool}<select value={draft.hostSchoolId} onChange={(event)=>change('hostSchoolId',event.target.value)}>{schools.map((school)=><option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label>{t.app.topicLabel}<select value={draft.category} onChange={(event)=>change('category',event.target.value)}>{interests.map((key)=><option key={key} value={key}>{t.categories[key]}</option>)}</select></label><button className="button" type="submit" disabled={busy}>{t.real.createEvent}</button></fieldset>{error && <p role="alert" className="field-error">{t.real.eventError}</p>}</form>}</>;
}
