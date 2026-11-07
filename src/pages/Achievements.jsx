import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { EmptyState } from '../components/UI.jsx';
import ActionButton from '../components/ActionButton.jsx';
export default function Achievements() {
  const { state,profile,access } = useDemo(), { t,language } = useLanguage();
  const awards = (state.modules.awards || []).filter((a) => a.ownerId === profile.id);
  return <section><h2>{t.awards.title}</h2><p className="module-note">{t.awards.hint}</p>{access.mode === 'guest' && <p className="form-notice">{t.awards.demoHint}</p>}<div className="task-list">{awards.map((a) => <article className="content-card" key={a.id}><h3>{t.awards.collaboration}</h3><p>{t.awards.evidence}: {state.activities?.find((e) => e.id === a.eventId)?.title}</p><p className="small-text">{new Intl.DateTimeFormat(language).format(new Date(a.awardedAt))}</p></article>)}</div>{!awards.length && <EmptyState text={t.awards.empty} />}<ActionButton action={{ type:'shareAwards',shared:!state.modules.awardSharing?.[profile.id] }}>{t.awards.share}: {state.modules.awardSharing?.[profile.id] ? '✓':'—'}</ActionButton></section>;
}
