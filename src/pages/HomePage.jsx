import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { projects } from '../data/projects.js';
import {
  getEventRecommendations,
  getEventRole,
  getMyEvents,
  getMyIdeas,
  getMyProjects,
  getProjectRecommendations,
  getUpdates,
} from '../lib/selectors.js';
import { describeMatch } from '../lib/reasons.js';
import Section from '../components/Section.jsx';
import EventCard from '../components/EventCard.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import QuickActions from '../components/QuickActions.jsx';
import UpdatesList from '../components/UpdatesList.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { StatusBadge } from '../components/Badges.jsx';

/**
 * Startseite = persönliches Dashboard. Alle Inhalte hängen vom aktiven Profil ab:
 * eigene Events, Empfehlungen (Interessen + Schule), Projekte/Ideen, Hinweise.
 */
export default function HomePage() {
  const { t, language } = useI18n();
  const { user, ideas, events } = useAppState();
  const [now] = useState(() => new Date());
  usePageTitle(t('nav.home'));

  const myEvents = getMyEvents(user, events, now).upcoming;
  const recommendations = getEventRecommendations(user, events, now);
  const updates = getUpdates(user, { events, ideas }, now);
  const myIdeas = getMyIdeas(user, ideas).authored;
  const myProjects = getMyProjects(user, projects);
  const projectSuggestion = getProjectRecommendations(user, projects)[0];

  return (
    <div className="page home">
      <div className="home__greeting">
        <h1 tabIndex={-1}>{t('home.greeting', { name: user.firstName })}</h1>
        <p className="home__school">
          <Icon name="school" size={16} />
          <span>
            {user.school.name} · {t('profile.grade', { grade: user.grade })}
          </span>
        </p>
      </div>

      <QuickActions />

      {updates.length > 0 && (
        <Section title={t('home.updates')} icon="bell">
          <UpdatesList updates={updates.slice(0, 3)} />
        </Section>
      )}

      <div className="home__grid">
        <Section
          title={t('home.myNextEvents')}
          icon="calendar"
          linkTo="/events?tab=mine"
          linkLabel={myEvents.length > 3 ? `${t('common.showAll')} (${myEvents.length})` : t('common.showAll')}
        >
          {myEvents.length > 0 ? (
            <div className="card-list">
              {myEvents.slice(0, 3).map((event) => (
                <EventCard key={event.id} event={event} role={getEventRole(user, event)} ownSchoolId={user.schoolId} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="calendar"
              title={t('home.noEventsTitle')}
              text={t('home.noEventsText')}
              action={
                <Link to="/events?tab=all" className="btn btn--secondary btn--sm">
                  {t('quick.discover')}
                </Link>
              }
            />
          )}
        </Section>

        <Section
          title={t('home.forYou')}
          icon="sparkles"
          linkTo="/events?tab=foryou"
          linkLabel={recommendations.length > 3 ? `${t('common.showAll')} (${recommendations.length})` : t('common.showAll')}
        >
          {recommendations.length > 0 ? (
            <div className="card-list">
              {recommendations.slice(0, 3).map((rec) => (
                <EventCard
                  key={rec.event.id}
                  event={rec.event}
                  reason={describeMatch(rec, t)}
                  ownSchoolId={user.schoolId}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="sparkles"
              title={t('home.noRecsTitle')}
              text={t('home.noRecsText')}
              action={
                <Link to="/me/interests" className="btn btn--secondary btn--sm">
                  {t('recommend.editInterests')}
                </Link>
              }
            />
          )}
        </Section>

        <Section title={t('home.myProjectsIdeas')} icon="folder" linkTo="/ideas?tab=mine" linkLabel={t('common.showAll')}>
          {myProjects.length === 0 && myIdeas.length === 0 && (
            <EmptyState
              icon="lightbulb"
              title={t('home.noProjectsIdeas')}
              action={
                <Link to="/ideas/new" className="btn btn--secondary btn--sm">
                  {t('quick.newIdea')}
                </Link>
              }
            />
          )}

          {(myProjects.length > 0 || myIdeas.length > 0) && (
            <ul className="compact-list">
              {myProjects.map((project) => (
                <li key={project.id}>
                  <Link to={`/network/projects/${project.id}`} className="compact-row">
                    <Icon name="folder" size={18} />
                    <span className="compact-row__title">{localize(project.title, language)}</span>
                    <span className="compact-row__type">{t('home.typeProject')}</span>
                  </Link>
                </li>
              ))}
              {myIdeas.slice(0, 3).map((idea) => (
                <li key={idea.id}>
                  <Link to={`/ideas/${idea.id}`} className="compact-row">
                    <Icon name="lightbulb" size={18} />
                    <span className="compact-row__title">{localize(idea.title, language)}</span>
                    <StatusBadge type="idea" status={idea.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {projectSuggestion && (
            <div className="suggestion">
              <p className="suggestion__label">{t('home.suggestedProject')}</p>
              <ProjectCard project={projectSuggestion.project} reason={describeMatch(projectSuggestion, t)} />
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
