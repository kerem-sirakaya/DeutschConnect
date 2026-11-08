import { replay, gameStatus } from '../../supabase/functions/_shared/chess.js';

export const leaderboardGames = ['chess', 'memory', 'flight', 'runner'];
export const leaderboardViews = ['global', 'school', 'personal'];
const integer = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e9;

export function validLocalResult(result) {
  return result && typeof result.id === 'string' && /^run-[a-z0-9-]{1,100}$/.test(result.id) &&
    typeof result.ownerId === 'string' && ['memory','flight','runner'].includes(result.game) &&
    result.completed === true && integer(result.score) && Number.isFinite(Date.parse(result.completedAt)) &&
    (result.game !== 'memory' || (result.score === 1 && result.pairs === 6 && integer(result.turns) && result.turns >= 6));
}

export function arcadeResult(game, scene, id, ownerId, now = new Date().toISOString()) {
  if(!scene || typeof scene!=='object')return null;
  const result = { id, ownerId, game, score:scene.score, completed:scene.over === true, completedAt:now };
  return validLocalResult(result) ? result : null;
}

export function pairsResult(deck, found, turns, id, ownerId, now = new Date().toISOString()) {
  if (!Array.isArray(deck) || !Array.isArray(found) || deck.length !== 12 || new Set(found).size !== 6 || found.length !== 6 ||
      ![0,1,2,3,4,5].every((value) => found.includes(value) && deck.filter((item) => item === value).length === 2)) return null;
  const result = { id, ownerId, game:'memory', score:1, completed:true, pairs:6, turns, completedAt:now };
  return validLocalResult(result) ? result : null;
}

// No stored chess counters: one validated, finished game ID contributes once.
// The server is authoritative for account games; demo records remain unverified.
export function chessOutcome(game) {
  if (game?.status !== 'ended' || !Array.isArray(game.moves) || !['hotseat','challenge'].includes(game.mode) ||
      !['w','b',null].includes(game.result?.winner)) return null;
  if (game.mode === 'challenge' && (!game.whiteId || !game.blackId || game.whiteId === game.blackId)) return null;
  try {
    const status = gameStatus(replay(game.moves));
    const { winner, reason } = game.result;
    if (status.ended) return status.winner === winner && status.reason === reason ? { winner, reason } : null;
    if (game.moves.length === 0) return null; // An empty/never-started match earns no result.
    if (reason === 'resigned' && ['w','b'].includes(winner)) return { winner, reason };
    if (winner === null && (reason === 'agreed' || (reason === 'claimed' && status.canClaimDraw))) return { winner, reason };
  } catch { /* Corrupt/incomplete records cannot contribute points. */ }
  return null;
}

export function personalGameStats({ game, ownerId, results = [], chessGames = [] }) {
  const history = [], seen = new Set();
  let wins = 0, losses = 0, draws = 0, practice = 0;
  if (game === 'chess') {
    for (const item of chessGames) {
      if (!item?.id || seen.has(item.id) || ![item.whiteId,item.blackId].includes(ownerId)) continue;
      seen.add(item.id);
      const outcome = chessOutcome(item); if (!outcome) continue;
      let result = 'practice';
      if (item.mode === 'hotseat') practice++;
      else if (outcome.winner === null) { draws++; result = 'draws'; }
      else if ((outcome.winner === 'w' ? item.whiteId : item.blackId) === ownerId) { wins++; result = 'wins'; }
      else { losses++; result = 'losses'; }
      history.push({ id:item.id, result, score:result === 'wins' ? 1 : 0, completedAt:item.endedAt || '', createdAt:item.createdAt || '', reason:outcome.reason });
    }
    return { score:wins, wins, losses, draws, completed:wins+losses+draws, totalCompleted:wins+losses+draws+practice, practice, history };
  }
  for (const item of results) {
    if (!validLocalResult(item) || item.ownerId !== ownerId || item.game !== game || seen.has(item.id)) continue;
    seen.add(item.id); history.push(item);
  }
  return { score:game === 'memory' ? history.length : Math.max(0,...history.map((item) => item.score)), completed:history.length, history };
}

export function rankGame({ game, profiles, sharing, results, chessGames, schoolId, blockedIds = [] }) {
  if (schoolId === '') return [];
  const rows = Object.values(profiles).filter((profile) => sharing[profile.id]?.[game] === true &&
    !blockedIds.includes(profile.id) && (schoolId === undefined || profile.schoolId === schoolId)).map((profile) => ({
      id:profile.id, displayName:profile.displayName, ...personalGameStats({ game, ownerId:profile.id, results, chessGames }),
    })).filter((row) => row.completed > 0).sort((a,b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows.map((row,index) => ({...row,rank:index > 0 && rows[index-1].score === row.score ? rows.findIndex((item) => item.score === row.score)+1 : index+1}));
}
