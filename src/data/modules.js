import { appendHistory, recordHistory } from './recordHistory.js';
import { isActive, normalizeSubject } from './matching.js';
import { freshSocial, restoreSocial } from '../../supabase/functions/_shared/social.js';
import { groupFor } from '../../supabase/functions/_shared/platform.js';
export { matchingTutoring, discoverTutoring } from './matching.js';

export const initiatives = [
  { id: 'interviews', icon: 'chat', source: 'team', stage: 'proposal', demo: false },
  { id: 'workshops', icon: 'science', source: 'team', stage: 'proposal', demo: false },
  { id: 'exchange', icon: 'globe', source: 'team', stage: 'proposal', demo: false },
  { id: 'tutoring', icon: 'bulb', source: 'team', stage: 'proposal', demo: false },
  { id: 'projects', icon: 'network', source: 'team', stage: 'proposal', demo: false },
];
export const rooms = ['general', 'learning', 'projects', 'events'];
export const tutorLanguages = ['de', 'tr', 'en'];
export const tutorFormats = ['online', 'school', 'either'];
export const tutorSubjects = ['math', 'german', 'coding'];
export const reportReasons = ['privacy', 'inappropriate', 'spam'];
export const projectStatuses = ['proposal', 'looking', 'preparing'];

// A deliberately shared fictional discovery fixture, never a real student account.
export const guestMembers = [
  { id: 'guest-mika', displayName: 'Mika', schoolId: 'anka', interests: ['science', 'technology'], demoShared: true },
];

export function createModuleState() {
  return {
    ...freshSocial(['alex', 'deniz']),
    tutoring: [
      { id: 'math-offer', seed: true, ownerId: 'alex', schoolId: 'ers', kind: 'offer', subjectKey: 'math', languages: ['de', 'tr'], format: 'online' },
      { id: 'math-request', seed: true, ownerId: 'deniz', schoolId: 'anka', kind: 'request', subjectKey: 'math', languages: ['tr', 'de'], format: 'either' },
      { id: 'german-offer', seed: true, ownerId: 'deniz', schoolId: 'anka', kind: 'offer', subjectKey: 'german', languages: ['tr', 'de'], format: 'school' },
      { id: 'coding-request', seed: true, ownerId: 'alex', schoolId: 'ers', kind: 'request', subjectKey: 'coding', languages: ['de', 'en'], format: 'online' },
    ],
    interests: { alex: [], deniz: [] },
    contactDrafts: [], visibility: { alex: false, deniz: true }, messages: [], reports: [],
  };
}

export function validTutoring(record) {
  const text = (key, min, max) => typeof record?.[key] === 'string' && record[key].trim().length >= min && record[key].length <= max;
  return ['offer', 'request'].includes(record?.kind) && text('subject', 2, 80) && text('topics', 3, 200) &&
    text('description', 20, 1000) && text('availability', 3, 200) && tutorFormats.includes(record.format) &&
    Array.isArray(record.languages) && record.languages.length > 0 && record.languages.every((value) => tutorLanguages.includes(value));
}

export function tutoringContent(record, t) {
  return record.seed ? { ...record, ...t.ext.tutorSeeds[record.id], subject: t.ext.subjects[record.subjectKey] } : record;
}

export function filterTutoring(records, filters, t, language) {
  return records.filter((record) => {
    if (record.lifecycle === 'deleted' || (!filters.ownerId && !filters.includeInactive && !isActive(record))) return false;
    const content = tutoringContent(record, t);
    const text = [content.subject, content.topics, content.description].join(' ').toLocaleLowerCase(language);
    return (!filters.kind || record.kind === filters.kind) && (!filters.ownerId || record.ownerId === filters.ownerId) &&
      (!filters.subject || normalizeSubject(record.subjectKey || record.subject) === normalizeSubject(filters.subject)) &&
      (!filters.language || record.languages.includes(filters.language)) &&
      (!filters.format || record.format === filters.format || record.format === 'either') &&
      text.includes((filters.query || '').trim().toLocaleLowerCase(language));
  });
}

export function visibleMembers(state) {
  return [...Object.values(state.profiles).filter((profile) => state.modules.visibility[profile.id]), ...(state.activities ? [] : guestMembers)];
}

function targetExists(state, type, id) {
  if (type === 'tutoring') return state.modules.tutoring.some((record) => record.id === id && isActive(record));
  if (type === 'initiative') return initiatives.some((record) => record.id === id);
  if (type === 'person') return visibleMembers(state).some((record) => record.id === id);
  return false;
}

