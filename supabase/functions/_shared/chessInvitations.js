const noticeKinds = ['invited','accepted','declined','cancelled'];
export function validChessNoticeKey(value) {
  return typeof value === 'string' && /^local-[a-z0-9-]{1,100}:(invited|accepted|declined|cancelled)$/.test(value);
}

// Notifications derive from persisted invitations; no duplicate game or message counters.
export function chessInvitationEvents(state, actor) {
  const seen = new Set(), events = [];
  for (const challenge of state.modules.challenges || []) {
    if (!challenge || !validChessNoticeKey(challenge.id+':invited') || seen.has(challenge.id) || challenge.fromId === challenge.toId ||
        ![challenge.fromId,challenge.toId].includes(actor) ||
        state.modules.blocks?.[challenge.fromId]?.includes(challenge.toId) ||
        state.modules.blocks?.[challenge.toId]?.includes(challenge.fromId)) continue;
    seen.add(challenge.id);
    const incoming = challenge.toId === actor;
    const otherId = incoming ? challenge.fromId : challenge.toId;
    if (!state.profiles[otherId]) continue;
    let kind;
    if (challenge.status === 'pending') kind = incoming ? 'invited' : 'sent';
    else if (challenge.status === 'accepted') kind = 'accepted';
    else if (challenge.status === 'declined' && !incoming) kind = 'declined';
    else if (challenge.status === 'cancelled' && incoming) kind = 'cancelled';
    else continue;
    const game = kind === 'accepted' ? state.modules.games?.find((item) => item.id === challenge.gameId && item.id === challenge.id+'-game' && item.mode === 'challenge' && item.whiteId === challenge.fromId && item.blackId === challenge.toId) : null;
    if (kind === 'accepted' && !game) continue;
    events.push({key:challenge.id+':'+kind,challengeId:challenge.id,kind,otherId,
      otherName:state.profiles[otherId].displayName,createdAt:challenge.createdAt || '',
      ...(game ? {gameId:game.id,finished:game.status === 'ended'} : {}),
      canRead:noticeKinds.includes(kind)});
  }
  return events.sort((a,b) => (Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0) || a.key.localeCompare(b.key));
}

// Provider-independent preparation only. No email addresses or transport credentials.
// A future server worker must resolve the verified recipient and enforce opt-in.
export function chessInviteEmail({challenge,language = 'de',appUrl}) {
  if (challenge?.status !== 'pending' || !/^local-[a-z0-9-]{1,100}$/.test(challenge.id) || typeof challenge.fromId!=='string' || typeof challenge.toId!=='string' || !challenge.toId || challenge.fromId === challenge.toId || !['de','tr','en'].includes(language)) return null;
  let url;
  try { url = new URL(appUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  url.hash = '/me/notifications';
  const copy = {
    de:['Schacheinladung bei DeutschConnect','Du hast eine Schacheinladung erhalten. Melde dich bei DeutschConnect an, um sie anzusehen und freiwillig anzunehmen oder abzulehnen.'],
    tr:['DeutschConnect satranç daveti','Bir satranç daveti aldın. Daveti görmek ve isteğe bağlı olarak kabul etmek ya da reddetmek için DeutschConnect hesabına giriş yap.'],
    en:['Chess invitation on DeutschConnect','You received a chess invitation. Sign in to DeutschConnect to view it and choose whether to accept or decline.'],
  }[language] || null;
  if (!copy) return null;
  return {idempotencyKey:'chess-invite/'+challenge.id,toUserId:challenge.toId,subject:copy[0],text:copy[1]+'\n\n'+url.href};
}
