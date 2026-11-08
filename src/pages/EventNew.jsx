import { useRef, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { PageIntro } from '../components/UI.jsx';
import { TextField } from '../components/FormFields.jsx';
import { schools, interests } from '../data/activities.js';
import { useFormDraft } from '../state/usePageMemory.js';
import BackLink from '../components/BackLink.jsx';
import { replaceRoute } from '../state/routeHistory.js';
import useActiveView from '../state/useActiveView.js';

export default function EventNew() {
  const { t } = useLanguage(); const { profile,dispatch,access } = useDemo();
  const { draft,setDraft,clearDraft,getSubmissionId,restored,hasDraft,storageAvailable } = useFormDraft('event:new',{ title:'',description:'',startsAt:'',hostSchoolId:profile.schoolId || '',category:'language' });
  const [errors,setErrors] = useState({}), [failed,setFailed] = useState(false), [busy,setBusy] = useState(false);
  const pending=useRef(false);
  const active=useActiveView();
  const change = (key,value) => setDraft({ ...draft,[key]:value });
  async function save(event) {
    event.preventDefault(); if (pending.current) return;
    const invalid={};
    if(draft.title.trim().length<5 || draft.title.length>90)invalid['event-title']=t.quality.validationTitle;
    if(draft.description.trim().length<20 || draft.description.length>1500)invalid['event-description']=t.quality.validationEventDescription;
    if(!Number.isFinite(Date.parse(draft.startsAt)) || Date.parse(draft.startsAt)<=Date.now())invalid['event-date']=t.quality.validationEventDate;
    if(!schools.some(school=>school.id===draft.hostSchoolId))invalid['event-school']=t.quality.validationSchool;
    setErrors(invalid);setFailed(false);
    if(Object.keys(invalid).length){document.getElementById(Object.keys(invalid)[0])?.focus();return;}
    pending.current=true;setBusy(true);
    const id = getSubmissionId();
    try { if (await dispatch({ type:'createEvent', id,event:{ ...draft,startsAt:new Date(draft.startsAt).toISOString() } })) { if(!active.current)return;clearDraft(); replaceRoute(window,'/events/'+id+'?from='+encodeURIComponent('/events/all')); } else setFailed(true); } catch { setFailed(true); } finally { pending.current=false;setBusy(false); }
  }
  return <><BackLink fallback="/events/all" /><PageIntro title={t.real.createEvent} description={t.real.createEventHint} />{access.mode === 'guest' ? <p className="form-notice">{t.real.eventAccountRequired} <a className="text-link" href="#/me/account">{t.real.signIn}</a></p> :
    <form className="content-card app-form" onSubmit={save} noValidate aria-busy={busy}>
      <fieldset disabled={busy} className="app-form form-controls">
        {restored && <p className="save-status" role="status">{t.quality.draftRestored}</p>}
        <TextField id="event-title" label={t.app.titleLabel} value={draft.title} onChange={(value)=>change('title',value)} maxLength={90} required error={errors['event-title']} />
        <TextField id="event-description" label={t.app.descriptionLabel} value={draft.description} onChange={(value)=>change('description',value)} maxLength={1500} multiline required error={errors['event-description']} />
        <label htmlFor="event-date">{t.real.eventDate}</label><input id="event-date" type="datetime-local" value={draft.startsAt} required onChange={(event)=>change('startsAt',event.target.value)} aria-invalid={Boolean(errors['event-date'])} aria-describedby={errors['event-date']?'event-date-error':undefined} />
        {errors['event-date'] && <p id="event-date-error" className="field-error" role="alert">{errors['event-date']}</p>}
        <label htmlFor="event-school">{t.quality.hostSchool}</label><select id="event-school" value={draft.hostSchoolId} onChange={(event)=>change('hostSchoolId',event.target.value)} aria-invalid={Boolean(errors['event-school'])} aria-describedby={errors['event-school']?'event-school-error':undefined} required><option value="" disabled>{t.real.noSchool}</option>{schools.map((school)=><option key={school.id} value={school.id}>{school.name}</option>)}</select>
        {errors['event-school'] && <p id="event-school-error" className="field-error" role="alert">{errors['event-school']}</p>}
        <label htmlFor="event-category">{t.app.topicLabel}</label><select id="event-category" value={draft.category} onChange={(event)=>change('category',event.target.value)}>{interests.map((key)=><option key={key} value={key}>{t.categories[key]}</option>)}</select>
        {hasDraft && <p className="small-text" role="status">{storageAvailable?t.quality.savedDraft:t.quality.unsavedWarning}</p>}
        <button className="button" type="submit" disabled={busy}>{busy?t.quality.saving:t.real.createEvent}</button>
      </fieldset>
      {failed && <p role="alert" className="field-error">{t.quality.saveFailed}</p>}
    </form>}</>;
}
