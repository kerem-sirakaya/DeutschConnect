const prefix = 'deutschconnect.page.v1:';
const maximumSize = 24000;

export function pageMemoryKey(profileId, scope) { return prefix + encodeURIComponent(profileId) + ':' + encodeURIComponent(scope); }

// Only restore the structure the form expects, never arbitrary storage properties.
function compatible(value, initial) {
  if (Array.isArray(initial)) return Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === 'string');
  if (initial && typeof initial === 'object') return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(initial).every((key) => Object.hasOwn(value, key) && compatible(value[key], initial[key]));
  return typeof value === typeof initial && (typeof value !== 'string' || value.length <= 12000);
}

export function readPageMemory(storage, profileId, scope, initial) {
  try {
    if (!storage) return { value: initial, restored: false, available: false };
    const raw = storage.getItem(pageMemoryKey(profileId, scope));
    if (raw === null) return { value: initial, restored: false, available: true };
    const value = raw.length <= maximumSize ? JSON.parse(raw) : null;
    if (!compatible(value, initial)) return { value: initial, restored: false, available: false };
    return { value, restored: true, available: true };
  } catch { return { value: initial, restored: false, available: false }; }
}

export function writePageMemory(storage, profileId, scope, value) {
  try {
    const raw = JSON.stringify(value);
    if (!storage || raw.length > maximumSize) return false;
    storage.setItem(pageMemoryKey(profileId, scope), raw);
    return true;
  } catch { return false; }
}

export function clearPageMemory(storage, profileId, scope) {
  try { storage?.removeItem(pageMemoryKey(profileId, scope)); return Boolean(storage); } catch { return false; }
}

// Allocate on submission, never on initial page load. Reuse the record ID after
// a timeout so retrying a create cannot silently create a second record.
export function submissionId(storage, profileId, scope, create = () => 'local-' + crypto.randomUUID()) {
  const key = pageMemoryKey(profileId, 'submission:' + scope);
  try { const saved = storage?.getItem(key); if (/^local-[a-z0-9-]+$/.test(saved || '')) return saved; } catch { /* in-memory fallback */ }
  const id = create();
  try { storage?.setItem(key,id); } catch { /* navigation guard protects unsaved input */ }
  return id;
}
