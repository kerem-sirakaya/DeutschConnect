import { isActive } from './matching.js';

export function projectParticipation(idea, profileId) {
  if (idea.ownerId === profileId) return 'owner';
  if (idea.participantIds.includes(profileId)) return 'member';
  if (idea.requestedIds?.includes(profileId)) return 'requested';
  if (idea.interestedIds?.includes(profileId)) return 'interested';
  return 'none';
}

export function restoreProjectPeople(source, known, recovered) {
  const fields = {};
  for (const key of ['interestedIds', 'requestedIds']) {
    if (source[key] === undefined) continue; // Additive compatibility with v1.
    const values = Array.isArray(source[key]) ? source[key] : [];
    const members = Array.isArray(source.participantIds) ? source.participantIds : [];
    fields[key] = [...new Set(values.filter((id) => known(id) && id !== source.ownerId && (key !== 'requestedIds' || !members.includes(id))))];
    if (!Array.isArray(source[key]) || fields[key].length !== values.length) recovered('ideas.' + source.id + '.' + key);
  }
  return fields;
}

export function reduceProjectParticipation(state, action, actorId) {
  const idea = state.ideas.find((item) => item.id === action.id);
  if (!idea || idea.lifecycle === 'deleted') return state;
  let updated;
  if (action.type === 'setIdeaInterest' && actorId !== idea.ownerId && typeof action.interested === 'boolean') {
    const ids = idea.interestedIds || [];
    if (action.interested && !isActive(idea)) return state;
    updated = { ...idea, interestedIds: action.interested ? [...new Set([...ids, actorId])] : ids.filter((id) => id !== actorId) };
  } else if (action.type === 'requestIdea' && actorId !== idea.ownerId && isActive(idea) && !idea.participantIds.includes(actorId) && !idea.requestedIds?.includes(actorId)) {
    updated = { ...idea, requestedIds: [...(idea.requestedIds || []), actorId] };
  } else if (action.type === 'cancelIdeaRequest' && idea.requestedIds?.includes(actorId)) {
    updated = { ...idea, requestedIds: idea.requestedIds.filter((id) => id !== actorId) };
  } else if (action.type === 'leaveIdea' && idea.participantIds.includes(actorId) && actorId !== idea.ownerId) {
    updated = { ...idea, participantIds: idea.participantIds.filter((id) => id !== actorId) };
  } else if (action.type === 'reviewIdeaRequest' && idea.ownerId === actorId && isActive(idea) && idea.requestedIds?.includes(action.profileId) && Object.hasOwn(state.profiles, action.profileId) && ['accept', 'decline'].includes(action.decision)) {
    updated = { ...idea, requestedIds: idea.requestedIds.filter((id) => id !== action.profileId), participantIds: action.decision === 'accept' ? [...new Set([...idea.participantIds, action.profileId])] : idea.participantIds };
  }
  return updated ? { ...state, ideas: state.ideas.map((item) => item.id === idea.id ? updated : item) } : state;
}
