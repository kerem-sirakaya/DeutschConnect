import Icon from './Icon.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { confirmUnsavedNavigation } from '../state/usePageMemory.js';

const destinations = [
  ['home', 'home', '/'], ['discover', 'search', '/discover'],
  ['tutoring', 'bulb', '/tutoring'], ['community', 'network', '/community'], ['me', 'user', '/me'],
];

export function Navigation({ page }) {
  const { t } = useLanguage();
  return <nav className="navigation" aria-label={t.navigationLabel}>
    {destinations.map(([key, icon, path]) => <a key={key} href={`#${path}`} className={`nav-link ${page === key ? 'active' : ''}`} aria-current={page === key ? 'page' : undefined}>
      <Icon name={icon} size={19} /><span>{t.nav[key]}</span>
    </a>)}
  </nav>;
}

export function LanguageSwitcher() {
  const { language, t, setLanguage } = useLanguage();
  const { updatePreferences } = useDemo();
  return <label className="language-switcher">
    <Icon name="globe" size={17} /><span className="sr-only">{t.language}</span>
    <select value={language} onChange={async (event) => { const nextLanguage = event.target.value; setLanguage(nextLanguage); await updatePreferences({ language: nextLanguage }); }}>
      <option value="de" lang="de" aria-label="Deutsch">DE</option>
      <option value="tr" lang="tr" aria-label="Türkçe">TR</option>
      <option value="en" lang="en" aria-label="English">EN</option>
    </select>
  </label>;
}

export default function Header({ page }) {
  const { t } = useLanguage();
  const { state, profile, switchProfile, access } = useDemo();
  return <header className="site-header">
    <div className="header-inner">
      <a className="brand" href="#/" aria-label={`DeutschConnect · ${t.nav.home}`}>
        <span className="brand-mark"><Icon name="globe" size={25} /></span>
        <span>Deutsch<span className="brand-accent">Connect</span></span>
      </a>
      <Navigation page={page} />
      <div className="header-actions"><LanguageSwitcher /><a className="create-link" href="#/ideas/new" aria-label={t.ext.create}><Icon name="plus" size={21} /></a><a className="avatar" href="#/me" aria-label={t.app.myArea}>{profile.displayName.slice(0, 1).toLocaleUpperCase()}</a></div>
    </div>
    <div className="demo-bar"><div className="demo-bar-inner">
      <details className="demo-info"><summary>{access.mode === 'guest' && <span className="demo-tag">DEMO</span>}<span>{access.mode === 'guest' ? t.personal.guest : t.real.accountShort}</span><Icon name="info" size={14} /></summary><p>{t.personal.guestHint} <a className="text-link" href="#/me/account">{t.personal.accountLink}</a></p></details>
      <label className="profile-switcher"><span className="sr-only">{t.app.switchProfile}</span>
        {access.mode === 'guest' ? <select value={profile.id} onChange={(event) => { if (confirmUnsavedNavigation(t.quality.unsavedWarning)) switchProfile(event.target.value); }}>
          {Object.values(state.profiles).map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.schoolId === 'ers' ? 'ERS' : 'Anka Bilim'}</option>)}
        </select> : <a className="text-link" href="#/me/account">{profile.displayName}</a>}
      </label>
    </div></div>
  </header>;
}
