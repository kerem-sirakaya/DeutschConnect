import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';

export default function InterestToggle({ targetType, targetId, label, withdraw, disabled = false }) {
  const { state, profile, dispatch } = useDemo();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const selected = state.modules.interests[profile.id].includes(targetType + ':' + targetId);
  async function toggle() {
    setBusy(true);
    setFeedback('');
    try { setFeedback(await dispatch({ type: 'toggleModuleInterest', targetType, targetId }) ? 'saved' : 'failed'); }
    catch { setFeedback('failed'); }
    finally { setBusy(false); }
  }
  return <div><button className={selected ? 'button button-secondary' : 'button'} type="button" disabled={disabled || busy} aria-pressed={selected} onClick={toggle}>{selected ? (withdraw || t.ext.discover.withdraw) : (label || t.ext.discover.interest)}</button><span className="save-status" role="status">{busy ? t.quality.saving : feedback === 'failed' ? t.quality.saveFailed : feedback === 'saved' ? t.app.updated : ''}</span></div>;
}
import { useState } from 'react';
