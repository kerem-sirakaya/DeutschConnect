import { useSearchParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { useAppState } from '../state/AppStateContext.jsx';
import { schools } from '../data/schools.js';
import { projects } from '../data/projects.js';
import { getProjectRole } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import Tabs from '../components/Tabs.jsx';
import SchoolCard from '../components/SchoolCard.jsx';
import ProjectCard from '../components/ProjectCard.jsx';
import FilterChips from '../components/FilterChips.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { StatusBadge } from '../components/Badges.jsx';

const TABS = ['schools', 'projects'];

export default function NetworkPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'schools';

  return (
    <div className="page">
      <PageHeader title={t('network.title')} />
      <Tabs
        label={t('network.tabsLabel')}
        active={tab}
        tabs={[
          { id: 'schools', label: t('network.tabs.schools'), count: schools.length },
          { id: 'projects', label: t('network.tabs.projects'), count: projects.length },
        ]}
      />
      {tab === 'schools' ? <Schools /> : <Projects />}
    </div>
  );
}

function Schools() {
  const { t } = useI18n();
  // Eigene Schule zuerst
  const { user } = useAppState();
  const sorted = [...schools].sort((a, b) => Number(b.id === user.schoolId) - Number(a.id === user.schoolId));

  return (
    <div className="stack">
      <div className="card-list">
        {sorted.map((school) => (
          <SchoolCard key={school.id} school={school} />
        ))}
      </div>

      <section className="card info-card" aria-labelledby="partnership-status">
        <h2 id="partnership-status" className="info-card__title">
          <Icon name="info" size={18} />
          {t('network.statusTitle')}
        </h2>
        <ul className="legend">
          {['initiator', 'interest', 'confirmed'].map((status) => (
            <li key={status}>
              <StatusBadge type="partnership" status={status} />
              <span>{t(`network.legend.${status}`)}</span>
            </li>
          ))}
        </ul>
        <p className="muted">{t('network.statusText')}</p>
      </section>

      <section className="card info-card info-card--dashed" aria-labelledby="planned-network">
        <h2 id="planned-network" className="info-card__title">
          <Icon name="network" size={18} />
          {t('network.plannedTitle')}
        </h2>
        <p className="muted">{t('network.plannedText')}</p>
      </section>
    </div>
  );
}

function Projects() {
  const { t } = useI18n();
  const { user } = useAppState();
  const [params, setParams] = useSearchParams();
  const show = params.get('show') === 'mine' ? 'mine' : 'all';
  const visible = projects.filter((p) => show === 'all' || getProjectRole(user, p));

  const setShow = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('show');
    else next.set('show', value);
    setParams(next, { replace: true });
  };

  return (
    <div className="stack">
      <FilterChips
        label={t('network.projectsFilterLabel')}
        value={show}
        onChange={setShow}
        options={[
          { value: 'all', label: t('network.filter.all') },
          { value: 'mine', label: t('network.filter.mine') },
        ]}
      />
      {visible.length > 0 ? (
        <div className="card-list">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <EmptyState icon="folder" title={t('network.noMyProjects')} text={t('network.noMyProjectsText')} />
      )}
    </div>
  );
}
