// Tests für die Personalisierungslogik. Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { events } from '../src/data/events.js';
import { seedIdeas } from '../src/data/ideas.js';
import { projects } from '../src/data/projects.js';
import { demoProfiles } from '../src/data/profiles.js';
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
