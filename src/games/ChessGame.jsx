import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext.jsx';
import Icon from '../components/Icon.jsx';
import { legalMoves, squareName, squareIndex } from './chess.js';
import { chessReducer, newGame, currentPosition, gameResult, isPromotion } from './chessHotseat.js';

/**
 * Schach zu zweit am selben Gerät („Hotseat“) – läuft komplett im Browser.
 *
 * Urheber: Kerem – Brett, Auswahl per Antippen, markierte Zielfelder, Umwandlung, Brett drehen,
 * Aufgeben/Remis und Zugliste stammen aus der Codex-Version (Branch `codex-version-1.0`,
 * `src/games/ChessBoard.jsx`); die Regeln aus `chess.js` (unverändert übernommen).
 * Für DeutschConnect angepasst: nur lokaler State (`useReducer`), kein Server, keine Speicherung,
 * kein Online-Spiel; neu: „Zug zurücknehmen“, Auswahlfenster für die Umwandlung statt Liste,
 * letzter Zug und König im Schach markiert, Bestätigung vor Aufgeben/Remis/Neustart.
 */

// Gefüllte Figuren für beide Farben, Farbe kommt aus dem CSS. ︎ = als Text darstellen,
// sonst zeigen manche Handys (v. a. iOS) den Bauern ♟ als buntes Emoji.
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const glyph = (piece) => GLYPHS[piece.toLowerCase()] + '︎';
const colorOf = (piece) => (piece === piece.toUpperCase() ? 'w' : 'b');
const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];
const FILES = 'abcdefgh';

