import { Link, useParams } from 'react-router';
import { useI18n } from '../i18n/LanguageContext.jsx';
import { localize } from '../i18n/localize.js';
import { useAppState } from '../state/AppStateContext.jsx';
import { getProject } from '../data/projects.js';
import { getSchool } from '../data/schools.js';
import { getProjectRole } from '../lib/selectors.js';
import PageHeader from '../components/PageHeader.jsx';
import InfoList from '../components/InfoList.jsx';
import Icon from '../components/Icon.jsx';
import { DemoBadge, RoleBadge, StatusBadge, TopicTags } from '../components/Badges.jsx';
import NotFoundPage from './NotFoundPage.jsx';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { t, language } = useI18n();
  const { user, actions } = useAppState();
  const project = getProject(projectId);

  if (!project) return <NotFoundPage titleKey="project.notFound" backTo="/network?tab=projects" />;

  const role = getProjectRole(user, project);

  return (
    <div className="page">
      <PageHeader title={localize(project.title, language)} backTo="/network?tab=projects" />

      <div className="detail-layout">
        <div className="detail-main">
          <div className="badge-row">
            <StatusBadge type="project" status={project.status} />
            <RoleBadge role={role} />
            {project.isDemo ? <DemoBadge /> : <span className="badge badge--info">{t('project.realProject')}</span>}
          </div>

          <p className="lead">{localize(project.summary, language)}</p>

          <InfoList
            items={[
              {
                icon: 'network',
                label: t('eventDetail.schools'),
                value: project.schoolIds.map((id, index) => (
                  <span key={id}>
                    {index > 0 && ', '}
                    <Link to={`/network/schools/${id}`}>{getSchool(id).name}</Link>
                  </span>
                )),
              },
              { icon: 'arrowRight', label: t('project.nextStep'), value: localize(project.nextStep, language) },
            ]}
          />

          <section className="detail-section">
            <h2>{t('project.about')}</h2>
            <p>{localize(project.description, language)}</p>
            <TopicTags topics={project.topics} highlight={user.interests} />
          </section>
        </div>

        <aside className="detail-aside card">
          <h2>{t('project.yourRole')}</h2>
          {role === 'member' ? (
            <p className="participation-state participation-state--registered">
              <Icon name="check" size={18} />
              {t('project.memberNote')}
            </p>
          ) : (
            <>
              <p className="muted" role="status">
                {role === 'interested' ? t('project.joinedNote') : t('project.joinText')}
              </p>
              <button
                type="button"
                className={`btn btn--block ${role === 'interested' ? 'btn--secondary' : 'btn--primary'}`}
                aria-pressed={role === 'interested'}
                onClick={() => actions.toggleProjectInterest(project.id)}
              >
                <Icon name={role === 'interested' ? 'check' : 'plus'} size={18} />
                {role === 'interested' ? t('project.joined') : t('project.join')}
              </button>
            </>
          )}
          <p className="hint">
            <Icon name="info" size={14} />
            {t('demo.localOnly')}
          </p>
        </aside>
      </div>
    </div>
  );
}
