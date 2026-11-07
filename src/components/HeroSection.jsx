import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { schools } from '../data/activities.js';
import Icon from './Icon.jsx';

// A compact application greeting replaces the former promotional hero.
export default function HeroSection() {
  const { profile } = useDemo();
  const { t } = useLanguage();
  const school = schools.find((item) => item.id === profile.schoolId);
  return <section className="dashboard-welcome" aria-labelledby="welcome-title">
    <div><p className="welcome-school">{school ? school.name + ' · ' + school.city : t.real.noSchool}</p>
      <h1 id="welcome-title">{t.app.greeting}, {profile.displayName}.</h1>
      <p>{t.app.dashboardSubtitle}</p>
    </div>
    <span className="welcome-icon" aria-hidden="true"><Icon name="network" size={36} /></span>
  </section>;
}
