import { useState } from 'react';
import { LANGUAGES, useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProfileSwitcher from '../components/ProfileSwitcher.jsx';
import Icon from '../components/Icon.jsx';
import AccountCard from '../components/AccountCard.jsx';

export default function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { actions } = useAppState();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

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

      <section className="card settings-block" aria-labelledby="settings-profile">
        <h2 id="settings-profile">{t('settings.profile')}</h2>
        <p className="muted">{t('settings.profileHint')}</p>
        <ProfileSwitcher />
      </section>

      <section className="card settings-block" aria-labelledby="settings-data">
        <h2 id="settings-data">{t('settings.data')}</h2>
        <p className="muted">{t('settings.dataText')}</p>
        {!confirmReset ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setConfirmReset(true);
              setResetDone(false);
            }}
          >
            <Icon name="refresh" size={18} />
            {t('settings.reset')}
          </button>
        ) : (
          <div className="confirm" role="group" aria-label={t('settings.reset')}>
            <p>{t('settings.resetConfirm')}</p>
            <div className="confirm__actions">
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => {
                  actions.resetDemo();
                  setConfirmReset(false);
                  setResetDone(true);
                }}
              >
                {t('settings.resetYes')}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmReset(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
        <p role="status" className="status-text">
          {resetDone && (
            <>
              <Icon name="check" size={16} />
              {t('settings.resetDone')}
            </>
          )}
        </p>
      </section>
    </div>
  );
}
