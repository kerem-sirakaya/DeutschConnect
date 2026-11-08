import { activities, interests, schools } from './activities.js';
import { createModuleState, moduleReducer, projectStatuses, restoreModuleState } from './modules.js';
import { appendHistory, recordHistory } from './recordHistory.js';
import { reduceProjectParticipation, restoreProjectPeople } from './projectParticipation.js';
import { reduceSocial } from '../../supabase/functions/_shared/social.js';
import { validSharing } from '../../supabase/functions/_shared/profiles.js';

export const demoStorageKey = 'deutschconnect.demo.v1';
const languages = ['de', 'tr', 'en'];
const statuses = ['interested', 'joined', 'organized'];
const eventIds = new Set(activities.map((event) => event.id));
const schoolIds = new Set(schools.map((school) => school.id));
const validTopics = (topics) => Array.isArray(topics) && topics.length <= 8 && topics.every((topic) => typeof topic === 'string' && topic.length <= 40);
const cleanTopics = (topics) => [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))];

export function createDemoState(language = 'de') {
  return {
    version: 1,
    modules: createModuleState(),
    activeId: 'alex',
    profiles: {
      alex: { id: 'alex', displayName: 'Alex', schoolId: 'ers', interests: ['technology', 'science'], language: languages.includes(language) ? language : 'de' },
      deniz: { id: 'deniz', displayName: 'Deniz', schoolId: 'anka', interests: ['language', 'culture'], language: 'tr' },
    },
    participation: { alex: { codewerkstatt: 'interested' }, deniz: { sprachwerkstatt: 'joined' } },
    ideas: [
      { id: 'schulcode', seedKey: 'schulcode', ownerId: 'alex', participantIds: [], category: 'technology', schoolId: 'ers' },
      { id: 'tandem', seedIndex: 0, ownerId: 'community', participantIds: [], category: 'language', schoolId: 'anka' },
      { id: 'future', seedIndex: 1, ownerId: 'community', participantIds: [], category: 'science', schoolId: 'ers' },
      { id: 'exhibition', seedIndex: 2, ownerId: 'community', participantIds: [], category: 'culture', schoolId: 'anka' },
    ],
  };
}

export function validProfile(profile) {
  return typeof profile?.displayName === 'string' && profile.displayName.trim().length >= 2 &&
    profile.displayName.trim().length <= 40 && schoolIds.has(profile.schoolId) &&
    Array.isArray(profile.interests) && profile.interests.every((interest) => interests.includes(interest)) &&
    (profile.customInterests === undefined || validTopics(profile.customInterests)) &&
    (profile.profileSharing === undefined || validSharing(profile.profileSharing)) && languages.includes(profile.language);
}

export function validIdeaInput(idea) {
  return typeof idea?.title === 'string' && idea.title.trim().length >= 5 && idea.title.trim().length <= 90 &&
    typeof idea.description === 'string' && idea.description.trim().length >= 20 &&
    idea.description.trim().length <= 1000 && (interests.includes(idea.category) || idea.category === 'open') &&
    (idea.goals === undefined || (typeof idea.goals === 'string' && idea.goals.length <= 600)) &&
    (idea.collaborators === undefined || (typeof idea.collaborators === 'string' && idea.collaborators.length <= 400)) &&
    (idea.topics === undefined || validTopics(idea.topics)) &&
    (idea.desiredSchoolIds === undefined || (Array.isArray(idea.desiredSchoolIds) && idea.desiredSchoolIds.every((id) => schoolIds.has(id)))) &&
    (idea.projectStatus === undefined || projectStatuses.includes(idea.projectStatus));
}

function projectFields(idea) {
  return {
    ...(idea.goals !== undefined ? { goals: idea.goals.trim() } : {}),
    ...(idea.collaborators !== undefined ? { collaborators: idea.collaborators.trim() } : {}),
    ...(idea.topics !== undefined ? { topics: cleanTopics(idea.topics) } : {}),
    ...(idea.desiredSchoolIds !== undefined ? { desiredSchoolIds: [...new Set(idea.desiredSchoolIds)] } : {}),
    ...(idea.projectStatus !== undefined ? { projectStatus: idea.projectStatus } : {}),
    ...(idea.initiativeId === 'interviews' ? { initiativeId: 'interviews' } : {}),
  };
}

