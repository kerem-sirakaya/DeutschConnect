import { freshSocial, reduceSocial, blocked } from './social.js';
import { validSharing, sharingFor, publicProfile } from './profiles.js';

const categories = ['open','technology','science','language','culture'];
const languages = ['de','tr','en'];
const safeText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const localId = (id) => typeof id === 'string' && /^local-[a-z0-9-]{1,100}$/.test(id);
const privateContact = (text) => /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/)/i.test(text) || (String(text).match(/\+?\d[\d\s()-]{7,}\d/g) || []).some((value) => value.replace(/\D/g,'').length >= 10);
const fail = (code = 'invalid-input') => { throw new Error(code); };
export function emptyPlatform() {
  return { version: 1, profiles: {}, participation: {}, ideas: [], activities: [], schools: [{ id:'ers', initials:'ERS', name:'Ernst-Reuter-Schule', city:'Ankara' },{ id:'anka', initials:'AB', name:'Anka Bilim', city:'Ankara' }], modules: { ...freshSocial(), tutoring: [], interests: {}, contactDrafts: [], visibility: {}, messages: [], reports: [] } };
}
export function addAccount(state, user, now = new Date().toISOString()) {
  if (state.profiles[user.id]) return state;
  const next = structuredClone(state), meta = user.user_metadata || {};
  next.profiles[user.id] = { id: user.id, displayName: safeText(meta.displayName,2,40) && !privateContact(meta.displayName) ? meta.displayName.trim() : 'Student', schoolId: '', interests: [], customInterests: [], language: languages.includes(meta.language) ? meta.language : 'de', joinedAt: now };
  next.participation[user.id] = {}; next.modules.interests[user.id] = []; next.modules.visibility[user.id] = false; next.modules.blocks[user.id] = []; next.modules.awardSharing[user.id] = false;
  if (!next.modules.groups.length) next.modules.groups = ['general','learning','projects','events'].map((id) => ({ id, kind:'topic', memberIds:[], closed:false }));
  return next;
}
export function groupFor(state, id) {
  const group = state.modules.groups.find((g) => g.id === id);
  if (!group) return null;
  if (group.kind === 'project') { const idea = state.ideas.find((i) => i.id === group.contextId); return idea ? { ...group, memberIds:[idea.ownerId,...idea.participantIds], closed: ['deleted','withdrawn'].includes(idea.lifecycle) } : null; }
  if (group.kind === 'event') { const event = state.activities.find((e) => e.id === group.contextId); return event ? { ...group, memberIds:[event.ownerId,...Object.keys(state.participation).filter((id) => state.participation[id][event.id] === 'joined')], closed: event.cancelled } : null; }
  return group;
}
export function applyPlatformAction(current, a, actor, options = {}) {
  if (!current.profiles[actor]) fail('account-required');
  if (!a || typeof a.type !== 'string') fail();
  const state = structuredClone(current), m = state.modules, profile = state.profiles[actor];
  const now = options.now || new Date().toISOString(), moderator = options.moderator === true;
  const own = (record) => { if (!record || record.ownerId !== actor) fail('not-owner'); if (record.lifecycle === 'deleted') fail('not-found'); if (a.expectedRecord) { let expected; try { expected = JSON.parse(a.expectedRecord); } catch { fail(); } if ((expected.revision || 0) !== (record.revision || 0)) fail('conflict'); } return record; };
  const bump = (record) => { record.revision = (record.revision || 0) + 1; record.updatedAt = now; };
  const school = (id) => state.schools.some((s) => s.id === id);
  const topics = (values) => Array.isArray(values) && values.length <= 8 && values.every((v) => safeText(v,1,40));
  const ideaInput = (v) => safeText(v?.title,5,90) && safeText(v.description,20,1000) && categories.includes(v.category) && (!v.topics || topics(v.topics)) && (!v.goals || safeText(v.goals,0,600)) && (!v.collaborators || safeText(v.collaborators,0,400)) && (!v.desiredSchoolIds || (Array.isArray(v.desiredSchoolIds) && v.desiredSchoolIds.every(school))) && (!v.projectStatus || ['proposal','looking','preparing'].includes(v.projectStatus));
  const tutorInput = (v) => ['offer','request'].includes(v?.kind) && safeText(v.subject,2,80) && safeText(v.topics,3,200) && safeText(v.description,20,1000) && safeText(v.availability,3,200) && ['online','school','either'].includes(v.format) && Array.isArray(v.languages) && v.languages.length > 0 && v.languages.every((l) => languages.includes(l));
  if (a.type === 'preferences') {
    const fields = ['displayName','schoolId','interests','customInterests','language','profileSharing'];
    if (!a.patch || Object.keys(a.patch).some((key) => !fields.includes(key))) fail();
    if (a.expectedProfile) { let expected; try { expected = JSON.parse(a.expectedProfile); } catch { fail(); } for (const key of Object.keys(a.patch)) if (JSON.stringify(expected[key] || []) !== JSON.stringify(profile[key] || [])) fail('conflict'); }
    const updated = { ...profile, ...a.patch };
    if (updated.profileSharing !== undefined && !validSharing(updated.profileSharing)) fail();
    const validSchool = school(updated.schoolId) || (updated.schoolId === '' && profile.schoolId === '' && !Object.hasOwn(a.patch,'schoolId'));
    if (privateContact(updated.displayName) || privateContact((Array.isArray(updated.customInterests) ? updated.customInterests : []).join(' '))) fail('private-contact');
    if (!safeText(updated.displayName,2,40) || !validSchool || !languages.includes(updated.language) || !Array.isArray(updated.interests) || !updated.interests.every((v) => categories.includes(v) && v !== 'open') || !topics(updated.customInterests || [])) fail();
    state.profiles[actor] = { ...updated, displayName: updated.displayName.trim() }; return state;
  }
  if (a.type === 'participation') {
    const event = state.activities.find((e) => e.id === a.eventId && !e.cancelled);
    if (!event || ![null,'interested','joined'].includes(a.status) || (a.status === 'joined' && event.approval !== 'confirmed')) fail('event-not-open');
    if (a.status) state.participation[actor][a.eventId] = a.status; else delete state.participation[actor][a.eventId]; return state;
  }
  if (a.type === 'createEvent') {
    const v = a.event;
    if (privateContact([v?.title,v?.description].join(' '))) fail('private-contact');
    if (!localId(a.id) || state.activities.some((e) => e.id === a.id) || !safeText(v?.title,5,90) || !safeText(v.description,20,1500) || !school(v.hostSchoolId) || !categories.includes(v.category) || !Number.isFinite(Date.parse(v.startsAt)) || Date.parse(v.startsAt) < Date.parse(now)) fail();
    state.activities.push({ id:a.id, ownerId:actor, title:v.title.trim(), description:v.description.trim(), detail:v.description.trim(), category:v.category, hostSchoolId:v.hostSchoolId, schoolIds:state.schools.map((s) => s.id), startsAt:v.startsAt, icon:'calendar', approval:'proposal', revision:0, attendance:{} }); return state;
  }
  if (a.type === 'approveEvent' || a.type === 'confirmAttendance') {
    if (!moderator) fail('moderator-required');
    const event = state.activities.find((e) => e.id === a.eventId); if (!event) fail('not-found');
    if (a.type === 'approveEvent') event.approval = 'confirmed';
    else { if (event.approval !== 'confirmed' || Date.parse(event.startsAt) > Date.parse(now) || state.participation[a.profileId]?.[event.id] !== 'joined') fail('no-evidence'); event.attendance[a.profileId] = { confirmedBy:actor, confirmedAt:now }; }
    bump(event); return state;
  }
  if (a.type === 'submitIdea') {
    if (privateContact([a.idea?.title,a.idea?.description,a.idea?.goals,a.idea?.collaborators,...(Array.isArray(a.idea?.topics) ? a.idea.topics : [])].join(' '))) fail('private-contact');
    if (!localId(a.id) || state.ideas.some((i) => i.id === a.id) || !ideaInput(a.idea) || !school(profile.schoolId)) fail();
    const v = a.idea;
    state.ideas.unshift({ id:a.id, ownerId:actor, schoolId:profile.schoolId, participantIds:[], requestedIds:[], interestedIds:[], category:v.category, title:v.title.trim(), description:v.description.trim(), goals:v.goals || '', collaborators:v.collaborators || '', topics:v.topics || [], desiredSchoolIds:v.desiredSchoolIds || [], projectStatus:v.projectStatus || 'proposal', ...(v.initiativeId === 'interviews' ? { initiativeId:'interviews' } : {}), revision:0 }); return state;
  }
  if (a.type === 'confirmProjectCompletion') {
    if (!moderator) fail('moderator-required');
    const idea = state.ideas.find((item) => item.id === a.id && !['deleted','withdrawn'].includes(item.lifecycle));
    if (!idea || idea.completion) fail('no-evidence');
    // Freeze accepted membership at confirmation; interest/request never qualifies.
    idea.completion = { confirmedBy:actor, confirmedAt:now, memberIds:[...new Set([idea.ownerId,...idea.participantIds])] };
    idea.requestedIds = [];
    bump(idea); return state;
  }
  if (['updateIdea','withdrawIdea','removeIdea'].includes(a.type)) {
    if (a.type === 'updateIdea' && privateContact([a.idea?.title,a.idea?.description,a.idea?.goals,a.idea?.collaborators,...(Array.isArray(a.idea?.topics) ? a.idea.topics : [])].join(' '))) fail('private-contact');
    const record = own(state.ideas.find((i) => i.id === a.id));
    if (a.type === 'updateIdea') { if (!ideaInput(a.idea)) fail(); for (const key of ['title','description','category','goals','collaborators','topics','desiredSchoolIds','projectStatus','initiativeId']) { if (a.idea[key] !== undefined) record[key] = a.idea[key]; else if (key === 'initiativeId') delete record[key]; } }
    else record.lifecycle = a.type === 'withdrawIdea' ? 'withdrawn' : 'deleted'; bump(record); return state;
  }
  if (['setIdeaInterest','requestIdea','cancelIdeaRequest','leaveIdea','reviewIdeaRequest'].includes(a.type)) {
    const record = state.ideas.find((i) => i.id === a.id && i.lifecycle !== 'deleted'); if (!record) fail('not-found');
    if (a.type === 'reviewIdeaRequest') own(record);
    if (['requestIdea','reviewIdeaRequest'].includes(a.type) && blocked(state,actor,a.profileId || record.ownerId)) fail('blocked');
    if (a.type === 'setIdeaInterest') { if (actor === record.ownerId || typeof a.interested !== 'boolean' || (a.interested && record.lifecycle === 'withdrawn')) fail(); record.interestedIds = a.interested ? [...new Set([...record.interestedIds,actor])] : record.interestedIds.filter((id) => id !== actor); }
    if (a.type === 'requestIdea') { if (actor === record.ownerId || record.lifecycle === 'withdrawn' || record.completion || record.participantIds.includes(actor)) fail(); record.requestedIds = [...new Set([...record.requestedIds,actor])]; }
    if (a.type === 'cancelIdeaRequest') record.requestedIds = record.requestedIds.filter((id) => id !== actor);
    if (a.type === 'leaveIdea') record.participantIds = record.participantIds.filter((id) => id !== actor);
    if (a.type === 'reviewIdeaRequest') { if (record.lifecycle === 'withdrawn' || record.completion || !record.requestedIds.includes(a.profileId) || !['accept','decline'].includes(a.decision)) fail(); record.requestedIds = record.requestedIds.filter((id) => id !== a.profileId); if (a.decision === 'accept') record.participantIds = [...new Set([...record.participantIds,a.profileId])]; }
    bump(record); return state;
  }
  if (a.type === 'submitTutoring' || a.type === 'updateTutoring') {
    if (privateContact([a.record?.subject,a.record?.topics,a.record?.description,a.record?.availability].join(' '))) fail('private-contact');
    if (!tutorInput(a.record) || !school(profile.schoolId)) fail(); const v = a.record;
    const record = a.type === 'updateTutoring' ? own(m.tutoring.find((r) => r.id === a.id)) : { id:a.id, ownerId:actor, schoolId:profile.schoolId, revision:0 };
    if (a.type === 'submitTutoring' && (!localId(a.id) || m.tutoring.some((r) => r.id === a.id))) fail();
    for (const key of ['kind','subject','topics','description','availability','languages','format']) record[key] = v[key];
    bump(record); if (a.type === 'submitTutoring') m.tutoring.unshift(record); return state;
  }
  if (['closeTutoring','removeTutoring'].includes(a.type)) { const record = own(m.tutoring.find((r) => r.id === a.id)); record.lifecycle = a.type === 'closeTutoring' ? 'closed' : 'deleted'; bump(record); return state; }
  if (a.type === 'toggleModuleInterest') {
    const valid = a.targetType === 'initiative' ? ['interviews','workshops','exchange','tutoring','projects'].includes(a.targetId) : a.targetType === 'tutoring' ? m.tutoring.some((r) => r.id === a.targetId && r.lifecycle !== 'deleted') : a.targetType === 'person' && m.visibility[a.targetId] && !blocked(state,actor,a.targetId);
    if (!valid) fail('not-found'); const key = a.targetType + ':' + a.targetId, ids = m.interests[actor]; m.interests[actor] = ids.includes(key) ? ids.filter((id) => id !== key) : [...ids,key]; return state;
  }
  if (a.type === 'saveContactDraft') { const record = m.tutoring.find((r) => r.id === a.targetId && !r.lifecycle); if (!record || blocked(state,actor,record.ownerId) || !safeText(a.note,10,600)) fail(); m.contactDrafts = [...m.contactDrafts.filter((d) => d.ownerId !== actor || d.targetId !== a.targetId), { ownerId:actor, targetId:a.targetId, note:a.note.trim() }]; return state; }
  if (a.type === 'setCommunityVisibility' && typeof a.visible === 'boolean') { m.visibility[actor] = a.visible; return state; }
  if (a.type === 'postMessage') {
    if (!options.communityEnabled) fail('moderation-required');
    const group = groupFor(state,a.roomId); if (!group || group.closed || !group.memberIds.includes(actor)) fail('group-required');
    if (!localId(a.id) || !safeText(a.body,3,1200)) fail();
    const existing = m.messages.find((v) => v.id === a.id);
    if (existing) {
      if (existing.ownerId === actor && existing.roomId === a.roomId && existing.body === a.body.trim()) return current;
      fail();
    }
    if (privateContact(a.body)) fail('private-contact');
    const recent = m.messages.filter((v) => v.ownerId === actor && Date.parse(v.createdAt) > Date.parse(now) - 60000); if (recent.length >= 10) fail('rate-limit');
    m.messages.push({ id:a.id, ownerId:actor, roomId:a.roomId, body:a.body.trim(), createdAt:now }); return state;
  }
  if (a.type === 'removeMessage' || a.type === 'moderateMessage') { const message = m.messages.find((v) => v.id === a.id); if (!message || (message.ownerId !== actor && !moderator) || (a.type === 'moderateMessage' && !moderator)) fail('not-owner'); m.messages = m.messages.filter((v) => v.id !== a.id); return state; }
  if (a.type === 'report') { if (!['privacy','inappropriate','spam'].includes(a.reason) || !['person','message'].includes(a.targetType)) fail(); const target = a.targetType === 'person' ? state.profiles[a.targetId] : m.messages.find((v) => v.id === a.targetId && groupFor(state,v.roomId)?.memberIds.includes(actor)); if (!target) fail('not-found'); m.reports = [...m.reports.filter((r) => !(r.ownerId === actor && r.targetId === a.targetId && r.targetType === a.targetType)), { ownerId:actor, targetId:a.targetId, targetType:a.targetType, reason:a.reason, createdAt:now, status:'pending' }]; return state; }
  if (a.type === 'resolveReport') { if (!moderator) fail('moderator-required'); const report = m.reports.find((r) => r.targetId === a.targetId && r.ownerId === a.ownerId); if (!report) fail('not-found'); report.status = 'reviewed'; report.reviewedAt = now; return state; }
  if (a.type === 'awardRecognition') {
    if (!moderator) fail('moderator-required'); const event = state.activities.find((e) => e.id === a.eventId); if (!event?.attendance?.[a.profileId] || !state.profiles[a.profileId]) fail('no-evidence');
    if (new Set(Object.keys(event.attendance).map((id) => state.profiles[id]?.schoolId).filter(Boolean)).size < 2) fail('no-evidence');
    if (m.awards.some((v) => v.ownerId === a.profileId && v.eventId === event.id)) return current;
    m.awards.push({ id:'award-' + event.id + '-' + a.profileId, ownerId:a.profileId, eventId:event.id, kind:'collaboration', awardedBy:actor, awardedAt:now }); return state;
  }
  const social = reduceSocial(state,a,actor,{ now,moderator });
  if (social === state) fail('not-allowed');
  return social;
}

