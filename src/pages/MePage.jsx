import { useState } from 'react';
import { Link } from 'react-router';
import { LANGUAGES, useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { projects } from '../data/projects.js';
import { getMyEvents, getMyIdeas, getMyProjects, getProjectRole } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import Section from '../components/Section.jsx';
import ListLink from '../components/ListLink.jsx';
import DemoNotice from '../components/DemoNotice.jsx';
import { RoleBadge, TopicTags } from '../components/Badges.jsx';
import ActivityStats from '../components/profiles/ActivityStats.jsx';
import ProfileStatusNotice from '../components/profiles/ProfileStatusNotice.jsx';
import { useMySharing, useMyStats } from '../state/useProfiles.js';

export default function MePage() {
  const { t, language } = useI18n();
  const { user, ideas, events, isRealAccount } = useAppState();
  const auth = useAuth();
  const [now] = useState(() => new Date());
  const activity = useMyStats();
  const sharing = useMySharing();
  const sharingLabel = sharing.data ? t(sharing.data.isPublic ? 'profiles.statePublic' : 'profiles.statePrivate') : '–';

  const myEvents = getMyEvents(user, events, now);
  const myIdeas = getMyIdeas(user, ideas);
  const myProjects = getMyProjects(user, projects);
  const languageLabel = LANGUAGES.find((l) => l.code === language).label;

  const stats = [
    { to: '/events?tab=mine', value: myEvents.upcoming.length, label: t('me.stats.events') },
    { to: '/ideas?tab=mine', value: myIdeas.authored.length, label: t('me.stats.ideas') },
    { to: '/network?tab=projects&show=mine', value: myProjects.length, label: t('me.stats.projects') },
  ];

  return (
    <div className="page page--narrow">
      <PageHeader title={t('me.title')} />

      <section className="profile-card card" aria-label={t('me.profile')}>
        <Avatar profile={user} size="lg" />
        <div className="profile-card__text">
          <p className="profile-card__name">
            {user.firstName} {user.lastName}
          </p>
          <p className="muted">
            <Link to={`/network/schools/${user.schoolId}`}>{user.school.name}</Link> ·{' '}
            {t('profile.grade', { grade: user.grade })}
          </p>
          {isRealAccount ? (
            <span className="badge badge--info">{t('profile.realAccount')}</span>
          ) : (
            <span className="badge badge--demo">{t('profile.demoProfile')}</span>
          )}
        </div>
        <Link to="/me/settings" className="btn btn--secondary btn--sm profile-card__switch">
          {isRealAccount ? t('auth.accountTitle') : t('me.switchProfile')}
        </Link>
      </section>

      <ul className="stats">
        {stats.map((stat) => (
          <li key={stat.to}>
            <Link to={stat.to} className="stat">
              <span className="stat__value">{stat.value}</span>
              <span className="stat__label">{stat.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Section title={t('profiles.myActivity')} icon="star">
        <ProfileStatusNotice status={activity.status} errorKey={activity.errorKey} reload={activity.reload} />
        {activity.data && <ActivityStats stats={activity.data} />}
        {activity.data && <p className="muted small">{t('profiles.statsPrivateHint')}</p>}
      </Section>

      <Section title={t('me.interests')} icon="sparkles" linkTo="/me/interests" linkLabel={t('me.edit')}>
        {user.interests.length > 0 ? (
          <TopicTags topics={user.interests} highlight={user.interests} />
        ) : (
          <p className="muted">{t('me.noInterests')}</p>
        )}
      </Section>

      {myProjects.length > 0 && (
        <Section title={t('me.myProjects')} icon="folder">
          <ul className="list-group">
            {myProjects.map((project) => (
              <ListLink
                key={project.id}
                to={`/network/projects/${project.id}`}
                icon="folder"
                title={localize(project.title, language)}
                trailing={<RoleBadge role={getProjectRole(user, project)} />}
              />
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('me.settingsSection')} icon="sliders">
        <ul className="list-group">
          {auth.isConfigured && (
            <ListLink
              to={auth.user ? '/me/settings' : '/login'}
              icon="user"
              title={t('auth.meRow')}
              trailing={auth.user ? t('auth.meRowSignedIn') : t('auth.toLogin')}
            />
          )}
          <ListLink
            to="/me/sharing"
            icon="shield"
            title={t('profiles.sharingTitle')}
            subtitle={t('profiles.sharingRowHint')}
            trailing={sharingLabel}
          />
          <ListLink to="/me/interests" icon="sparkles" title={t('me.rows.interests')} subtitle={t('me.rows.interestsHint')} />
          <ListLink to="/me/settings" icon="globe" title={t('me.rows.language')} trailing={languageLabel} />
          <ListLink to="/me/settings" icon="users" title={t('me.rows.settings')} subtitle={t('me.rows.settingsHint')} />
          <ListLink to="/about" icon="info" title={t('me.rows.about')} />
        </ul>
      </Section>

      <DemoNotice textKey={isRealAccount ? 'auth.demoStillActive' : 'demo.notice'} />
    </div>
  );
}
