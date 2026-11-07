import { createContext, useContext, useEffect, useState } from 'react';
import de from '../locales/de.json';
import tr from '../locales/tr.json';
import en from '../locales/en.json';
import deModules from '../locales/modules/de.json';
import trModules from '../locales/modules/tr.json';
import enModules from '../locales/modules/en.json';
import deQuality from '../locales/quality/de.json';
import trQuality from '../locales/quality/tr.json';
import enQuality from '../locales/quality/en.json';
import dePersonal from '../locales/personal/de.json';
import trPersonal from '../locales/personal/tr.json';
import enPersonal from '../locales/personal/en.json';
import dePlatform from '../locales/platform/de.json';
import trPlatform from '../locales/platform/tr.json';
import enPlatform from '../locales/platform/en.json';

const combine = (base, ext, quality, personal, platform) => ({ ...base, ext, quality, personal, ...platform, nav: { ...base.nav, ...ext.nav }, categories: { ...base.categories, open: ext.open } });
const translations = { de: combine(de, deModules, deQuality, dePersonal, dePlatform), tr: combine(tr, trModules, trQuality, trPersonal, trPlatform), en: combine(en, enModules, enQuality, enPersonal, enPlatform) };
const storageKey = 'deutschconnect.language';
const LanguageContext = createContext(null);

function initialLanguage() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (Object.hasOwn(translations, stored)) return stored;
  } catch { /* Language switching also works when browser storage is blocked. */ }
  const preferred = navigator.language?.slice(0, 2).toLowerCase();
  return Object.hasOwn(translations, preferred) ? preferred : 'de';
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(initialLanguage);
  const t = translations[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `DeutschConnect · ${t.siteTitle}`;
    document.querySelector('meta[name="description"]').content = t.siteDescription;
    try { localStorage.setItem(storageKey, language); } catch { /* Optional persistence. */ }
  }, [language, t]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageOverride({ transform, children }) {
  const value = useLanguage();
  return <LanguageContext.Provider value={transform ? { ...value, t:transform(value.t) } : value}>{children}</LanguageContext.Provider>;
}
