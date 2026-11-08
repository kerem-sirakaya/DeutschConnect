import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import { useGameResults } from '../games/GameResultsContext.jsx';
import { leaderboardGames, leaderboardViews, personalGameStats, rankGame } from '../games/leaderboards.js';
import { useRememberedState } from '../state/usePageMemory.js';
import { blocked } from '../../supabase/functions/_shared/social.js';

function historyTime(item) {
  for (const value of [item.completedAt,item.createdAt]) if (Number.isFinite(Date.parse(value))) return new Date(value);
  return null;
}

export default function GameLeaderboard({ game = 'chess' }) {
  const {t,language} = useLanguage(), copy = t.leaderboard;
  const {state,profile,access} = useDemo();
  const {data,available,share} = useGameResults();
  const [view,setView] = useRememberedState('leaderboard:'+game,'global');
  const [busy,setBusy] = useState(false), [failed,setFailed] = useState(false);
  const demo = access.mode === 'guest', shared = data.sharing[profile.id]?.[game] === true;
  const stats = personalGameStats({game,ownerId:profile.id,results:data.results,chessGames:state.modules.games});
  const common = {game,profiles:state.profiles,sharing:data.sharing,results:data.results,chessGames:state.modules.games,blockedIds:Object.keys(state.profiles).filter((id) => blocked(state,profile.id,id))};
  const global = demo ? rankGame(common) : [];
  const school = demo ? rankGame({...common,schoolId:profile.schoolId || ''}) : [];
  const rows = view === 'school' ? school : global;
  const myRank = (items) => items.find((item) => item.id === profile.id)?.rank ?? '—';
  const columns = game === 'chess' ? ['wins','losses','draws','totalCompleted','practice'] : ['score','completed'];
  const history = [...stats.history].sort((a,b) => (b.completedAt || b.createdAt || '').localeCompare(a.completedAt || a.createdAt || '') || a.id.localeCompare(b.id));
  const [historyLimit,setHistoryLimit] = useState(10);
  async function toggle() {
    if (busy) return; setBusy(true); setFailed(false);
    try { setFailed(!await share(game,!shared)); } catch { setFailed(true); } finally { setBusy(false); }
  }
  return <section className="content-card game-leaderboard section-block" aria-labelledby="leaderboard-heading">
    <h2 id="leaderboard-heading">{copy.title}</h2>
    <label className="leaderboard-game">{copy.game}<select value={game} onChange={(event) => { window.location.hash='/community/games/'+event.target.value; }}>{leaderboardGames.map((key) => <option value={key} key={key}>{t.games[key]}</option>)}</select></label>
    <div className="filter-chips leaderboard-views" role="group" aria-label={copy.view}>{leaderboardViews.map((key) => <button type="button" key={key} className={view === key ? 'selected':''} aria-pressed={view === key} onClick={() => setView(key)}>{copy.views[key]}</button>)}</div>
    <p className="form-notice">{demo ? copy.demo : game === 'chess' && view === 'personal' ? copy.accountChess : copy.accountLocal}</p>
    <p className="module-note">{copy.rules[game]}</p>
    {view === 'school' && <p className="module-note">{profile.schoolId ? copy.schoolHint : copy.noSchool}</p>}
    {view !== 'personal' && <>
      {!demo ? <p>{copy.backendMissing}</p> : rows.length ? <table className="leaderboard-table"><caption>{t.games[game]+' · '+copy.views[view]+' · DEMO'}</caption><thead><tr><th scope="col">{copy.rank}</th><th scope="col">{copy.player}</th><th scope="col">{game === 'chess' ? copy.wins : game === 'memory' ? copy.completed : copy.highscore}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={row.id === profile.id ? 'own-rank':''}><th scope="row">{row.rank}</th><td>{row.displayName}{row.id === profile.id && <span className="own-rank-label">{copy.you}</span>}</td><td>{row.score}</td></tr>)}</tbody></table> : <p>{copy.empty}</p>}
      <p className="small-text">{copy.ties}</p>
    </>}
    {view === 'personal' && <>
      <dl className="personal-statistics">{columns.map((key) => <div className="content-card" key={key}><dt>{key === 'score' ? (game === 'memory' ? copy.points : copy.highscore) : copy[key]}</dt><dd>{stats[key]}</dd></div>)}</dl>
      <p className="module-note">{copy.views.global}: {myRank(global)} · {copy.views.school}: {myRank(school)}</p>
      {game === 'chess' && <p className="small-text">{copy.practiceHint}</p>}
      <h3>{copy.history}</h3>
      {history.length ? <><ol className="leaderboard-history">{history.slice(0,historyLimit).map((item) => <li key={item.id}><span>{historyTime(item) ? new Intl.DateTimeFormat(language,{dateStyle:'short',timeStyle:'short'}).format(historyTime(item)) : copy.noDate}</span><strong>{game === 'chess' ? copy[item.result] : game === 'memory' ? copy.completed : item.score}</strong>{item.turns && <span>{t.games.moves}: {item.turns}</span>}</li>)}</ol>{historyLimit < history.length && <button className="text-button" type="button" onClick={() => setHistoryLimit((value) => value+10)}>{copy.more}</button>}</> : <p>{copy.noHistory}</p>}
    </>}
    {demo && <div className="leaderboard-consent"><label className="checkbox-row"><input type="checkbox" checked={shared} disabled={busy} onChange={toggle} />{copy.share}</label><p className="small-text">{copy.shareHint}</p></div>}
    {(!available || failed) && <p className="field-error" role="status">{copy.failed}</p>}
  </section>;
}
