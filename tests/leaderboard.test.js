// Bestenlisten für Papierflug und Brückenläufer (Migration 017). Ausführen mit: npm test
// Ohne Datenbank: Logik, API-Aufrufe (mit Test-Client), Plausibilitätsgrenzen gegen die echten
// Spielregeln und statische Prüfungen der Migration. Die SQL-Funktionen selbst werden mit
// supabase/tests/017_leaderboard_test.sql geprüft (Staging bzw. lokale Test-Datenbank).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEADERBOARD_GAMES,
  isLeaderboardGame,
  leaderboardErrorKey,
  mapLeaderboardRow,
  mapMyStatus,
  mapSubmitResult,
  maxPlausibleScore,
  rejectedSubmitKey,
  shouldSubmit,
} from '../src/lib/leaderboard.js';
import {
  fetchLeaderboard,
  fetchMyStatus,
  setLeaderboardVisibility,
  startRun,
  submitScore,
} from '../src/lib/leaderboardApi.js';
import { freshFlight, stepFlight, PIPE_WIDTH } from '../src/games/paperFlight.js';
import { freshRunner, stepRunner } from '../src/games/bridgeRunner.js';

const sql = readFileSync(new URL('../supabase/migrations/017_game_leaderboards.sql', import.meta.url), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

// ---------- Logik ----------
test('Spiel-Kennungen wie in der Datenbank', () => {
  assert.deepEqual(LEADERBOARD_GAMES, { paperFlight: 'paper_flight', bridgeRunner: 'bridge_runner' });
  assert.equal(isLeaderboardGame('bridge_runner'), true);
  assert.equal(isLeaderboardGame('chess'), false);
  assert.ok(code.includes("game in ('paper_flight', 'bridge_runner')"));
});

test('nur ein höherer Wert wird eingereicht', () => {
  assert.equal(shouldSubmit(10, null), true, 'erster Wert');
  assert.equal(shouldSubmit(11, 10), true, 'höher');
  assert.equal(shouldSubmit(10, 10), false, 'gleich');
  assert.equal(shouldSubmit(9, 10), false, 'niedriger');
  assert.equal(shouldSubmit(0, null), false, '0 Punkte');
  assert.equal(shouldSubmit(2.5, null), false, 'keine ganze Zahl');
  assert.equal(shouldSubmit(Number.NaN, null), false);
});

test('Zeilen aus der Datenbank werden sicher übernommen', () => {
  assert.deepEqual(mapLeaderboardRow({ rank: 1, display_name: ' Ada ', best_score: 120, is_self: true }), {
    rank: 1,
    displayName: 'Ada',
    score: 120,
    isSelf: true,
  });
  assert.equal(mapLeaderboardRow({ rank: 2, display_name: '', best_score: 5, is_self: 'yes' }).isSelf, false);
  assert.equal(mapLeaderboardRow({ rank: 2, display_name: null, best_score: 5 }).displayName, '–');
  assert.deepEqual(mapMyStatus(null), { bestScore: null, visible: false, rank: null });
  assert.deepEqual(mapMyStatus({ best_score: 0, visible: true, my_rank: 3 }), { bestScore: 0, visible: true, rank: 3 });
  assert.deepEqual(mapSubmitResult({ best_score: 40, is_new_best: false, status: 'kept' }), {
    bestScore: 40,
    isNewBest: false,
    status: 'kept',
  });
  assert.deepEqual(mapSubmitResult({ best_score: null, is_new_best: false, status: 'implausible' }), {
    bestScore: null,
    isNewBest: false,
    status: 'implausible',
  });
  // is_new_best zählt nur zusammen mit status 'saved'
  assert.equal(mapSubmitResult({ best_score: 9, is_new_best: true, status: 'implausible' }).isNewBest, false);
});

test('Ablehnung kommt als status (nicht als Fehler) → eigene Meldung', () => {
  assert.equal(rejectedSubmitKey('saved'), null);
  assert.equal(rejectedSubmitKey('kept'), null);
  assert.equal(rejectedSubmitKey('implausible'), 'games.leaderboard.errors.implausible');
  assert.equal(rejectedSubmitKey('expired'), 'games.leaderboard.errors.noRun');
  assert.equal(rejectedSubmitKey(undefined), 'games.leaderboard.errors.generic', 'unbekannt = nicht gespeichert');
});

test('Fehlercodes → eigene Meldungen', () => {
  assert.equal(leaderboardErrorKey({ code: 'PGRST202' }), 'games.leaderboard.errors.notInstalled');
  assert.equal(leaderboardErrorKey({ code: '42501' }), 'games.leaderboard.errors.notAllowed');
  assert.equal(leaderboardErrorKey({ code: 'DC031' }), 'games.leaderboard.errors.noRun');
  assert.equal(leaderboardErrorKey(new Error('offline')), 'games.leaderboard.errors.generic');
});

// ---------- API mit Test-Client ----------
function fakeClient(responses = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({ name, params });
      return responses[name] ?? { data: null, error: null };
    },
  };
}

