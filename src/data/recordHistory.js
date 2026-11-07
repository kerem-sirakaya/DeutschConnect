// Small local audit trail, not a permission or server-side audit system.
export function recordHistory(source, known) {
  if (!Array.isArray(source.history)) return {};
  return { history: source.history.filter((item) => item && known(item.actorId) && typeof item.action === 'string' && typeof item.at === 'string').map(({ actorId, action, at }) => ({ actorId, action, at })) };
}

export function appendHistory(record, action, actorId) {
  return [...(record.history || []), { actorId, action: action.type, at: typeof action.at === 'string' ? action.at : new Date().toISOString() }];
}
