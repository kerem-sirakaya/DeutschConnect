import { LANGUAGES, useI18n } from '../i18n/LanguageContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import AccountCard from '../components/AccountCard.jsx';

/** Einstellungen: Sprache und Konto (Abmelden). Demo-Profile und „Demo zurücksetzen“ gibt es nicht mehr. */
export default function SettingsPage() {
  const { t, language, setLanguage } = useI18n();

  return (
    <div className="page page--narrow">
      <PageHeader title={t('settings.title')} backTo="/me" />

      <section className="card settings-block" aria-labelledby="settings-language">
        <h2 id="settings-language">{t('settings.language')}</h2>
        <div className="radio-list" role="radiogroup" aria-labelledby="settings-language">
          {LANGUAGES.map((lang) => (
            <label key={lang.code} className="radio">
              <input
                type="radio"
                name="language"
                value={lang.code}
                checked={language === lang.code}
                onChange={() => setLanguage(lang.code)}
              />
              <span lang={lang.code}>{lang.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Darstellung (Akzentfarbe) hier entfernt – Farbwahl nur noch über das Paletten-Symbol in der Kopfzeile */}

      <section className="card settings-block" aria-labelledby="settings-account">
        <h2 id="settings-account">{t('auth.accountTitle')}</h2>
        <AccountCard />
      </section>
    </div>
  );
}
