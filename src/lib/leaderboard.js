/**
 * Bestenlisten für Papierflug und Brückenläufer (Migration 017_game_leaderboards.sql) –
 * reine Hilfsfunktionen ohne Netzwerk (getestet in tests/leaderboard.test.js).
 */

/** Spiel-Kennungen in der Datenbank (Prüfregel in 017: game in ('paper_flight', 'bridge_runner')). */
export const LEADERBOARD_GAMES = { paperFlight: 'paper_flight', bridgeRunner: 'bridge_runner' };

export const isLeaderboardGame = (game) => Object.values(LEADERBOARD_GAMES).includes(game);

/**
 * Höchste plausible Punktzahl nach `seconds` Sekunden – GLEICHE Formel wie
 * game_max_plausible_score() in 017 (dort wird geprüft; hier nur für Tests und Dokumentation).
 *   Brückenläufer: Punkte = Spielzeit × 10                       → floor((s + 5) × 10)
 *   Papierflug:    erste Säule frühestens nach ~2,3 s, dann je ~1,17 s → floor((s + 5) / 1,1) + 1
 * Die + 5 s gleichen Netzwerk-Verzögerungen zwischen Rundenstart und Einreichen aus.
 */
export function maxPlausibleScore(game, seconds) {
  const s = Math.max(0, seconds);
  if (game === LEADERBOARD_GAMES.bridgeRunner) return Math.floor((s + 5) * 10);
  if (game === LEADERBOARD_GAMES.paperFlight) return Math.floor((s + 5) / 1.1) + 1;
  return 0;
}

/**
 * Lohnt sich das Einreichen? Nur wenn die Punktzahl HÖHER ist als der bekannte Bestwert
 * (spart Anfragen; die Datenbank prüft das ohnehin selbst noch einmal).
 */
export function shouldSubmit(score, knownBest) {
  if (!Number.isInteger(score) || score <= 0) return false;
  return knownBest == null || score > knownBest;
}

const toInt = (value) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : null);

/** Zeile aus game_leaderboard() → Anzeige. */
export function mapLeaderboardRow(row) {
  return {
    rank: toInt(row?.rank),
    displayName: String(row?.display_name ?? '').trim() || '–',
    score: toInt(row?.best_score) ?? 0,
    isSelf: row?.is_self === true,
  };
}

/** Zeile aus game_my_status() → eigener Stand (bestScore/rank null = noch keiner bzw. nicht sichtbar). */
export function mapMyStatus(row) {
  return {
    bestScore: row?.best_score == null ? null : toInt(row.best_score),
    visible: row?.visible === true,
    rank: row?.my_rank == null ? null : toInt(row.my_rank),
  };
}

/**
 * Ergebnis aus game_submit_score() → { bestScore, isNewBest, status }.
 * status: 'saved' | 'kept' | 'implausible' | 'expired' (Migration 017). Abgelehnte Einreichungen kommen
 * bewusst als Ergebnis und NICHT als Fehler zurück – nur so bleibt die Runde in der Datenbank verbraucht.
 */
export function mapSubmitResult(row) {
  const status = typeof row?.status === 'string' ? row.status : null;
  return {
    bestScore: row?.best_score == null ? null : toInt(row.best_score),
    isNewBest: row?.is_new_best === true && status === 'saved',
    status,
  };
}

/** Abgelehnte Einreichung → Übersetzungsschlüssel; null = angenommen (saved/kept). */
export function rejectedSubmitKey(status) {
  if (status === 'saved' || status === 'kept') return null;
  if (status === 'implausible') return 'games.leaderboard.errors.implausible';
  if (status === 'expired') return 'games.leaderboard.errors.noRun';
  return 'games.leaderboard.errors.generic';
}

/** Datenbank-Fehler → Übersetzungsschlüssel. */
export function leaderboardErrorKey(error) {
  const code = error?.code;
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') {
    return 'games.leaderboard.errors.notInstalled';
  }
  if (code === '42501') return 'games.leaderboard.errors.notAllowed';
  if (code === 'DC031') return 'games.leaderboard.errors.noRun'; // keine (oder schon verbrauchte) Runde
  return 'games.leaderboard.errors.generic';
}
