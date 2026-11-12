/**
 * Projekt-Mitwirkung – reine Funktionen (ohne React, testbar).
 * Backend: supabase/migrations/013_project_members.sql
 *
 * Eine veröffentlichte Idee (collecting/review/planned) ist ein Projekt (wie in der Codex-Version).
 * Ablauf: anfragen → Autor:in nimmt an/lehnt ab → Mitglied → austreten.
 * Alle Regeln prüft die Datenbank; diese Funktionen entscheiden nur, welche Knöpfe sinnvoll sind.
 */
import { PUBLIC_IDEA_STATUSES } from './ideasApi.js';

/** my_status aus der Datenbank: null (keine Beziehung) | requested | member | declined | left */
export const MEMBER_STATUSES = ['requested', 'member', 'declined', 'left'];

export const isProjectOpen = (idea) => Boolean(idea) && PUBLIC_IDEA_STATUSES.includes(idea.status);

export function mapOverviewRow(row) {
  if (!row) return null;
  return {
    memberCount: typeof row.member_count === 'number' ? row.member_count : 0,
    myStatus: MEMBER_STATUSES.includes(row.my_status) ? row.my_status : null,
    isOwner: row.is_owner === true,
    pendingCount: typeof row.pending_count === 'number' ? row.pending_count : null,
  };
}

export function mapTeamRow(row) {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    schoolId: row.school_id ?? null,
    status: row.status,
    requestedAt: row.requested_at,
  };
}

export function mapMembershipRow(row) {
  return {
    ideaId: row.idea_id,
    title: row.title,
    summary: row.summary ?? '',
    ideaStatus: row.idea_status,
    schoolId: row.school_id ?? null,
    myStatus: row.my_status ?? 'member',
    memberCount: typeof row.member_count === 'number' ? row.member_count : null,
    requestedAt: row.requested_at ?? null,
  };
}

/**
 * Welche Aktion passt für mich? Gibt genau einen Hauptknopf zurück (oder null).
 *   'request' | 'cancel' | 'leave' | null
 * Eigene Idee: null (die Autor:in verwaltet stattdessen Anfragen).
 */
export function primaryAction(overview, idea) {
  if (!overview || overview.isOwner) return null;
  if (overview.myStatus === 'member') return 'leave';
  if (overview.myStatus === 'requested') return 'cancel';
  return isProjectOpen(idea) ? 'request' : null;
}

/** Team aufteilen: Mitglieder und offene Anfragen (Anfragen bekommt nur die Autor:in). */
export function splitTeam(team) {
  return {
    members: team.filter((person) => person.status === 'member'),
    requests: team.filter((person) => person.status === 'requested'),
  };
}

/** Supabase-Fehler → i18n-Schlüssel. */
export function projectErrorKey(error) {
  const code = error?.code;
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') return 'projects.errors.notInstalled';
  if (code === 'DC021') return 'projects.errors.own';
  if (code === 'DC022') return 'projects.errors.exists';
  if (code === 'DC023') return 'projects.errors.closed';
  if (code === 'DC024') return 'projects.errors.transition';
  if (code === 'P0002') return 'projects.errors.notFound';
  if (code === '42501') return 'projects.errors.notAllowed';
  if (code === '22023') return 'projects.errors.invalid';
  return 'projects.errors.generic';
}
