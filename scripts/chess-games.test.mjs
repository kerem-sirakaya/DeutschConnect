import test from 'node:test';
import assert from 'node:assert/strict';
import { fromFen, toFen, legalMoves, move, replay, gameStatus, squareIndex, squareName, inCheck } from '../supabase/functions/_shared/chess.js';
import { reduceSocial, freshSocial } from '../supabase/functions/_shared/social.js';
import { freshRunner, stepRunner, freshFlight, stepFlight, shuffledPairs } from '../src/games/arcade.js';
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
function socialState() { return { profiles:{alex:{},deniz:{}},ideas:[],modules:{...freshSocial(['alex','deniz']),visibility:{alex:true,deniz:true}} }; }
test('challenges require consent, reject outsiders and create exactly one game', () => {
  let s=socialState(); s=reduceSocial(s,{type:'challengeChess',id:'local-challenge',profileId:'deniz'},'alex');
  assert.equal(s.modules.games.length,0); assert.equal(reduceSocial(s,{type:'respondChess',id:'local-challenge',response:'accepted'},'alex'),s);
  s=reduceSocial(s,{type:'respondChess',id:'local-challenge',response:'accepted'},'deniz'); assert.equal(s.modules.games.length,1);
  assert.equal(reduceSocial(s,{type:'respondChess',id:'local-challenge',response:'accepted'},'deniz'),s);
  assert.equal(reduceSocial(s,{type:'chessMove',id:s.modules.games[0].id,revision:0,move:{from:'e2',to:'e4'}},'deniz'),s);
  const played=reduceSocial(s,{type:'chessMove',id:s.modules.games[0].id,revision:0,move:{from:'e2',to:'e4'}},'alex'); assert.equal(played.modules.games[0].moves[0],'e2e4');
  assert.equal(reduceSocial(played,{type:'chessMove',id:s.modules.games[0].id,revision:0,move:{from:'e7',to:'e5'}},'deniz'),played);
});
test('blocking prevents challenges and hotseat accepts alternating moves from its owner', () => {
  let s=reduceSocial(socialState(),{type:'blockPerson',profileId:'deniz',blocked:true},'alex'); assert.equal(reduceSocial(s,{type:'challengeChess',id:'local-blocked',profileId:'alex'},'deniz'),s);
  s=reduceSocial(s,{type:'startChess',id:'local-hotseat'},'alex');
  s=reduceSocial(s,{type:'chessMove',id:'local-hotseat',revision:0,move:{from:'e2',to:'e4'}},'alex');
  s=reduceSocial(s,{type:'chessMove',id:'local-hotseat',revision:1,move:{from:'e7',to:'e5'}},'alex'); assert.deepEqual(s.modules.games[0].moves,['e2e4','e7e5']);
});
test('arcade models provide jumping, collisions, scoring and bounded elapsed time', () => {
  const runner=stepRunner(freshRunner(),.016,true,()=>.5); assert.ok(runner.y>0);
  assert.equal(stepRunner({...freshRunner(),obstacles:[{x:90,width:25,height:40}]},.016,false).over,true);
  const flight=stepFlight(freshFlight(),.016,true); assert.ok(flight.y<150);
  assert.equal(stepFlight({...freshFlight(),y:299},.016,false).over,true);
  assert.ok(stepRunner(freshRunner(),100,false).time<=.035);
  const deck=shuffledPairs(()=>.4); assert.equal(deck.length,12); for(let i=0;i<6;i++) assert.equal(deck.filter((v)=>v===i).length,2);
});
