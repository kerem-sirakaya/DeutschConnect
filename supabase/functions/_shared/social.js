import { replay, move, gameStatus, squareName, squareIndex } from './chess.js';
import { chessInvitationEvents, validChessNoticeKey } from './chessInvitations.js';

export function freshSocial(profileIds = []) {
  return { blocks: Object.fromEntries(profileIds.map((id) => [id, []])), challenges: [], chessRead:{}, games: [], groups: [], awards: [], awardSharing: Object.fromEntries(profileIds.map((id) => [id, false])) };
}
export function blocked(state, a, b) { return Boolean(state.modules.blocks?.[a]?.includes(b) || state.modules.blocks?.[b]?.includes(a)); }
export function reduceSocial(state, action, actor, options = {}) {
  const m = state.modules, now = options.now || new Date().toISOString();
  const validId = (id) => typeof id === 'string' && /^local-[a-z0-9-]{1,100}$/.test(id);
  const known = (id) => Object.hasOwn(state.profiles, id);
  const change = (patch) => ({ ...state, modules: { ...m, ...patch } });
  if (action.type === 'readChessNotices' && Array.isArray(action.keys) && action.keys.length > 0 && action.keys.length <= 100) {
    const allowed = new Set(chessInvitationEvents(state,actor).filter((event) => event.canRead).map((event) => event.key));
    if (!action.keys.every((key) => validChessNoticeKey(key) && allowed.has(key))) return state;
    return change({chessRead:{...m.chessRead,[actor]:[...new Set([...(m.chessRead?.[actor] || []),...action.keys])]}});
  }
  if (action.type === 'blockPerson' && (known(action.profileId) || (options.demo && action.profileId === 'guest-mika')) && action.profileId !== actor && typeof action.blocked === 'boolean') {
    const ids = m.blocks?.[actor] || [];
    return change({ blocks: { ...m.blocks, [actor]: action.blocked ? [...new Set([...ids, action.profileId])] : ids.filter((id) => id !== action.profileId) } });
  }
  if (action.type === 'shareAwards' && typeof action.shared === 'boolean') return change({ awardSharing: { ...m.awardSharing, [actor]: action.shared } });
  if (action.type === 'challengeChess' && validId(action.id) && known(action.profileId) && action.profileId !== actor && m.visibility[action.profileId] && !blocked(state, actor, action.profileId) && !m.challenges?.some((c) => c.id === action.id || (c.status === 'pending' && [c.fromId,c.toId].includes(actor) && [c.fromId,c.toId].includes(action.profileId)))) {
    return change({ challenges: [...(m.challenges || []), { id: action.id, fromId: actor, toId: action.profileId, status: 'pending', createdAt: now }] });
  }
  if (action.type === 'respondChess') {
    const challenge = m.challenges?.find((c) => c.id === action.id && c.status === 'pending');
    if (!challenge || blocked(state, challenge.fromId, challenge.toId)) return state;
    if (action.response === 'cancelled' && challenge.fromId !== actor) return state;
    if (['accepted','declined'].includes(action.response) && challenge.toId !== actor) return state;
    if (!['cancelled','accepted','declined'].includes(action.response)) return state;
    const gameId = challenge.id + '-game';
    return change({ challenges: m.challenges.map((c) => c.id === challenge.id ? { ...c, status: action.response, ...(action.response === 'accepted' ? { gameId } : {}) } : c), games: action.response === 'accepted' ? [...(m.games || []), { id: gameId, whiteId: challenge.fromId, blackId: challenge.toId, mode: 'challenge', moves: [], revision: 0, status: 'active', createdAt: now }] : m.games });
  }
  if (action.type === 'startChess' && validId(action.id) && !m.games?.some((g) => g.id === action.id)) return change({ games: [...(m.games || []), { id: action.id, whiteId: actor, blackId: actor, mode: 'hotseat', moves: [], revision: 0, status: 'active', createdAt: now }] });
  if (['chessMove','chessResign','chessDraw','chessOfferDraw'].includes(action.type)) {
    const game = m.games?.find((g) => g.id === action.id);
    if (!game || ![game.whiteId,game.blackId].includes(actor) || game.status !== 'active' || game.revision !== action.revision || blocked(state, game.whiteId, game.blackId)) return state;
    const position = replay(game.moves), before = gameStatus(position);
    const side = game.mode === 'hotseat' ? position.turn : actor === game.whiteId ? 'w' : 'b';
    if (before.ended) return state;
    let next = { ...game, revision: game.revision + 1 };
    if (action.type === 'chessMove') {
      if (side !== position.turn) return state;
      try {
        const from = typeof action.move.from === 'string' ? squareIndex(action.move.from) : action.move.from;
        const to = typeof action.move.to === 'string' ? squareIndex(action.move.to) : action.move.to;
        const promotion = position.board[from]?.toLowerCase() === 'p' && [0,7].includes(Math.floor(to / 8)) ? action.move.promotion || 'q' : '';
        move(position, { from, to, promotion });
        const encoded = squareName(from) + squareName(to) + promotion;
        // Store coordinate moves and reconstruct every position on the server.
        next.moves = [...game.moves, encoded]; const status = gameStatus(replay(next.moves));
        next.drawOffer = null; if (status.ended) next = { ...next, status: 'ended', result: status };
      } catch { return state; }
    } else if (action.type === 'chessResign') next = { ...next, status: 'ended', result: { winner: side === 'w' ? 'b' : 'w', reason: 'resigned' } };
    else if (action.type === 'chessOfferDraw') next.drawOffer = actor;
    else {
      if (before.canClaimDraw && side !== position.turn && (!game.drawOffer || game.drawOffer === actor)) return state;
      if (!before.canClaimDraw && (!game.drawOffer || game.drawOffer === actor) && game.mode !== 'hotseat') return state;
      if (!before.canClaimDraw && !game.drawOffer) return state;
      next = { ...next, status: 'ended', result: { winner: null, reason: before.canClaimDraw ? 'claimed' : 'agreed' } };
    }
    return change({ games: m.games.map((g) => g.id === game.id ? next : g) });
  }
  if (action.type === 'joinGroup') {
    const group = m.groups?.find((g) => g.id === action.id && g.kind === 'topic' && !g.closed);
    if (!group) return state;
    return change({ groups: m.groups.map((g) => g.id === group.id ? { ...g, memberIds: [...new Set([...g.memberIds,actor])] } : g) });
  }
  if (action.type === 'leaveGroup') {
    const group = m.groups?.find((g) => g.id === action.id && g.kind === 'topic' && g.memberIds.includes(actor));
    if (!group) return state;
    return change({ groups: m.groups.map((g) => g.id === group.id ? { ...g, memberIds: g.memberIds.filter((id) => id !== actor) } : g) });
  }
  if (action.type === 'createProjectGroup') {
    const idea = state.ideas.find((i) => i.id === action.ideaId && i.ownerId === actor && !['deleted','withdrawn'].includes(i.lifecycle));
    if (!idea || m.groups?.some((g) => g.contextId === idea.id)) return state;
    return change({ groups: [...(m.groups || []), { id: 'project-' + idea.id, kind: 'project', contextId: idea.id, ownerId: actor, title: idea.title || options.projectTitle || 'Project', memberIds: [actor,...idea.participantIds] }] });
  }
  if (action.type === 'createEventGroup') {
    const event = state.activities?.find((e) => e.id === action.eventId && e.approval === 'confirmed' && (e.ownerId === actor || options.moderator));
    if (!event || m.groups?.some((g) => g.contextId === event.id)) return state;
    return change({ groups:[...(m.groups || []),{ id:'event-'+event.id, kind:'event', contextId:event.id, ownerId:event.ownerId, title:event.title, memberIds:[event.ownerId] }] });
  }
  return state;
}

