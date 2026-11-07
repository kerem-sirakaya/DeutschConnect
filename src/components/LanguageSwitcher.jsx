import { LANGUAGES, useI18n } from '../i18n/LanguageContext.jsx';
import Icon from './Icon.jsx';

/**
 * Kompakter Sprachumschalter (Globus + Kürzel). Technisch ein natives <select>,
 * das unsichtbar über dem Button liegt – dadurch voll tastatur- und screenreaderfähig.
 */
export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="lang-switch" title={t('settings.language')}>
      <Icon name="globe" size={18} />
      <span className="lang-switch__code" aria-hidden="true">
        {language.toUpperCase()}
      </span>
      <span className="visually-hidden">{t('settings.language')}</span>
      <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} lang={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}
