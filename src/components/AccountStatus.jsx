import { useRef, useState } from 'react';
import { useAccount } from '../state/AccountContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
export default function AccountStatus() {
  const account = useAccount(), { t } = useLanguage();
  const pending=useRef(false),[busy,setBusy]=useState(false);
  async function reload(){if(pending.current)return;pending.current=true;setBusy(true);try{await account.reload();}finally{pending.current=false;setBusy(false);}}
  return account?.error ? <aside className="storage-warning" aria-busy={busy}><p role="status">{t.real.errors[account.error] || t.real.connectionError}</p><button className="button button-secondary" type="button" disabled={busy} onClick={reload}>{busy ? t.real.loading : t.quality.reloadStorage}</button></aside> : null;
}
