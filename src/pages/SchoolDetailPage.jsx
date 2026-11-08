import { useState } from 'react';
import { useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getSchool } from '../data/schools.js';
import { projects } from '../data/projects.js';
import { byStart, getEventRole, isListed } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import InfoList from '../components/InfoList.jsx';
import Section from '../components/Section.jsx';
import EventCard from '../components/EventCard.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { StatusBadge } from '../components/Badges.jsx';
import NotFoundPage from './NotFoundPage.jsx';

export default function SchoolDetailPage() {
  const { schoolId } = useParams();
  const { t, language } = useI18n();
  const { user, ideas, events } = useAppState();
  const [now] = useState(() => new Date());
  const school = getSchool(schoolId);

  if (!school) return <NotFoundPage titleKey="school.notFound" backTo="/network" />;

  const schoolEvents = events.filter((e) => e.schoolIds.includes(school.id) && isListed(e, now)).sort(byStart);
  const schoolProjects = projects.filter((p) => p.schoolIds.includes(school.id));
  const ideaCount = ideas.filter((i) => i.schoolId === school.id).length;
  const isOwn = user.schoolId === school.id;

  return (
    <div className="page">
      <PageHeader title={school.name} backTo="/network" />

      <div className="school-hero card">
        <span className="school-mark school-mark--lg" style={{ '--school-color': school.color }} aria-hidden="true">
          <Icon name="school" size={28} />
        </span>
        <div>
          <div className="badge-row">
            <StatusBadge type="partnership" status={school.partnershipStatus} />
            {isOwn && <span className="badge badge--role">{t('common.yourSchool')}</span>}
          </div>
          <p>{localize(school.description, language)}</p>
        </div>
      </div>

      <InfoList
        items={[
          { icon: 'mapPin', label: t('school.city'), value: school.city },
          { icon: 'lightbulb', label: t('school.ideas'), value: t('ideas.results', { count: ideaCount }) },
        ]}
      />

      <div className="two-col">
        <Section title={t('school.events')} icon="calendar">
          {schoolEvents.length > 0 ? (
            <div className="card-list">
              {schoolEvents.map((event) => (
                <EventCard key={event.id} event={event} role={getEventRole(user, event)} ownSchoolId={user.schoolId} />
              ))}
            </div>
          ) : (
            <EmptyState icon="calendar" title={t('school.noEvents')} />
          )}
        </Section>

        <Section title={t('school.projects')} icon="folder">
          {schoolProjects.length > 0 ? (
            <div className="card-list">
              {schoolProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState icon="folder" title={t('school.noProjects')} />
          )}
        </Section>
      </div>
    </div>
  );
}
