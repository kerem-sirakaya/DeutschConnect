import { Link, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { getSchool } from '../data/schools.js';
import { usePublicProfile } from '../state/useProfiles.js';
import { usePublicMemberships } from '../state/useProjects.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import ListLink from '../components/ListLink.jsx';
import Section from '../components/Section.jsx';
import { StatusBadge, TopicTags } from '../components/Badges.jsx';
import ProfileStatusNotice from '../components/profiles/ProfileStatusNotice.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import ChatRequestPanel from '../components/chat/ChatRequestPanel.jsx';

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
              {school.name}
            </p>
          )}
        </div>
      </section>

      {/* „Nachricht senden“ → Nachrichtenanfrage (Chat, Migration 014); nicht auf dem eigenen Profil */}
      <ChatRequestPanel person={person} />

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
        </Section>
      )}

      {person.showProjects && <Memberships profileId={person.id} />}
    </div>
  );
}

/** Projekt-Mitgliedschaften (Migration 013) – die Datenbank liefert sie nur mit Profil-Freigabe. */
function Memberships({ profileId }) {
  const { t } = useI18n();
  const memberships = usePublicMemberships(profileId);
  if (memberships.status === 'guest') return null;
  return (
    <Section title={t('projects.membershipsTitle')} icon="users">
      {memberships.status === 'loading' && <p className="muted">{t('projects.loading')}</p>}
      {(memberships.status === 'error' || memberships.status === 'notInstalled') && (
        <p className="muted">{t(memberships.errorKey ?? 'projects.errors.generic')}</p>
      )}
      {memberships.status === 'ready' &&
        (memberships.data.length > 0 ? (
          <ul className="list-group">
            {memberships.data.map((m) => (
              <ListLink key={m.ideaId} to={`/ideas/${m.ideaId}`} icon="folder" title={m.title} subtitle={m.summary} />
            ))}
          </ul>
        ) : (
          <p className="muted">{t('projects.noPublicMemberships')}</p>
        ))}
    </Section>
  );
}
