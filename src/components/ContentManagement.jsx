import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';

// Ownership is also checked by the state layer. A backend must enforce it later.
export default function ContentManagement({ editHref, inactive, inactiveLabel, onWithdraw, onDelete }) {
  const { t } = useLanguage();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function run(action) {
    setBusy(true);
    setFailed(false);
    try { if (!(await action())) setFailed(true); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <section className="content-management" aria-busy={busy}>
    <h2>{t.quality.manageOwn}</h2>
    <div className="form-actions">
      <a className="button button-secondary" href={editHref}>{t.quality.edit}</a>
      {!inactive && <button className="button button-secondary" type="button" disabled={busy} onClick={() => run(onWithdraw)}>{inactiveLabel}</button>}
      <button className="text-button" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>{t.quality.delete}</button>
    </div>
    {confirmDelete && <div className="form-notice" role="group" aria-label={t.quality.deleteConfirm}>
      <p>{t.quality.deleteConfirm}</p>
      <div className="form-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => run(onDelete)}>{t.quality.delete}</button><button className="text-button" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>{t.quality.cancel}</button></div>
    </div>}
    {busy && <p className="save-status" role="status">{t.quality.saving}</p>}
    {failed && <p className="field-error" role="alert">{t.quality.saveFailed}</p>}
  </section>;
}