export function restoreSocial(saved, profiles, recovered = () => {}) {
  const result = freshSocial(Object.keys(profiles));
  const known = (id) => Object.hasOwn(profiles,id);
  for (const id of Object.keys(profiles)) {
    const ids = saved?.blocks?.[id];
    if (Array.isArray(ids)) result.blocks[id] = [...new Set(ids.filter((target) => target !== id && (known(target) || target === 'guest-mika')))];
    if (ids !== undefined && (!Array.isArray(ids) || result.blocks[id].length !== ids.length)) recovered('blocks.'+id);
    result.awardSharing[id] = saved?.awardSharing?.[id] === true;
    const reads = saved?.chessRead?.[id];
    if (reads !== undefined) {
      if (Array.isArray(reads)) result.chessRead[id]=[...new Set(reads.filter(validChessNoticeKey))];
      if (!Array.isArray(reads) || reads.length !== result.chessRead[id].length) recovered('chessRead.'+id);
    }
  }
  for (const g of Array.isArray(saved?.games) ? saved.games : []) {
    try { if (!g || typeof g.id !== 'string' || !known(g.whiteId) || !known(g.blackId) || !['hotseat','challenge'].includes(g.mode) || !['active','ended'].includes(g.status) || !Number.isInteger(g.revision) || g.revision < 0 || (g.result && (!['w','b',null].includes(g.result.winner) || typeof g.result.reason !== 'string')) || result.games.some((item) => item.id === g.id)) throw new Error(); replay(g.moves); result.games.push(g); }
    catch { recovered('games'); }
  }
  result.challenges = (Array.isArray(saved?.challenges) ? saved.challenges : []).filter((c) => { const valid=typeof c?.id === 'string' && known(c.fromId) && known(c.toId) && ['pending','accepted','declined','cancelled'].includes(c.status) && (c.status !== 'accepted' || result.games.some((g)=>g.id===c.gameId)); if(!valid)recovered('challenges'); return valid; });
  result.groups = (Array.isArray(saved?.groups) ? saved.groups : []).filter((g) => { const valid=typeof g?.id === 'string' && ['topic','project','event'].includes(g.kind) && Array.isArray(g.memberIds) && (g.title === undefined || typeof g.title === 'string') && (g.kind === 'topic' || typeof g.contextId === 'string'); if(!valid)recovered('groups'); return valid; }).map((g) => ({ ...g, memberIds: [...new Set(g.memberIds.filter(known))] }));
  for(const field of ['games','challenges','groups']) if(saved?.[field]!==undefined&&!Array.isArray(saved[field]))recovered(field);
  if(saved?.awards?.length)recovered('awards');
  // Demo storage never supplies verified achievements. Real awards come only
  // from the authorized server projection.
  return result;
}
