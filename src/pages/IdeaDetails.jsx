import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { ideaContent } from '../components/IdeaCard.jsx';
import { PageIntro, StatusBadge } from '../components/UI.jsx';
import NotFound from './NotFound.jsx';
import { schools } from '../data/activities.js';
import ContentManagement from '../components/ContentManagement.jsx';
import ProjectParticipation from '../components/ProjectParticipation.jsx';
import ActionButton from '../components/ActionButton.jsx';
import ProfileLink from '../components/ProfileLink.jsx';
import BackLink from '../components/BackLink.jsx';
import useActiveView from '../state/useActiveView.js';

export default function IdeaDetails({ id, returnTo = '/ideas/my' }) {
  const active = useActiveView();
  const { t } = useLanguage();
  const { state, profile, dispatch, access } = useDemo();
  const idea = state.ideas.find((item) => item.id === id);
  if (!idea || idea.lifecycle === 'deleted') return <NotFound />;
  const content = ideaContent(idea, t);
  const owner = idea.ownerId === profile.id;
  const inactive = idea.lifecycle === 'withdrawn';

  return <>
    <BackLink fallback={returnTo} />
    <PageIntro eyebrow={(access.mode === 'guest' ? t.example : t.ext.discover.student) + ' · ' + t.categories[idea.category]} title={content.title} />
    <article className="content-card idea-detail">
      <StatusBadge muted>{inactive ? t.quality.withdrawn : idea.completion ? t.personal.profile.completed : t.ext.project.statuses[idea.projectStatus || 'proposal']}</StatusBadge>
      <p className="user-content">{content.description}</p>
      <dl className="record-facts">{idea.goals && <><dt>{t.ext.project.goals}</dt><dd className="user-content">{idea.goals}</dd></>}{idea.collaborators && <><dt>{t.ext.project.collaborators}</dt><dd>{idea.collaborators}</dd></>}{idea.topics?.length > 0 && <><dt>{t.ext.project.topics}</dt><dd>{idea.topics.join(' · ')}</dd></>}{idea.desiredSchoolIds?.length > 0 && <><dt>{t.ext.project.schools}</dt><dd>{idea.desiredSchoolIds.map((id) => schools.find((school) => school.id === id).name).join(' · ')}</dd></>}</dl>
      {idea.initiativeId === 'interviews' && <a className="text-link" href="#/discover/interviews">{t.ext.initiatives.interviews.title}</a>}
      <p className="small-text">{t.app.authorLabel}: <ProfileLink id={idea.ownerId} /></p>
      <ProjectParticipation idea={idea} />
      {owner && !state.modules.groups?.some((g) => g.contextId === id) && !inactive && <ActionButton action={{ type:'createProjectGroup',ideaId:id }}>{t.real.createGroup}</ActionButton>}
      {state.modules.groups?.some((g) => g.contextId === id && g.memberIds.includes(profile.id)) && <a className="button button-secondary" href={'#/community/rooms/project-'+id}>{t.real.groups}</a>}
      {inactive && <p className="form-notice" role="status">{t.quality.inactiveHint}</p>}
      {owner && <ContentManagement editHref={'#/ideas/' + id + '/edit'} inactive={inactive} inactiveLabel={t.quality.withdraw} onWithdraw={() => dispatch({ type: 'withdrawIdea', id, expectedRecord: JSON.stringify(idea) })} onDelete={async () => { const success = await dispatch({ type: 'removeIdea', id, expectedRecord: JSON.stringify(idea) }); if (success && active.current) window.location.hash = '/ideas/my'; return success; }} />}
      <p className="small-text">{t.ideasPage.approval}</p>
      {!idea.seedKey && !Number.isInteger(idea.seedIndex) && <p className="small-text">{t.app.notTranslated}</p>}
    </article>
  </>;
}