export function projectPlatform(state, actor, moderator = false, communityEnabled = false) {
  const m = state.modules, next = structuredClone(state);
  next.activeId = actor;
  next.modules.chessNotificationCapabilities = {inApp:true,email:false};
  next.modules.chessRead = {[actor]:m.chessRead?.[actor] || []};
  next.modules.profileCapabilities = true;
  const publicSource = { ...state, ideas:state.ideas.filter((idea) => !blocked(state,actor,idea.ownerId)) };
  next.modules.publicProfiles = Object.fromEntries(Object.keys(state.profiles).filter((id) => !blocked(state,actor,id)).map((id) => [id,publicProfile(publicSource,id)]).filter(([,value]) => value));
  const referenced = new Set([actor,...Object.keys(m.visibility).filter((id)=>m.visibility[id])]);
  const contextNames = new Set();
  for (const idea of state.ideas.filter((i)=>i.lifecycle!=='deleted')) {
    referenced.add(idea.ownerId);
    const related=idea.ownerId===actor || idea.participantIds.includes(actor);
    for(const id of idea.participantIds)if(related || (m.visibility[id] && sharingFor(state.profiles[id]).projects))referenced.add(id);
    if(idea.ownerId===actor)for(const id of idea.requestedIds)referenced.add(id);
  }
  for (const record of m.tutoring.filter((r)=>r.lifecycle!=='deleted')) referenced.add(record.ownerId);
  for (const event of state.activities) if (event.ownerId) referenced.add(event.ownerId);
  for (const message of m.messages) if(moderator || groupFor(state,message.roomId)?.memberIds.includes(actor)) referenced.add(message.ownerId);
  for (const item of [...m.games,...m.challenges]) if([item.whiteId,item.blackId,item.fromId,item.toId].includes(actor)) for(const id of [item.whiteId,item.blackId,item.fromId,item.toId].filter(Boolean)) referenced.add(id);
  for(const idea of state.ideas) if(idea.ownerId===actor || idea.participantIds.includes(actor)) for(const id of [idea.ownerId,...idea.participantIds,...(idea.ownerId===actor ? idea.requestedIds : [])]) contextNames.add(id);
  for(const group of m.groups.map((g)=>groupFor(state,g.id)).filter(Boolean)) if(group.memberIds.includes(actor)) for(const id of group.memberIds) {contextNames.add(id);referenced.add(id);}
  for(const item of [...m.games,...m.challenges]) if([item.whiteId,item.blackId,item.fromId,item.toId].includes(actor)) for(const id of [item.whiteId,item.blackId,item.fromId,item.toId].filter(Boolean))contextNames.add(id);
  next.profiles = Object.fromEntries(Object.entries(state.profiles).filter(([id]) => moderator || (referenced.has(id) && !blocked(state,actor,id))).map(([id,p]) => [id, id === actor || moderator ? { ...p, isModerator:id === actor && moderator } : m.visibility[id] ? { id, displayName:p.displayName, schoolId:sharingFor(p).school ? p.schoolId : '', interests:sharingFor(p).interests ? p.interests : [], customInterests:sharingFor(p).interests ? p.customInterests : [], language:'de' } : { id, displayName:contextNames.has(id)?p.displayName:'—', schoolId:'', interests:[], language:'de' }]));
  next.modules.visibility = Object.fromEntries(Object.keys(next.profiles).map((id)=>[id,m.visibility[id]===true]));
  next.participation = moderator ? next.participation : { [actor]:state.participation[actor] || {} };
  next.modules.moderationAvailable = communityEnabled;
  next.ideas = next.ideas.filter((i) => i.lifecycle !== 'deleted' && (i.ownerId === actor || !blocked(state,actor,i.ownerId))).map((i) => {
    const canSeeMembers = moderator || i.ownerId === actor || i.participantIds.includes(actor);
    const visibleId = (id) => !blocked(state,actor,id) && (canSeeMembers || id === actor || (m.visibility[id] && sharingFor(state.profiles[id]).projects));
    return { ...i, schoolId:i.ownerId === actor || moderator || (m.visibility[i.ownerId] && sharingFor(state.profiles[i.ownerId]).school) ? i.schoolId : '', participantIds:i.participantIds.filter(visibleId), ...(i.completion ? {completion:{...i.completion,memberIds:i.completion.memberIds.filter(visibleId)}} : {}), interestedIds:i.interestedIds.filter((id) => id === actor), requestedIds:i.requestedIds.filter((id) => next.profiles[id] && (i.ownerId === actor || id === actor)) };
  });
  next.modules.interests = { [actor]:m.interests[actor] || [] }; next.modules.blocks = { [actor]:m.blocks[actor] || [] };
  next.modules.contactDrafts = m.contactDrafts.filter((d) => d.ownerId === actor);
  next.modules.tutoring = m.tutoring.filter((r) => r.lifecycle !== 'deleted' && !blocked(state,actor,r.ownerId)).map((r) => ({...r,schoolId:r.ownerId === actor || moderator || (m.visibility[r.ownerId] && sharingFor(state.profiles[r.ownerId]).school) ? r.schoolId : ''}));
  next.modules.groups = m.groups.map((g) => groupFor(state,g.id)).filter(Boolean).map((g) => g.memberIds.includes(actor) || moderator ? g : { id:g.id, kind:g.kind, title:g.title, closed:g.closed, memberIds:[] });
  next.modules.messages = m.messages.filter((v) => moderator || (groupFor(state,v.roomId)?.memberIds.includes(actor) && !blocked(state,actor,v.ownerId)));
  next.modules.reports = m.reports.filter((r) => moderator || r.ownerId === actor);
  next.modules.challenges = m.challenges.filter((c) => [c.fromId,c.toId].includes(actor) && !blocked(state,c.fromId,c.toId));
  next.modules.games = m.games.filter((g) => [g.whiteId,g.blackId].includes(actor) && !blocked(state,g.whiteId,g.blackId));
  next.modules.awards = m.awards.filter((v) => v.ownerId === actor || (m.visibility[v.ownerId] && m.awardSharing[v.ownerId] && !blocked(state,actor,v.ownerId))).map((v) => v.ownerId === actor || moderator ? v : { id:v.id, ownerId:v.ownerId, kind:v.kind, awardedAt:v.awardedAt });
  next.modules.awardSharing = { [actor]:m.awardSharing[actor] || false };
  for (const event of next.activities) event.attendance = moderator ? event.attendance : event.attendance?.[actor] ? { [actor]:event.attendance[actor] } : {};
  return next;
}
