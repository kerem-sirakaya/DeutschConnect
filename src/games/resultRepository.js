import { leaderboardGames, validLocalResult } from './leaderboards.js';

export const resultsKey = (scope) => 'deutschconnect.game-results.v1:' + encodeURIComponent(scope);
const fresh = () => ({version:1,results:[],sharing:{}});

// Local persistence only. Never forwarded to the platform API as verified results.
export function createGameRepository({ storage, locks, scope, profileIds }) {
  const key = resultsKey(scope), listeners = new Set();
  let snapshot = {data:fresh(),available:true}, pending = Promise.resolve();
  const emit = () => { for (const listener of listeners) listener(snapshot); };
  function read() {
    if (!storage) throw new Error('storage');
    const raw = storage.getItem(key); if (raw === null) return fresh();
    if (raw.length > 2e6) throw new Error('size');
    const value = JSON.parse(raw), ids = new Set();
    if (value?.version !== 1 || !Array.isArray(value.results) || !value.sharing || typeof value.sharing !== 'object' || Array.isArray(value.sharing)) throw new Error('format');
    if (!value.results.every((result) => { if (!validLocalResult(result) || !profileIds.includes(result.ownerId) || ids.has(result.id)) return false; ids.add(result.id); return true; })) throw new Error('result');
    if (!Object.entries(value.sharing).every(([id,games]) => profileIds.includes(id) && games && typeof games === 'object' && !Array.isArray(games) && Object.entries(games).every(([game,shared]) => leaderboardGames.includes(game) && typeof shared === 'boolean'))) throw new Error('sharing');
    return value;
  }
  function reload() {
    try { snapshot = {data:read(),available:!!locks?.request}; }
    catch { snapshot = {...snapshot,available:false}; }
    emit(); return snapshot;
  }
  reload();
  function write(action, ownerId) {
    const operation = pending.then(async () => {
      if (!profileIds.includes(ownerId) || !locks?.request) { snapshot = {...snapshot,available:false}; emit(); return false; }
      try {
        return await locks.request(key,async () => {
          const data = read();
          if (action.type === 'record') {
            const result = {...action.result,ownerId};
            if (!validLocalResult(result)) return false;
            const existing = data.results.find((item) => item.id === result.id);
            if (existing) {
              const same=['id','ownerId','game','score','completed','completedAt','pairs','turns'].every((field)=>existing[field]===result[field]);
              if(same){snapshot={data,available:true};emit();}return same;
            }
            data.results.push(result);
          } else if (action.type === 'share' && leaderboardGames.includes(action.game) && typeof action.shared === 'boolean') {
            data.sharing[ownerId] = {...data.sharing[ownerId],[action.game]:action.shared};
          } else return false;
          const raw = JSON.stringify(data); if (raw.length > 2e6) throw new Error('size');
          storage.setItem(key,raw); snapshot = {data,available:true}; emit(); return true;
        });
      } catch { snapshot = {...snapshot,available:false}; emit(); return false; }
    });
    pending = operation.catch(() => false); return operation;
  }
  return { key, getSnapshot:() => snapshot, reload, write,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
