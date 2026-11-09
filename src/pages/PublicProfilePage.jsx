import { Link, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { getSchool } from '../data/schools.js';
import { usePublicProfile } from '../state/useProfiles.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import ListLink from '../components/ListLink.jsx';
import Section from '../components/Section.jsx';
import { StatusBadge, TopicTags } from '../components/Badges.jsx';
import ProfileStatusNotice from '../components/profiles/ProfileStatusNotice.jsx';
import NotFoundPage from './NotFoundPage.jsx';

/**
 * Öffentliches Profil (/community/people/:profileId).
 * Zeigt NUR, was die Person freigegeben hat. Privat und „gibt es nicht“ sehen gleich aus.
 * Eigenes Profil: Vorschau mit denselben Ausblendungen wie für andere.
 */
export default function PublicProfilePage() {
  const { profileId } = useParams();
  const { t, language } = useI18n();
  const result = usePublicProfile(profileId);

  if (result.status === 'loading' || result.status === 'error' || result.status === 'notInstalled') {
    return (
      <div className="page page--narrow">
        <PageHeader title={t('profiles.profileTitle')} backTo="/community/people" />
        <ProfileStatusNotice status={result.status} errorKey={result.errorKey} reload={result.reload} />
      </div>
    );
  }

  const person = result.data;
  if (!person) return <NotFoundPage titleKey="profiles.notAvailable" backTo="/community/people" />;
  const school = getSchool(person.schoolId);

  return (
    <div className="page page--narrow">
      <PageHeader title={person.firstName} backTo="/community/people" />

      {person.isDemo && <ProfileStatusNotice status="demo" />}
      {person.isSelf && (
        <p className={`notice ${person.isPublic ? 'notice--info' : 'notice--demo'}`}>
          <span>
            {t(person.isPublic ? 'profiles.previewPublic' : 'profiles.previewPrivate')}{' '}
            <Link to="/me/sharing" className="text-link">
              {t('profiles.manageMine')}
            </Link>
          </span>
        </p>
      )}

      <section className="profile-card card" aria-label={t('profiles.profileTitle')}>
        <Avatar profile={person} size="lg" />
        <div className="profile-card__text">
          <p className="profile-card__name">{person.firstName}</p>
          {school && (
            <p className="muted">
              <Link to={`/network/schools/${school.id}`}>{school.name}</Link>
            </p>
          )}
        </div>
      </section>

      <p className="muted">{t('profiles.onlySharedHere')}</p>

      {person.interests.length > 0 && (
        <Section title={t('me.interests')} icon="sparkles">
          <TopicTags topics={person.interests} />
        </Section>
      )}

      {person.activity && (
        <Section title={t('profiles.sharedActivity')} icon="star">
          <ul className="stats">
            {['ideasPublished', 'eventsPast', 'supportsReceived'].map((key) => (
              <li key={key}>
                <span className="stat">
                  <span className="stat__value">{person.activity[key] ?? '–'}</span>
                  <span className="stat__label">{t(`profiles.publicStats.${key}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {person.showProjects && (
        <Section title={t('profiles.projectsTitle')} icon="folder">
          {person.projects.length > 0 ? (
            <ul className="list-group">
              {person.projects.map((project) => (
                <ListLink
                  key={project.id}
                  to={`/ideas/${project.id}`}
                  icon="lightbulb"
                  title={localize(project.title, language)}
                  subtitle={localize(project.summary, language)}
                  trailing={<StatusBadge type="idea" status={project.status} />}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">{t('profiles.noProjects')}</p>
          )}
          <p className="muted small">{t('profiles.membershipsLater')}</p>
        </Section>
      )}
    </div>
  );
}
