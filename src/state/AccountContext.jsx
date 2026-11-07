import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createSupabaseService, readBackendConfig } from '../services/supabase.js';
import { LanguageOverride } from '../i18n/LanguageContext.jsx';
import { accountCopy } from '../i18n/accountCopy.js';

export const AccountContext = createContext(null);
function service() {
  let storage; try { storage = globalThis.localStorage; } catch { /* optional session persistence */ }
  return createSupabaseService({ config:readBackendConfig(import.meta.env), storage, locks:globalThis.navigator?.locks, location:globalThis.window?.location, history:globalThis.window?.history });
}
export function AccountProvider({ children }) {
  const [client] = useState(service), [user,setUser] = useState(null), [state,setState] = useState(null), [error,setError] = useState(''), [loading,setLoading] = useState(false);
  const generation = useRef(0), currentUser = useRef(null), queue = useRef(Promise.resolve()), revision = useRef(-1), pendingCommands = useRef(new Map());
  function applySnapshot(data) { if (Number.isSafeInteger(data.revision) && data.revision >= revision.current) { revision.current = data.revision; setState(data.state); } }
  async function reload() {
    const id = client.getUser()?.id, marker = generation.current;
    if (!id) return false;
    try { const data = await client.platform(); if (marker !== generation.current || id !== client.getUser()?.id) return false; applySnapshot(data); setError(''); return true; }
    catch (e) { if (marker === generation.current) setError(e.message); return false; }
  }
  useEffect(() => {
    if (import.meta.env.DEV && !client.configured) {
      // Diagnostics contain variable names only, never configuration values.
      console.info('[DeutschConnect] Supabase configuration is missing or invalid. Guest demo remains available. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY). Setup: docs/SUPABASE-SETUP.md');
    }
    const unsubscribe = client.subscribe(() => {
      const value = client.getUser();
      if (value?.id !== currentUser.current) {
        const previous = currentUser.current;
        if (previous) { try { const prefix = 'deutschconnect.page.v1:' + encodeURIComponent(previous) + ':'; for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key); } catch { /* optional tab drafts */ } }
        currentUser.current = value?.id; generation.current++; revision.current = -1; pendingCommands.current.clear(); setState(null); setUser(value); setError('');
      }
    });
    setLoading(true); client.initialize().catch((e) => setError(e.message)).finally(() => { setLoading(false); window.dispatchEvent(new Event('hashchange')); });
    const sync = () => client.synchronize().catch((e) => setError(e.message));
    window.addEventListener('storage',sync);
    window.addEventListener('online',sync);
    return () => { unsubscribe(); window.removeEventListener('storage',sync); window.removeEventListener('online',sync); };
  },[client]);
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
  return <AccountContext.Provider value={{ configured:client.configured, user, state, error, loading, dispatch, reload, signIn:client.signIn, signUp:client.signUp, signOut, resend:client.resend }}><LanguageOverride transform={user ? accountCopy : undefined}>{children}</LanguageOverride></AccountContext.Provider>;
}
export function useAccount() { return useContext(AccountContext); }
