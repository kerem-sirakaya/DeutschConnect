// Tests für die Spiellogik „Papierflug“ (Spiel von Kerem, Codex-Version). Ausführen mit: npm test
// Die ersten beiden Prüfungen stammen aus Kerems `scripts/chess-games.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshFlight, resizeFlight, stepFlight, flightDifficulty, FIELD } from '../src/games/paperFlight.js';

test('mobile Flugfläche: Start, Säulen und Randkollisionen nutzen die größere Höhe', () => {
  const height = 800;
  const scene = freshFlight(height);
  assert.equal(scene.y, height / 2);
  assert.equal(scene.pipes[0].gap, height / 2);
  assert.equal(stepFlight(scene, 0.016, false).over, false, 'unterhalb der alten 300er-Grenze weiterspielen');
  let running = scene;
  for (let frame = 0; frame < 40; frame += 1) {
    running = stepFlight(running, 1 / 60, frame % 30 === 0);
    assert.equal(running.height, height, 'die Höhe bleibt über alle Bilder erhalten');
    assert.equal(running.over, false);
  }
  assert.equal(stepFlight({ ...scene, y: height - 1 }, 0.016, false).over, true);
  for (const random of [0, 0.5, 1]) {
    const spawned = stepFlight({ ...scene, spawn: 0 }, 0.016, false, () => random).pipes.at(-1);
    assert.equal(spawned.gap, height / 2 - 60 + random * 120);
    assert.ok(Math.abs(spawned.gap - scene.pipes.at(-1).gap) <= 120, 'nächste Lücke bleibt erreichbar');
  }
  const collision = { ...scene, pipes: [{ x: 90, gap: 600, counted: false }] };
  assert.equal(stepFlight(collision, 0, false).over, true);
});

test('Größenwechsel überträgt Positionen und bewahrt Punkte, Phase und alte Spielstände', () => {
  const original = { ...freshFlight(), score: 7 };
  const taller = resizeFlight(original, 600);
  assert.equal(taller.y, 300);
  assert.equal(taller.pipes[0].gap, 300);
  assert.equal(taller.score, 7);
  assert.equal(taller.over, false);
  assert.equal(original.y, 150);
  assert.equal(resizeFlight(taller, 600), taller);
  assert.deepEqual(resizeFlight(taller, 300), original);
  const { height, ...legacy } = original;
  assert.equal(resizeFlight(legacy, 600).y, 300);
  assert.equal(stepFlight(legacy, 0.016, false).over, false);
});

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
