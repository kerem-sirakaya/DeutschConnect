// Zeit-Fortschritt für die Reaktionsspiele (ohne React → mit `npm test` prüfbar).
//
// Kerems Game Loop (Codex-Version) hat pro Bild genau einen Schritt gerechnet und ihn auf
// höchstens 0,035 s gekappt. Auf langsamen Handys (unter ~28 Bildern pro Sekunde) lief das
// Spiel dadurch in Zeitlupe. Hier wird die vergangene Zeit stattdessen in Teilschritten
// nachgerechnet; die Spielregeln (`step`) selbst bleiben unverändert.

/** Länge eines Physik-Teilschritts (s). Bei 60 Bildern pro Sekunde genau ein Teilschritt pro Bild. */
export const SUBSTEP = 1 / 60;
/** Höchstens so viel Spielzeit wird pro Bild nachgeholt (s) – nach langen Hängern lieber kurz verlangsamen als „springen“. */
export const MAX_CATCH_UP = 0.1;

/**
 * Rechnet `seconds` Spielzeit mit `step` nach.
 * Die Eingabe (`tapped`) zählt nur im ersten Teilschritt – also wie bisher einmal pro Bild.
 * Bei 0 Sekunden wird trotzdem ein Schritt gerechnet, damit ein Tippen sofort wirkt.
 */
export function advance(scene, seconds, tapped, step) {
  let remaining = Math.min(Math.max(0, seconds), MAX_CATCH_UP);
  let next = scene;
  let input = tapped;
  do {
    const dt = Math.min(remaining, SUBSTEP);
    next = step(next, dt, input);
    input = false;
    remaining -= dt;
  } while (remaining > 1e-9 && !next.over);
  return next;
}
