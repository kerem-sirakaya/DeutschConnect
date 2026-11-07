import { activities } from './activities.js';
import { initiatives } from './modules.js';
import { isActive } from './matching.js';

// Derived read model; no stored totals, inferred attendance or fake account data.
// Pass time explicitly in tests. This remains independent of React and storage.
export function selectPersonalArea(state, profileId, now = new Date()) {
  const participation = state.participation[profileId] || {};
  const source = state.activities || activities;
  const events = source.filter((event) => participation[event.id]);
  const upcoming = events.filter((event) => new Date(event.startsAt).getTime() >= now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pastDemo = events.filter((event) => new Date(event.startsAt).getTime() < now.getTime()).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const ideas = state.ideas.filter((idea) => idea.lifecycle !== 'deleted');
  const owned = ideas.filter((idea) => idea.ownerId === profileId);
  const collaborating = ideas.filter((idea) => idea.ownerId !== profileId && idea.participantIds.includes(profileId));
  const requested = ideas.filter((idea) => idea.requestedIds?.includes(profileId));
  const interested = ideas.filter((idea) => idea.interestedIds?.includes(profileId));
  const tutoring = state.modules.tutoring.filter((record) => record.ownerId === profileId && record.lifecycle !== 'deleted');
  const savedKeys = new Set(state.modules.interests[profileId] || []);
  const savedTutoring = state.modules.tutoring.filter((record) => record.lifecycle !== 'deleted' && savedKeys.has('tutoring:' + record.id));
  const savedInitiatives = initiatives.filter((item) => savedKeys.has('initiative:' + item.id));
  const savedEvents = events.filter((event) => participation[event.id] === 'interested');
  const posts = state.modules.messages.filter((message) => message.ownerId === profileId);
  return {
    confirmedAttendance: source.filter((event) => event.attendance?.[profileId] && new Date(event.startsAt) < now),
    events: { upcoming, pastDemo, interested: events.filter((event) => participation[event.id] === 'interested'), registered: events.filter((event) => participation[event.id] === 'joined'), organized: events.filter((event) => participation[event.id] === 'organized') },
    projects: { owned, collaborating, requested, interested },
    tutoring: { offers: tutoring.filter((record) => record.kind === 'offer'), requests: tutoring.filter((record) => record.kind === 'request') },
    saved: { events: savedEvents, projects: interested, tutoring: savedTutoring, initiatives: savedInitiatives },
    community: { posts, projectMemberships: collaborating.filter(isActive) },
    counts: {
      eventInterests: events.filter((event) => participation[event.id] === 'interested').length,
      eventRegistrations: events.filter((event) => participation[event.id] === 'joined').length,
      ownedProjects: owned.length,
      projectMemberships: collaborating.filter(isActive).length,
      projectRequests: requested.filter(isActive).length,
      tutoringOffers: tutoring.filter((record) => record.kind === 'offer' && isActive(record)).length,
      tutoringRequests: tutoring.filter((record) => record.kind === 'request' && isActive(record)).length,
      saved: savedEvents.length + interested.length + savedTutoring.length + savedInitiatives.length,
    },
  };
}
