import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { myIdeas } from '../data/demoState.js';
import IdeaCard, { ideaContent } from '../components/IdeaCard.jsx';
import { EmptyState, ModuleTabs, PageIntro, SearchField } from '../components/UI.jsx';
import { DiscoverNavigation } from '../components/ModuleNavigation.jsx';
import { useRememberedState } from '../state/usePageMemory.js';
import { isActive } from '../data/matching.js';

export default function Ideas({ mode = 'my' }) {
  const { t, language } = useLanguage();
  const { state, profile } = useDemo();
  const [query, setQuery] = useRememberedState('ideas:' + mode, '');
  const source = mode === 'my' ? myIdeas(profile, state.ideas) : state.ideas.filter(isActive);
  const visible = source.filter((idea) => {
    const content = ideaContent(idea, t);
    return (content.title + ' ' + content.description + ' ' + (idea.topics || []).join(' ')).toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language));
  });
  return <>
    <PageIntro title={t.app.ideasTitle} description={t.app.ideasSubtitle} />
    <DiscoverNavigation active="projects" />
    <ModuleTabs label={t.nav.ideas} items={Object.entries(t.app.ideaTabs).map(([key, label]) => ({ label, href: '#/ideas/' + key, active: mode === key }))} />
    <div className="search-toolbar"><SearchField label={t.app.searchIdeas} value={query} onChange={setQuery} /></div>
    <div className="task-grid">{visible.map((idea) => <IdeaCard key={idea.id} idea={idea} returnTo={'/ideas/' + mode} />)}</div>
    {!visible.length && <EmptyState icon="bulb" text={query ? t.app.noResults : t.app.emptyMyIdeas} href={!query ? '#/ideas/new' : undefined} action={t.app.newIdea} />}
    <p className="module-note">{t.ideasPage.approval}</p>
  </>;
}