// Salvage each valid record independently. Persistence keeps the raw original.
export function inspectDemoState(raw, language = 'de') {
  const initial = createDemoState(language);
  if (raw === null || raw === undefined) return { state: initial, recoveredRecords: 0, problems: [], revision: 0 };
  let saved;
  try { saved = JSON.parse(raw); }
  catch { return { state: initial, recoveredRecords: 0, problems: ['parse'], blocked: true, reason: 'parse', revision: 0 }; }
  if (!saved || saved.version !== 1) return { state: initial, recoveredRecords: 0, problems: ['version'], blocked: true, reason: 'version', revision: 0 };
  const problems = [];
  const recovered = (path) => problems.push(path);
  const known = (id) => Object.hasOwn(initial.profiles, id);
  const profiles = {};
  for (const [id, fallback] of Object.entries(initial.profiles)) {
    const source = saved.profiles?.[id];
    const profile = { ...fallback };
    if (!source || typeof source !== 'object' || Array.isArray(source)) recovered('profiles.' + id);
    else {
      for (const key of ['displayName', 'schoolId', 'interests', 'language', 'customInterests', 'profileSharing']) {
        if (['customInterests', 'profileSharing'].includes(key) && source[key] === undefined) continue;
        const candidate = { ...profile, [key]: source[key] };
        if (validProfile(candidate)) profile[key] = source[key];
        else recovered('profiles.' + id + '.' + key);
      }
      if (source.id !== id) recovered('profiles.' + id + '.id');
    }
    profiles[id] = { ...profile, displayName: profile.displayName.trim(), interests: [...new Set(profile.interests)], ...(profile.customInterests ? { customInterests: cleanTopics(profile.customInterests) } : {}) };
  }
  for (const id of Object.keys(saved.profiles || {})) if (!known(id)) recovered('profiles.' + id);
  const participation = {};
  for (const id of Object.keys(profiles)) {
    const source = saved.participation?.[id];
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      participation[id] = { ...initial.participation[id] };
      recovered('participation.' + id);
    } else {
      participation[id] = {};
      for (const [eventId, status] of Object.entries(source)) {
        if (eventIds.has(eventId) && statuses.includes(status)) participation[id][eventId] = status;
        else recovered('participation.' + id + '.' + eventId);
      }
    }
  }
  const ids = new Set();
  const ideas = [];
  if (!Array.isArray(saved.ideas)) recovered('ideas');
  for (const source of Array.isArray(saved.ideas) ? saved.ideas : []) {
    const seed = initial.ideas.find((idea) => idea.id === source?.id);
    if (!source || ids.has(source.id) || (!seed && (!/^local-[a-z0-9-]+$/.test(source.id) || !known(source.ownerId))) || (seed && source.ownerId !== seed.ownerId) || !schoolIds.has(source.schoolId)) {
      recovered('ideas.' + (source?.id || '?')); continue;
    }
    const materialized = typeof source.title === 'string';
    if ((!seed || materialized) && !validIdeaInput(source)) { recovered('ideas.' + source.id); continue; }
    if (source.lifecycle !== undefined && !['active', 'withdrawn', 'deleted'].includes(source.lifecycle)) { recovered('ideas.' + source.id + '.lifecycle'); continue; }
    const participantIds = Array.isArray(source.participantIds) ? [...new Set(source.participantIds.filter(known))] : [];
    if (!Array.isArray(source.participantIds) || participantIds.length !== source.participantIds.length) recovered('ideas.' + source.id + '.participants');
    ids.add(source.id);
    ideas.push({ ...(seed && !materialized ? seed : { id: source.id, title: source.title.trim(), description: source.description.trim(), category: source.category, ownerId: source.ownerId, schoolId: source.schoolId, ...projectFields(source) }), participantIds,
      ...(source.lifecycle ? { lifecycle: source.lifecycle } : {}), ...recordHistory(source, known), ...restoreProjectPeople(source, known, recovered) });
  }
  // Missing legacy fixtures are restored, but an existing tombstone is retained.
  for (const seed of initial.ideas) if (!ids.has(seed.id)) { ideas.push(seed); if (Array.isArray(saved.ideas)) recovered('ideas.' + seed.id); }
  if (!known(saved.activeId)) recovered('activeId');
  const state = { ...initial, profiles, participation, ideas, activeId: known(saved.activeId) ? saved.activeId : initial.activeId,
    modules: restoreModuleState(saved.modules, profiles, recovered) };
  return { state, recoveredRecords: problems.length, problems, revision: Number.isSafeInteger(saved._persistence?.revision) && saved._persistence.revision >= 0 ? saved._persistence.revision : 0 };
}

export function readDemoState(storage, language) {
  try { return inspectDemoState(storage.getItem(demoStorageKey), language).state; }
  catch { return createDemoState(language); }
}

