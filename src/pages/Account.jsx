import { useState } from 'react';
import { useAccount } from '../state/AccountContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { TextField } from '../components/FormFields.jsx';

export default function Account() {
  const { t,language } = useLanguage(), r = t.real;
  const account = useAccount();
  const [mode,setMode] = useState('signin'), [email,setEmail] = useState(''), [password,setPassword] = useState(''), [name,setName] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState(''), [sent,setSent] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (mode !== 'resend' && password.length < (mode === 'signup' ? 12 : 1)) || (mode === 'signup' && (name.trim().length < 2 || name.trim().length > 40))) { setError('form'); return; }
    setBusy(true); setError(''); setSent(false);
    try { if (mode === 'signup') { await account.signUp(email,password,name.trim(),language); setSent(true); } else if (mode === 'resend') { await account.resend(email); setSent(true); } else await account.signIn(email,password); setPassword(''); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (account?.user) return <section className="content-card auth-panel"><h2>{r.account}</h2><p>{r.verified}</p><p>{account.user.email}</p><p>{r.liveHint}</p><button className="button button-secondary" type="button" onClick={account.signOut}>{r.signOut}</button></section>;
  if (!account?.configured) return <section className="content-card auth-panel">
    <h2>{r.account}</h2>
    <p>{r.notConfigured}</p>
    <a className="button button-secondary" href="#/">{r.continueDemo}</a>
  </section>;
  return <section className="content-card auth-panel">
    <h2>{r.account}</h2><p>{mode === 'signin' ? r.signInHint : mode === 'resend' ? r.resendHint : r.authHint}</p>
    {account?.configured && <><div className="filter-chips" role="group" aria-label={r.account}>{['signin','signup','resend'].map((key) => <button type="button" key={key} aria-pressed={mode === key} className={mode === key ? 'selected':''} onClick={() => { setMode(key); setError(''); setPassword(''); }}>{key === 'signin' ? r.signIn : key === 'signup' ? r.signUp : r.resend}</button>)}</div><form className="app-form" onSubmit={submit} noValidate><fieldset className="app-form form-controls" disabled={busy} aria-label={r.account}>{mode === 'signup' && <TextField id="account-name" label={r.displayName} value={name} onChange={setName} maxLength={40} required autoComplete="nickname" />}<label htmlFor="account-email">{r.email}</label><input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />{mode !== 'resend' && <><label htmlFor="account-password">{r.password}</label><input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'signup' ? 12 : 1} autoComplete={mode === 'signup' ? 'new-password':'current-password'} />{mode === 'signup' && <p className="small-text">{r.passwordHint}</p>}</>}<button className="button" type="submit" disabled={busy}>{busy ? t.quality.saving : mode === 'signin' ? r.signIn : mode === 'signup' ? r.signUp : r.resend}</button></fieldset></form></>}
    {(error || account?.error) && <p className="field-error" role="alert">{error === 'form' ? r.invalidForm : r.errors[error || account.error] || r.requestFailed}</p>}
    {sent && <p className="save-status" role="status">{r.mailSent}</p>}
    <p className="small-text">{t.personal.account.separation}</p>
  </section>;
}
