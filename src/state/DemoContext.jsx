import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { createLocalRepository } from './localRepository.js';
import { guestAccess } from '../data/access.js';
import { useAccount } from './AccountContext.jsx';
import { activities as demoActivities } from '../data/activities.js';

export const DemoContext = createContext(null);
const personaKey = 'deutschconnect.demo.persona';

function browserRepository(language) {
  let storage;
  try { storage = globalThis.localStorage; } catch { /* Read-only UI remains usable. */ }
  return createLocalRepository({ storage, locks: globalThis.navigator?.locks, language });
}

export function DemoProvider({ children }) {
  const { language, setLanguage, t } = useLanguage();
  const account = useAccount();
  const [repository] = useState(() => browserRepository(language));
  const [snapshot, setSnapshot] = useState(repository.getSnapshot);
  const activeId = useRef(null);
  if (activeId.current === null) {
    let selected;
    try { selected = globalThis.sessionStorage?.getItem(personaKey); } catch { /* Optional tab preference. */ }
    activeId.current = Object.hasOwn(snapshot.state.profiles, selected) ? selected : snapshot.state.activeId;
  }
  // Active persona is tab-local. Receiving another tab's state never switches it.
  const state = account?.user && account.state ? account.state : { ...snapshot.state, activeId: activeId.current };
  const profile = state.profiles[state.activeId];
  const storageStatus = account?.user ? { kind:account.error ? 'blocked':'ready', reason:account.error, backupAvailable:false } : snapshot.storageStatus;

  useEffect(() => { setLanguage(profile.language); }, [profile.language, setLanguage]);
  useEffect(() => repository.subscribe(setSnapshot), [repository]);
  useEffect(() => {
    const sync = (event) => repository.onStorageEvent(event);
    globalThis.addEventListener?.('storage', sync);
    return () => globalThis.removeEventListener?.('storage', sync);
  }, [repository]);

  function switchProfile(id) {
    if (account?.user) return false;
    if (!Object.hasOwn(snapshot.state.profiles, id)) return false;
    activeId.current = id;
    try { globalThis.sessionStorage?.setItem(personaKey, id); } catch { /* Selection still works in memory. */ }
    setSnapshot({ ...repository.getSnapshot() });
    setLanguage(snapshot.state.profiles[id].language);
    return true;
  }

  function dispatch(action) {
    if (account?.user) return account.dispatch(action);
    if (action.type === 'switchProfile') return Promise.resolve(switchProfile(action.id));
    return repository.dispatch(action, activeId.current);
  }

  function updatePreferences(patch, expectedProfile) { return dispatch({ type: 'preferences', patch, ...(expectedProfile !== undefined ? { expectedProfile } : {}) }); }

  if (account?.user && !account.state) return <main className="main-container"><h1>{t.real.loadingAccount}</h1><p role="status">{account.error ? t.real.connectionError : t.real.loading}</p><div className="form-actions"><button className="button" onClick={account.reload}>{t.quality.reloadStorage}</button><button className="button button-secondary" onClick={account.signOut}>{t.real.signOut}</button></div></main>;
  const access = account?.user ? { mode:'account', subjectId:account.user.id, authenticationAvailable:true, synchronized:true, confirmedAttendanceAvailable:true } : account?.configured ? { ...guestAccess,authenticationAvailable:true } : guestAccess;
  return <DemoContext.Provider value={{ state, profile, activities:state.activities || demoActivities, access, participation: state.participation[profile.id], dispatch, updatePreferences, switchProfile,
    storageAvailable: ['ready', 'recovered'].includes(storageStatus.kind), storageStatus,
    exportRecovery: account?.user ? () => null : repository.exportRecovery, reloadStorage: account?.user ? account.reload : repository.reloadStorage }}>
    {children}
  </DemoContext.Provider>;
}

export function useDemo() { return useContext(DemoContext); }
