import { useRef, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { projectParticipation } from '../data/projectParticipation.js';
import { isActive } from '../data/matching.js';
import { StatusBadge } from './UI.jsx';

export default function ProjectParticipation({ idea }) {
  const { t } = useLanguage();
  const { profile, state, dispatch, access } = useDemo();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pending = useRef(false);
  const status = projectParticipation(idea, profile.id);
  const interested = idea.interestedIds?.includes(profile.id) || false;
  const active = isActive(idea);
  async function run(action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFeedback('');
    try {
      const success = await dispatch({ ...action, id: idea.id, ...(action.type === 'reviewIdeaRequest' ? { expectedRecord: JSON.stringify(idea) } : {}) });
      setFeedback(success ? action.type === 'requestIdea' ? 'requested' : 'saved' : 'failed');
    } catch { setFeedback('failed'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="project-participation" aria-busy={busy}>
    <h2>{t.personal.projectParticipation}</h2><StatusBadge muted={status === 'none'}>{t.personal.projectStates[status]}</StatusBadge>
    {status !== 'owner' && <div className="form-actions">
      <button className="button button-secondary" type="button" disabled={busy || (!active && !interested)} aria-pressed={interested} onClick={() => run({ type: 'setIdeaInterest', interested: !interested })}>{interested ? t.personal.withdrawInterest : t.personal.interest}</button>
      {status === 'member' ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => run({ type: 'leaveIdea' })}>{t.personal.leave}</button> : status === 'requested' ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => run({ type: 'cancelIdeaRequest' })}>{t.personal.cancelRequest}</button> : <button className="button" type="button" disabled={busy || !active} onClick={() => run({ type: 'requestIdea' })}>{t.personal.request}</button>}
    </div>}
    {status === 'owner' && idea.requestedIds?.length > 0 && <section className="request-review"><h3>{t.personal.incomingRequests}</h3>{idea.requestedIds.map((id) => <div className="request-review-row" key={id}><span>{state.profiles[id].displayName}{access.mode === 'guest' ? ' · DEMO' : ''}</span><div className="form-actions"><button className="button button-secondary" type="button" disabled={busy || !active} onClick={() => run({ type: 'reviewIdeaRequest', profileId: id, decision: 'accept' })}>{t.personal.accept}</button><button className="text-button" type="button" disabled={busy || !active} onClick={() => run({ type: 'reviewIdeaRequest', profileId: id, decision: 'decline' })}>{t.personal.decline}</button></div></div>)}</section>}
    <p className="module-note">{t.personal.projectHint}</p>
    <p className="save-status" role="status">{busy ? t.quality.saving : feedback === 'failed' ? t.quality.saveFailed : feedback === 'requested' ? t.personal.requestSaved : feedback === 'saved' ? t.personal.memberSaved : ''}</p>
    <a className="text-link" href="#/me/projects">{t.personal.viewProjects}</a>
  </section>;
}
