import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { demoProfiles } from '../data/profiles.js';
import { getSchool } from '../data/schools.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

/** Auswahl der Demo-Profile (keine echte Anmeldung). */
export default function ProfileSwitcher({ onSwitch }) {
  const { t } = useI18n();
  const { user, actions, isRealAccount } = useAppState();

  // Angemeldet: Demo-Profile sind erst nach dem Abmelden wieder wählbar.
  if (isRealAccount) return <p className="muted">{t('settings.profileSignedIn')}</p>;

  return (
    <ul className="profile-switcher">
      {demoProfiles.map((profile) => {
        const active = profile.id === user.id;
        return (
          <li key={profile.id}>
            <button
              type="button"
              className="profile-option"
              aria-pressed={active}
              onClick={() => {
                actions.switchProfile(profile.id);
                onSwitch?.(profile);
              }}
            >
              <Avatar profile={profile} size="sm" />
              <span className="profile-option__text">
                <span className="profile-option__name">
                  {profile.firstName} {profile.lastName}
                </span>
                <span className="profile-option__meta">
                  {getSchool(profile.schoolId)?.shortName} · {t('profile.grade', { grade: profile.grade })}
                </span>
              </span>
              {active && <Icon name="check" size={18} className="profile-option__check" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
