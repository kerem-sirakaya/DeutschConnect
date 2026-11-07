import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';

// Recovery is deliberately an explicit action. Mounting the app never writes a
// repaired snapshot over the original stored data.
export default function PersistenceNotice() {
  const { t } = useLanguage();
  const { storageStatus, reloadStorage, exportRecovery } = useDemo();
  const [busy, setBusy] = useState(false);
  const [reloaded, setReloaded] = useState(false);
  if (!storageStatus) return null;
  const message = {
    recovered: t.quality.storageRecovered,
    conflict: t.quality.storageConflict,
    blocked: t.quality.storageBlocked,
    unavailable: t.quality.storageUnavailable,
  }[storageStatus.kind] || t.quality.storageUnavailable;
  async function reload() {
    setBusy(true);
    try { setReloaded(await reloadStorage()); } finally { setBusy(false); }
  }
  function download() {
    const backup = exportRecovery();
    if (!backup) return;
    const url = URL.createObjectURL(new Blob([backup.raw], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = backup.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (storageStatus.kind === 'ready') {
    return storageStatus.backupAvailable ? <details className="storage-warning">
      <summary>{t.quality.storageBackupAvailable}</summary>
      <p>{t.quality.storageRecoveryHint}</p>
      <button type="button" className="button button-secondary" onClick={download}>{t.quality.exportRecovery}</button>
    </details> : reloaded ? <p className="storage-warning" role="status">{t.quality.storageReloaded}</p> : null;
  }
  return <aside className="storage-warning" aria-label={t.app.demoShort}>
    <p role="status">{message}</p>
    {storageStatus.reason === 'locks-unavailable' && <p>{t.quality.locksUnavailable}</p>}
    {storageStatus.reason === 'backup-failed' && <p>{t.quality.storageBackupFailed}</p>}
    <div className="form-actions">
      <button type="button" className="button button-secondary" onClick={reload} disabled={busy}>{t.quality.reloadStorage}</button>
      {storageStatus.backupAvailable && <button type="button" className="button button-secondary" onClick={download}>{t.quality.exportRecovery}</button>}
    </div>
    {storageStatus.backupAvailable && <p>{t.quality.storageRecoveryHint}</p>}
  </aside>;
}
