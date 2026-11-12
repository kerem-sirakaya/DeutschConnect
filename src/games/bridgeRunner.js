// Spiellogik „Brückenläufer“ (Bridge Runner).
//
// Urheber: Kerem – übernommen aus der Codex-Version (Branch `codex-version-1.0`,
// Datei `src/games/arcade.js`: `freshRunner`, `stepRunner`).
// Die Rechenregeln sind unverändert; für DeutschConnect nur lesbarer formatiert und die
// festen Zahlen als benannte Konstanten herausgezogen. Reine Funktionen ohne React
// → mit `npm test` prüfbar. Keine Speicherung, kein Bestwert.
//
// Koordinaten: Spielfeld 640 × 300 (SVG-viewBox). `y` ist hier die Sprunghöhe über dem
// Boden (0 = steht auf der Brücke), Hindernisse kommen von rechts.

export const GROUND_Y = 270; // Höhe der Brücke im Spielfeld
export const RUNNER_X = 66; // linke Kante der Spielfigur
export const RUNNER_SIZE = 32;
const JUMP_VELOCITY = 510;
const GRAVITY = 1450;
const BASE_SPEED = 235; // px/s, steigt pro Sekunde um 3 bis höchstens +100
const MAX_STEP = 0.035; // längster Zeitschritt in Sekunden (verhindert „Sprünge“ bei Rucklern)

/** Startzustand einer neuen Runde. */
export function freshRunner() {
  return { time: 0, y: 0, velocity: 0, obstacles: [{ x: 670, width: 25, height: 40 }], score: 0, over: false, spawn: 1.5 };
}

/** Lauftempo: 235 px/s am Anfang, höchstens 335 px/s. */
export function runnerSpeed(time) {
  return BASE_SPEED + Math.min(100, time * 3);
}

/**
 * Ein Zeitschritt.
 * @param s      aktueller Zustand
 * @param delta  vergangene Zeit in Sekunden
 * @param jump   wurde seit dem letzten Schritt getippt? (springt nur vom Boden aus)
 * @param random austauschbar für Tests
 */
export function stepRunner(s, delta, jump, random = Math.random) {
  if (s.over) return s;
  const dt = Math.min(MAX_STEP, Math.max(0, delta));
  const speed = runnerSpeed(s.time);

  let velocity = jump && s.y === 0 ? JUMP_VELOCITY : s.velocity;
  velocity -= GRAVITY * dt;
  const y = Math.max(0, s.y + velocity * dt);
  if (!y) velocity = 0; // gelandet

  const obstacles = s.obstacles
    .map((obstacle) => ({ ...obstacle, x: obstacle.x - speed * dt }))
    .filter((obstacle) => obstacle.x > -50);

  let spawn = s.spawn - dt;
  if (spawn <= 0) {
    obstacles.push({ x: 660, width: 23, height: 32 + random() * 20 });
    spawn = 1.25 + random() * 0.7;
  }

  // Vorbei, wenn die Figur ein Hindernis berührt (3 px Spielraum oben).
  const over = obstacles.some(
    (obstacle) => obstacle.x < RUNNER_X + RUNNER_SIZE && obstacle.x + obstacle.width > RUNNER_X && y < obstacle.height - 3,
  );
  // Punkte = überlebte Zeit (10 Punkte pro Sekunde)
  return { time: s.time + dt, y, velocity, obstacles, spawn, score: Math.floor((s.time + dt) * 10), over };
}
