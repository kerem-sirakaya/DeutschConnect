import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { filterTutoring, tutoringContent, tutorFormats, tutorLanguages } from '../data/modules.js';
import TutoringCard from '../components/TutoringCard.jsx';
import { EmptyState, ModuleTabs, PageIntro, SearchField } from '../components/UI.jsx';
import { useRememberedState } from '../state/usePageMemory.js';
import { normalizeSubject } from '../data/matching.js';

export default function Tutoring({ mode = 'offers' }) {
  const { t, language } = useLanguage();
  const { state, profile } = useDemo();
  const [filters, setFilters] = useRememberedState('tutoring:' + mode, { query: '', subject: '', language: '', format: '' });
  const own = mode === 'my';
  const saved = mode === 'saved';
  const interestedIds = new Set(state.modules.interests[profile.id].filter((key) => key.startsWith('tutoring:')).map((key) => key.slice('tutoring:'.length)));
  const records = state.modules.tutoring.filter((record) => record.lifecycle !== 'deleted' && (!saved || interestedIds.has(record.id)));
  const visible = filterTutoring(records, { ...filters, kind: own || saved ? undefined : mode === 'requests' ? 'request' : 'offer', ownerId: own ? profile.id : undefined, includeInactive: saved }, t, language);
  const subjects = [...new Map(records.map((record) => [normalizeSubject(record.subjectKey || record.subject), tutoringContent(record, t).subject])).entries()];
  const change = (key, value) => setFilters({ ...filters, [key]: value });
  const drafts = state.modules.contactDrafts.filter((item) => item.ownerId === profile.id);
  return <>
    <PageIntro title={t.ext.tutoring.title} description={t.ext.tutoring.description} />
    <div className="form-actions module-action"><a className="button" href="#/tutoring/new?kind=request">{t.ext.tutoring.newRequest}</a><a className="button button-secondary" href="#/tutoring/new?kind=offer">{t.ext.tutoring.newOffer}</a></div>
    <ModuleTabs label={t.nav.tutoring} items={['offers', 'requests', 'my', 'saved'].map((key) => ({ label: key === 'saved' ? t.quality.savedTutoring : t.ext.tutoring[key], href: '#/tutoring/' + key, active: mode === key }))} />
    <div className="search-toolbar"><SearchField label={t.ext.tutoring.search} value={filters.query} onChange={(value) => change('query', value)} /></div>
    <div className="filter-grid">
      <label>{t.ext.tutoring.subjectFilter}<select value={filters.subject} onChange={(event) => change('subject', event.target.value)}><option value="">{t.ext.tutoring.allSubjects}</option>{subjects.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>{t.ext.tutoring.languageFilter}<select value={filters.language} onChange={(event) => change('language', event.target.value)}><option value="">{t.ext.tutoring.allLanguages}</option>{tutorLanguages.map((key) => <option key={key} value={key}>{t.ext.languages[key]}</option>)}</select></label>
      <label>{t.ext.tutoring.formatFilter}<select value={filters.format} onChange={(event) => change('format', event.target.value)}><option value="">{t.ext.tutoring.allFormats}</option>{tutorFormats.map((key) => <option key={key} value={key}>{t.ext.formats[key]}</option>)}</select></label>
    </div>
    <div className="task-grid">{visible.map((record) => <TutoringCard key={record.id} record={record} returnTo={'/tutoring/' + mode} />)}</div>
    {!visible.length && <EmptyState text={saved ? t.quality.noSavedTutoring : t.ext.tutoring.empty} icon="bulb" />}
    {Object.values(filters).some(Boolean) && <button type="button" className="text-button" onClick={() => setFilters({ query: '', subject: '', language: '', format: '' })}>{t.app.clearFilters}</button>}
    {own && drafts.length > 0 && <section className="section-block"><h2>{t.ext.tutoring.drafts}</h2>{drafts.map((draft) => {
      const target = state.modules.tutoring.find((record) => record.id === draft.targetId);
      const content = target && tutoringContent(target, t);
      return <article className="content-card" key={draft.targetId}>{target?.lifecycle === 'deleted' ? <p>{t.quality.deleted}</p> : <a className="text-link" href={'#/tutoring/' + draft.targetId + '?from=' + encodeURIComponent('/tutoring/my')}>{content ? content.subject + ' · ' + content.topics : t.ext.tutoring.contact}</a>}<p className="user-content">{draft.note}</p><p className="small-text">{t.ext.tutoring.contactSaved}</p></article>;
    })}</section>}
    <p className="module-note">{t.ext.tutoring.localHint}</p>
  </>;
}
