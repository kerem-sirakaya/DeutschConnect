// Tests für die Spiellogik „Brückenläufer“ (Spiel von Kerem, Codex-Version). Ausführen mit: npm test
// Die ersten drei Prüfungen stammen aus Kerems `scripts/chess-games.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRunner, stepRunner, runnerSpeed } from '../src/games/bridgeRunner.js';

const noObstacles = () => ({ ...freshRunner(), obstacles: [], spawn: 99 });

test('Sprung hebt die Figur, Hindernis berührt = Spielende, Zeitschritt begrenzt (aus Kerems Tests)', () => {
  assert.ok(stepRunner(freshRunner(), 0.016, true, () => 0.5).y > 0);
  assert.equal(stepRunner({ ...freshRunner(), obstacles: [{ x: 90, width: 25, height: 40 }] }, 0.016, false).over, true);
  assert.ok(stepRunner(freshRunner(), 100, false).time <= 0.035);
});

test('ohne Eingabe bleibt die Figur auf der Brücke', () => {
  const next = stepRunner(noObstacles(), 0.03, false);
  assert.equal(next.y, 0);
  assert.equal(next.velocity, 0);
});

test('kein Doppelsprung: in der Luft wird Tippen ignoriert', () => {
  const inAir = stepRunner(noObstacles(), 0.03, true);
  assert.ok(inAir.y > 0);
  const tapAgain = stepRunner(inAir, 0.03, true);
  const noTap = stepRunner(inAir, 0.03, false);
  assert.deepEqual(tapAgain, noTap);
});

test('nach dem Sprung landet die Figur wieder', () => {
  let state = stepRunner(noObstacles(), 0.03, true);
  for (let i = 0; i < 60 && state.y > 0; i++) state = stepRunner(state, 0.03, false);
  assert.equal(state.y, 0);
  assert.equal(state.velocity, 0);
});

test('hoch genug gesprungen = Hindernis wird übersprungen', () => {
  const state = { ...freshRunner(), y: 60, velocity: 0, obstacles: [{ x: 80, width: 23, height: 40 }], spawn: 99 };
  assert.equal(stepRunner(state, 0.016, false).over, false);
});

test('Punkte = überlebte Zeit (10 pro Sekunde)', () => {
  let state = noObstacles();
  // 41 × 0,025 s ≈ 1,025 s (nicht genau 1 s, sonst Rundungsfehler bei Kommazahlen)
  for (let i = 0; i < 41; i++) state = stepRunner(state, 0.025, false);
  assert.equal(state.score, 10);
});

test('Spielende: Zustand bleibt eingefroren', () => {
  const over = { ...freshRunner(), over: true, score: 12 };
  assert.equal(stepRunner(over, 0.03, true), over);
});

test('Tempo steigt und ist nach oben begrenzt', () => {
  assert.equal(runnerSpeed(0), 235);
  assert.ok(runnerSpeed(20) > runnerSpeed(5));
  assert.equal(runnerSpeed(10_000), 335);
});

test('neue Hindernisse erscheinen rechts mit passender Höhe', () => {
  for (const value of [0, 0.999]) {
    const state = stepRunner({ ...noObstacles(), spawn: 0 }, 0.016, false, () => value);
    const obstacle = state.obstacles.at(-1);
    assert.equal(obstacle.x, 660);
    assert.ok(obstacle.height >= 32 && obstacle.height <= 52);
    assert.ok(state.spawn >= 1.25 && state.spawn <= 1.95);
  }
});
