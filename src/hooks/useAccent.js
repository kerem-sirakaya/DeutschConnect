import { useSyncExternalStore } from 'react';
import { DEFAULT_ACCENT, getAccent, subscribeAccent } from '../lib/theme.js';

/** Aktuelle Akzentfarbe – aktualisiert sich, egal wo sie geändert wird (Palette, Einstellungen, anderer Tab). */
export function useAccent() {
  return useSyncExternalStore(subscribeAccent, getAccent, () => DEFAULT_ACCENT);
}
