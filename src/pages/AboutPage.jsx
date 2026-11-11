import { useI18n } from '../i18n/LanguageContext.jsx';
// nur sichtbare Schulen (ausgeblendete: src/data/schools.js → HIDDEN_SCHOOL_IDS)
import { visibleSchools as schools } from '../data/schools.js';
import PageHeader from '../components/PageHeader.jsx';
import Icon from '../components/Icon.jsx';
import { StatusBadge } from '../components/Badges.jsx';

/** Über DeutschConnect – ehrlicher Projektstand, keine erfundenen Zahlen. */
export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="page page--narrow">
      <PageHeader title={t('about.title')} subtitle={t('about.tagline')} backTo="/me" />

      <section className="card about-block">
        <h2>{t('about.whatTitle')}</h2>
        <p>{t('about.whatText')}</p>
      </section>

      <section className="card about-block">
        <h2>{t('about.originTitle')}</h2>
        <p>{t('about.originText')}</p>
      </section>

      <section className="card about-block">
        <h2>{t('about.statusTitle')}</h2>
        <div className="status-columns">
          <div>
            <h3 className="status-heading status-heading--done">
              <Icon name="check" size={16} />
              {t('about.worksTitle')}
            </h3>
            <ul className="plain-list">
              {[1, 2, 3].map((n) => (
                <li key={n}>{t(`about.works${n}`)}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="status-heading">
              <Icon name="clock" size={16} />
              {t('about.openTitle')}
            </h3>
            <ul className="plain-list">
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>{t(`about.open${n}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card about-block">
        <h2>{t('about.schoolsTitle')}</h2>
        <ul className="plain-list plain-list--rows">
          {schools.map((school) => (
            <li key={school.id}>
              <span>{school.name}</span>
              <StatusBadge type="partnership" status={school.partnershipStatus} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card about-block">
        <h2>{t('about.impactTitle')}</h2>
        <p>{t('about.impactText')}</p>
        <p className="muted">{t('about.competition')}</p>
      </section>
    </div>
  );
}
