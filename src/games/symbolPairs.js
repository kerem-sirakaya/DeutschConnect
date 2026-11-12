// Spiellogik „Symbolpaare“ (Memory).
//
// Urheber: Kerem – übernommen aus der Codex-Version (Branch `codex-version-1.0`,
// Datei `src/games/arcade.js`, Funktion `shuffledPairs`, und `src/games/MemoryGame.jsx`).
// Für DeutschConnect angepasst: Symbol-Namen für Screenreader, ohne Bestenliste,
// ohne Speicherung. Reine Funktionen ohne React → einfach mit `npm test` prüfbar.

/** Die sechs Symbole. `id` wird für die Übersetzung des Namens genutzt (Screenreader). */
export const SYMBOLS = [
  { id: 'star', glyph: '✦' },
  { id: 'circle', glyph: '●' },
  { id: 'triangle', glyph: '▲' },
  { id: 'diamond', glyph: '◆' },
  { id: 'heart', glyph: '♥' },
  { id: 'sun', glyph: '☀' },
];

export const PAIR_COUNT = SYMBOLS.length;

/** Wie lange zwei falsche Karten offen bleiben, bevor sie sich wieder umdrehen (ms). */
export const FLIP_BACK_MS = 650;

/**
 * Neues, gemischtes Deck: 12 Karten, jedes Symbol genau zweimal.
 * Eine Karte ist nur die Nummer ihres Symbols (0–5).
 * Mischen mit dem Fisher-Yates-Verfahren; `random` ist austauschbar (für Tests).
 */
export function shuffledPairs(random = Math.random) {
  const values = SYMBOLS.flatMap((_, index) => [index, index]);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

/**
 * Darf die Karte an Position `index` jetzt aufgedeckt werden?
 * Nein, wenn schon zwei Karten offen sind, die Karte schon offen ist
 * oder ihr Paar bereits gefunden wurde.
 */
export function canReveal({ deck, open, found }, index) {
  if (index < 0 || index >= deck.length) return false;
  if (open.length >= 2 || open.includes(index)) return false;
  return !found.includes(deck[index]);
}

/** Sind die zwei offenen Karten ein Paar? */
export function isPair(deck, [first, second]) {
  return first !== second && deck[first] === deck[second];
}

export function isComplete(found) {
  return found.length === PAIR_COUNT;
}