export function myEvents(profile, participation, source = activities) {
  return source.filter((event) => participation[event.id]).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function recommendationReason(event, profile) {
  if (!event.schoolIds.includes(profile.schoolId)) return null;
  if (profile.interests.includes(event.category)) return 'interest';
  return event.hostSchoolId === profile.schoolId ? 'school' : null;
}

export function recommendedEvents(profile, participation, source = activities) {
  return source.filter((event) => !participation[event.id] && recommendationReason(event, profile)).sort((a, b) => {
    const score = (event) => Number(profile.interests.includes(event.category)) * 4 + Number(event.hostSchoolId === profile.schoolId);
    return score(b) - score(a) || a.startsAt.localeCompare(b.startsAt);
  });
}

export function myIdeas(profile, ideas) {
  return ideas.filter((idea) => idea.lifecycle !== 'deleted' && (idea.ownerId === profile.id || idea.participantIds.includes(profile.id) || idea.requestedIds?.includes(profile.id) || idea.interestedIds?.includes(profile.id)));
}

// Pure updates keep UI consumers independent of the local persistence mechanism.
export function demoReducer(state, action) {
  const id = action.actorId || state.activeId;
  if (!Object.hasOwn(state.profiles, id)) return state;
  if (action.type === 'switchProfile' && Object.hasOwn(state.profiles, action.id)) return { ...state, activeId: action.id };
  if (action.type === 'preferences') {
    const { displayName, schoolId, interests: selected, language, customInterests, profileSharing } = { ...state.profiles[id], ...action.patch };
    const profile = { id, displayName, schoolId, interests: selected, language, ...(customInterests !== undefined ? { customInterests } : {}), ...(profileSharing !== undefined ? { profileSharing } : {}) };
    if (!validProfile(profile)) return state;
    return { ...state, profiles: { ...state.profiles, [id]: { ...profile, displayName: profile.displayName.trim(), interests: [...new Set(profile.interests)], ...(customInterests !== undefined ? { customInterests: cleanTopics(customInterests) } : {}) } } };
  }
  if (action.type === 'participation' && eventIds.has(action.eventId) && (action.status === null || statuses.includes(action.status))) {
    const personal = { ...state.participation[id] };
    if (action.status) personal[action.eventId] = action.status;
    else delete personal[action.eventId];
    return { ...state, participation: { ...state.participation, [id]: personal } };
  }
  if (action.type === 'submitIdea' && validIdeaInput(action.idea) && /^local-[a-z0-9-]+$/.test(action.id) && !state.ideas.some((idea) => idea.id === action.id)) {
    const idea = { id: action.id, title: action.idea.title.trim(), description: action.idea.description.trim(), category: action.idea.category, schoolId: state.profiles[id].schoolId, ownerId: id, participantIds: [], ...projectFields(action.idea) };
    return { ...state, ideas: [idea, ...state.ideas] };
  }
  if (action.type === 'toggleIdea') {
    const previous = state.ideas.find((idea) => idea.id === action.id);
    if (!previous || previous.ownerId === id || previous.lifecycle === 'deleted' || (previous.lifecycle === 'withdrawn' && !previous.participantIds.includes(id))) return state;
    return { ...state, ideas: state.ideas.map((idea) => {
      if (idea.id !== action.id || idea.ownerId === id) return idea;
      const participantIds = idea.participantIds.includes(id) ? idea.participantIds.filter((value) => value !== id) : [...idea.participantIds, id];
      return { ...idea, participantIds };
    }) };
  }
  if (['setIdeaInterest', 'requestIdea', 'cancelIdeaRequest', 'leaveIdea', 'reviewIdeaRequest'].includes(action.type)) return reduceProjectParticipation(state, action, id);
  if (['updateIdea', 'withdrawIdea', 'removeIdea'].includes(action.type)) {
    const previous = state.ideas.find((idea) => idea.id === action.id);
    if (!previous || previous.ownerId !== id || previous.lifecycle === 'deleted' || (action.type === 'updateIdea' && !validIdeaInput(action.idea))) return state;
    const { seedKey, seedIndex, initiativeId, ...materialized } = previous;
    const updated = action.type === 'updateIdea' ? { ...materialized, title: action.idea.title.trim(), description: action.idea.description.trim(), category: action.idea.category, ...projectFields(action.idea) } : { ...previous, lifecycle: action.type === 'removeIdea' ? 'deleted' : 'withdrawn' };
    return { ...state, ideas: state.ideas.map((idea) => idea.id === action.id ? { ...updated, history: appendHistory(previous, action, id) } : idea) };
  }
  const social = reduceSocial(state, action, id, { demo: true });
  return social !== state ? social : moduleReducer(state, { ...action, actorId: id });
}