export default function ChessGame() {
  const { t } = useI18n();
  const [game, dispatch] = useReducer(chessReducer, undefined, newGame);
  const [selected, setSelected] = useState(null); // Feld-Nummer der ausgewählten Figur
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }
  const [confirm, setConfirm] = useState(null); // 'resign' | 'draw' | 'restart'
  const [flipped, setFlipped] = useState(false);
  const promotionRef = useRef(null);

  const position = currentPosition(game);
  // Nur einmal pro Zug berechnen, nicht bei jedem Antippen.
  const status = useMemo(() => gameResult(game), [game]);
  const moves = useMemo(() => (status.ended ? [] : legalMoves(position)), [position, status.ended]);
  const targets = useMemo(
    () => new Set(moves.filter((m) => m.from === selected).map((m) => m.to)),
    [moves, selected],
  );

  const turn = position.turn;
  const colorName = (color) => t(color === 'w' ? 'games.chess.white' : 'games.chess.black');
  const pieceName = (piece) => t(`games.chess.pieces.${piece.toLowerCase()}`);

  const last = game.moves.at(-1);
  const lastFrom = last ? squareIndex(last.slice(0, 2)) : -1;
  const lastTo = last ? squareIndex(last.slice(2, 4)) : -1;
  const kingInCheck =
    !game.manualEnd && (status.reason === 'check' || status.reason === 'checkmate')
      ? position.board.indexOf(turn === 'w' ? 'K' : 'k')
      : -1;

  // Fokus auf die Umwandlungs-Auswahl, sobald sie erscheint (Tastatur/Screenreader).
  useEffect(() => {
    if (pendingPromotion) promotionRef.current?.querySelector('button')?.focus();
  }, [pendingPromotion]);

  function run(action) {
    dispatch(action);
    setSelected(null);
    setPendingPromotion(null);
    setConfirm(null);
  }

  function choose(index) {
    if (status.ended || pendingPromotion) return;
    if (selected !== null && targets.has(index)) {
      if (isPromotion(position, selected, index)) setPendingPromotion({ from: selected, to: index });
      else run({ type: 'move', from: selected, to: index });
      return;
    }
    const piece = position.board[index];
    setSelected(piece && colorOf(piece) === turn && index !== selected ? index : null);
  }

  let statusText;
  if (status.ended) {
    const reason = t(`games.chess.reasons.${status.reason}`);
    const outcome = status.winner
      ? t(status.winner === 'w' ? 'games.chess.whiteWins' : 'games.chess.blackWins')
      : t('games.chess.draw');
    statusText = `${reason} – ${outcome}`;
  } else {
    const toMove = t(turn === 'w' ? 'games.chess.whiteToMove' : 'games.chess.blackToMove');
    statusText = status.reason === 'check' ? `${t('games.chess.check')} ${toMove}` : toMove;
  }

  const cells = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i));
  const confirmTexts = {
    resign: t('games.chess.confirmResign', { color: colorName(turn) }),
    draw: t('games.chess.confirmDraw'),
    restart: t('games.chess.confirmRestart'),
  };
  const confirmActions = { resign: 'resign', draw: 'agreeDraw', restart: 'restart' };

  return (
    <section className="card stack chess-game" aria-labelledby="chess-title">
      <h2 id="chess-title" className="visually-hidden">
        {t('games.chess.title')}
      </h2>
      <p className="muted">{t('games.chess.hint')}</p>

      <p role="status" className={`chess-status${status.ended ? ' chess-status--ended' : ''}`}>
        {!status.ended && <span className={`chess-turn chess-turn--${turn}`} aria-hidden="true" />}
        {statusText}
      </p>

      <div className="chess-board" role="group" aria-label={t('games.chess.board')}>
        {cells.map((index, displayIndex) => {
          const piece = position.board[index];
          const rank = Math.floor(index / 8);
          const file = index % 8;
          const dark = (rank + file) % 2 === 1;
          const isTarget = targets.has(index);
          const classes = [
            'chess-square',
            dark ? 'chess-square--dark' : 'chess-square--light',
            selected === index && 'chess-square--selected',
            isTarget && (piece ? 'chess-square--capture' : 'chess-square--target'),
            (index === lastFrom || index === lastTo) && 'chess-square--last',
            index === kingInCheck && 'chess-square--check',
          ]
            .filter(Boolean)
            .join(' ');
          let label = piece
            ? t('games.chess.squarePiece', { square: squareName(index), color: colorName(colorOf(piece)), piece: pieceName(piece) })
            : squareName(index);
          if (isTarget) label += `, ${t('games.chess.targetSuffix')}`;
          // Koordinaten am Rand wie auf einem echten Brett (links Reihen, unten Linien)
          const showRank = displayIndex % 8 === 0;
          const showFile = displayIndex >= 56;

          return (
            <button
              key={index}
              type="button"
              className={classes}
              aria-label={label}
              aria-pressed={selected === index}
              aria-disabled={status.ended || undefined}
              onClick={() => choose(index)}
            >
              {piece && (
                <span className={`chess-piece chess-piece--${colorOf(piece)}`} aria-hidden="true">
                  {glyph(piece)}
                </span>
              )}
              {showRank && (
                <small className="chess-coord chess-coord--rank" aria-hidden="true">
                  {8 - rank}
                </small>
              )}
              {showFile && (
                <small className="chess-coord chess-coord--file" aria-hidden="true">
                  {FILES[file]}
                </small>
              )}
            </button>
          );
        })}
      </div>

      {pendingPromotion && (
        <div className="chess-promotion" role="group" aria-label={t('games.chess.promotion')} ref={promotionRef}>
          <p>{t('games.chess.promotion')}</p>
          <div className="chess-promotion__choices">
            {PROMOTION_PIECES.map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn btn--secondary chess-promotion__choice"
                onClick={() => run({ type: 'move', ...pendingPromotion, promotion: kind })}
              >
                <span className={`chess-piece chess-piece--${turn}`} aria-hidden="true">
                  {glyph(kind)}
                </span>
                {t(`games.chess.pieces.${kind}`)}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPendingPromotion(null)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      <div className="chess-actions">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={game.history.length === 1 && !game.manualEnd}
          onClick={() => run({ type: 'undo' })}
        >
          {t('games.chess.undo')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setFlipped((value) => !value)}>
          <Icon name="refresh" size={18} />
          {t('games.chess.flip')}
        </button>
        {!status.ended && status.canClaimDraw && (
          <button type="button" className="btn btn--secondary" onClick={() => run({ type: 'claimDraw' })}>
            {t('games.chess.claimDraw')}
          </button>
        )}
        {!status.ended && (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm('draw')}>
              {t('games.chess.offerDraw')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm('resign')}>
              {t('games.chess.resign')}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          disabled={game.history.length === 1 && !game.manualEnd}
          onClick={() => setConfirm('restart')}
        >
          {t('games.restart')}
        </button>
      </div>

      {confirm && (
        <div className="confirm" role="group" aria-label={confirmTexts[confirm]}>
          <p>{confirmTexts[confirm]}</p>
          <div className="confirm__actions">
            <button type="button" className="btn btn--danger btn--sm" onClick={() => run({ type: confirmActions[confirm] })}>
              {t('games.chess.confirmYes')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <details className="disclosure">
        <summary>
          <Icon name="chevronDown" size={18} className="disclosure__chevron" />
          {t('games.chess.moveList', { count: game.moves.length })}
        </summary>
        {game.moves.length ? (
          <ol className="chess-moves">
            {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, i) => (
              <li key={i}>
                <span>{formatMove(game.moves[i * 2])}</span>
                {game.moves[i * 2 + 1] && <span>{formatMove(game.moves[i * 2 + 1])}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t('games.chess.noMoves')}</p>
        )}
      </details>
    </section>
  );
}

/** "e2e4" → "e2–e4", "e7e8q" → "e7–e8=Q" */
function formatMove(notation) {
  const promotion = notation[4] ? `=${notation[4].toUpperCase()}` : '';
  return `${notation.slice(0, 2)}–${notation.slice(2, 4)}${promotion}`;
}
