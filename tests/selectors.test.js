// Tests für die Personalisierungslogik. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { events } from './fixtures/events.js';
import { seedIdeas } from './fixtures/ideas.js';
import { projects } from './fixtures/projects.js';
import { demoProfiles } from './fixtures/profiles.js';
import {
  filterEvents,
  filterIdeas,
  getEventRecommendations,
  getEventRole,
  getMyEvents,
  getMyProjects,
  getProjectRecommendations,
  getSupportCounts,
  getUpdates,
  isListed,
  isPast,
  isUpcoming,
} from '../src/lib/selectors.js';

// Baut ein "user"-Objekt wie in AppStateContext (Profil + lokaler Zustand)
function userFor(id, overrides = {}) {
  const profile = demoProfiles.find((p) => p.id === id);
  return {
    ...profile,
    interests: [...profile.interests],
    registrations: { ...profile.registrations },
    supportedIdeas: [...profile.supportedIdeas],
    projectInterest: [],
    dismissedUpdates: [],
    ...overrides,
  };
}

const ids = (list) => list.map((item) => (item.event ?? item.project ?? item).id);

test('verschiedene Profile sehen unterschiedliche eigene Events', () => {
  const alex = getMyEvents(userFor('alex'), events);
  const elif = getMyEvents(userFor('elif'), events);
  assert.deepEqual(ids(alex.upcoming).sort(), ['e1', 'e3']);
  assert.deepEqual(ids(alex.past), ['e8']);
  assert.deepEqual(ids(elif.upcoming).sort(), ['e2', 'e4', 'e7']);
});

test('Organisator-Rolle hat Vorrang vor Anmeldung', () => {
  const alex = userFor('alex', { registrations: { e3: 'interested' } });
  assert.equal(getEventRole(alex, events.find((e) => e.id === 'e3')), 'organizer');
});

test('Empfehlungen unterscheiden sich je Profil und schließen eigene Events aus', () => {
  const alexRecs = ids(getEventRecommendations(userFor('alex'), events));
  const denizRecs = ids(getEventRecommendations(userFor('deniz'), events));
  assert.ok(alexRecs.length > 0);
  assert.notDeepEqual(alexRecs, denizRecs);
  assert.ok(!alexRecs.includes('e1'), 'angemeldetes Event darf nicht empfohlen werden');
  assert.ok(!alexRecs.includes('e8'), 'vergangenes Event darf nicht empfohlen werden');
});

test('Interessen verändern die Empfehlungen tatsächlich', () => {
  const before = ids(getEventRecommendations(userFor('deniz'), events));
  const after = ids(getEventRecommendations(userFor('deniz', { interests: ['debate'] }), events));
  assert.ok(!before.includes('e3'));
  assert.deepEqual(after, ['e3']);
  assert.deepEqual(getEventRecommendations(userFor('deniz', { interests: [] }), events), []);
});

test('Empfehlungen enthalten nachvollziehbare Gründe', () => {
  const rec = getEventRecommendations(userFor('alex'), events).find((r) => r.event.id === 'e5');
  assert.deepEqual(rec.matchedTopics.sort(), ['career', 'languages']);
  assert.equal(rec.schoolMatch, true);
});

test('Projekt-Empfehlungen und eigene Projekte', () => {
  assert.deepEqual(ids(getMyProjects(userFor('alex'), projects)), ['p1']);
  assert.deepEqual(ids(getMyProjects(userFor('deniz'), projects)), []);
  assert.ok(ids(getProjectRecommendations(userFor('deniz'), projects)).includes('p1'));
  assert.deepEqual(ids(getMyProjects(userFor('deniz', { projectInterest: ['p3'] }), projects)), ['p3']);
});

test('Suche findet Inhalte in allen Sprachen und ignoriert Akzente', () => {
  assert.deepEqual(ids(filterEvents(events, { query: 'Robotik' })), ['e2']);
  assert.deepEqual(ids(filterEvents(events, { query: 'robotics' })), ['e2']);
  assert.deepEqual(ids(filterEvents(events, { query: 'munazara' })), ['e3']);
});

