import { daysUntil, startOfDay } from './dates.js';

/**
 * Personalisierungs- und Filterlogik als reine Funktionen (ohne React).
 * Vorteil: leicht verständlich, testbar (tests/selectors.test.js) und später
 * auch mit echten Daten aus einer Datenbank nutzbar.
 *
 * "user" ist das aktuelle Profil inkl. lokalem Zustand:
 * { id, schoolId, interests, registrations, supportedIdeas, projectInterest, invitations, dismissedUpdates }
 */

const UPCOMING_STATUSES = ['planned', 'confirmed'];

export function isUpcoming(event, now = new Date()) {
  return UPCOMING_STATUSES.includes(event.status) && new Date(event.start) >= startOfDay(now);
}

export function isPast(event, now = new Date()) {
  return event.status === 'completed' || (event.status !== 'cancelled' && new Date(event.start) < startOfDay(now));
}

export const byStart = (a, b) => new Date(a.start) - new Date(b.start);

/** 'organizer' | 'registered' | 'interested' | null */
export function getEventRole(user, event) {
  if (event.organizerIds?.includes(user.id)) return 'organizer';
  return user.registrations?.[event.id] ?? null;
}

export function getMyEvents(user, events, now = new Date()) {
  const mine = events.filter((event) => getEventRole(user, event));
  return {
    upcoming: mine.filter((event) => isUpcoming(event, now)).sort(byStart),
    past: mine.filter((event) => isPast(event, now)).sort((a, b) => byStart(b, a)),
  };
}

/**
 * Empfehlungen: nur bevorstehende Events, bei denen der Nutzer noch keine Rolle hat
 * und die mindestens ein Interesse treffen. Sortierung nach nachvollziehbarer Punktzahl:
 * +3 je passendem Interesse, +2 wenn die eigene Schule beteiligt ist, +1 wenn schulübergreifend.
 */
export function getEventRecommendations(user, events, now = new Date()) {
  return events
    .filter((event) => isUpcoming(event, now) && !getEventRole(user, event))
    .map((event) => {
      const matchedTopics = event.topics.filter((topic) => user.interests.includes(topic));
      const schoolMatch = event.schoolIds.includes(user.schoolId);
      const score = matchedTopics.length * 3 + (schoolMatch ? 2 : 0) + (event.schoolIds.length > 1 ? 1 : 0);
      return { event, matchedTopics, schoolMatch, score };
    })
    .filter((rec) => rec.matchedTopics.length > 0)
    .sort((a, b) => b.score - a.score || byStart(a.event, b.event));
}

/** 'member' | 'interested' | null */
export function getProjectRole(user, project) {
  if (project.memberIds.includes(user.id)) return 'member';
  if (user.projectInterest?.includes(project.id)) return 'interested';
  return null;
}

export function getMyProjects(user, projects) {
  return projects.filter((project) => getProjectRole(user, project));
}

export function getProjectRecommendations(user, projects) {
  return projects
    .filter((project) => !getProjectRole(user, project))
    .map((project) => ({
      project,
      matchedTopics: project.topics.filter((topic) => user.interests.includes(topic)),
      schoolMatch: project.schoolIds.includes(user.schoolId),
    }))
    .filter((rec) => rec.matchedTopics.length > 0)
    .sort((a, b) => b.matchedTopics.length - a.matchedTopics.length || Number(b.schoolMatch) - Number(a.schoolMatch));
}

export function getMyIdeas(user, ideas) {
  return {
    authored: ideas.filter((idea) => idea.authorId === user.id),
    supported: ideas.filter((idea) => idea.authorId !== user.id && user.supportedIdeas.includes(idea.id)),
  };
}

/** Zählt Unterstützungen aus allen (Demo-)Profilen – keine erfundenen Zahlen. */
export function getSupportCounts(profileStates) {
  const counts = {};
  for (const state of Object.values(profileStates)) {
    for (const ideaId of state.supportedIdeas ?? []) counts[ideaId] = (counts[ideaId] ?? 0) + 1;
  }
  return counts;
}

/** Kleinschreibung + Akzente entfernen, damit "munchen" auch "München" findet. */
export function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

/** Durchsucht alle Sprachfassungen eines Inhalts. */
export function matchesQuery(query, ...values) {
  const q = normalizeText(query.trim());
  if (!q) return true;
  const haystack = values
    .flatMap((value) => (value && typeof value === 'object' ? Object.values(value) : [value ?? '']))
    .join(' ');
  return normalizeText(haystack).includes(q);
}

/**
 * timeframe: 'upcoming' | 'week' | 'month' | 'past'
 */
export function filterEvents(
  events,
  { query = '', schoolId = 'all', topic = 'all', format = 'all', timeframe = 'upcoming' } = {},
  now = new Date(),
) {
  return events
    .filter((event) => {
      if (timeframe === 'past') {
        if (!isPast(event, now)) return false;
      } else {
        if (!isUpcoming(event, now)) return false;
        const days = daysUntil(event.start, now);
        if (timeframe === 'week' && days > 7) return false;
        if (timeframe === 'month' && days > 31) return false;
      }
      if (schoolId !== 'all' && !event.schoolIds.includes(schoolId)) return false;
      if (topic !== 'all' && !event.topics.includes(topic)) return false;
      if (format !== 'all' && event.format !== format) return false;
      return matchesQuery(query, event.title, event.summary, event.location);
    })
    .sort(timeframe === 'past' ? (a, b) => byStart(b, a) : byStart);
}

/** sort: 'popular' | 'new' */
export function filterIdeas(ideas, { query = '', topic = 'all', sort = 'popular' } = {}, supportCounts = {}) {
  const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  return ideas
    .filter((idea) => (topic === 'all' || idea.topics.includes(topic)) && matchesQuery(query, idea.title, idea.summary))
    .sort((a, b) =>
      sort === 'new' ? byNewest(a, b) : (supportCounts[b.id] ?? 0) - (supportCounts[a.id] ?? 0) || byNewest(a, b),
    );
}

/**
 * Persönliche Hinweise für die Startseite. Alle Einträge werden direkt aus den
 * Daten abgeleitet – Einladungen erscheinen nur, wenn das Profil sie enthält.
 */
export function getUpdates(user, { events, ideas }, now = new Date()) {
  const updates = [];

  for (const invitation of user.invitations ?? []) {
    const event = events.find((e) => e.id === invitation.eventId);
    if (!event || !isUpcoming(event, now) || getEventRole(user, event)) continue;
    updates.push({ id: invitation.id, type: 'invitation', event, fromSchoolId: invitation.fromSchoolId });
  }

  for (const event of getMyEvents(user, events, now).upcoming) {
    const days = daysUntil(event.start, now);
    if (days <= 7) updates.push({ id: `reminder-${event.id}`, type: 'reminder', event, days });
  }

  for (const idea of ideas) {
    if (idea.authorId === user.id && idea.status === 'review') {
      updates.push({ id: `idea-review-${idea.id}`, type: 'ideaReview', idea });
    }
  }

  return updates.filter((update) => !(user.dismissedUpdates ?? []).includes(update.id));
}
