// Tests für die Spiellogik „Papierflug“ (Spiel von Kerem, Codex-Version). Ausführen mit: npm test
// Die ersten beiden Prüfungen stammen aus Kerems `scripts/chess-games.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshFlight, stepFlight, flightDifficulty, FIELD } from '../src/games/paperFlight.js';

test('Auftrieb hebt das Flugzeug, Boden beendet das Spiel (aus Kerems Tests)', () => {
  assert.ok(stepFlight(freshFlight(), 0.016, true).y < 150);
  assert.equal(stepFlight({ ...freshFlight(), y: FIELD.height - 1 }, 0.016, false).over, true);
});

test('ohne Eingabe fällt das Flugzeug (Schwerkraft)', () => {
  const next = stepFlight(freshFlight(), 0.03, false);
  assert.ok(next.y > 150);
  assert.equal(next.over, false);
});

test('Spielende: Zustand bleibt eingefroren', () => {
  const over = { ...freshFlight(), over: true, score: 7 };
  assert.equal(stepFlight(over, 0.03, true), over);
});

test('lange Ruckler werden auf einen kurzen Schritt begrenzt, negative Zeit ignoriert', () => {
  const start = freshFlight();
  const slow = stepFlight(start, 5, false);
  assert.ok(slow.time <= 0.035 + 1e-9, 'Zeitschritt höchstens 0,035 s');
  assert.equal(stepFlight(start, -1, false).time, 0);
});

test('eine überflogene Säule gibt genau einen Punkt', () => {
  // Säule kurz vor der Wertungslinie, Flugzeug mitten in der Lücke
  let state = { ...freshFlight(), y: 150, pipes: [{ x: 51, gap: 150, counted: false }] };
  state = stepFlight(state, 0.03, true);
  assert.equal(state.score, 1);
  state = stepFlight(state, 0.03, true);
  assert.equal(state.score, 1, 'nicht doppelt zählen');
  assert.equal(state.over, false);
});

test('Säule außerhalb der Lücke berührt = Spielende', () => {
  const state = { ...freshFlight(), y: 40, pipes: [{ x: 80, gap: 200, counted: false }] };
  assert.equal(stepFlight(state, 0.016, false).over, true);
});

test('Tempo steigt langsam und bleibt unter 260 px/s', () => {
  assert.equal(Math.round(flightDifficulty(0).speed), 160);
  assert.ok(flightDifficulty(60).speed > flightDifficulty(10).speed);
  assert.ok(flightDifficulty(10_000).speed <= 260);
});

test('neue Säulen erscheinen mit Lücke im sichtbaren Bereich', () => {
  const low = stepFlight({ ...freshFlight(), spawn: 0 }, 0.016, true, () => 0);
  const high = stepFlight({ ...freshFlight(), spawn: 0 }, 0.016, true, () => 0.999);
  for (const state of [low, high]) {
    const pipe = state.pipes.at(-1);
    assert.equal(pipe.x, 650);
    assert.ok(pipe.gap >= 85 && pipe.gap <= 205);
  }
});
