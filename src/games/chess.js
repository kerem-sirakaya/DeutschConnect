// Schachregeln (ohne externe Pakete).
//
// Urheber: Kerem – UNVERÄNDERT übernommen aus der Codex-Version (Branch `codex-version-1.0`,
// Datei `supabase/functions/_shared/chess.js`). Dort wurde die Datei von Browser und Server
// gemeinsam genutzt; hier nur im Browser (lokales Schach zu zweit am selben Gerät).
// Geprüft durch Kerems Tests (Perft-Referenzstellungen), übernommen in `tests/chess.test.js`.
// Bitte nicht nebenbei umformatieren – Änderungen an den Regeln nur mit Tests.
//
// Kurzüberblick: Felder 0–63 (0 = a8, 63 = h1). Großbuchstaben = Weiß, Kleinbuchstaben = Schwarz.
// `fromFen` → Stellung, `legalMoves` → erlaubte Züge, `move` → nächste Stellung (wirft bei
// illegalem Zug), `gameStatus` → Matt/Patt/Remis/Schach, `positionKey` → für Stellungswiederholung.

// Dependency-free standard chess rules. Shared by browser and authoritative
// Edge Function; no network, browser state or trust in a supplied FEN.
export const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const file = (i) => i % 8;
const rank = (i) => Math.floor(i / 8);
const color = (p) => p && (p === p.toUpperCase() ? 'w' : 'b');
const other = (c) => c === 'w' ? 'b' : 'w';
export const squareName = (i) => 'abcdefgh'[file(i)] + (8 - rank(i));
export const squareIndex = (s) => /^[a-h][1-8]$/.test(s) ? (8 - Number(s[1])) * 8 + 'abcdefgh'.indexOf(s[0]) : -1;
export function fromFen(fen = initialFen) {
  const [placement, turn, rights, ep, half, full] = fen.split(' ');
  const board = [];
  for (const c of placement) { if (/[1-8]/.test(c)) board.push(...Array(Number(c)).fill(null)); else if (c !== '/') board.push(c); }
  if (board.length !== 64 || !['w', 'b'].includes(turn) || board.filter((p) => p === 'K').length !== 1 || board.filter((p) => p === 'k').length !== 1) throw new Error('invalid-position');
  return { board, turn, rights: rights === '-' ? '' : rights, ep: ep === '-' ? -1 : squareIndex(ep), half: Number(half) || 0, full: Number(full) || 1 };
}
export function toFen(s) {
  const rows = [];
  for (let r = 0; r < 8; r++) { let row = '', empty = 0; for (let f = 0; f < 8; f++) { const p = s.board[r * 8 + f]; if (!p) empty++; else { if (empty) row += empty; empty = 0; row += p; } } if (empty) row += empty; rows.push(row); }
  return `${rows.join('/')} ${s.turn} ${s.rights || '-'} ${s.ep < 0 ? '-' : squareName(s.ep)} ${s.half} ${s.full}`;
}
const knightSteps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const kingSteps = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
export function attacked(s, target, by) {
  const tr = rank(target), tf = file(target);
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]; if (color(p) !== by) continue;
    const dr = tr - rank(i), df = tf - file(i), kind = p.toLowerCase();
    if (kind === 'p' && dr === (by === 'w' ? -1 : 1) && Math.abs(df) === 1) return true;
    if (kind === 'n' && Math.abs(dr) * Math.abs(df) === 2) return true;
    if (kind === 'k' && Math.max(Math.abs(dr), Math.abs(df)) === 1) return true;
    const diagonal = Math.abs(dr) === Math.abs(df) && dr !== 0;
    const straight = (dr === 0) !== (df === 0);
    if (!((kind === 'b' && diagonal) || (kind === 'r' && straight) || (kind === 'q' && (diagonal || straight)))) continue;
    const rr = Math.sign(dr), ff = Math.sign(df); let r = rank(i) + rr, f = file(i) + ff, clear = true;
    while (r !== tr || f !== tf) { if (s.board[r * 8 + f]) { clear = false; break; } r += rr; f += ff; }
    if (clear) return true;
  }
  return false;
}
export function inCheck(s, side = s.turn) { return attacked(s, s.board.indexOf(side === 'w' ? 'K' : 'k'), other(side)); }
function applyRaw(s, m) {
  const board = [...s.board], piece = board[m.from], captured = board[m.to];
  board[m.from] = null; board[m.to] = m.promotion ? (s.turn === 'w' ? m.promotion.toUpperCase() : m.promotion) : piece;
  if (m.ep) board[m.to + (s.turn === 'w' ? 8 : -8)] = null;
  if (piece.toLowerCase() === 'k' && Math.abs(m.to - m.from) === 2) { const rookFrom = m.to > m.from ? m.from + 3 : m.from - 4; const rookTo = m.to > m.from ? m.from + 1 : m.from - 1; board[rookTo] = board[rookFrom]; board[rookFrom] = null; }
  let rights = s.rights;
  if (piece === 'K') rights = rights.replace(/[KQ]/g, '');
  if (piece === 'k') rights = rights.replace(/[kq]/g, '');
  for (const [corner, right] of [[0,'q'],[7,'k'],[56,'Q'],[63,'K']]) if (m.from === corner || m.to === corner) rights = rights.replace(right, '');
  return { board, turn: other(s.turn), rights, ep: piece.toLowerCase() === 'p' && Math.abs(m.to - m.from) === 16 ? (m.to + m.from) / 2 : -1, half: piece.toLowerCase() === 'p' || captured || m.ep ? 0 : s.half + 1, full: s.full + Number(s.turn === 'b') };
}
export function legalMoves(s) {
  const pseudo = [];
  const add = (from, to, extra = {}) => {
    if (color(s.board[to]) === s.turn || s.board[to]?.toLowerCase() === 'k') return;
    if (s.board[from].toLowerCase() === 'p' && [0,7].includes(rank(to))) for (const promotion of ['q','r','b','n']) pseudo.push({ from, to, ...extra, promotion });
    else pseudo.push({ from, to, ...extra });
  };
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]; if (color(p) !== s.turn) continue;
    const kind = p.toLowerCase(), r = rank(i), f = file(i);
    if (kind === 'p') {
      const d = s.turn === 'w' ? -1 : 1, next = i + 8 * d;
      if (next >= 0 && next < 64 && !s.board[next]) { add(i, next); if (r === (s.turn === 'w' ? 6 : 1) && !s.board[i + 16 * d]) add(i, i + 16 * d); }
      for (const df of [-1,1]) { const target = next + df; if (f + df < 0 || f + df > 7 || target < 0 || target > 63) continue; if (s.board[target] && color(s.board[target]) !== s.turn) add(i, target); else if (target === s.ep && s.board[target - 8 * d] === (s.turn === 'w' ? 'p' : 'P')) add(i, target, { ep: true }); }
    } else if (kind === 'n' || kind === 'k') {
      for (const [dr,df] of kind === 'n' ? knightSteps : kingSteps) if (r + dr >= 0 && r + dr < 8 && f + df >= 0 && f + df < 8) add(i, (r + dr) * 8 + f + df);
      const home = s.turn === 'w' ? 60 : 4;
      if (kind === 'k' && i === home && !inCheck(s)) for (const [delta, right, corner, path] of [[2,s.turn === 'w' ? 'K':'k',home+3,[1,2]],[-2,s.turn === 'w' ? 'Q':'q',home-4,[-1,-2,-3]]]) {
        if (s.rights.includes(right) && s.board[corner] === (s.turn === 'w' ? 'R' : 'r') && path.every((offset) => !s.board[home + offset]) && [Math.sign(delta),delta].every((offset) => !attacked(s, home + offset, other(s.turn)))) add(i, home + delta);
      }
    } else {
      const steps = kingSteps.filter(([dr,df]) => kind === 'q' || (kind === 'b' ? dr && df : !dr || !df));
      for (const [dr,df] of steps) { let rr = r + dr, ff = f + df; while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const target = rr * 8 + ff; add(i, target); if (s.board[target]) break; rr += dr; ff += df; } }
    }
  }
  return pseudo.filter((move) => !inCheck(applyRaw(s, move), s.turn));
}
export function move(s, input) {
  const from = typeof input.from === 'string' ? squareIndex(input.from) : input.from;
  const to = typeof input.to === 'string' ? squareIndex(input.to) : input.to;
  const found = legalMoves(s).find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === (input.promotion || 'q')));
  if (!found) throw new Error('illegal-move');
  return applyRaw(s, found);
}
export function positionKey(s) { return toFen(s).split(' ').slice(0,3).join(' ') + ' ' + (s.ep >= 0 && legalMoves(s).some((m) => m.ep) ? squareName(s.ep) : '-'); }
export function replay(moves = [], fen = initialFen) {
  let state = fromFen(fen); const positions = [positionKey(state)];
  if (!Array.isArray(moves) || moves.length > 1200) throw new Error('invalid-game');
  for (const item of moves) { if (gameStatus({...state,positions}).ended) throw new Error('game-ended');if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(item)) throw new Error('invalid-move'); state = move(state, { from: item.slice(0,2), to: item.slice(2,4), promotion: item[4] }); positions.push(positionKey(state)); }
  return { ...state, positions };
}
export function gameStatus(s) {
  const legal = legalMoves(s);
  if (!legal.length) return inCheck(s) ? { ended: true, reason: 'checkmate', winner: other(s.turn) } : { ended: true, reason: 'stalemate', winner: null };
  const nonKings = s.board.map((p,i) => ({ p, i })).filter(({p}) => p && p.toLowerCase() !== 'k');
  const insufficient = nonKings.length === 0 || (nonKings.length === 1 && /[bn]/i.test(nonKings[0].p)) || (nonKings.every(({p}) => p.toLowerCase() === 'b') && new Set(nonKings.map(({i}) => (rank(i) + file(i)) % 2)).size === 1);
  const repetition = (s.positions || []).filter((key) => key === positionKey(s)).length;
  if (insufficient || s.half >= 150 || repetition >= 5) return { ended: true, reason: insufficient ? 'material' : s.half >= 150 ? 'seventyfive' : 'fivefold', winner: null };
  return { ended: false, reason: inCheck(s) ? 'check' : 'playing', winner: null, canClaimDraw: s.half >= 100 || repetition >= 3 };
}
