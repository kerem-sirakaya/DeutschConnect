import { useRef, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
export default function ActionButton({ action, children, secondary = true, onSuccess, disabled = false }) {
  const { dispatch } = useDemo(), { t } = useLanguage();
  const [busy,setBusy] = useState(false), [result,setResult] = useState(''); const pending = useRef(false);
  async function run() { if (pending.current || disabled) return; pending.current=true; setBusy(true); setResult(''); try { if (await dispatch(action)) { setResult('saved'); onSuccess?.(); } else setResult('failed'); } catch { setResult('failed'); } finally { pending.current=false; setBusy(false); } }
  return <div><button type="button" className={secondary ? 'button button-secondary':'button'} disabled={busy || disabled} onClick={run}>{busy ? t.quality.saving : children}</button><p className="save-status" role="status">{result === 'failed' ? t.quality.saveFailed : result === 'saved' ? t.app.updated : ''}</p></div>;
}
