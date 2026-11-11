import { useState } from 'react';
import { Link } from 'react-router';
import { LANGUAGES, useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { getMyEvents, getMyIdeas } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import Section from '../components/Section.jsx';
import ListLink from '../components/ListLink.jsx';
import DemoNotice from '../components/DemoNotice.jsx';
import { TopicTags } from '../components/Badges.jsx';
import ActivityStats from '../components/profiles/ActivityStats.jsx';
import ProfileStatusNotice from '../components/profiles/ProfileStatusNotice.jsx';
import { useMySharing, useMyStats } from '../state/useProfiles.js';
import { useMyMemberships } from '../state/useProjects.js';

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
  // Projekte: nur für Konten (echte Mitwirkungen aus Migration 013). Demo-Projekte lagen im entfernten Netzwerk-Bereich.
  const memberships = useMyMemberships();
  const realMemberships = isRealAccount && memberships.data ? memberships.data : [];
  const languageLabel = LANGUAGES.find((l) => l.code === language).label;

  const stats = [
    { to: '/events?tab=mine', value: myEvents.upcoming.length, label: t('me.stats.events') },
    { to: '/ideas?tab=mine', value: myIdeas.authored.length, label: t('me.stats.ideas') },
    // Projekte-Kachel nur für echte Konten (Demo-Projekte gab es nur im entfernten Netzwerk-Bereich)
    ...(isRealAccount
      ? [
          {
            to: '/me#projects',
            value: memberships.data ? realMemberships.filter((m) => m.myStatus === 'member').length : '–',
            label: t('me.stats.projects'),
          },
        ]
      : []),
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
            {/* Schulname fehlt bei ausgeblendeter Schule → kein loses „·“ */}
            {[user.school?.name, t('profile.grade', { grade: user.grade })].filter(Boolean).join(' · ')}
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

      {isRealAccount && (
        <div id="projects">
          <Section title={t('me.myProjects')} icon="folder">
            {memberships.status === 'ready' && realMemberships.length === 0 && (
              <p className="muted">{t('projects.noMemberships')}</p>
            )}
            {memberships.status === 'notInstalled' && <p className="muted">{t('projects.errors.notInstalled')}</p>}
            {memberships.status === 'error' && <p className="muted">{t(memberships.errorKey)}</p>}
            {realMemberships.length > 0 && (
              <ul className="list-group">
                {realMemberships.map((m) => (
                  <ListLink
                    key={m.ideaId}
                    to={`/ideas/${m.ideaId}`}
                    icon="folder"
                    title={m.title}
                    subtitle={m.memberCount != null ? t('projects.memberCount', { count: m.memberCount }) : undefined}
                    trailing={<span className="badge badge--neutral">{t(`projects.myStatus.${m.myStatus}`)}</span>}
                  />
                ))}
              </ul>
            )}
          </Section>
        </div>
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
          <ListLink to="/help" icon="help" title={t('nav.help')} />
          <ListLink to="/about" icon="info" title={t('me.rows.about')} />
        </ul>
      </Section>

      {/* Echte Konten: kein Hinweis „… vorerst weiterhin Demo-Daten“ mehr. Demo-Profile behalten ihren Demo-Hinweis. */}
      {!isRealAccount && <DemoNotice textKey="demo.notice" />}
    </div>
  );
}