test('API: richtige Funktionen, keine Nutzer-ID im Aufruf', async () => {
  const client = fakeClient({
    game_submit_score: { data: [{ best_score: 80, is_new_best: true, status: 'saved' }], error: null },
    game_set_leaderboard_visibility: { data: true, error: null },
    game_my_status: { data: [{ best_score: 80, visible: true, my_rank: 2 }], error: null },
    game_leaderboard: { data: [{ rank: 1, display_name: 'Ada', best_score: 90, is_self: false }], error: null },
  });
  await startRun(client, 'bridge_runner');
  assert.deepEqual(await submitScore(client, 'bridge_runner', 80), { bestScore: 80, isNewBest: true, status: 'saved' });
  assert.equal(await setLeaderboardVisibility(client, true), true);
  assert.deepEqual(await fetchMyStatus(client, 'bridge_runner'), { bestScore: 80, visible: true, rank: 2 });
  assert.equal((await fetchLeaderboard(client, 'paper_flight'))[0].displayName, 'Ada');
  assert.deepEqual(
    client.calls.map((c) => c.name),
    ['game_start_run', 'game_submit_score', 'game_set_leaderboard_visibility', 'game_my_status', 'game_leaderboard'],
  );
  assert.deepEqual(client.calls[1].params, { p_game: 'bridge_runner', p_score: 80 });
  for (const call of client.calls) {
    assert.ok(!Object.keys(call.params).some((key) => /user|uid|id$/i.test(key)), `${call.name}: keine Nutzer-ID`);
  }
});

test('API: Datenbank-Fehler werden weitergegeben, Ablehnung als status', async () => {
  const client = fakeClient({ game_submit_score: { data: null, error: { code: 'DC031' } } });
  await assert.rejects(() => submitScore(client, 'paper_flight', 999), (error) => error.code === 'DC031');
  const rejected = fakeClient({
    game_submit_score: { data: [{ best_score: null, is_new_best: false, status: 'implausible' }], error: null },
  });
  assert.deepEqual(await submitScore(rejected, 'paper_flight', 999), { bestScore: null, isNewBest: false, status: 'implausible' });
  const empty = fakeClient({ game_leaderboard: { data: null, error: null } });
  assert.deepEqual(await fetchLeaderboard(empty, 'paper_flight'), [], 'leere Liste');
});

// ---------- Plausibilitätsgrenzen ----------
test('Grenzen in JavaScript und SQL sind identisch', () => {
  assert.ok(code.includes("when 'bridge_runner' then floor((greatest(p_seconds, 0) + 5) * 10)::integer"));
  assert.ok(code.includes("when 'paper_flight'  then floor((greatest(p_seconds, 0) + 5) / 1.1)::integer + 1"));
  assert.equal(maxPlausibleScore('bridge_runner', 10), 150);
  assert.equal(maxPlausibleScore('paper_flight', 6), 11);
  assert.equal(maxPlausibleScore('chess', 100), 0);
  assert.equal(maxPlausibleScore('bridge_runner', -3), 50, 'negative Zeit wie 0');
  // dieselben Werte prüft die Selbstprüfung in 017
  assert.ok(code.includes("public.game_max_plausible_score('bridge_runner', 10) <> 150"));
  assert.ok(code.includes("public.game_max_plausible_score('paper_flight', 6) <> 11"));
});

test('Brückenläufer: echte Punkte liegen immer unter der Grenze', () => {
  // Ohne Hindernisse läuft die Runde beliebig lange; Punkte = Spielzeit × 10
  let state = { ...freshRunner(), obstacles: [], spawn: 1e9 };
  const dt = 1 / 60;
  for (let frame = 1; frame <= 60 * 120; frame++) {
    state = stepRunner(state, dt, false);
    assert.ok(state.score <= maxPlausibleScore('bridge_runner', frame * dt - 5), `t=${frame * dt}`);
  }
  assert.ok(state.score >= 1190, 'Simulation lief wirklich ~120 s');
});

test('Papierflug: auch perfektes Spiel bleibt unter der Grenze', () => {
  // Autopilot: hält das Flugzeug in der Mitte der nächsten Lücke → viele Punkte
  let state = freshFlight();
  const dt = 1 / 60;
  let frame = 0;
  while (!state.over && frame < 60 * 300) {
    frame++;
    const next = state.pipes.find((pipe) => pipe.x + PIPE_WIDTH > 70) ?? { gap: 150 };
    const flap = state.y > next.gap + 6 && state.velocity > -60;
    state = stepFlight(state, dt, flap);
    // Grenze OHNE den Netzwerk-Puffer von 5 s (strenger als auf dem Server)
    assert.ok(state.score <= maxPlausibleScore('paper_flight', frame * dt - 5), `t=${(frame * dt).toFixed(2)} Punkte=${state.score}`);
  }
  assert.ok(state.score >= 30, `Autopilot sollte weit kommen (erreicht: ${state.score})`);
});