test('Filter: Zeitraum, Schule, Thema, Format', () => {
  assert.deepEqual(ids(filterEvents(events, { timeframe: 'past' })), ['e8']);
  assert.ok(ids(filterEvents(events, { timeframe: 'week' })).every((id) => ['e1', 'e7'].includes(id)));
  assert.deepEqual(ids(filterEvents(events, { schoolId: 'anka', topic: 'music' })), ['e7']);
  assert.deepEqual(ids(filterEvents(events, { format: 'online' })), ['e5']);
});

test('Einladungen erscheinen nur, wenn sie in den Profildaten stehen, und verschwinden nach Reaktion', () => {
  const elif = userFor('elif');
  const updates = getUpdates(elif, { events, ideas: seedIdeas });
  assert.ok(updates.some((u) => u.type === 'invitation' && u.event.id === 'e1'));
  assert.ok(updates.some((u) => u.type === 'ideaReview' && u.idea.id === 'i2'));

  const deniz = getUpdates(userFor('deniz'), { events, ideas: seedIdeas });
  assert.ok(!deniz.some((u) => u.type === 'invitation'));

  const afterInterest = getUpdates(userFor('elif', { registrations: { ...elif.registrations, e1: 'interested' } }), {
    events,
    ideas: seedIdeas,
  });
  assert.ok(!afterInterest.some((u) => u.type === 'invitation'));

  const dismissed = getUpdates(userFor('elif', { dismissedUpdates: ['inv-elif-e1'] }), { events, ideas: seedIdeas });
  assert.ok(!dismissed.some((u) => u.id === 'inv-elif-e1'));
});

test('Unterstützungen werden nur aus Profilen gezählt (keine erfundenen Zahlen)', () => {
  const states = Object.fromEntries(demoProfiles.map((p) => [p.id, { supportedIdeas: p.supportedIdeas }]));
  const counts = getSupportCounts(states);
  assert.equal(counts.i1, 2);
  assert.equal(counts.i2, undefined);
  const popular = filterIdeas(seedIdeas, { sort: 'popular' }, counts);
  assert.equal(popular[0].id, 'i1');
});

// ---------------------------------------------------------------------------
// Abgesagte Events (Fehler: verschwanden aus allen Schüler-Listen)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-11-08T10:00:00Z');
const realEvent = (id, status, start, extra = {}) => ({
  id,
  title: { de: `Event ${id}` },
  summary: '',
  location: 'ERS',
  start,
  topics: ['languages'],
  format: 'meetup',
  schoolIds: ['ers', 'anka'],
  status,
  organizerIds: [],
  ...extra,
});
const cancelledSoon = realEvent('c-future', 'cancelled', '2026-11-12T14:00:00+03:00');
const cancelledPast = realEvent('c-past', 'cancelled', '2026-10-01T14:00:00+03:00');
const plannedSoon = realEvent('p-future', 'planned', '2026-11-11T14:00:00+03:00');
const confirmedSoon = realEvent('k-future', 'confirmed', '2026-11-20T14:00:00+03:00');
const plannedPast = realEvent('p-past', 'planned', '2026-10-05T14:00:00+03:00');
const completedPast = realEvent('d-past', 'completed', '2026-10-10T14:00:00+03:00');
const realEvents = [cancelledSoon, cancelledPast, plannedSoon, confirmedSoon, plannedPast, completedPast];

const student = (registrations = {}) => ({
  id: 'student-b',
  schoolId: 'ers',
  interests: ['languages'],
  registrations,
  supportedIdeas: [],
  projectInterest: [],
  invitations: [],
  dismissedUpdates: [],
});

test('isListed: bevorstehende geplante, bestätigte UND abgesagte Events', () => {
  assert.equal(isListed(cancelledSoon, NOW), true);
  assert.equal(isListed(plannedSoon, NOW), true);
  assert.equal(isListed(confirmedSoon, NOW), true);
  assert.equal(isListed(cancelledPast, NOW), false);
  assert.equal(isListed(completedPast, NOW), false);
  assert.equal(isListed(realEvent('x', 'draft', '2026-12-01T10:00:00+03:00'), NOW), false);
});

