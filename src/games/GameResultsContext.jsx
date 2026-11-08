import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { createGameRepository } from './resultRepository.js';
import { useUnsavedGuard } from '../state/usePageMemory.js';

export const GameResultsContext = createContext(null);
export function GameResultsProvider({children}) {
  const {profile,state,access} = useDemo();
  const [repository] = useState(() => {
    let storage; try { storage = globalThis.localStorage; } catch { /* optional local storage */ }
    return createGameRepository({storage,locks:globalThis.navigator?.locks,scope:access.mode === 'guest' ? 'demo' : 'account:'+profile.id,profileIds:access.mode === 'guest' ? Object.keys(state.profiles) : [profile.id]});
  });
  const [snapshot,setSnapshot] = useState(repository.getSnapshot);
  useEffect(() => repository.subscribe(setSnapshot),[repository]);
  useEffect(() => {
    const sync = (event) => { if (event.key === repository.key || event.key === null) repository.reload(); };
    window.addEventListener('storage',sync); return () => window.removeEventListener('storage',sync);
  },[repository]);
  return <GameResultsContext.Provider value={{...snapshot,
    record:(result) => repository.write({type:'record',result},profile.id),
    share:(game,shared) => access.mode === 'guest' ? repository.write({type:'share',game,shared},profile.id) : Promise.resolve(false),
  }}>{children}</GameResultsContext.Provider>;
}
export const useGameResults = () => useContext(GameResultsContext);

// Keep the same result ID on retries; re-rendering or StrictMode cannot count it twice.
export function useResultRecorder() {
  const {record} = useGameResults(), {t} = useLanguage();
  const pending = useRef(new Map());
  const [status,setStatus] = useState('');
  useUnsavedGuard(status==='saving' || status==='failed');
  async function save(result) {
    if (!result) return;
    pending.current.set(result.id,result); setStatus('saving');
    try { const success = await record(result); if (success) pending.current.delete(result.id); setStatus(pending.current.size ? 'failed':'saved'); }
    catch { setStatus('failed'); }
  }
  const notice = <div className="game-result-notice"><p role="status">{status ? t.leaderboard[status] : ''}</p>{status === 'failed' && <button className="button button-secondary" type="button" onClick={() => { for (const result of pending.current.values()) save(result); }}>{t.leaderboard.retry}</button>}</div>;
  return {save,notice,unsaved:status === 'failed' || status === 'saving'};
}
