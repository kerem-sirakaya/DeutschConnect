import { useEffect, useRef, useState } from 'react';
import { useDemo } from './DemoContext.jsx';
import { clearPageMemory, readPageMemory, writePageMemory, submissionId } from './pageMemory.js';

const unsafeDrafts = new Set();
export function confirmUnsavedNavigation(message) { return !unsafeDrafts.size || window.confirm(message); }

// sessionStorage keeps filters and unfinished forms separate in each browser tab.
function storage() { try { return window.sessionStorage; } catch { return undefined; } }

function useMemory(scope, initial) {
  const { profile } = useDemo();
  const [snapshot, setSnapshot] = useState(() => readPageMemory(storage(), profile.id, scope, initial));
  const snapshotRef = useRef(snapshot);
  const initialRef = useRef(JSON.stringify(initial));
  const [dirty, setDirty] = useState(() => JSON.stringify(snapshot.value) !== initialRef.current);

  function setValue(update) {
    const value = typeof update === 'function' ? update(snapshotRef.current.value) : update;
    const available = writePageMemory(storage(), profile.id, scope, value);
    const next = { value, available, restored: snapshotRef.current.restored };
    snapshotRef.current = next;
    setSnapshot(next);
    setDirty(JSON.stringify(value) !== initialRef.current);
  }
  function clearDraft(value = snapshotRef.current.value) {
    const available = clearPageMemory(storage(), profile.id, scope);
    initialRef.current = JSON.stringify(value);
    const next = { value, restored: false, available };
    snapshotRef.current = next; setSnapshot(next); setDirty(false);
  }
  return { ...snapshot, setValue, clearDraft, dirty };
}

export function useRememberedState(scope, initial) {
  const memory = useMemory('filters:' + scope, initial);
  return [memory.value, memory.setValue];
}

export function useFormDraft(scope, initial) {
  const { profile } = useDemo();
  const creation = useRef(null);
  const memory = useMemory('draft:' + scope, initial);
  const guardToken = useRef(Symbol(scope));
  useEffect(() => {
    if (!memory.dirty) return undefined;
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    // App hash navigation and the persona selector consult this registry.
    const token = guardToken.current;
    if (!memory.available) unsafeDrafts.add(token);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); unsafeDrafts.delete(token); };
  }, [memory.dirty, memory.available, scope]);
  const clearDraft = (...args) => { unsafeDrafts.delete(guardToken.current); memory.clearDraft(...args); clearPageMemory(storage(),profile.id,'submission:'+scope); creation.current=null; };
  const getSubmissionId = () => creation.current || (creation.current=submissionId(storage(),profile.id,scope));
  return { draft: memory.value, setDraft: memory.setValue, clearDraft, getSubmissionId, restored: memory.restored, hasDraft: memory.dirty, storageAvailable: memory.available };
}
