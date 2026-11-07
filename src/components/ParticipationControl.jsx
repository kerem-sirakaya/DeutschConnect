import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { StatusBadge } from './UI.jsx';

export default function ParticipationControl({ eventId }) {
  const { t } = useLanguage();
  const { participation, dispatch, access, activities } = useDemo();
  const open = access.mode === 'guest' || activities.find((event) => event.id === eventId)?.approval === 'confirmed';
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const status = participation[eventId];

  async function change(status) {
    if (busy) return;
    setBusy(true);
    setFeedback('');
    try { setFeedback(await dispatch({ type: 'participation', eventId, status }) ? 'saved' : 'failed'); }
    catch { setFeedback('failed'); }
    finally { setBusy(false); }
  }

  return <section className="content-card participation-panel" aria-labelledby="participation-heading">
    <h2 id="participation-heading">{t.app.participationTitle}</h2>
    <StatusBadge muted={!status}>{status === 'joined' ? t.personal.registered : t.app.status[status || 'none']}</StatusBadge>
    <div className="participation-actions" aria-busy={busy}>
      <button className="button button-secondary" type="button" disabled={busy} aria-pressed={status === 'interested'} onClick={() => change('interested')}>{t.app.interestAction}</button>
      <button className="button" type="button" disabled={busy || status === 'joined' || !open} aria-pressed={status === 'joined'} onClick={() => change('joined')}>{status === 'joined' ? t.personal.registered : t.personal.register}</button>
      {status && <button className="text-button" type="button" disabled={busy} onClick={() => change(null)}>{t.app.cancelAction}</button>}
    </div>
    <p className="small-text">{t.personal.registrationHint}</p>
    {!open && <p className="form-notice">{t.real.eventNotOpen}</p>}
    <p className="save-status" role="status">{busy ? t.quality.saving : feedback === 'saved' ? status === 'joined' ? t.personal.registrationSaved : t.app.updated : feedback === 'failed' ? t.quality.saveFailed : ''}</p>
    {status && <a className="text-link" href="#/me/activities">{t.personal.viewActivities}</a>}
  </section>;
}
