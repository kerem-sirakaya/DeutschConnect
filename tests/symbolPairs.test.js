// Tests für die Spiellogik „Symbolpaare“ (Spiel von Kerem, Codex-Version). Ausführen mit: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, PAIR_COUNT, shuffledPairs, canReveal, isPair, isComplete } from '../src/games/symbolPairs.js';

// Wiederholbarer Zufall für Tests (kleiner linearer Kongruenzgenerator)
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

test('Deck hat 12 Karten und jedes Symbol genau zweimal', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const deck = shuffledPairs(seeded(seed));
    assert.equal(deck.length, PAIR_COUNT * 2);
    for (let symbol = 0; symbol < SYMBOLS.length; symbol++) {
      assert.equal(deck.filter((value) => value === symbol).length, 2, `Symbol ${symbol} (seed ${seed})`);
    }
  }
});

test('Mischen ändert die Reihenfolge und funktioniert auch mit Grenzwerten von random', () => {
  const sorted = SYMBOLS.flatMap((_, index) => [index, index]);
  assert.notDeepEqual(shuffledPairs(seeded(7)), sorted);
  // random() liefert Werte in [0, 1) – auch 0 und knapp unter 1 dürfen nichts kaputt machen
  assert.equal(shuffledPairs(() => 0).length, 12);
  assert.equal(shuffledPairs(() => 0.999999).length, 12);
});

test('canReveal: höchstens zwei offene Karten, keine doppelte und keine gefundene', () => {
  const deck = [0, 1, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  assert.equal(canReveal({ deck, open: [], found: [] }, 0), true);
  assert.equal(canReveal({ deck, open: [0], found: [] }, 0), false, 'dieselbe Karte zweimal');
  assert.equal(canReveal({ deck, open: [0, 1], found: [] }, 2), false, 'schon zwei offen');
  assert.equal(canReveal({ deck, open: [], found: [0] }, 2), false, 'Paar schon gefunden');
  assert.equal(canReveal({ deck, open: [], found: [] }, -1), false);
  assert.equal(canReveal({ deck, open: [], found: [] }, 12), false);
});

test('isPair und isComplete', () => {
  const deck = [0, 1, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  assert.equal(isPair(deck, [0, 2]), true);
  assert.equal(isPair(deck, [0, 1]), false);
  assert.equal(isPair(deck, [0, 0]), false, 'eine Karte ist kein Paar');
  assert.equal(isComplete([0, 1, 2, 3, 4]), false);
  assert.equal(isComplete([0, 1, 2, 3, 4, 5]), true);
});