export function moduleReducer(state, action) {
  const modules = state.modules;
  const ownerId = action.actorId || state.activeId;
  if (!Object.hasOwn(state.profiles, ownerId)) return state;
  const localId = (id) => /^local-[a-z0-9-]+$/.test(id);
  if (action.type === 'submitTutoring' && validTutoring(action.record) && localId(action.id) && !modules.tutoring.some((record) => record.id === action.id)) {
    const { kind, subject, subjectKey, topics, description, availability, languages, format } = action.record;
    const canonical = normalizeSubject(subject);
    const record = { id: action.id, ownerId, schoolId: state.profiles[ownerId].schoolId, kind, subject: subject.trim(), ...(tutorSubjects.includes(canonical) ? { subjectKey: canonical } : {}), topics: topics.trim(), description: description.trim(), availability: availability.trim(), languages: [...new Set(languages)], format };
    return { ...state, modules: { ...modules, tutoring: [record, ...modules.tutoring] } };
  }
  if (['updateTutoring', 'closeTutoring', 'removeTutoring'].includes(action.type)) {
    const previous = modules.tutoring.find((record) => record.id === action.id);
    if (!previous || previous.ownerId !== ownerId || previous.lifecycle === 'deleted' || (action.type === 'updateTutoring' && !validTutoring(action.record))) return state;
    let updated;
    if (action.type === 'updateTutoring') {
      const { kind, subject, topics, description, availability, languages, format } = action.record;
      const { subjectKey, ...base } = previous;
      const canonical = normalizeSubject(subject);
      updated = { ...base, seed: false, kind, subject: subject.trim(), ...(tutorSubjects.includes(canonical) ? { subjectKey: canonical } : {}), topics: topics.trim(), description: description.trim(), availability: availability.trim(), languages: [...new Set(languages)], format };
    } else updated = { ...previous, lifecycle: action.type === 'removeTutoring' ? 'deleted' : 'closed' };
    return { ...state, modules: { ...modules, tutoring: modules.tutoring.map((record) => record.id === action.id ? { ...updated, history: appendHistory(previous, action, ownerId) } : record) } };
  }
  if (action.type === 'toggleModuleInterest' && (modules.interests[ownerId].includes(action.targetType + ':' + action.targetId) || targetExists(state, action.targetType, action.targetId))) {
    const key = action.targetType + ':' + action.targetId;
    const values = modules.interests[ownerId];
    return { ...state, modules: { ...modules, interests: { ...modules.interests, [ownerId]: values.includes(key) ? values.filter((value) => value !== key) : [...values, key] } } };
  }
  if (action.type === 'saveContactDraft' && targetExists(state, 'tutoring', action.targetId) && typeof action.note === 'string' && action.note.trim().length >= 10 && action.note.length <= 600 && modules.tutoring.find((record) => record.id === action.targetId).ownerId !== ownerId) {
    const draft = { ownerId, targetId: action.targetId, note: action.note.trim() };
    return { ...state, modules: { ...modules, contactDrafts: [...modules.contactDrafts.filter((item) => item.ownerId !== ownerId || item.targetId !== action.targetId), draft] } };
  }
  if (action.type === 'setCommunityVisibility' && typeof action.visible === 'boolean') {
    return { ...state, modules: { ...modules, visibility: { ...modules.visibility, [ownerId]: action.visible } } };
  }
  if (action.type === 'postMessage' && (rooms.includes(action.roomId) || groupFor(state,action.roomId)?.memberIds.includes(ownerId)) && localId(action.id) && typeof action.body === 'string' && action.body.trim().length >= 3 && action.body.length <= 1200 && !modules.messages.some((message) => message.id === action.id)) {
    return { ...state, modules: { ...modules, messages: [...modules.messages, { id: action.id, ownerId, roomId: action.roomId, body: action.body.trim() }] } };
  }
  if (action.type === 'removeMessage') {
    if (!modules.messages.some((message) => message.id === action.id && message.ownerId === ownerId)) return state;
    return { ...state, modules: { ...modules, messages: modules.messages.filter((message) => message.id !== action.id || message.ownerId !== ownerId) } };
  }
  if (action.type === 'report' && reportReasons.includes(action.reason) && ((action.targetType === 'message' && modules.messages.some((message) => message.id === action.targetId)) || (action.targetType === 'person' && targetExists(state, 'person', action.targetId)))) {
    const report = { ownerId, targetType: action.targetType, targetId: action.targetId, reason: action.reason };
    return { ...state, modules: { ...modules, reports: [...modules.reports.filter((item) => !(item.ownerId === ownerId && item.targetType === report.targetType && item.targetId === report.targetId)), report] } };
  }
  return state;
}

