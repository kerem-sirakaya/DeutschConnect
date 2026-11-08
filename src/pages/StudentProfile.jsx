import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { selectPublicProfile } from '../data/profiles.js';
import { PageIntro } from '../components/UI.jsx';
import IdeaCard from '../components/IdeaCard.jsx';
import { MemberActions } from '../components/CommunityCards.jsx';
import ActivityStatistics from '../components/ActivityStatistics.jsx';
import BackLink from '../components/BackLink.jsx';
import NotFound from './NotFound.jsx';
import { blocked } from '../../supabase/functions/_shared/social.js';

export default function StudentProfile({ id, returnTo = '/community/people' }) {
  const { state, profile, access } = useDemo();
  const { t, language } = useLanguage();
  const member = selectPublicProfile(state,id);
  if (!member || blocked(state,profile.id,id)) return <NotFound />;
  const copy = t.personal.profile;
  const groups = [['ownedProjectIds',copy.ideas],['currentProjectIds',copy.current],['completedProjectIds',copy.completed]];
  const counts = { ...(member.sharing.projects ? { ownedProjects:member.counts.ownedProjects, projectMemberships:member.counts.projectMemberships, completedProjects:member.counts.completedProjects } : {}), ...(member.awards.length ? { awards:member.awards.length } : {}) };
  return <>
    <BackLink fallback={returnTo} />
    <PageIntro eyebrow={t.ext.community.shared} title={member.displayName + (access.mode === 'guest' ? ' · DEMO' : '')} description={member.schoolId === 'ers' ? 'Ernst-Reuter-Schule Ankara' : member.schoolId === 'anka' ? 'Anka Bilim' : undefined} />
    <article className="content-card"><p>{copy.onlyShared}</p>{member.interests.length > 0 && <div className="topic-tags">{member.interests.map((key) => <span key={key}>{t.categories[key] || key}</span>)}</div>}{id !== profile.id && <details className="disclosure"><summary>{copy.actions}</summary><div className="form-actions"><MemberActions member={member} /></div></details>}</article>
    {Object.keys(counts).length > 0 && <section className="section-block"><h2>{copy.activity}</h2><ActivityStatistics counts={counts} publicView /><p className="module-note">{t.personal.statistics.hint}</p></section>}
    {member.sharing.projects && groups.map(([key,title]) => <section className="section-block" key={key}><h2>{title}</h2>{member[key].length ? <div className="task-list">{member[key].map((projectId) => state.ideas.find((idea) => idea.id === projectId)).filter(Boolean).map((idea) => <IdeaCard key={idea.id} idea={idea} returnTo={'/community/people/' + id} />)}</div> : <p className="module-note">{copy.empty}</p>}</section>)}
    {member.awards.length > 0 && <section className="section-block"><h2>{t.awards.title}</h2>{member.awards.map((award) => <article className="content-card" key={award.id}><h3>{t.awards.collaboration}</h3><p>{new Intl.DateTimeFormat(language).format(new Date(award.awardedAt))}</p></article>)}</section>}
  </>;
}
