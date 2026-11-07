import { useMemo, useState } from 'react';
import { useDemo } from '../state/DemoContext.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { replay, legalMoves, gameStatus, squareName } from '../../supabase/functions/_shared/chess.js';
import NotFound from '../pages/NotFound.jsx';
const glyphs = { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' };

export default function ChessBoard({ id }) {
  const { t } = useLanguage(), g = t.games;
  const { state,profile,dispatch,access } = useDemo();
  const game = state.modules.games?.find((v) => v.id === id && [v.whiteId,v.blackId].includes(profile.id));
  const position = useMemo(() => { try { return game ? replay(game.moves) : null; } catch { return null; } },[game]);
  const [selected,setSelected] = useState(null), [promotion,setPromotion] = useState('q'), [flipped,setFlipped] = useState(false), [busy,setBusy] = useState(false), [failed,setFailed] = useState(false), [confirm,setConfirm] = useState(false), [from,setFrom] = useState('e2'), [to,setTo] = useState('e4');
  if (!game || !position) return <NotFound />;
  const status = gameStatus(position), ended = game.status === 'ended' || status.ended;
  const side = game.mode === 'hotseat' ? position.turn : game.whiteId === profile.id ? 'w' : 'b';
  const mine = side === position.turn && !ended;
  const moves = legalMoves(position), targets = moves.filter((m) => m.from === selected).map((m) => m.to);
  const cells = Array.from({ length:64 },(_,i) => flipped ? 63-i : i);
  const result = game.result || status;
  async function run(type,extra = {}) {
    if (busy) return; setBusy(true); setFailed(false);
    try { if (!await dispatch({ type,id,revision:game.revision,...extra })) setFailed(true); else { setSelected(null); setConfirm(false); } }
    catch { setFailed(true); } finally { setBusy(false); }
  }
  function choose(index) {
    if (!mine || busy) return;
    if (targets.includes(index)) { run('chessMove',{ move:{ from:selected,to:index,promotion } }); return; }
    const piece = position.board[index];
    setSelected(piece && (piece === piece.toUpperCase() ? 'w':'b') === side ? index : null);
  }
  return <section className="content-card chess-panel">
    <a className="text-link" href="#/community/games/chess">← {g.active}</a>
    <p className="form-notice">{game.mode === 'hotseat' ? g.hotseatHint : access.mode === 'guest' ? g.challengeHint : g.connectionHint}</p>
    <div className="game-score" role="status">{ended ? <strong>{g.result}: {result.winner ? g[result.winner === 'w' ? 'white':'black']+' '+g.wins : g.reasons[result.reason] || g.result}</strong> : <><strong>{g.turn}: {g[position.turn === 'w' ? 'white':'black']}</strong><span>{status.reason === 'check' ? g.reasons.check : mine ? g.yourTurn : g.notYourTurn}</span></>}</div>
    <p className="small-text">{g.selectHint}</p>
    <div className="chess-grid" role="group" aria-label={g.chess}>{cells.map((index) => { const p = position.board[index]; return <button key={index} className={'chess-square '+((Math.floor(index/8)+index%8)%2 ? 'dark':'light')+(selected === index ? ' selected':'')+(targets.includes(index) ? ' legal':'')+(p === p?.toUpperCase() ? ' white-piece':' black-piece')} type="button" aria-label={squareName(index)+(p ? ': '+g[p === p.toUpperCase() ? 'white':'black']+' '+g.pieces[p.toLowerCase()] : '')} aria-pressed={selected === index} disabled={busy || ended || !mine} onClick={() => choose(index)}><span aria-hidden="true">{glyphs[p] || ''}</span><small aria-hidden="true">{squareName(index)}</small></button>; })}</div>
    <div className="chess-controls"><label>{g.promotion}<select value={promotion} onChange={(event) => setPromotion(event.target.value)} disabled={busy}>{['q','r','b','n'].map((key) => <option key={key} value={key}>{g.pieces[key]}</option>)}</select></label><button className="button button-secondary" type="button" onClick={() => setFlipped(!flipped)}>{g.flip}</button></div>
    {!ended && <><details className="disclosure"><summary>{g.moveEntry}</summary><form className="form-actions" onSubmit={(event) => { event.preventDefault(); run('chessMove',{ move:{ from,to,promotion } }); }}><label>{g.from}<input value={from} maxLength={2} pattern="[a-h][1-8]" required onChange={(event) => setFrom(event.target.value)} /></label><label>{g.to}<input value={to} maxLength={2} pattern="[a-h][1-8]" required onChange={(event) => setTo(event.target.value)} /></label><button className="button" type="submit" disabled={busy || !mine}>{g.move}</button></form></details><div className="form-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => run('chessOfferDraw')}>{g.offerDraw}</button>{(status.canClaimDraw || game.drawOffer) && <button className="button button-secondary" type="button" disabled={busy} onClick={() => run('chessDraw')}>{g.draw}</button>}<button className="text-button" type="button" disabled={busy} onClick={() => setConfirm(!confirm)}>{g.resign}</button>{confirm && <button className="button button-secondary" type="button" disabled={busy} onClick={() => run('chessResign')}>{g.confirmResign}</button>}</div>{game.drawOffer && <p className="save-status">{g.drawOffered}</p>}</>}
    {failed && <p className="field-error" role="alert">{g.saveFailed}</p>}
    <details className="disclosure"><summary>{g.moves}: {game.moves.length}</summary><ol className="chess-moves">{game.moves.map((item,index) => <li key={index}>{item}</li>)}</ol></details>
  </section>;
}
