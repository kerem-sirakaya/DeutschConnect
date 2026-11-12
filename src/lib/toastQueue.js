/**
 * Reine Logik für Erfolgsmeldungen (Toasts) – ohne React, damit sie testbar ist.
 * Ein Toast: { id, message }. Dieselbe Meldung wird nicht doppelt angezeigt,
 * sondern ersetzt (neue id → neue Laufzeit). Höchstens MAX_TOASTS gleichzeitig.
 */
export const TOAST_DURATION_MS = 4000;
export const MAX_TOASTS = 3;

export function addToast(list, toast) {
  const rest = list.filter((item) => item.message !== toast.message);
  return [...rest, toast].slice(-MAX_TOASTS);
}

export function removeToast(list, id) {
  return list.filter((item) => item.id !== id);
}
