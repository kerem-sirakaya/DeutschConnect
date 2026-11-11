import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import {
  getEventRecommendations,
  getEventRole,
  getMyEvents,
  getMyIdeas,
  getUpdates,
} from '../lib/selectors.js';
import { describeMatch } from '../lib/reasons.js';
import Section from '../components/Section.jsx';
import EventCard from '../components/EventCard.jsx';
import QuickActions from '../components/QuickActions.jsx';
import UpdatesList from '../components/UpdatesList.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { StatusBadge } from '../components/Badges.jsx';
import TutoringCard from '../components/tutoring/TutoringCard.jsx';
import { useTutoring } from '../state/TutoringContext.jsx';
import { countOpenIncoming, matchTutoring } from '../lib/tutoring.js';
import { greetingMessage } from '../lib/greeting.js';
import { useNow } from '../hooks/useNow.js';

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
  const tutoring = useTutoring();
  const tutoringSuggestions = matchTutoring(tutoring.entries, language);
  const openTutoringRequests = countOpenIncoming(tutoring.requests);

  return (
    <div className="page home">
      {/* Begrüßungskarte im Codex-Design (blaue Karte) */}
      <section className="dashboard-welcome" aria-labelledby="welcome-title">
        <div>
          <p className="dashboard-welcome__school">
            {/* Schulname fehlt bei ausgeblendeter Schule → kein loses „·“ */}
            {[user.school?.name, user.grade ? t('profile.grade', { grade: user.grade }) : ''].filter(Boolean).join(' · ')}
          </p>
          <DashboardGreeting firstName={user.firstName} />
          <p>{t('home.dashboardSubtitle')}</p>
        </div>
        <span className="dashboard-welcome__icon" aria-hidden="true">
          <Icon name="network" size={36} />
        </span>
      </section>

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

        <Section
          title={t(tutoringSuggestions.type === 'matches' ? 'home.tutoringMatches' : 'home.tutoringDiscover')}
          icon="lightbulb"
          linkTo={openTutoringRequests > 0 ? '/tutoring?tab=contacts' : '/tutoring'}
          linkLabel={
            openTutoringRequests > 0 ? t('home.tutoringOpenRequests', { count: openTutoringRequests }) : t('common.showAll')
          }
        >
          {tutoringSuggestions.entries.length > 0 ? (
            <div className="card-list">
              {tutoringSuggestions.entries.slice(0, 2).map((entry) => (
                <TutoringCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="lightbulb"
              title={t(tutoring.status === 'notInstalled' ? 'tutoring.errors.notInstalled' : 'home.noTutoring')}
              action={
                <Link to="/tutoring" className="btn btn--secondary btn--sm">
                  {t('nav.tutoring')}
                </Link>
              }
            />
          )}
        </Section>

        <Section title={t('home.myProjectsIdeas')} icon="folder" linkTo="/ideas?tab=mine" linkLabel={t('common.showAll')}>
          {myIdeas.length === 0 && (
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

          {myIdeas.length > 0 && (
            <ul className="compact-list">
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
        </Section>
      </div>
    </div>
  );
}

/**
 * „Guten Morgen, Ada!“ – nach lokaler Uhrzeit, mit dem Vornamen aus dem Profil (Konto) bzw. Demo-Profil.
 * Eigene kleine Komponente: nur sie wird jede Minute neu gezeichnet, nicht das ganze Dashboard.
 */
function DashboardGreeting({ firstName }) {
  const { t } = useI18n();
  const now = useNow();
  const { key, values } = greetingMessage(firstName, now);
  return (
    <h1 id="welcome-title" tabIndex={-1}>
      {t(key, values)}
    </h1>
  );
}
