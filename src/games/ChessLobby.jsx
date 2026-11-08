import { useRef, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { visibleMembers } from '../data/modules.js';
import { blocked } from '../../supabase/functions/_shared/social.js';
import { EmptyState } from '../components/UI.jsx';
import useActiveView from '../state/useActiveView.js';

export default function ChessLobby({initialTarget}) {
  const { t } = useLanguage(), g = t.games;
  const { state,profile,dispatch,access } = useDemo();
  const [target,setTarget] = useState(initialTarget || ''), [busy,setBusy] = useState(false), [failed,setFailed] = useState(false), [sent,setSent] = useState(false);
  const requestIds=useRef(new Map());
  const active=useActiveView();
  const players = visibleMembers(state).filter((p) => p.id !== profile.id && state.profiles[p.id] && !blocked(state,profile.id,p.id));
  const challenges = (state.modules.challenges || []).filter((c) => c.status === 'pending' && [c.fromId,c.toId].includes(profile.id) && !blocked(state,c.fromId,c.toId));
  const games = (state.modules.games || []).filter((v) => [v.whiteId,v.blackId].includes(profile.id) && !blocked(state,v.whiteId,v.blackId));
  const selected=players.some((player)=>player.id===target)?target:initialTarget?'':players[0]?.id;
  async function run(action,go) { if (busy) return; setBusy(true); setFailed(false); try { const saved = await dispatch(action); if (!saved) setFailed(true); else if (go && active.current) window.location.hash = '/community/games/chess/'+go; } catch { setFailed(true); } finally { setBusy(false); } }
  function start() { const id = 'local-'+crypto.randomUUID(); run({ type:'startChess',id },id); }
  async function invite(event) {
    event.preventDefault();if(busy || !selected)return;
    const id=requestIds.current.get(selected)||'local-'+crypto.randomUUID();requestIds.current.set(selected,id);
    setBusy(true);setFailed(false);setSent(false);
    try{const saved=await dispatch({type:'challengeChess',id,profileId:selected});setFailed(!saved);if(saved){requestIds.current.delete(selected);setSent(true);}}
    catch{setFailed(true);}finally{setBusy(false);}
  }
  return <>
    <section className="content-card"><h2>{g.hotseat}</h2><p>{g.hotseatHint}</p><button className="button" type="button" disabled={busy} onClick={start}>{g.newGame}</button></section>
    <section className="content-card section-block"><h2>{g.challenge}</h2><p>{access.mode === 'guest' ? g.challengeHint : g.connectionHint}</p>
      {players.length ? <form onSubmit={invite}><label className="form-field">{g.choose}<select value={selected} disabled={busy} onChange={(event) => {setTarget(event.target.value);setSent(false);}}><option value="" disabled>{g.choose}</option>{players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label><button className="button button-secondary" type="submit" disabled={busy||!selected||challenges.some((challenge)=>[challenge.fromId,challenge.toId].includes(selected))}>{g.send}</button></form> : <p className="small-text">{access.mode === 'guest' ? g.noPlayers : t.real.noPlayers}</p>}
      <p className="save-status" role="status">{sent?t.chessNotices.sent:''}</p>
      <a className="text-link" href="#/me/notifications">{t.chessNotices.view} ({challenges.length})</a>
      <p className="small-text">{t.chessNotices.emailMissing}</p>
      {!challenges.length && <p className="small-text">{g.empty}</p>}
    </section>
    <section className="section-block"><h2 className="personal-section-title">{g.active}</h2>{games.length ? <div className="task-grid">{[...games].reverse().map((game) => <article className="content-card" key={game.id}><h3>{game.mode === 'hotseat' ? g.hotseat : (state.profiles[game.whiteId]?.displayName || g.white)+' × '+(state.profiles[game.blackId]?.displayName || g.black)}</h3><p>{game.status === 'ended' ? g.result : g.moves + ': ' + game.moves.length}</p><a className="text-link" href={'#/community/games/chess/'+game.id}>{g.open}</a></article>)}</div> : <EmptyState text={g.noGames} />}</section>
    {failed && <p role="alert" className="field-error">{t.quality.saveFailed}</p>}
  </>;
}
