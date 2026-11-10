// Tests für Schach. Ausführen mit: npm test
// Teil 1: Kerems Regeltests – unverändert übernommen aus `scripts/chess-games.test.mjs`
//         (Branch `codex-version-1.0`; nur die Schach-Teile, ohne Online-/Server-Funktionen).
// Teil 2: Tests für die lokale Spielverwaltung (chessHotseat.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFen, toFen, legalMoves, move, replay, gameStatus, squareIndex, squareName, inCheck } from '../src/games/chess.js';
import { newGame, chessReducer, currentPosition, gameResult, isPromotion } from '../src/games/chessHotseat.js';

// ---------- Teil 1: Kerems Regeltests ----------
function perft(s, depth) { if (!depth) return 1; return legalMoves(s).reduce((sum,m) => sum + perft(move(s,m),depth-1),0); }
test('initial chess position matches reference move-tree counts', () => {
  const state = fromFen(); assert.equal(legalMoves(state).length,20); assert.equal(perft(state,2),400); assert.equal(perft(state,3),8902);
  for (let i=0;i<64;i++) assert.equal(squareIndex(squareName(i)),i);
});
test('castling, checks and tactical move generation match Kiwipete perft', () => {
  const state = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(state,1),48); assert.equal(perft(state,2),2039);
});
test('endgame, promotion and pinned-piece reference positions match known move trees',()=>{
 for(const [fen,first,second]of [
 ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',14,191],
 ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',6,264],
 ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',44,1486]]){const s=fromFen(fen);assert.equal(perft(s,1),first);assert.equal(perft(s,2),second);}
});
test('castling moves the rook and cannot cross attacked squares', () => {
  const state = move(fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),{from:'e1',to:'g1'});
  assert.equal(state.board[squareIndex('f1')],'R'); assert.equal(state.board[squareIndex('g1')],'K'); assert.ok(!state.rights.includes('K'));
  assert.throws(() => move(fromFen('4kr2/8/8/8/8/8/8/4K2R w K - 0 1'),{from:'e1',to:'g1'}));
});
test('en passant is legal only immediately and cannot expose the king', () => {
  const state = replay(['e2e4','a7a6','e4e5','d7d5','e5d6']);
  assert.equal(state.board[squareIndex('d5')],null); assert.equal(state.board[squareIndex('d6')],'P');
  assert.throws(() => move(fromFen('4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1'),{from:'e5',to:'d6'}));
});
test('all promotions, checkmate, stalemate and material draws are identified', () => {
  const s=fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'); assert.equal(legalMoves(s).filter((m) => m.from===squareIndex('a7')).length,4);
  assert.equal(move(s,{from:'a7',to:'a8',promotion:'n'}).board[0],'N');
  assert.equal(gameStatus(replay(['f2f3','e7e5','g2g4','d8h4'])).reason,'checkmate');
  assert.equal(gameStatus(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason,'stalemate');
  assert.equal(gameStatus(fromFen('7k/8/6K1/8/8/8/8/8 w - - 0 1')).reason,'material');
});
test('draw claims and automatic draw thresholds are separate', () => {
  const cycle=['g1f3','g8f6','f3g1','f6g8'];
  assert.equal(gameStatus(replay([...cycle,...cycle])).canClaimDraw,true);
  assert.equal(gameStatus(replay([...cycle,...cycle])).ended,false);
  assert.equal(gameStatus(replay([...cycle,...cycle,...cycle,...cycle])).reason,'fivefold');
  assert.equal(gameStatus(fromFen('r3k3/8/8/8/8/8/8/R3K3 w - - 100 1')).canClaimDraw,true);
  assert.equal(gameStatus(fromFen('r3k3/8/8/8/8/8/8/R3K3 w - - 150 1')).reason,'seventyfive');
});
test('illegal moves, self-check, missing kings and malformed histories fail', () => {
  assert.throws(()=>move(fromFen(),{from:'e2',to:'e5'})); assert.throws(()=>replay(['e2e9'])); assert.throws(()=>fromFen('8/8/8/8/8/8/8/8 w - - 0 1'));
  const s=fromFen('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1'); assert.throws(()=>move(s,{from:'e2',to:'d2'})); assert.equal(inCheck(s),false); assert.equal(toFen(fromFen()),toFen(fromFen()));
});

// ---------- Teil 2: lokale Spielverwaltung (Hotseat) ----------
const sq = squareIndex;
function play(game, ...notations) {
  return notations.reduce(
    (state, n) => chessReducer(state, { type: 'move', from: sq(n.slice(0, 2)), to: sq(n.slice(2, 4)), promotion: n[4] }),
    game,
  );
}

test('Hotseat: Züge wechseln die Seite, illegale Züge ändern nichts', () => {
  const start = newGame();
  const afterE4 = play(start, 'e2e4');
  assert.deepEqual(afterE4.moves, ['e2e4']);
  assert.equal(currentPosition(afterE4).turn, 'b');
  assert.equal(play(afterE4, 'e2e4'), afterE4, 'Weiß ist nicht am Zug');
  assert.equal(play(start, 'e2e5'), start, 'illegaler Bauernzug');
});

test('Hotseat: Schachmatt beendet die Partie, danach keine Züge mehr', () => {
  const mate = play(newGame(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.deepEqual(gameResult(mate), { ended: true, reason: 'checkmate', winner: 'b' });
  assert.equal(play(mate, 'a2a3'), mate);
});

test('Hotseat: Zug zurücknehmen und Neustart', () => {
  const two = play(newGame(), 'e2e4', 'e7e5');
  const one = chessReducer(two, { type: 'undo' });
  assert.deepEqual(one.moves, ['e2e4']);
  assert.equal(currentPosition(one).turn, 'b');
  const none = chessReducer(one, { type: 'undo' });
  assert.equal(chessReducer(none, { type: 'undo' }), none, 'nichts mehr zurückzunehmen');
  assert.deepEqual(chessReducer(two, { type: 'restart' }).moves, []);
  // Nach Matt kann der letzte Zug zurückgenommen werden
  const mate = play(newGame(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(gameResult(chessReducer(mate, { type: 'undo' })).ended, false);
});

test('Hotseat: Rochade, en passant und Umwandlung über den Reducer', () => {
  const castled = play(newGame(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1');
  assert.equal(currentPosition(castled).board[sq('g1')], 'K');
  assert.equal(currentPosition(castled).board[sq('f1')], 'R');

  const enPassant = play(newGame(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  assert.equal(currentPosition(enPassant).board[sq('d5')], null);

  // Weißer Bauer läuft nach h7 und schlägt dann den Springer auf g8 → Umwandlung
  const promo = play(newGame(), 'h2h4', 'g7g5', 'h4g5', 'h7h6', 'g5h6', 'f8g7', 'h6h7', 'a7a6');
  assert.equal(promo.moves.length, 8, 'alle Vorbereitungszüge legal');
  assert.equal(isPromotion(currentPosition(promo), sq('h7'), sq('g8')), true);
  const knight = play(promo, 'h7g8n');
  assert.equal(currentPosition(knight).board[sq('g8')], 'N');
  assert.equal(knight.moves.at(-1), 'h7g8n');
  const queen = play(promo, 'h7g8'); // ohne Angabe → Dame
  assert.equal(currentPosition(queen).board[sq('g8')], 'Q');
  assert.equal(isPromotion(currentPosition(newGame()), sq('e2'), sq('e4')), false);
});

test('Hotseat: Aufgeben, Remis vereinbaren und Remis nur bei Anspruch beanspruchen', () => {
  const game = play(newGame(), 'e2e4');
  const resigned = chessReducer(game, { type: 'resign' });
  assert.deepEqual(gameResult(resigned), { ended: true, reason: 'resigned', winner: 'w' }, 'Schwarz war am Zug und gibt auf');
  assert.equal(play(resigned, 'e7e5'), resigned, 'nach Aufgabe keine Züge');
  assert.equal(gameResult(chessReducer(resigned, { type: 'undo' })).ended, false, 'Aufgabe zurücknehmen');
  assert.deepEqual(gameResult(chessReducer(game, { type: 'agreeDraw' })), { ended: true, reason: 'agreed', winner: null });

  assert.equal(chessReducer(game, { type: 'claimDraw' }), game, 'kein Anspruch → nichts passiert');
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const repeated = play(newGame(), ...cycle, ...cycle);
  assert.equal(gameResult(repeated).canClaimDraw, true);
  assert.equal(gameResult(chessReducer(repeated, { type: 'claimDraw' })).reason, 'claimed');
});

test('Hotseat: Stellungswiederholung wird wie bei replay() erkannt', () => {
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const notations = [...cycle, ...cycle, ...cycle, ...cycle];
  assert.equal(gameResult(play(newGame(), ...notations)).reason, 'fivefold');
  assert.deepEqual(currentPosition(play(newGame(), ...notations)).positions, replay(notations).positions);
});