test('isUpcoming bleibt unverändert: abgesagte Events zählen nicht als bevorstehend', () => {
  assert.equal(isUpcoming(cancelledSoon, NOW), false);
  assert.equal(isUpcoming(plannedSoon, NOW), true);
  assert.equal(isUpcoming(confirmedSoon, NOW), true);
});

test('isPast: vergangene abgesagte Events stehen unter "Vergangen", künftige nicht', () => {
  assert.equal(isPast(cancelledPast, NOW), true);
  assert.equal(isPast(cancelledSoon, NOW), false);
  assert.equal(isPast(plannedPast, NOW), true);
  assert.equal(isPast(completedPast, NOW), true);
  assert.equal(isPast(plannedSoon, NOW), false);
});

test('"Meine": abgesagtes Event bleibt sichtbar (und zählt im Tab), Anmeldung bleibt erhalten', () => {
  const user = student({ 'c-future': 'registered', 'p-future': 'interested', 'c-past': 'registered' });
  const mine = getMyEvents(user, realEvents, NOW);
  assert.deepEqual(ids(mine.upcoming), ['p-future', 'c-future']);
  assert.equal(mine.upcoming.length, 2, 'Tab-Zahl enthält das abgesagte Event');
  assert.deepEqual(ids(mine.past), ['c-past']);
  assert.equal(getEventRole(user, cancelledSoon), 'registered');
});

test('"Alle": abgesagte Events in Demnächst / 7 Tage / 30 Tage bzw. Vergangen', () => {
  assert.ok(ids(filterEvents(realEvents, { timeframe: 'upcoming' }, NOW)).includes('c-future'));
  assert.ok(ids(filterEvents(realEvents, { timeframe: 'week' }, NOW)).includes('c-future'));
  assert.ok(ids(filterEvents(realEvents, { timeframe: 'month' }, NOW)).includes('c-future'));
  assert.ok(!ids(filterEvents(realEvents, { timeframe: 'upcoming' }, NOW)).includes('c-past'));
  const past = ids(filterEvents(realEvents, { timeframe: 'past' }, NOW));
  assert.ok(past.includes('c-past'));
  assert.ok(!past.includes('c-future'));
});

test('geplante und bestätigte Events verhalten sich wie bisher', () => {
  assert.deepEqual(ids(filterEvents(realEvents, { timeframe: 'upcoming' }, NOW)), ['p-future', 'c-future', 'k-future']);
  assert.deepEqual(ids(filterEvents(realEvents, { timeframe: 'past' }, NOW)), ['d-past', 'p-past', 'c-past']);
  const mine = getMyEvents(student({ 'k-future': 'registered' }), realEvents, NOW);
  assert.deepEqual(ids(mine.upcoming), ['k-future']);
});

test('abgesagte Events werden NICHT empfohlen', () => {
  const recs = ids(getEventRecommendations(student(), realEvents, NOW));
  assert.ok(!recs.includes('c-future'));
  assert.ok(recs.includes('p-future'));
});

test('keine "in X Tagen"-Erinnerung für abgesagte Events, Einladungen auch nicht', () => {
  const user = {
    ...student({ 'c-future': 'registered', 'p-future': 'registered' }),
    invitations: [{ id: 'inv-c', eventId: 'c-future', fromSchoolId: 'anka' }],
  };
  // Einladung zu einem abgesagten Event, für das man (noch) keine Rolle hat
  const updates = getUpdates({ ...user, registrations: { 'p-future': 'registered' } }, { events: realEvents, ideas: [] }, NOW);
  assert.ok(!updates.some((u) => u.event?.id === 'c-future'), 'keine Einladung zu abgesagtem Event');
  const reminders = getUpdates(user, { events: realEvents, ideas: [] }, NOW).filter((u) => u.type === 'reminder');
  assert.deepEqual(reminders.map((u) => u.event.id), ['p-future']);
});
