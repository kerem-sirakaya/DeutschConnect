import { useAccount } from '../state/AccountContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
export default function AccountStatus() {
  const account = useAccount(), { t } = useLanguage();
  return account?.error ? <aside className="storage-warning"><p role="status">{t.real.errors[account.error] || t.real.connectionError}</p><button className="button button-secondary" type="button" onClick={account.reload}>{t.quality.reloadStorage}</button></aside> : null;
}
