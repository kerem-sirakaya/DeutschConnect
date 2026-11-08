import {useState} from 'react';
import {useAccount} from '../state/AccountContext.jsx';
import {useLanguage} from '../i18n/LanguageContext.jsx';

export default function ConfirmationNotice(){
  const account=useAccount(),{t}=useLanguage(),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const notice=account?.confirmation;
  async function accept(){if(busy)return;setBusy(true);setFailed(false);try{await account.acceptConfirmation();}catch{setFailed(true);}finally{setBusy(false);}}
  if(!notice || notice.kind==='none')return null;
  if(notice.kind==='error')return <aside className="form-notice"><p role="alert">{t.real.errors[notice.code]||t.real.requestFailed}</p><button className="text-button" onClick={account.dismissConfirmation}>{t.auth.dismiss}</button></aside>;
  return <aside className="content-card auth-panel" aria-busy={busy}>
    {notice.kind==='different-account'?<><p role="alert">{t.auth.otherAccount}</p><p>{notice.email}</p><div className="form-actions"><button className="button" disabled={busy} onClick={accept}>{t.auth.acceptAccount}</button><button className="button button-secondary" disabled={busy} onClick={account.dismissConfirmation}>{t.auth.keepAccount}</button></div></>:<><p role="status">{notice.signedIn?t.auth.confirmedSignedIn:t.auth.confirmedSignIn}</p><button className="text-button" onClick={account.dismissConfirmation}>{t.auth.dismiss}</button></>}
    {failed&&<p role="alert" className="field-error">{t.real.requestFailed}</p>}
  </aside>;
}
