import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/LanguageContext.jsx';
import {
  SYMBOLS,
  PAIR_COUNT,
  FLIP_BACK_MS,
  shuffledPairs,
  canReveal,
  isPair,
  isComplete,
} from './symbolPairs.js';

/**
 * Spiel „Symbolpaare“ (Memory) – läuft komplett im Browser.
 *
 * Urheber: Kerem – Spielidee, Regeln und Aufbau stammen aus der Codex-Version
 * (Branch `codex-version-1.0`, `src/games/MemoryGame.jsx`).
 * Für DeutschConnect angepasst: unsere Übersetzungen und CSS-Klassen, Symbol-Namen für
 * Screenreader, keine Bestenliste und KEINE Speicherung (nach dem Neuladen ist alles weg).
 *
 * Barrierefreiheit: Karten werden während des Umdrehens nicht `disabled` gesetzt,
 * sondern nur blockiert (`aria-disabled`). Sonst verliert man mit der Tastatur den Fokus.
 */
export default function SymbolPairs() {
  const { t } = useI18n();
  const [deck, setDeck] = useState(() => shuffledPairs());
  const [open, setOpen] = useState([]); // Positionen der gerade offenen Karten (max. 2)
  const [found, setFound] = useState([]); // Symbol-Nummern der gefundenen Paare
  const [moves, setMoves] = useState(0);
  const timer = useRef(null);

  // Timer aufräumen, wenn die Seite verlassen wird.
  useEffect(() => () => clearTimeout(timer.current), []);

  const complete = isComplete(found);

  function reveal(index) {
    if (!canReveal({ deck, open, found }, index)) return;
    const selected = [...open, index];
    setOpen(selected);
    if (selected.length < 2) return;

    setMoves((value) => value + 1);
    timer.current = setTimeout(() => {
      if (isPair(deck, selected)) setFound((value) => [...value, deck[selected[0]]]);
      setOpen([]);
    }, FLIP_BACK_MS);
  }

  function restart() {
    clearTimeout(timer.current);
    setDeck(shuffledPairs());
    setOpen([]);
    setFound([]);
    setMoves(0);
  }

  return (
    <section className="card stack symbol-pairs" aria-labelledby="symbol-pairs-title">
      <h2 id="symbol-pairs-title" className="visually-hidden">
        {t('games.symbolPairs.title')}
      </h2>
      <p className="muted">{t('games.symbolPairs.hint')}</p>

      <div className="game-score">
        <span>{t('games.symbolPairs.pairs', { found: found.length, total: PAIR_COUNT })}</span>
        <span>{t('games.symbolPairs.moves', { count: moves })}</span>
      </div>

      <div className="symbol-grid" role="group" aria-label={t('games.symbolPairs.board')}>
        {deck.map((value, index) => {
          const isFound = found.includes(value);
          const visible = isFound || open.includes(index);
          const blocked = isFound || open.length === 2;
          const symbol = SYMBOLS[value];
          const number = index + 1;
          let label = t('games.symbolPairs.cardHidden', { n: number });
          if (isFound) label = t('games.symbolPairs.cardFound', { n: number, symbol: t(`games.symbolPairs.symbols.${symbol.id}`) });
          else if (visible) label = t('games.symbolPairs.cardOpen', { n: number, symbol: t(`games.symbolPairs.symbols.${symbol.id}`) });

          return (
            <button
              key={index}
              type="button"
              className={`symbol-card${visible ? ' symbol-card--open' : ''}${isFound ? ' symbol-card--found' : ''}`}
              aria-label={label}
              aria-disabled={blocked || undefined}
              onClick={() => reveal(index)}
            >
              <span aria-hidden="true">{visible ? symbol.glyph : 'DC'}</span>
            </button>
          );
        })}
      </div>

      <p role="status" className="game-status">
        {complete ? t('games.symbolPairs.complete', { count: moves }) : ''}
      </p>

      <div>
        <button type="button" className="btn btn--secondary" onClick={restart}>
          {t('games.restart')}
        </button>
      </div>
    </section>
  );
}
