// Stufe 6: Projekt-Mitwirkung (Migration 013). Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isProjectOpen,
  mapMembershipRow,
  mapOverviewRow,
  mapTeamRow,
  primaryAction,
  projectErrorKey,
  splitTeam,
} from '../src/lib/projects.js';
import {
  cancelJoinRequest,
  fetchMyMemberships,
  fetchProjectState,
  leaveProject,
  requestJoin,
  reviewJoinRequest,
} from '../src/lib/projectsApi.js';

const sql = readFileSync(new URL('../supabase/migrations/013_project_members.sql', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const IDEA = '11111111-2222-4333-8444-555555555555';
const USER = '99999999-8888-4777-8666-555555555555';
const open = { status: 'collecting' };

test('nur veröffentlichte Ideen sind offene Projekte', () => {
  for (const status of ['collecting', 'review', 'planned']) assert.equal(isProjectOpen({ status }), true);
  for (const status of ['submitted', 'rejected', undefined]) assert.equal(isProjectOpen({ status }), false);
});

test('Hauptknopf je nach eigenem Status', () => {
  const o = (myStatus, isOwner = false) => ({ memberCount: 0, myStatus, isOwner, pendingCount: null });
  assert.equal(primaryAction(o(null), open), 'request');
  assert.equal(primaryAction(o('declined'), open), 'request', 'nach Ablehnung erneut anfragen');
  assert.equal(primaryAction(o('left'), open), 'request');
  assert.equal(primaryAction(o('requested'), open), 'cancel');
  assert.equal(primaryAction(o('member'), open), 'leave');
  assert.equal(primaryAction(o(null, true), open), null, 'Autor:in fragt nicht an');
  assert.equal(primaryAction(o(null), { status: 'rejected' }), null, 'geschlossene Projekte');
  assert.equal(primaryAction(o('member'), { status: 'rejected' }), 'leave', 'austreten geht immer');
  assert.equal(primaryAction(null, open), null);
});

test('Überblick und Team werden sauber umgewandelt', () => {
  assert.deepEqual(mapOverviewRow({ member_count: 2, my_status: 'hacked', is_owner: 'yes', pending_count: null }), {
    memberCount: 2, myStatus: null, isOwner: false, pendingCount: null,
  });
  assert.equal(mapOverviewRow(null), null);
  const team = [
    mapTeamRow({ user_id: 'a', first_name: 'Ada', school_id: 'ers', status: 'member' }),
    mapTeamRow({ user_id: 'b', first_name: 'Can', school_id: null, status: 'requested' }),
  ];
  const { members, requests } = splitTeam(team);
  assert.deepEqual(members.map((p) => p.userId), ['a']);
  assert.deepEqual(requests.map((p) => p.userId), ['b']);
  assert.equal(mapMembershipRow({ idea_id: IDEA, title: 'T', idea_status: 'planned', my_status: 'member', member_count: 3 }).memberCount, 3);
});

test('Fehlercodes → Texte', () => {
  const cases = { DC021: 'own', DC022: 'exists', DC023: 'closed', DC024: 'transition', P0002: 'notFound',
    42501: 'notAllowed', PGRST202: 'notInstalled', XX000: 'generic' };
  for (const [code, key] of Object.entries(cases)) assert.equal(projectErrorKey({ code }), `projects.errors.${key}`);
});

function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    rpc: (name, args) => {
      calls.push({ name, args });
      return Promise.resolve(responses[name] ?? { data: null, error: null });
    },
  };
}

test('API: richtige Funktionen und Parameter, keine direkten Tabellenzugriffe', async () => {
  const client = fakeClient({
    project_get_overview: { data: [{ member_count: 1, my_status: 'member', is_owner: false }], error: null },
    project_get_team: { data: [{ user_id: USER, first_name: 'Ada', status: 'member' }], error: null },
    project_my_memberships: { data: [{ idea_id: IDEA, title: 'X', my_status: 'requested' }], error: null },
  });
  const state = await fetchProjectState(client, IDEA);
  assert.equal(state.overview.myStatus, 'member');
  assert.equal(state.team[0].firstName, 'Ada');
  await requestJoin(client, IDEA);
  await cancelJoinRequest(client, IDEA);
  await leaveProject(client, IDEA);
  await reviewJoinRequest(client, IDEA, USER, true);
  assert.equal((await fetchMyMemberships(client))[0].myStatus, 'requested');
  assert.deepEqual(client.calls.map((c) => c.name), [
    'project_get_overview', 'project_get_team', 'project_request_join', 'project_cancel_request',
    'project_leave', 'project_review_request', 'project_my_memberships',
  ]);
  assert.deepEqual(client.calls[5].args, { p_idea_id: IDEA, p_user_id: USER, p_accept: true });
  assert.ok(!('from' in client));
});

test('API: Fehler werden weitergegeben (nichts gilt als gespeichert)', async () => {
  const client = fakeClient({ project_request_join: { data: null, error: { code: 'DC022' } } });
  await assert.rejects(requestJoin(client, IDEA), (error) => error.code === 'DC022');
});

test('Migration 013: kein direkter Zugriff, alle Funktionen sicher', () => {
  assert.match(sql, /alter table public\.idea_members enable row level security/);
  assert.match(sql, /revoke all on public\.idea_members from public, anon, authenticated/);
  assert.ok(!/grant [^;]* on public\.idea_members/i.test(sql), 'keine Tabellenrechte');
  assert.ok(!/create policy/i.test(sql), 'keine Policies (Zugriff nur über Funktionen)');
  const functions = sql.match(/create function public\.\w+/g) ?? [];
  assert.equal(functions.length, 8);
  assert.equal((sql.match(/security definer\nset search_path = ''/g) ?? []).length, 8);
  // Außenstehende bekommen im Team keine Zeilen
  assert.match(sql, /if v_author <> uid and not v_is_member then\n\s+return;/);
  // Öffentliche Mitgliedschaften nur mit Freigabe aus 012
  assert.match(sql, /s\.show_projects and \(s\.is_public or m\.user_id = uid\)/);
  // Nur veröffentlichte Ideen können angefragt werden (Erlaubnisliste wie 004 v3)
  assert.match(sql, /if v_status not in \('collecting', 'review', 'planned'\) then/);
});
