/**
 * Akzentfarbe („Darstellung“). Die Farbwerte stehen in src/styles/themes.css; hier nur Auswahl,
 * Prüfung und Speichern. Gespeichert wird nur im Browser (localStorage), keine Datenbank.
 * Die Farbe wird als <html data-accent="…"> gesetzt – schon VOR dem ersten Zeichnen durch das
 * kleine Skript in index.html (gleiche Liste, gleicher Schlüssel → kein Aufblitzen in Blau).
 */
export const ACCENT_STORAGE_KEY = 'deutschconnect.accent';
export const DEFAULT_ACCENT = 'ocean';

/** Die sechs erlaubten Farben. swatch = Grundton für die Vorschau-Kachel. */
export const ACCENTS = [
  { id: 'ocean', swatch: '#3478CF' },
  { id: 'forest', swatch: '#39866A' },
  { id: 'lavender', swatch: '#9271CD' },
  { id: 'sunset', swatch: '#D98946' },
  { id: 'rose', swatch: '#D46B87' },
  { id: 'midnight', swatch: '#47516E' },
];

const IDS = new Set(ACCENTS.map((a) => a.id));

// Feste Übersetzungsschlüssel (keine zusammengesetzten Strings, damit die i18n-Prüfung sie findet).
export const ACCENT_NAME_KEYS = {
  ocean: 'appearance.accents.ocean',
  forest: 'appearance.accents.forest',
  lavender: 'appearance.accents.lavender',
  sunset: 'appearance.accents.sunset',
  rose: 'appearance.accents.rose',
  midnight: 'appearance.accents.midnight',
};

// Wer zeigt die aktuelle Farbe an? (Kopfzeilen-Palette, Einstellungen) – alle werden bei Änderung benachrichtigt.
const listeners = new Set();
export function subscribeAccent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** Aktuell angewendete Farbe (aus <html data-accent>). */
export const getAccent = () => normalizeAccent(globalThis.document?.documentElement?.dataset.accent);

/** Nur einer der sechs Werte ist gültig – alles andere → Ocean Blue. */
export function normalizeAccent(value) {
  return typeof value === 'string' && IDS.has(value) ? value : DEFAULT_ACCENT;
}

/** Gespeicherte Farbe lesen (Speicher gesperrt/leer/ungültig → Standard). */
export function readStoredAccent(storage = globalThis.localStorage) {
  try {
    return normalizeAccent(storage?.getItem(ACCENT_STORAGE_KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
}

/** Farbe speichern. Standard → Eintrag entfernen. Fehler beim Speichern (z. B. privates Fenster) egal. */
export function storeAccent(id, storage = globalThis.localStorage) {
  const accent = normalizeAccent(id);
  try {
    if (accent === DEFAULT_ACCENT) storage?.removeItem(ACCENT_STORAGE_KEY);
    else storage?.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // nicht speicherbar → gilt nur bis zum Neuladen
  }
  return accent;
}

/**
 * storage-Ereignis aus einem ANDEREN Tab → neue Farbe oder null (nichts tun).
 * Nur localStorage zählt: sessionStorage.clear() in einem anderen Tab (key = null) darf die Farbe
 * nicht zurücksetzen. Bei localStorage.clear() wird der (jetzt leere) Speicher neu gelesen → Standard.
 */
export function accentFromStorageEvent(event, localStore = globalThis.localStorage) {
  if (!event || (event.storageArea && event.storageArea !== localStore)) return null;
  if (event.key === ACCENT_STORAGE_KEY) return normalizeAccent(event.newValue);
  if (event.key === null) return readStoredAccent(localStore);
  return null;
}

/** Auf die Seite anwenden: <html data-accent="…">. */
export function applyAccent(id, root = globalThis.document?.documentElement) {
  const accent = normalizeAccent(id);
  if (root) root.dataset.accent = accent;
  listeners.forEach((listener) => listener(accent));
  return accent;
}

/** Auswählen = speichern + sofort überall anwenden. */
export const chooseAccent = (id) => applyAccent(storeAccent(id));
