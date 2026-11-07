import { createDemoState, demoReducer, demoStorageKey, inspectDemoState } from '../data/demoState.js';

export const demoLockName = 'deutschconnect-demo-write-v1';
export const recoveryPrefix = demoStorageKey + '.recovery.';
const stable = (value) => JSON.stringify(value, function (key, item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]]));
  return item;
});

// This is the replaceable persistence boundary. It has no React/browser globals,
// authentication, network calls or dependency on a future database schema.
export function createLocalRepository({ storage, locks, language = 'de', writerId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) } = {}) {
  let state = createDemoState(language);
  let raw = null;
  let recoveryRaw = null;
  let status = { kind: 'ready', recoveredRecords: 0, backupAvailable: false };
  let pending = Promise.resolve();
  let recoverySequence = 0;
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener({ state, storageStatus: status }); };
  const read = () => {
    if (!storage) throw new Error('unavailable');
    return storage.getItem(demoStorageKey);
  };
  const retainRecovery = (value) => { if (value !== null && value !== undefined) recoveryRaw = value; };
  function applyRead(value) {
    const result = inspectDemoState(value, language);
    raw = value;
    state = result.state;
    if (result.blocked || result.recoveredRecords) retainRecovery(value);
    status = { kind: result.blocked ? 'blocked' : result.recoveredRecords ? 'recovered' : 'ready', recoveredRecords: result.recoveredRecords, backupAvailable: recoveryRaw !== null, ...(result.reason ? { reason: result.reason } : {}) };
    return result;
  }
  function load() {
    try { applyRead(read()); }
    catch { status = { kind: 'unavailable', reason: 'read', recoveredRecords: 0, backupAvailable: recoveryRaw !== null }; }
    // Backups survive reloads as well. A failed optional backup read does not
    // invalidate the authoritative state or remove any stored snapshot.
    if (recoveryRaw === null) {
      try {
        const keys = [];
        for (let index = 0; index < storage?.length; index++) {
          const key = storage.key(index);
          if (key?.startsWith(recoveryPrefix)) keys.push(key);
        }
        const latestKey = keys.sort().at(-1);
        if (latestKey) retainRecovery(storage.getItem(latestKey));
        status = { ...status, backupAvailable: recoveryRaw !== null };
      } catch { /* The current raw input remains available for export. */ }
    }
    emit();
    return { state, storageStatus: status };
  }
  load(); // Reading never writes defaults or repairs back to storage.

  async function mutate(action, actorId) {
    if (!locks?.request) {
      // localStorage has no atomic compare-and-set. Refuse writes rather than
      // claim that a revision check alone prevents simultaneous lost updates.
      try {
        const currentRaw = read();
        if (currentRaw !== raw) { retainRecovery(raw); status = { ...status, kind: 'conflict', reason: 'changed', backupAvailable: recoveryRaw !== null }; }
        else status = { ...status, kind: 'blocked', reason: 'locks-unavailable' };
      } catch { status = { ...status, kind: 'unavailable', reason: 'read' }; }
      emit(); return false;
    }
    try {
      return await locks.request(demoLockName, async () => {
        const latestRaw = read();
        const latest = inspectDemoState(latestRaw, language);
        if (latest.blocked) {
          retainRecovery(latestRaw);
          status = { kind: 'blocked', reason: latest.reason, recoveredRecords: 0, backupAvailable: true };
          emit(); return false;
        }
        if (!Object.hasOwn(latest.state.profiles, actorId)) return false;
        if (action.expectedProfile !== undefined) {
          let expected;
          try { expected = JSON.parse(action.expectedProfile); } catch { expected = null; }
          const value = (profile, key) => key === 'customInterests' ? profile?.[key] || [] : profile?.[key];
          const changed = Object.keys(action.patch || {}).some((key) => stable(value(latest.state.profiles[actorId], key)) !== stable(value(expected, key)));
          if (!expected || changed) {
            status = { ...status, kind: 'conflict', reason: 'record-changed' }; emit(); return false;
          }
        }
        if (action.expectedRecord !== undefined) {
          const collection = action.type.includes('Tutoring') ? latest.state.modules.tutoring : latest.state.ideas;
          let expected;
          try { expected = JSON.parse(action.expectedRecord); } catch { expected = null; }
          if (!expected || stable(collection.find((item) => item.id === action.id)) !== stable(expected)) {
            status = { ...status, kind: 'conflict', reason: 'record-changed' }; emit(); return false;
          }
        }
        const next = demoReducer(latest.state, { ...action, actorId, at: new Date().toISOString() });
        if (next === latest.state) return false;
        // Keep every raw recovery snapshot, never evict or overwrite a backup.
        // If quota prevents the backup, the authoritative snapshot is untouched.
        if (latest.recoveredRecords) {
          retainRecovery(latestRaw);
          const backupKey = recoveryPrefix + Date.now() + '.' + writerId + '.' + (++recoverySequence);
          try { storage.setItem(backupKey, latestRaw); }
          catch (error) {
            status = { ...status, kind: 'unavailable', reason: 'backup-failed', failure: error?.name === 'QuotaExceededError' ? 'quota' : 'write', backupAvailable: true };
            emit(); return false;
          }
        }
        // Detect old/uncooperative writers too. Web Locks serialize this app's
        // writers, but cannot lock browser tools or older application versions.
        if (read() !== latestRaw) {
          status = { ...status, kind: 'conflict', reason: 'changed' }; emit(); return false;
        }
        const serialized = JSON.stringify({ ...next, _persistence: { revision: latest.revision + 1, writerId } });
        storage.setItem(demoStorageKey, serialized);
        raw = serialized;
        state = next;
        status = { kind: latest.recoveredRecords ? 'recovered' : 'ready', recoveredRecords: latest.recoveredRecords, backupAvailable: recoveryRaw !== null };
        emit(); return true;
      });
    } catch (error) {
      status = { ...status, kind: 'unavailable', reason: error?.name === 'QuotaExceededError' ? 'quota' : 'write', backupAvailable: recoveryRaw !== null };
      emit(); return false;
    }
  }

  return {
    getSnapshot: () => ({ state, storageStatus: status }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    // Capture the actor before joining the queue; persona changes cannot reassign it.
    dispatch(action, actorId) {
      const capturedActor = actorId;
      const capturedAction = structuredClone(action);
      const operation = pending.then(() => mutate(capturedAction, capturedActor));
      pending = operation.catch(() => false);
      return operation;
    },
    reloadStorage: async () => { load(); return status.kind !== 'blocked' && status.kind !== 'unavailable'; },
    onStorageEvent(event) {
      if (event.key !== demoStorageKey && event.key !== null) return;
      // Always re-read the latest value: queued browser events may be out of order.
      load();
    },
    exportRecovery() {
      const value = recoveryRaw ?? raw;
      return value === null ? null : { raw: value, fileName: 'deutschconnect-recovery.json' };
    },
  };
}
