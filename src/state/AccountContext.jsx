import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createSupabaseService, readBackendConfig } from '../services/supabase.js';
import { LanguageOverride } from '../i18n/LanguageContext.jsx';
import { accountCopy } from '../i18n/accountCopy.js';
import { replaceRoute } from './routeHistory.js';
import { routeFromHash } from '../data/navigation.js';

export const AccountContext = createContext(null);
function service(initialCallback) {
  let storage; try { storage = globalThis.localStorage; } catch { /* optional session persistence */ }
  return createSupabaseService({ config:readBackendConfig(import.meta.env), storage, locks:globalThis.navigator?.locks, location:globalThis.window?.location, history:globalThis.window?.history,initialCallback });
}
export function AccountProvider({ children,initialCallback }) {
  const [client] = useState(()=>service(initialCallback)), [user,setUser] = useState(null), [state,setState] = useState(null), [error,setError] = useState(''), [loading,setLoading] = useState(false);
  const [confirmation,setConfirmation]=useState({kind:'none'}),[redirectId,setRedirectId]=useState(null),[syncing,setSyncing]=useState(false);
  const [profileFailure,setProfileFailure]=useState(null);
  const generation = useRef(0), currentUser = useRef(null), queue = useRef(Promise.resolve()), revision = useRef(-1), pendingCommands = useRef(new Map());
  const pendingReload = useRef(null), lastSnapshot = useRef('');
  function applySnapshot(data) { if (Number.isSafeInteger(data.revision) && data.revision >= revision.current) { revision.current = data.revision; const serialized=JSON.stringify(data.state); if(serialized!==lastSnapshot.current){lastSnapshot.current=serialized;setState(data.state);} } }
  async function reload() {
    const id = client.getUser()?.id, marker = generation.current;
    if (!id) return false;
    if(pendingReload.current?.id===id && pendingReload.current.marker===marker)return pendingReload.current.promise;
    const promise=(async()=>{
      setSyncing(true);
      try { const data = await client.platform(); if (marker !== generation.current || id !== client.getUser()?.id) return false; applySnapshot(data);setProfileFailure(null); setError(''); return true; }
      catch (e) { if (marker === generation.current){setError(e.message);setProfileFailure({code:/^[a-z][a-z0-9_-]{0,50}$/.test(e.message)?e.message:'unavailable',status:Number.isInteger(e.status)?e.status:null});} return false; }
      finally {if(marker===generation.current)setSyncing(false);}
    })();
    pendingReload.current={id,marker,promise};
    try{return await promise;}finally{if(pendingReload.current?.promise===promise)pendingReload.current=null;}
  }
  useEffect(() => {
    if (import.meta.env.DEV && !client.configured) {
      // Diagnostics contain variable names only, never configuration values.
      console.info('[DeutschConnect] Supabase configuration is missing or invalid. Guest demo remains available. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY). Setup: docs/SUPABASE-SETUP.md');
    }
    const unsubscribe = client.subscribe(() => {
      const value = client.getUser();
      setConfirmation(client.getConfirmation());
      if (value?.id !== currentUser.current) {
        const previous = currentUser.current;
        if (previous) { try { const prefix = 'deutschconnect.page.v1:' + encodeURIComponent(previous) + ':'; for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key); } catch { /* optional tab drafts */ } }
        currentUser.current = value?.id; generation.current++; revision.current = -1;lastSnapshot.current=''; pendingCommands.current.clear();setProfileFailure(null); setState(null); setUser(value); setError('');
      }
    });
    setLoading(true); client.initialize().then(()=>{if(client.getConfirmation().signedIn && client.getUser())setRedirectId(client.getUser().id);}).catch((e) => setError(e.message)).finally(() => { setLoading(false); window.dispatchEvent(new Event('hashchange')); });
    const sync = (event) => client.synchronize(event).catch((e) => setError(e.message));
    window.addEventListener('storage',sync);
    window.addEventListener('online',sync);
    return () => { unsubscribe(); window.removeEventListener('storage',sync); window.removeEventListener('online',sync); };
  },[client]);
  useEffect(()=>{
    if(redirectId && user?.id===redirectId && state?.activeId===redirectId && state.profiles?.[redirectId]){
      setRedirectId(null);
      if(routeFromHash(window.location.hash)==='/me/account')replaceRoute(window,'/me');
    }
  },[redirectId,user?.id,state]);
  useEffect(() => {
    if (!user) return undefined;
    let active = true, running = false;
    const poll = async () => { if (!active || running || document.hidden) return; running = true; await reload(); running = false; };
    poll(); const interval = setInterval(poll,4000);
    window.addEventListener('online',poll); document.addEventListener('visibilitychange',poll);
    return () => { active = false; clearInterval(interval); window.removeEventListener('online',poll); document.removeEventListener('visibilitychange',poll); };
  },[user?.id]);
  function dispatch(action) {
    const actor = user?.id, marker = generation.current;
    const captured = structuredClone(action);
    const key = actor + '|' + JSON.stringify(captured);
    const commandId = pendingCommands.current.get(key) || crypto.randomUUID();
    pendingCommands.current.set(key,commandId);
    const work = queue.current.then(async () => {
      if (!actor || actor !== client.getUser()?.id || marker !== generation.current) return false;
      try { const data = await client.platform(captured,commandId); if (marker !== generation.current) return false; pendingCommands.current.delete(key); applySnapshot(data); setError(''); return true; }
      catch (e) { if (e.message !== 'network' && e.status < 500) pendingCommands.current.delete(key); if (marker === generation.current) setError(e.message); return false; }
    });
    queue.current = work.catch(() => false); return work;
  }
  async function signOut() { try { await client.signOut(); } catch { setError('network'); } }
  async function signIn(...args){await client.signIn(...args);setError('');setRedirectId(client.getUser()?.id);}
  async function retryAuth(){setLoading(true);setError('');try{await client.retryAuth();if(client.getConfirmation().signedIn)setRedirectId(client.getUser()?.id);}catch(e){setError(e.message);}finally{setLoading(false);}}
  async function acceptConfirmation(){await client.acceptConfirmation();setError('');setRedirectId(client.getUser()?.id);}
  function dismissConfirmation(){client.dismissConfirmation();setError('');}
  return <AccountContext.Provider value={{ configured:client.configured, user, state, error, loading,syncing,confirmation,profileFailure, dispatch, reload,retryAuth,acceptConfirmation,dismissConfirmation, signIn, signUp:client.signUp, signOut, resend:client.resend }}><LanguageOverride transform={user ? accountCopy : undefined}>{children}</LanguageOverride></AccountContext.Provider>;
}
export function useAccount() { return useContext(AccountContext); }
