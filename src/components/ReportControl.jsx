import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { reportReasons } from '../data/modules.js';

export default function ReportControl({ targetType, targetId }) {
  const { t } = useLanguage();
  const { state, profile, dispatch } = useDemo();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('privacy');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reported = state.modules.reports.some((item) => item.ownerId === profile.id && item.targetType === targetType && item.targetId === targetId);
  async function report() {
    setBusy(true);
    setFailed(false);
    try { setFailed(!await dispatch({ type: 'report', targetType, targetId, reason })); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <div className="report-control">
    <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>{t.ext.community.report}</button>
    {open && <div className="inline-form"><label>{t.ext.community.reason}<select value={reason} onChange={(event) => setReason(event.target.value)}>{reportReasons.map((key) => <option key={key} value={key}>{t.ext.reportReasons[key]}</option>)}</select></label><button className="button button-secondary" type="button" disabled={busy} onClick={report}>{busy ? t.quality.saving : t.ext.community.saveReport}</button></div>}
    {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
    {reported && <p className="small-text" role="status">{t.ext.community.reported}</p>}
  </div>;
}
