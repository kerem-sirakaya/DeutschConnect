import { useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { visibleMembers } from '../data/modules.js';
import { blocked } from '../../supabase/functions/_shared/social.js';
import { EmptyState } from '../components/UI.jsx';

export default function ChessLobby() {
  const { t } = useLanguage(), g = t.games;
  const { state,profile,dispatch,access } = useDemo();
  const [target,setTarget] = useState(''), [busy,setBusy] = useState(false), [failed,setFailed] = useState(false);
  const players = visibleMembers(state).filter((p) => p.id !== profile.id && state.profiles[p.id] && !blocked(state,profile.id,p.id));
  const challenges = (state.modules.challenges || []).filter((c) => c.status === 'pending' && [c.fromId,c.toId].includes(profile.id) && !blocked(state,c.fromId,c.toId));
  const games = (state.modules.games || []).filter((v) => [v.whiteId,v.blackId].includes(profile.id) && !blocked(state,v.whiteId,v.blackId));
  async function run(action,go) { if (busy) return; setBusy(true); setFailed(false); try { const saved = await dispatch(action); if (!saved) setFailed(true); else if (go) window.location.hash = '/community/games/chess/'+go; } catch { setFailed(true); } finally { setBusy(false); } }
  function start() { const id = 'local-'+crypto.randomUUID(); run({ type:'startChess',id },id); }
  return <>
    <section className="content-card"><h2>{g.hotseat}</h2><p>{g.hotseatHint}</p><button className="button" type="button" disabled={busy} onClick={start}>{g.newGame}</button></section>
    <section className="content-card section-block"><h2>{g.challenge}</h2><p>{access.mode === 'guest' ? g.challengeHint : g.connectionHint}</p>
      {players.length ? <form onSubmit={(event) => { event.preventDefault(); const id = target || players[0].id; run({ type:'challengeChess', id:'local-'+crypto.randomUUID(), profileId:id }); }}><label className="form-field">{g.choose}<select value={target || players[0].id} onChange={(event) => setTarget(event.target.value)}>{players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label><button className="button button-secondary" type="submit" disabled={busy}>{g.send}</button></form> : <p className="small-text">{access.mode === 'guest' ? g.noPlayers : t.real.noPlayers}</p>}
      {challenges.map((c) => <div className="request-review-row" key={c.id}><span>{c.toId === profile.id ? g.incoming : g.outgoing}: {state.profiles[c.toId === profile.id ? c.fromId : c.toId]?.displayName}</span><div className="form-actions">{c.toId === profile.id ? <><button className="button" type="button" disabled={busy} onClick={() => run({ type:'respondChess', id:c.id, response:'accepted' },c.id+'-game')}>{g.accept}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => run({ type:'respondChess',id:c.id,response:'declined' })}>{g.decline}</button></> : <button className="text-button" type="button" disabled={busy} onClick={() => run({ type:'respondChess',id:c.id,response:'cancelled' })}>{g.cancel}</button>}</div></div>)}
      {!challenges.length && <p className="small-text">{g.empty}</p>}
    </section>
    <section className="section-block"><h2 className="personal-section-title">{g.active}</h2>{games.length ? <div className="task-grid">{[...games].reverse().map((game) => <article className="content-card" key={game.id}><h3>{game.mode === 'hotseat' ? g.hotseat : (state.profiles[game.whiteId]?.displayName || g.white)+' × '+(state.profiles[game.blackId]?.displayName || g.black)}</h3><p>{game.status === 'ended' ? g.result : g.moves + ': ' + game.moves.length}</p><a className="text-link" href={'#/community/games/chess/'+game.id}>{g.open}</a></article>)}</div> : <EmptyState text={g.noGames} />}</section>
    {failed && <p role="alert" className="field-error">{t.quality.saveFailed}</p>}
  </>;
}
