import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { useIsAdmin } from '../state/AdminStatusContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

/** Avatar oben rechts: Konto, „Mein Bereich“, Admin-Link – für Gäste Anmelden/Registrieren. */
export default function ProfileMenu() {
  const { t } = useI18n();
  const { user, isRealAccount } = useAppState();
  const auth = useAuth();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="profile-menu__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {isRealAccount ? <Avatar profile={user} size="sm" /> : <Icon name="user" size={20} />}
        <span className="visually-hidden">
          {isRealAccount ? t('profileMenu.openAccount', { name: user.firstName }) : t('profileMenu.openGuest')}
        </span>
      </button>

      {open && (
        <div className="profile-menu__panel" id={panelId}>
          {isRealAccount ? (
            <>
              <p className="profile-menu__label">{t('auth.signedInAs', { name: user.firstName })}</p>
              <Link to="/me/settings" className="profile-menu__link" onClick={() => setOpen(false)}>
                {t('auth.accountTitle')}
                <Icon name="chevronRight" size={16} />
              </Link>
              {/* Nur sichtbar, wenn die Datenbank is_admin() = true bestätigt hat (Smartphone-Zugang) */}
              {isAdmin && (
                <Link to="/admin" className="profile-menu__link" onClick={() => setOpen(false)}>
                  {t('nav.admin')}
                  <Icon name="chevronRight" size={16} />
                </Link>
              )}
            </>
          ) : (
            <>
              <p className="profile-menu__label">{t('profileMenu.guestLabel')}</p>
              <Link to="/login" className="profile-menu__link" onClick={() => setOpen(false)}>
                {t('auth.toLogin')}
                <Icon name="chevronRight" size={16} />
              </Link>
              {auth.isSignupEnabled && (
                <Link to="/register" className="profile-menu__link" onClick={() => setOpen(false)}>
                  {t('auth.toRegister')}
                  <Icon name="chevronRight" size={16} />
                </Link>
              )}
            </>
          )}
          {isRealAccount && (
            <Link to="/me" className="profile-menu__link" onClick={() => setOpen(false)}>
              {t('profileMenu.toMyArea')}
              <Icon name="chevronRight" size={16} />
            </Link>
          )}
          <Link to="/help" className="profile-menu__link" onClick={() => setOpen(false)}>
            {t('nav.help')}
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
