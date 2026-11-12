/**
 * Logik der Admin-Ideen-Moderation – ohne React, deshalb testbar (tests/adminIdeas.test.js).
 *
 * Die erlaubten Statuswechsel sind eine KOPIE der Regeln aus admin_set_idea_status()
 * (Migration 006). Sie steuern nur, welche Knöpfe angezeigt werden. Die Datenbank prüft
 * jeden Wechsel selbst und antwortet bei allem anderen mit DC004.
 */
import { ADMIN_IDEA_STATUSES, adminErrorKey, deleteAdminIdea, fetchAdminIdeas, setAdminIdeaStatus } from './adminApi.js';

// Texte der Aktionen (feste Schlüssel, damit Tests jeden Text finden)
const APPROVE = { id: 'approve', labelKey: 'admin.ideas.actions.approve', confirmKey: 'admin.ideas.confirm.approve' };
const REJECT = { id: 'reject', labelKey: 'admin.ideas.actions.reject', confirmKey: 'admin.ideas.confirm.reject' };
const TO_REVIEW = { id: 'toReview', labelKey: 'admin.ideas.actions.toReview', confirmKey: 'admin.ideas.confirm.toReview' };
const TO_PLANNED = { id: 'toPlanned', labelKey: 'admin.ideas.actions.toPlanned', confirmKey: 'admin.ideas.confirm.toPlanned' };
const BACK = {
  id: 'backToCollecting',
  labelKey: 'admin.ideas.actions.backToCollecting',
  confirmKey: 'admin.ideas.confirm.backToCollecting',
};
const REOPEN = { id: 'reopen', labelKey: 'admin.ideas.actions.reopen', confirmKey: 'admin.ideas.confirm.reopen' };

/**
 * Alle erlaubten Moderations-Aktionen (genau die Liste aus Migration 006).
 * `tone` bestimmt die Farbe des Knopfs (primary / secondary / danger).
 */
export const IDEA_ACTIONS = [
  { from: 'submitted', to: 'collecting', tone: 'primary', ...APPROVE },
  { from: 'submitted', to: 'rejected', tone: 'danger', ...REJECT },
  { from: 'collecting', to: 'review', tone: 'secondary', ...TO_REVIEW },
  { from: 'collecting', to: 'rejected', tone: 'danger', ...REJECT },
  { from: 'review', to: 'planned', tone: 'primary', ...TO_PLANNED },
  { from: 'review', to: 'collecting', tone: 'secondary', ...BACK },
  { from: 'review', to: 'rejected', tone: 'danger', ...REJECT },
  { from: 'rejected', to: 'submitted', tone: 'secondary', ...REOPEN },
];

/** Filter der Seite: 'all' + jeder Status, mit Text-Schlüssel. */
export const IDEA_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'admin.ideas.filters.all' },
  ...ADMIN_IDEA_STATUSES.map((status) => ({ value: status, labelKey: `status.idea.${status}` })),
];
export const IDEA_FILTERS = IDEA_FILTER_OPTIONS.map((option) => option.value);

/** Übersicht "Arbeit für das Team" – Status, die eine Entscheidung brauchen. */
export const IDEA_WORKLOAD = [
  { status: 'submitted', labelKey: 'admin.ideas.workload.submitted' },
  { status: 'collecting', labelKey: 'admin.ideas.workload.collecting' },
  { status: 'review', labelKey: 'admin.ideas.workload.review' },
];

/** Text für eine leere Liste – abhängig vom Filter. */
export function ideaEmptyKey(filter) {
  if (filter === 'all') return 'admin.ideas.empty.all';
  if (filter === 'submitted') return 'admin.ideas.empty.submitted';
  return 'admin.ideas.empty.filtered';
}

export function isAllowedIdeaTransition(from, to) {
  return IDEA_ACTIONS.some((action) => action.from === from && action.to === to);
}

/** Aktionen für eine Idee mit diesem Status ('planned' ist endgültig -> keine). */
export function ideaActionsFor(status) {
  return IDEA_ACTIONS.filter((action) => action.from === status);
}

/** Ungültige/unbekannte Filter werden zu 'all'. */
export function normalizeIdeaFilter(value) {
  return IDEA_FILTERS.includes(value) ? value : 'all';
}

