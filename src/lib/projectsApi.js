/**
 * Projekt-Mitwirkung – Zugriff auf Supabase (Migration 013_project_members.sql).
 * Nur Funktionen (rpc) – die Tabelle idea_members ist für Nutzer:innen nicht direkt erreichbar.
 * Der Client wird übergeben (testbar ohne echte Datenbank, siehe tests/projects.test.js).
 */
import { mapMembershipRow, mapOverviewRow, mapTeamRow } from './projects.js';

const first = (data) => (Array.isArray(data) ? data[0] : data);

async function call(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

/** Überblick + Team einer Idee in einem Schritt. overview = null: Idee nicht sichtbar. */
export async function fetchProjectState(client, ideaId) {
  const [overview, team] = await Promise.all([
    call(client, 'project_get_overview', { p_idea_id: ideaId }),
    call(client, 'project_get_team', { p_idea_id: ideaId }),
  ]);
  return { overview: mapOverviewRow(first(overview)), team: (team ?? []).map(mapTeamRow) };
}

export const requestJoin = (client, ideaId) => call(client, 'project_request_join', { p_idea_id: ideaId });
export const cancelJoinRequest = (client, ideaId) => call(client, 'project_cancel_request', { p_idea_id: ideaId });
export const leaveProject = (client, ideaId) => call(client, 'project_leave', { p_idea_id: ideaId });
export const reviewJoinRequest = (client, ideaId, userId, accept) =>
  call(client, 'project_review_request', { p_idea_id: ideaId, p_user_id: userId, p_accept: accept });

export async function fetchMyMemberships(client) {
  return ((await call(client, 'project_my_memberships')) ?? []).map(mapMembershipRow);
}

export async function fetchPublicMemberships(client, userId) {
  return ((await call(client, 'list_public_memberships', { p_user_id: userId })) ?? []).map(mapMembershipRow);
}
