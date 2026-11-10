// Tests für den Zeit-Fortschritt der Reaktionsspiele (Teilschritte statt Zeitlupe). Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, SUBSTEP, MAX_CATCH_UP } from '../src/games/arcadeStep.js';
import { freshFlight, stepFlight } from '../src/games/paperFlight.js';
import { freshRunner, stepRunner } from '../src/games/bridgeRunner.js';

// Zähl-Schritt: merkt sich jede Zeit und jede Eingabe
function recorder() {
  const calls = [];
  const step = (s, dt, input) => {
    calls.push({ dt, input });
    return { ...s, time: s.time + dt, over: false };
  };
  return { calls, step };
}

test('60 Bilder pro Sekunde: genau ein Teilschritt pro Bild', () => {
  const { calls, step } = recorder();
  advance({ time: 0 }, 1 / 60, false, step);
  assert.equal(calls.length, 1);
});

test('langsames Gerät (20 Bilder/s): Spielzeit läuft trotzdem in Echtzeit', () => {
  const { calls, step } = recorder();
  const next = advance({ time: 0 }, 0.05, true, step);
  assert.ok(Math.abs(next.time - 0.05) < 1e-9, 'keine Zeitlupe');
  assert.ok(calls.every((c) => c.dt <= SUBSTEP + 1e-12));
  assert.deepEqual(calls.map((c) => c.input), [true, false, false], 'Eingabe nur im ersten Teilschritt');
});

test('lange Hänger werden begrenzt; 0 s rechnet trotzdem einen Schritt (Tippen wirkt sofort)', () => {
  const long = recorder();
  assert.ok(advance({ time: 0 }, 5, false, long.step).time <= MAX_CATCH_UP + 1e-9);
  const zero = recorder();
  advance({ time: 0 }, 0, true, zero.step);
  assert.deepEqual(zero.calls, [{ dt: 0, input: true }]);
  const negative = recorder();
  assert.equal(advance({ time: 0 }, -1, false, negative.step).time, 0);
});

test('nach Spielende wird nicht weitergerechnet', () => {
  let count = 0;
  const step = (s) => { count++; return { ...s, over: true }; };
  advance({ time: 0 }, 0.1, false, step);
  assert.equal(count, 1);
});

test('echte Spiele: bei 60 Bildern/s identisch mit einem direkten Schritt', () => {
  assert.deepEqual(advance(freshFlight(), 1 / 60, true, stepFlight), stepFlight(freshFlight(), 1 / 60, true));
  assert.deepEqual(advance(freshRunner(), 1 / 60, true, stepRunner), stepRunner(freshRunner(), 1 / 60, true));
});