// ---------- Migration 017 (statisch) ----------
test('017: Tabellen gesperrt (RLS an, keine Policies, keine Rechte)', () => {
  for (const table of ['game_scores', 'game_runs', 'game_leaderboard_optin']) {
    assert.ok(code.includes(`alter table public.${table} enable row level security;`), table);
  }
  assert.ok(/revoke all on public\.game_scores, public\.game_runs, public\.game_leaderboard_optin\s+from public, anon, authenticated;/.test(code));
  assert.ok(!/create policy/i.test(code), 'keine Policies');
  assert.ok(!/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.game_/i.test(code), 'keine Tabellenrechte');
});

test('017: Funktionen sicher (SECURITY DEFINER, fester search_path, nur auth.uid(), keine E-Mail)', () => {
  const functions = [...code.matchAll(/create function (public\.\w+)\(([^)]*)\)([\s\S]*?)\$\$;/g)];
  assert.equal(functions.length, 6);
  for (const [, name, params, body] of functions) {
    assert.ok(/set search_path = ''/.test(body), `${name}: search_path`);
    assert.ok(!/p_user|user_id\s+uuid/i.test(params), `${name}: nimmt keine Nutzer-ID entgegen`);
    if (name !== 'public.game_max_plausible_score') {
      assert.ok(/security definer/.test(body), `${name}: security definer`);
      assert.ok(/auth\.uid\(\)/.test(body), `${name}: nutzt auth.uid()`);
      assert.ok(/raise exception 'Nicht angemeldet' using errcode = '42501'/.test(body), `${name}: Anmeldung geprüft`);
    }
  }
  assert.ok(!/email/i.test(code), 'keine E-Mail');
  assert.ok(/revoke execute on function public\.game_max_plausible_score\(text, double precision\)\s+from public, anon, authenticated/.test(code));
  assert.ok(/execute format\('revoke execute on function %s from public, anon', f\)/.test(code));
});

test('017: niedrigerer Wert ersetzt nie den Bestwert; Rundenstart nur einmal verwendbar', () => {
  assert.ok(code.includes('where s.best_score < excluded.best_score'));
  assert.ok(code.includes('elsif previous is null or p_score > previous then'));
  assert.ok(/delete from public\.game_runs r\s+where r\.user_id = uid and r\.game = p_game\s+returning r\.started_at into run_started;/.test(code));
  assert.ok(code.includes('if seconds > 3 * 60 * 60 then'));
});

test('017: abgelehnte Einreichung verbraucht die Runde (keine Exception nach dem DELETE)', () => {
  // Eine Exception nach dem DELETE würde das DELETE zurückrollen → Runde wiederverwendbar.
  const body = code.match(/create function public\.game_submit_score\(p_game text, p_score integer\)([\s\S]*?)\$\$;/)[1];
  assert.ok(/returns table \(best_score integer, is_new_best boolean, status text\)/.test(body));
  const afterDelete = body.slice(body.indexOf('delete from public.game_runs'));
  const raises = [...afterDelete.matchAll(/raise exception '([^']*)' using errcode = '(\w+)'/g)].map((m) => m[2]);
  assert.deepEqual(raises, ['DC031'], 'nach dem DELETE nur DC031 (= es wurde nichts gelöscht)');
  // DC031 steht direkt im "nichts gelöscht"-Zweig
  assert.ok(/if run_started is null then[\s\S]{0,120}raise exception 'Keine laufende Runde' using errcode = 'DC031';/.test(afterDelete));
  // Markierung steht in einem Kommentar → im Originaltext (mit Kommentaren) suchen, wie die Selbstprüfung (prosrc)
  const rawBody = sql.match(/create function public\.game_submit_score\(p_game text, p_score integer\)([\s\S]*?)\$\$;/)[1];
  const afterMarker = rawBody.split('AB HIER KEINE EXCEPTION MEHR')[1];
  assert.ok(afterMarker, 'Markierung vorhanden');
  assert.ok(!/raise/i.test(afterMarker), 'nach der Markierung keine Exception');
  for (const status of ['expired', 'implausible', 'saved', 'kept']) assert.ok(afterMarker.includes(`outcome := '${status}'`), status);
  assert.ok(!/DC032|DC033/.test(code), 'alte Fehlercodes für Ablehnungen sind entfernt');
  // Selbstprüfung der Migration wacht über dieselbe Regel
  assert.ok(code.includes("ABBRUCH: game_submit_score darf nach dem Verbrauchen der Runde keine Exception auslösen"));
});

test('017: Bestenliste nur mit Zustimmung, Top 10, Wettkampf-Platzierung', () => {
  const board = code.match(/create function public\.game_leaderboard\(p_game text\)([\s\S]*?)\$\$;/)[1];
  assert.ok(/returns table \(rank integer, display_name text, best_score integer, is_self boolean\)/.test(board));
  assert.ok(board.includes('join public.game_leaderboard_optin o on o.user_id = s.user_id and o.visible'));
  assert.ok(board.includes('rank() over (order by s.best_score desc)'));
  assert.ok(board.includes('order by s.best_score desc, s.achieved_at asc, s.user_id'));
  assert.ok(board.includes('limit 10'));
  assert.ok(code.includes('visible    boolean not null default false'), 'Standard: nicht sichtbar');
});
