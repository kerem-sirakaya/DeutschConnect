import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { interests, schools } from '../data/activities.js';
import { LanguageSwitcher } from '../components/Navigation.jsx';
import { TextField } from '../components/FormFields.jsx';
import { useFormDraft } from '../state/usePageMemory.js';
import { sharingFor, sharingKeys } from '../../supabase/functions/_shared/profiles.js';
import ActionButton from '../components/ActionButton.jsx';
import useActiveView from '../state/useActiveView.js';

export default function PersonalSettings() {
  const active = useActiveView();
  const { t } = useLanguage();
  const { state, access, profile, updatePreferences, storageAvailable } = useDemo();
  const canShare = access.mode === 'guest' || state.modules.profileCapabilities;
  const initial = { displayName: profile.displayName, schoolId: profile.schoolId, interests: [...profile.interests], customInterestsText: (profile.customInterests || []).join(', '), expectedProfile: JSON.stringify(profile) };
  const { draft, setDraft, clearDraft, restored, hasDraft, storageAvailable: draftStorageAvailable } = useFormDraft('profile', initial);
  const [nameError, setNameError] = useState(false);
  const [topicsError, setTopicsError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function change(patch) { setDraft({ ...draft, ...patch }); setSaved(false); }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const customInterests = [...new Set(draft.customInterestsText.split(',').map((topic) => topic.trim()).filter(Boolean))];
    const invalidName = draft.displayName.trim().length < 2 || draft.displayName.trim().length > 40;
    const invalidTopics = customInterests.length > 8 || customInterests.some((topic) => topic.length > 40);
    setNameError(invalidName);
    setTopicsError(invalidTopics);
    if (invalidName) {
      event.currentTarget.elements.namedItem('displayName').focus();
      return;
    }
    if (invalidTopics) { event.currentTarget.elements.namedItem('profile-custom-interests')?.focus(); return; }
    setBusy(true);
    setFailed(false);
    try {
      const patch = { displayName: draft.displayName.trim(), ...(draft.schoolId ? {schoolId:draft.schoolId} : {}), interests: draft.interests, customInterests, ...(canShare ? {profileSharing:draft.profileSharing || sharingFor(profile)} : {}) };
      const success = await updatePreferences(patch, draft.expectedProfile);
      if (!active.current) return;
      if (success) { clearDraft({ ...draft, displayName: patch.displayName, customInterestsText: customInterests.join(', '), expectedProfile: JSON.stringify({ ...profile, ...patch }) }); setSaved(true); }
      else setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <>
    <p className="module-note">{t.personal.settingsIntro}</p>
    <form className="content-card app-form" onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset className="app-form form-controls" disabled={busy} aria-label={t.app.preferences}>
      <h2>{t.app.preferences}</h2><p className="form-notice">{t.app.privacyHint}</p>
      {restored && <p className="save-status" role="status">{t.quality.draftRestored}</p>}
      <label htmlFor="display-name">{t.app.profileName}</label>
      <input id="display-name" name="displayName" value={draft.displayName} maxLength={40} required aria-invalid={nameError} aria-describedby={nameError ? 'name-error' : undefined} onChange={(event) => change({ displayName: event.target.value })} />
      {nameError && <p id="name-error" className="field-error">{t.app.validationName}</p>}
      <label htmlFor="profile-school">{t.app.schoolLabel}</label>
      <select id="profile-school" value={draft.schoolId} onChange={(event) => change({ schoolId: event.target.value })}><option value="" disabled>{t.real.noSchool}</option>{schools.map((school) => <option value={school.id} key={school.id}>{school.name}</option>)}</select>
      <fieldset><legend>{t.app.interestsLabel}</legend><p className="small-text">{t.app.interestHint}</p><div className="interest-options">{interests.map((interest) => <label key={interest}><input type="checkbox" checked={draft.interests.includes(interest)} onChange={() => change({ interests: draft.interests.includes(interest) ? draft.interests.filter((key) => key !== interest) : [...draft.interests, interest] })} /><span>{t.categories[interest]}</span></label>)}</div></fieldset>
      <TextField id="profile-custom-interests" label={t.quality.customInterests} value={draft.customInterestsText} onChange={(value) => change({ customInterestsText: value })} maxLength={327} multiline hint={t.quality.customInterestsHint} error={topicsError ? t.quality.validationFreeTopics : undefined} />
      <div className="preference-language"><span>{t.app.preferredLanguage}</span><LanguageSwitcher /></div>
      <fieldset><legend>{t.personal.profile.visibility}</legend><p className="small-text">{t.personal.profile.visibilityHint}</p>{canShare ? sharingKeys.map((key) => <label className="checkbox-row" key={key}><input type="checkbox" checked={(draft.profileSharing || sharingFor(profile))[key]} onChange={(event) => change({profileSharing:{...(draft.profileSharing || sharingFor(profile)),[key]:event.target.checked}})} />{t.personal.profile.fields[key]}</label>) : <p className="form-notice">{t.personal.profile.unavailable}</p>}</fieldset>
      {hasDraft && <p className="small-text">{draftStorageAvailable ? t.quality.savedDraft : t.quality.unsavedWarning}</p>}
      {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
      <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? t.quality.saving : t.app.saveChanges}</button>{hasDraft && <button className="text-button" type="button" disabled={busy} onClick={() => { clearDraft(initial); setNameError(false); setTopicsError(false); setSaved(false); }}>{t.quality.discardDraft}</button>}<p className="save-status" role="status">{saved && storageAvailable ? t.app.saved : ''}</p></div>
      </fieldset>
    </form>
    <section className="content-card section-block"><h2>{t.personal.profile.visibility}</h2><ActionButton disabled={!canShare && !state.modules.visibility[profile.id]} action={{type:'setCommunityVisibility',visible:!state.modules.visibility[profile.id]}}>{state.modules.visibility[profile.id] ? t.personal.profile.disable : t.personal.profile.enable}</ActionButton><p className="module-note">{t.personal.profile.visibilityHint}</p>{state.modules.visibility[profile.id] && <a className="text-link" href={'#/community/people/' + profile.id}>{t.personal.profile.preview}</a>}</section>
  </>;
}
