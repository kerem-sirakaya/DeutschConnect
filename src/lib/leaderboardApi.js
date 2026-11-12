/**
 * Bestenlisten – Zugriff auf Supabase (Migration 017_game_leaderboards.sql).
 * Der Client wird übergeben (testbar ohne echte Datenbank, siehe tests/leaderboard.test.js).
 *
 * Alles läuft über Datenbank-Funktionen; die Tabellen sind für den Browser gesperrt.
 * Keine Funktion nimmt eine Nutzer-ID entgegen – die Datenbank nimmt immer auth.uid().
 *
 *   Runde beginnt:          rpc game_start_run(p_game)          → Server merkt sich die Startzeit
 *   Runde beendet:          rpc game_submit_score(p_game, p_score) → prüft Plausibilität, nur höherer Wert zählt;
 *                           verbraucht die Runde IMMER; Ablehnung kommt als status ('implausible'/'expired')
 *   Anzeige an/aus:         rpc game_set_leaderboard_visibility(p_visible)
 *   eigener Stand:          rpc game_my_status(p_game)
 *   Top 10:                 rpc game_leaderboard(p_game)
 */
import { mapLeaderboardRow, mapMyStatus, mapSubmitResult } from './leaderboard.js';

const first = (data) => (Array.isArray(data) ? data[0] : data);

export async function startRun(client, game) {
  const { error } = await client.rpc('game_start_run', { p_game: game });
  if (error) throw error;
}

export async function submitScore(client, game, score) {
  const { data, error } = await client.rpc('game_submit_score', { p_game: game, p_score: score });
  if (error) throw error;
  return mapSubmitResult(first(data));
}

export async function setLeaderboardVisibility(client, visible) {
  const { data, error } = await client.rpc('game_set_leaderboard_visibility', { p_visible: visible === true });
  if (error) throw error;
  return data === true;
}

export async function fetchMyStatus(client, game) {
  const { data, error } = await client.rpc('game_my_status', { p_game: game });
  if (error) throw error;
  return mapMyStatus(first(data));
}

export async function fetchLeaderboard(client, game) {
  const { data, error } = await client.rpc('game_leaderboard', { p_game: game });
  if (error) throw error;
  return (data ?? []).map(mapLeaderboardRow);
}