export function filterIdeas(ideas, filter) {
  const normalized = normalizeIdeaFilter(filter);
  return normalized === 'all' ? ideas : ideas.filter((idea) => idea.status === normalized);
}

/** { all, submitted, collecting, review, planned, rejected } */
export function countIdeasByStatus(ideas) {
  const counts = Object.fromEntries(IDEA_FILTERS.map((filter) => [filter, 0]));
  for (const idea of ideas) {
    counts.all += 1;
    if (idea.status in counts) counts[idea.status] += 1;
  }
  return counts;
}

/** Lädt ALLE Ideen (gefiltert wird im Browser – so sind Filterwechsel sofort da). */
export async function loadAdminIdeas(client) {
  try {
    return { ideas: await fetchAdminIdeas(client), errorKey: null };
  } catch (error) {
    return { ideas: null, errorKey: adminErrorKey(error) };
  }
}

/**
 * Status einer Idee ändern.
 * - Nicht erlaubter Wechsel: keine Anfrage, Fehler admin.errors.transition.
 * - Fehler der Datenbank: Liste bleibt UNVERÄNDERT, übersetzter Fehler.
 * - Erfolg: Liste mit neuem Status (die Seite lädt danach zusätzlich neu).
 * @returns {Promise<{ ideas: object[], errorKey: string|null, action: object|null }>}
 */
export async function moderateIdea(client, ideas, ideaId, toStatus) {
  const idea = ideas.find((item) => item.id === ideaId);
  if (!idea) return { ideas, errorKey: 'admin.errors.notFound', action: null };
  const action = IDEA_ACTIONS.find((item) => item.from === idea.status && item.to === toStatus);
  if (!action) return { ideas, errorKey: 'admin.errors.transition', action: null };

  const { error } = await setAdminIdeaStatus(client, ideaId, toStatus);
  if (error) return { ideas, errorKey: adminErrorKey(error), action: null };

  return {
    ideas: ideas.map((item) => (item.id === ideaId ? { ...item, status: toStatus } : item)),
    errorKey: null,
    action,
  };
}

// ---------------------------------------------------------------------------
// Löschen (Migration 007: admin_delete_idea)
// ---------------------------------------------------------------------------

/** Löschbar nur nach der Moderation – gleiche Erlaubnisliste wie admin_delete_idea. */
export const IDEA_DELETABLE_STATUSES = ['collecting', 'review', 'planned', 'rejected'];

/** Löschen – eigene Aktion (keine Statusänderung). */
export const IDEA_DELETE_ACTION = {
  id: 'delete',
  tone: 'danger',
  labelKey: 'admin.ideas.actions.delete',
  confirmKey: 'admin.ideas.confirm.delete',
};

export function canDeleteIdea(idea) {
  return IDEA_DELETABLE_STATUSES.includes(idea?.status);
}

/**
 * Idee löschen. Nicht löschbarer Status (z. B. submitted): KEINE Anfrage.
 * Fehler der Datenbank: Liste bleibt UNVERÄNDERT. Erfolg: Idee ist aus der Liste entfernt.
 * @returns {Promise<{ ideas: object[], errorKey: string|null }>}
 */
export async function removeIdea(client, ideas, ideaId) {
  const idea = ideas.find((item) => item.id === ideaId);
  if (!idea) return { ideas, errorKey: 'admin.errors.notFound' };
  if (!canDeleteIdea(idea)) return { ideas, errorKey: 'admin.errors.ideaNotDeletable' };

  const { error } = await deleteAdminIdea(client, ideaId);
  if (error) return { ideas, errorKey: adminErrorKey(error) };
  return { ideas: ideas.filter((item) => item.id !== ideaId), errorKey: null };
}

/**
 * Welche Bestätigung ist für diese Idee offen? `confirmingTo` = Ziel-Status, 'delete' oder null.
 * Gibt die Aktion zurück oder null (nichts offen / abgebrochen / für diesen Status nicht erlaubt).
 */
export function resolveIdeaConfirmation(idea, confirmingTo) {
  if (!confirmingTo) return null;
  if (confirmingTo === 'delete') return canDeleteIdea(idea) ? IDEA_DELETE_ACTION : null;
  return ideaActionsFor(idea.status).find((action) => action.to === confirmingTo) ?? null;
}
