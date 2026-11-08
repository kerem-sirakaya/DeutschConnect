import { initiatives } from '../data/modules.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { PageIntro, StatusBadge } from '../components/UI.jsx';
import { DiscoverNavigation } from '../components/ModuleNavigation.jsx';
import InterestToggle from '../components/InterestToggle.jsx';
import Icon from '../components/Icon.jsx';
import NotFound from './NotFound.jsx';
import BackLink from '../components/BackLink.jsx';

export default function Discover({ id }) {
  const { t } = useLanguage();
  const { state } = useDemo();
  const initiative = initiatives.find((item) => item.id === id);
  if (id && !initiative) return <NotFound />;
  if (initiative) {
    const content = t.ext.initiatives[id];
    const moduleLink = { tutoring: '/tutoring', workshops: '/events/all', projects: '/ideas/all', exchange: '/ideas/new' }[id];
    const related = state.ideas.filter((idea) => idea.initiativeId === id);
    return <>
      <BackLink fallback="/discover" />
      <PageIntro eyebrow={t.ext.discover.team} title={content.title} description={content.description} />
      <article className="content-card prose"><StatusBadge muted>{t.ext.discover.proposal}</StatusBadge><p>{content.detail}</p>
        <div className="form-actions"><InterestToggle targetType="initiative" targetId={id} />{id === 'interviews' ? <a className="button button-secondary" href="#/ideas/new?initiative=interviews">{t.ext.discover.interviewIdea}</a> : <a className="button button-secondary" href={'#' + moduleLink}>{t.ext.discover.openModule}</a>}</div>
        <p className="small-text">{t.app.participationHint}</p>
      </article>
      {related.length > 0 && <section className="section-block"><h2>{t.ext.discover.projects}</h2><div className="task-list">{related.map((idea) => <a className="content-card text-link" key={idea.id} href={'#/ideas/' + idea.id}>{idea.title}<Icon name="arrow" size={17} /></a>)}</div></section>}
    </>;
  }
  return <>
    <PageIntro title={t.ext.discover.title} description={t.ext.discover.description} />
    <DiscoverNavigation active="initiatives" />
    <div className="initiative-grid">{initiatives.map((item) => <article className="content-card initiative-card" key={item.id}><span className="detail-icon"><Icon name={item.icon} size={25} /></span><span className="category-label">{t.ext.discover.team}</span><h2><a href={'#/discover/' + item.id}>{t.ext.initiatives[item.id].title}<Icon name="arrow" size={17} /></a></h2><p>{t.ext.initiatives[item.id].description}</p></article>)}</div>
    <p className="module-note">{t.ext.discover.noneConfirmed}</p>
  </>;
}
