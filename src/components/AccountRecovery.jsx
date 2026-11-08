import {useState} from 'react';
import {useAccount} from '../state/AccountContext.jsx';
import {useLanguage} from '../i18n/LanguageContext.jsx';
import Account from '../pages/Account.jsx';

export default function AccountRecovery(){
  const account=useAccount(),{t}=useLanguage(),[showSignIn,setShowSignIn]=useState(false);
  if(account.loading&&!account.user)return <main className="main-container" aria-busy="true"><h1>{t.auth.checking}</h1><p role="status">{t.real.loading}</p></main>;
  const busy=account.loading||account.syncing;
  return <main className="main-container">
    <h1>{t.auth.profileTitle}</h1><p>{t.auth.profilePending}</p>
    <p className="small-text">{account.user?.email}</p>
    {account.error?<><p role="alert" className="field-error">{t.real.errors[account.error]||t.auth.profileFailed}</p><p className="small-text">{t.auth.profileHelp}</p></>:<p role="status">{t.real.loading}</p>}
    {account.profileFailure&&<p className="small-text">{t.auth.diagnosticCode}: {account.profileFailure.status&&'HTTP '+account.profileFailure.status+' / '}{account.profileFailure.code}</p>}
    <div className="form-actions"><button className="button" disabled={busy} onClick={account.reload}>{busy?t.real.loading:t.auth.retryProfile}</button><button className="button button-secondary" disabled={busy} onClick={()=>setShowSignIn(true)}>{t.auth.openSignIn}</button><button className="text-button" disabled={busy} onClick={account.signOut}>{t.real.signOut}</button></div>
    {showSignIn&&<Account allowExistingSignIn />}
  </main>;
}
