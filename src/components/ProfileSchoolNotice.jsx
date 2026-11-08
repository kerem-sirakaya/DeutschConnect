import { useLanguage } from '../i18n/LanguageContext.jsx';

export default function ProfileSchoolNotice() {
  const {t}=useLanguage();
  return <section className="content-card"><p className="form-notice">{t.quality.schoolRequired}</p><a className="button" href="#/me/settings">{t.personal.tabs.settings}</a></section>;
}
