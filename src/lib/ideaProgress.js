/**
 * Fortschrittsanzeige und Hinweis auf der Ideen-Detailseite – ohne React, deshalb testbar
 * (tests/ideaProgress.test.js). Ändert nichts an Rechten: Wer eine Idee sehen darf,
 * entscheidet weiterhin allein die Datenbank (RLS).
 */
import { PUBLIC_IDEA_STATUSES } from './ideasApi.js';

export const IDEA_STEPS = ['submitted', 'collecting', 'review', 'planned'];

/**
 * Schritte für die Anzeige. state: 'done' | 'current' | 'upcoming' | 'rejected'.
 * Abgelehnt: "Eingereicht" ist erledigt, danach endet der Weg mit "Nicht freigegeben" –
 * kein Freigabe-Schritt erscheint als erledigt.
 */
export function ideaProgressSteps(status) {
  if (status === 'rejected') {
    return [
      { id: 'submitted', labelKey: 'ideaDetail.steps.submitted', state: 'done' },
      { id: 'rejected', labelKey: 'ideaDetail.steps.rejected', state: 'rejected' },
    ];
  }
  const current = IDEA_STEPS.indexOf(status);
  return IDEA_STEPS.map((id, index) => ({
    id,
    labelKey: `ideaDetail.steps.${id}`,
    state: index < current ? 'done' : index === current ? 'current' : 'upcoming',
  }));
}

/**
 * Hinweis für die eigene Idee (nur echtes Konto):
 * 'rejected' | 'awaitingApproval' | null
 */
export function ownIdeaNotice({ status, isOwn, isRealAccount }) {
  if (!isOwn || !isRealAccount) return null;
  if (status === 'rejected') return 'rejected';
  if (!PUBLIC_IDEA_STATUSES.includes(status)) return 'awaitingApproval';
  return null;
}
