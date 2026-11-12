// Spielverwaltung für Schach zu zweit am selben Gerät („Hotseat“) – nur lokaler State.
//
// Urheber der Regeln: Kerem (`chess.js`, Codex-Version). Der Hotseat-Ablauf (Züge als Liste
// wie "e2e4", Aufgeben, Remis vereinbaren/beanspruchen) folgt Kerems `ChessBoard.jsx` und
// seinem Server-Reducer in `supabase/functions/_shared/social.js` (Branch `codex-version-1.0`).
// Für DeutschConnect neu als reiner Reducer geschrieben: ohne Server, ohne Speicherung,
// zusätzlich mit „Zug zurücknehmen“. Reine Funktionen → mit `npm test` prüfbar.
//
// Leistung: Statt bei jedem Zug die ganze Partie neu nachzuspielen (`replay`), wird jede
// Stellung einmal berechnet und in `history` gemerkt. Zurücknehmen = letzte Stellung entfernen.

import { fromFen, move, gameStatus, positionKey, squareName } from './chess.js';

const other = (color) => (color === 'w' ? 'b' : 'w');

/** Neue Partie: Grundstellung, keine Züge, kein vorzeitiges Ende. */
export function newGame() {
  const start = fromFen();
  return { history: [{ ...start, positions: [positionKey(start)] }], moves: [], manualEnd: null };
}

/** Aktuelle Stellung (mit Liste aller bisherigen Stellungen für die Wiederholungs-Regel). */
export function currentPosition(game) {
  return game.history[game.history.length - 1];
}

/**
 * Ergebnis/Status der Partie.
 * Vorzeitiges Ende (Aufgabe, Remis vereinbart/beansprucht) hat Vorrang vor der Stellung.
 */
export function gameResult(game) {
  if (game.manualEnd) return { ended: true, ...game.manualEnd };
  return gameStatus(currentPosition(game));
}

/** Wird dieser Zug eine Bauernumwandlung? (Bauer erreicht die letzte Reihe) */
export function isPromotion(position, from, to) {
  return position.board[from]?.toLowerCase() === 'p' && (to < 8 || to >= 56);
}

/**
 * Reducer für `useReducer`.
 * Aktionen: move {from, to, promotion}, undo, restart, resign, agreeDraw, claimDraw.
 * Ungültige Aktionen ändern nichts (gleiches Objekt zurück).
 */
export function chessReducer(game, action) {
  switch (action.type) {
    case 'move': {
      if (gameResult(game).ended) return game;
      const position = currentPosition(game);
      const promotion = isPromotion(position, action.from, action.to) ? action.promotion || 'q' : undefined;
      let next;
      try {
        next = move(position, { from: action.from, to: action.to, promotion });
      } catch {
        return game; // illegaler Zug
      }
      const notation = squareName(action.from) + squareName(action.to) + (promotion || '');
      return {
        history: [...game.history, { ...next, positions: [...position.positions, positionKey(next)] }],
        moves: [...game.moves, notation],
        manualEnd: null,
      };
    }
    case 'undo': {
      // Zuerst ein vorzeitiges Ende zurücknehmen, sonst den letzten Zug.
      if (game.manualEnd) return { ...game, manualEnd: null };
      if (game.history.length === 1) return game;
      return { history: game.history.slice(0, -1), moves: game.moves.slice(0, -1), manualEnd: null };
    }
    case 'restart':
      return newGame();
    case 'resign': {
      // Am selben Gerät gibt die Seite auf, die gerade am Zug ist.
      if (gameResult(game).ended) return game;
      return { ...game, manualEnd: { reason: 'resigned', winner: other(currentPosition(game).turn) } };
    }
    case 'agreeDraw':
      if (gameResult(game).ended) return game;
      return { ...game, manualEnd: { reason: 'agreed', winner: null } };
    case 'claimDraw': {
      const status = gameResult(game);
      if (status.ended || !status.canClaimDraw) return game;
      return { ...game, manualEnd: { reason: 'claimed', winner: null } };
    }
    default:
      return game;
  }
}
