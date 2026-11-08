import { useRef, useState } from 'react';
import { useAccount } from '../state/AccountContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { TextField } from '../components/FormFields.jsx';
import ConfirmationNotice from '../components/ConfirmationNotice.jsx';

export default function Account({allowExistingSignIn=false}) {
  const { t,language } = useLanguage(), r = t.real;
  const account = useAccount();
  const [mode,setMode] = useState('signin'), [email,setEmail] = useState(''), [password,setPassword] = useState(''), [name,setName] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState(''), [sent,setSent] = useState(false);
  const [fields,setFields] = useState({});
  const [reauth,setReauth]=useState(false);
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    const invalid = {};
    if (mode === 'signup' && (name.trim().length < 2 || name.trim().length > 40)) invalid['account-name'] = t.quality.validationName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) invalid['account-email'] = r.invalidEmail;
    if (mode !== 'resend' && password.length < (mode === 'signup' ? 12 : 1)) invalid['account-password'] = mode === 'signup' ? r.passwordHint : r.passwordRequired;
    setFields(invalid);setError('');setSent(false);
    if (Object.keys(invalid).length) { document.getElementById(Object.keys(invalid)[0])?.focus(); return; }
    pending.current = true;
    setBusy(true); setError(''); setSent(false);
    try { if (mode === 'signup') { await account.signUp(email.trim(),password,name.trim(),language); setSent(true); } else if (mode === 'resend') { await account.resend(email.trim()); setSent(true); } else await account.signIn(email.trim(),password); setPassword(''); }
    catch (e) { setError(e.message); } finally { pending.current=false;setBusy(false); }
  }
  async function signOut() {
    if (pending.current) return;
    pending.current=true;setBusy(true);
    try { await account.signOut(); } finally { pending.current=false;setBusy(false); }
  }
  if (account?.user&&!allowExistingSignIn&&!reauth) return <section className="content-card auth-panel" aria-busy={busy}><ConfirmationNotice /><h2>{r.account}</h2><p>{r.verified}</p><p>{account.user.email}</p><p>{r.liveHint}</p>{account.confirmation?.kind==='confirmed'&&!account.confirmation.signedIn&&<button className="button" onClick={()=>setReauth(true)}>{t.auth.openSignIn}</button>}<button className="button button-secondary" type="button" disabled={busy} onClick={signOut}>{busy ? r.signingOut : r.signOut}</button></section>;
  if (!account?.configured) return <section className="content-card auth-panel">
    <h2>{r.account}</h2>
    <p>{r.notConfigured}</p>
    <a className="button button-secondary" href="#/">{r.continueDemo}</a>
  </section>;
  return <section className="content-card auth-panel">
    <ConfirmationNotice />
    {(allowExistingSignIn||reauth)&&account.user&&<p className="form-notice">{t.auth.reauthHint}</p>}
    <h2>{r.account}</h2><p>{mode === 'signin' ? r.signInHint : mode === 'resend' ? r.resendHint : r.authHint}</p>
    {account?.configured && <><div className="filter-chips" role="group" aria-label={r.account}>{['signin','signup','resend'].map((key) => <button type="button" key={key} disabled={busy} aria-pressed={mode === key} className={mode === key ? 'selected':''} onClick={() => { setMode(key); setError(''); setFields({});setSent(false);setPassword(''); }}>{key === 'signin' ? r.signIn : key === 'signup' ? r.signUp : r.resend}</button>)}</div>
      <form className="app-form" onSubmit={submit} noValidate aria-busy={busy}><fieldset className="app-form form-controls" disabled={busy} aria-label={r.account}>
        {mode === 'signup' && <TextField id="account-name" label={r.displayName} value={name} onChange={setName} maxLength={40} required autoComplete="nickname" error={fields['account-name']} />}
        <label htmlFor="account-email">{r.email}</label><input id="account-email" type="email" value={email} onChange={(event) => {setEmail(event.target.value);setSent(false);}} required autoComplete="email" aria-invalid={Boolean(fields['account-email'])} aria-describedby={fields['account-email'] ? 'account-email-error' : undefined} />
        {fields['account-email'] && <p className="field-error" id="account-email-error" role="alert">{fields['account-email']}</p>}
        {mode !== 'resend' && <><label htmlFor="account-password">{r.password}</label><input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'signup' ? 12 : 1} autoComplete={mode === 'signup' ? 'new-password':'current-password'} aria-invalid={Boolean(fields['account-password'])} aria-describedby={fields['account-password'] ? 'account-password-error' : undefined} />
          {mode === 'signup' && <p className="small-text">{r.passwordHint}</p>}{fields['account-password'] && <p className="field-error" id="account-password-error" role="alert">{fields['account-password']}</p>}</>}
        <button className="button" type="submit" disabled={busy}>{busy ? t.quality.saving : mode === 'signin' ? r.signIn : mode === 'signup' ? r.signUp : r.resend}</button>
      </fieldset></form></>}
    {(error || account?.error) && (error || account.error)!==account?.confirmation?.code && <p className="field-error" role="alert">{r.errors[error || account.error] || r.requestFailed}</p>}
    {account?.error&&account.retryAuth&&<button className="button button-secondary" type="button" disabled={busy||account.loading} onClick={account.retryAuth}>{t.auth.retryAuth}</button>}
    {sent && <p className="save-status" role="status">{r.mailSent}</p>}
    <p className="small-text">{t.personal.account.separation}</p>
  </section>;
}
