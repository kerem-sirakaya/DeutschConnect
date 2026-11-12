import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import de from '../locales/de.json';
import en from '../locales/en.json';
import tr from '../locales/tr.json';

/**
 * Einfaches, zentrales i18n-System ohne zusätzliche Bibliothek.
 * Alle festen Texte stehen in src/locales/*.json.
 * Neue Sprache: JSON-Datei anlegen und hier in LANGUAGES + DICTIONARIES eintragen.
 */
export const LANGUAGES = [
  { code: 'de', label: 'Deutsch', locale: 'de-DE' },
  { code: 'tr', label: 'Türkçe', locale: 'tr-TR' },
  { code: 'en', label: 'English', locale: 'en-GB' },
];

const DICTIONARIES = { de, tr, en };
const DEFAULT_LANGUAGE = 'de';
const STORAGE_KEY = 'deutschconnect.language';

function detectInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch {
    // localStorage nicht verfügbar (z. B. privater Modus) – Browsersprache verwenden
  }
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of browserLanguages) {
    const code = String(lang ?? '').slice(0, 2).toLowerCase();
    if (DICTIONARIES[code]) return code;
  }
  return DEFAULT_LANGUAGE;
}

function lookup(dictionary, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dictionary);
}

function resolve(dictionary, key, count) {
  if (typeof count === 'number') {
    const plural = lookup(dictionary, `${key}_${count === 1 ? 'one' : 'other'}`);
    if (typeof plural === 'string') return plural;
  }
  return lookup(dictionary, key);
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(detectInitialLanguage);

  useEffect(() => {
    // Wichtig für korrekte Groß-/Kleinschreibung (z. B. türkisches İ/ı) und Screenreader
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Speichern nicht möglich – Sprache gilt dann nur für diese Sitzung
    }
  }, [language]);

  const t = useCallback(
    (key, vars = {}) => {
      let value = resolve(DICTIONARIES[language], key, vars.count);
      if (typeof value !== 'string') value = resolve(DICTIONARIES[DEFAULT_LANGUAGE], key, vars.count);
      if (typeof value !== 'string') {
        if (import.meta.env.DEV) console.warn(`[i18n] Fehlende Übersetzung: ${key}`);
        return key;
      }
      return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage: (code) => DICTIONARIES[code] && setLanguage(code),
      locale: LANGUAGES.find((l) => l.code === language).locale,
      t,
    }),
    [language, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useI18n muss innerhalb von <LanguageProvider> verwendet werden.');
  return context;
}