export function restoreModuleState(saved, profiles, recovered = () => {}) {
  const initial = createModuleState();
  if (saved === undefined) return initial; // Additive support for older v1 snapshots.
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) { recovered('modules'); return initial; }
  const social = restoreSocial(saved, profiles, recovered);
  const roomIds = new Set([...rooms,...social.groups.map((group) => group.id)]);
  const known = (id) => Object.hasOwn(profiles, id);
  const local = (id) => typeof id === 'string' && /^local-[a-z0-9-]+$/.test(id);
  const list = (value, path) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { recovered(path); return []; }
    return value;
  };
  const ids = new Set();
  const tutoring = [];
  for (const source of list(saved.tutoring, 'modules.tutoring')) {
    const seed = initial.tutoring.find((record) => record.id === source?.id);
    const lifecycleValid = source?.lifecycle === undefined || ['active', 'closed', 'deleted'].includes(source.lifecycle);
    if (!source || ids.has(source.id) || !known(source.ownerId) || !['ers', 'anka'].includes(source.schoolId) || !lifecycleValid || (seed && source.ownerId !== seed.ownerId) || (!seed && !local(source.id))) { recovered('tutoring.' + (source?.id || '?')); continue; }
    const materialized = !source.seed;
    if ((materialized || !seed) && !validTutoring(source)) { recovered('tutoring.' + source.id); continue; }
    ids.add(source.id);
    tutoring.push({ ...(seed && !materialized ? seed : {
      id: source.id, ownerId: source.ownerId, schoolId: source.schoolId,
      ...(source.seed === false ? { seed: false } : {}), kind: source.kind,
      subject: source.subject.trim(), topics: source.topics.trim(), description: source.description.trim(), availability: source.availability.trim(), languages: [...new Set(source.languages)], format: source.format,
      ...(tutorSubjects.includes(normalizeSubject(source.subject)) ? { subjectKey: normalizeSubject(source.subject) } : {}),
    }), ...(source.lifecycle ? { lifecycle: source.lifecycle } : {}), ...recordHistory(source, known) });
  }
  for (const seed of initial.tutoring) if (!ids.has(seed.id)) { tutoring.push(seed); if (saved.tutoring !== undefined) recovered('tutoring.' + seed.id); }
  initial.tutoring = tutoring;
  const tutorIds = new Set(tutoring.map((record) => record.id));
  const people = new Set([...Object.keys(profiles), ...guestMembers.map((member) => member.id)]);
  const interestTarget = (key) => {
    if (typeof key !== 'string') return false;
    const [type, id, extra] = key.split(':');
    return !extra && ((type === 'tutoring' && tutorIds.has(id)) || (type === 'initiative' && initiatives.some((item) => item.id === id)) || (type === 'person' && people.has(id)));
  };
  for (const id of Object.keys(profiles)) {
    if (saved.visibility?.[id] !== undefined && typeof saved.visibility[id] !== 'boolean') recovered('visibility.' + id);
    initial.visibility[id] = typeof saved.visibility?.[id] === 'boolean' ? saved.visibility[id] : initial.visibility[id];
    initial.interests[id] = [...new Set(list(saved.interests?.[id], 'interests.' + id).filter((key) => { if (interestTarget(key)) return true; recovered('interests.' + id); return false; }))];
  }
  const filterRecords = (field, valid) => list(saved[field], 'modules.' + field).filter((item) => { if (valid(item)) return true; recovered('modules.' + field); return false; });
  initial.contactDrafts = filterRecords('contactDrafts', (item) => item && known(item.ownerId) && tutorIds.has(item.targetId) && typeof item.note === 'string' && item.note.trim().length >= 10 && item.note.length <= 600);
  const messageIds = new Set();
  initial.messages = filterRecords('messages', (item) => {
    if (!item || !local(item.id) || messageIds.has(item.id) || !known(item.ownerId) || !roomIds.has(item.roomId) || typeof item.body !== 'string' || item.body.trim().length < 3 || item.body.length > 1200) return false;
    messageIds.add(item.id); return true;
  });
  initial.reports = filterRecords('reports', (item) => item && known(item.ownerId) && reportReasons.includes(item.reason) && ((item.targetType === 'message' && messageIds.has(item.targetId)) || (item.targetType === 'person' && people.has(item.targetId))));
  return { ...initial, ...social };
}
