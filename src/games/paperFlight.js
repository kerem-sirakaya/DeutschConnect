// Spiellogik „Papierflug“ (Paper Flight).
//
// Urheber: Kerem – übernommen aus der Codex-Version (Branch `codex-version-1.0`,
// Datei `src/games/arcade.js`: `freshFlight`, `flightDifficulty`, `stepFlight`).
// Tempo, Auftrieb und Schwerkraft bleiben gleich; im mobilen Hochformat wächst die Höhe.
// Feste Zahlen sind als benannte Konstanten herausgezogen. Reine Funktionen ohne React
// → mit `npm test` prüfbar. Keine Speicherung, kein Bestwert.
//
// Koordinaten: 640 × 300 am Desktop, im mobilen Hochformat höher; y wächst nach unten.

export const FIELD = { width: 640, height: 300 };
export const PLANE_X = 72; // linke Kante des Flugzeugs
export const PIPE_WIDTH = 35;
export const GAP_HALF = 65; // Lücke zwischen den Säulen = 130 px, bei jedem Tempo gleich
const GAP_VARIATION = 60;
const GAP_TOP_MARGIN = 85;
const GAP_BOTTOM_MARGIN = 95;
const PIPE_SPACING = 304; // ungefährer Abstand zwischen zwei Säulen (px)
const FLAP_VELOCITY = -240; // Auftrieb beim Tippen (nach oben)
const GRAVITY = 680;
const MAX_STEP = 0.035; // längster Zeitschritt in Sekunden (verhindert „Sprünge“ bei Rucklern)

/** Startzustand einer neuen Runde. */
export function freshFlight(height = FIELD.height) {
  return {
    time: 0,
    height,
    y: height / 2,
    velocity: 0,
    pipes: [{ x: 650, gap: height / 2, counted: false }],
    score: 0,
    over: false,
    spawn: 1.8,
  };
}

/** Positionen beim Größen-/Orientierungswechsel proportional in die neue Welt übertragen. */
export function resizeFlight(scene, height) {
  const previousHeight = scene.height ?? FIELD.height;
  if (height === previousHeight) return scene;
  const scale = height / previousHeight;
  return {
    ...scene,
    height,
    y: scene.y * scale,
    pipes: scene.pipes.map((pipe) => ({ ...pipe, gap: pipe.gap * scale })),
  };
}

/** Tempo steigt langsam von 160 auf höchstens 260 px/s; Säulen kommen so, dass der Abstand gleich bleibt. */
export function flightDifficulty(time) {
  const speed = 160 + 100 * (1 - Math.exp(-Math.max(0, time) / 80));
  return { speed, spawn: PIPE_SPACING / speed };
}

/**
 * Ein Zeitschritt.
 * @param s      aktueller Zustand
 * @param delta  vergangene Zeit in Sekunden
 * @param flap   wurde seit dem letzten Schritt getippt?
 * @param random austauschbar für Tests
 */
export function stepFlight(s, delta, flap, random = Math.random) {
  if (s.over) return s;
  const dt = Math.min(MAX_STEP, Math.max(0, delta));
  const height = s.height ?? FIELD.height;
  const difficulty = flightDifficulty(s.time);
  const velocity = flap ? FLAP_VELOCITY : s.velocity + GRAVITY * dt;
  const y = s.y + velocity * dt;

  // Säulen nach links schieben; jede Säule, die das Flugzeug hinter sich lässt, gibt 1 Punkt.
  let score = s.score;
  const pipes = s.pipes
    .map((pipe) => {
      const x = pipe.x - difficulty.speed * dt;
      const passed = x + PIPE_WIDTH < 85;
      if (!pipe.counted && passed) score++;
      return { ...pipe, x, counted: pipe.counted || passed };
    })
    .filter((pipe) => pipe.x > -40);

  let spawn = s.spawn - dt;
  if (spawn <= 0) {
    // Auch in einer hohen Welt müssen aufeinanderfolgende Lücken erreichbar bleiben.
    // Bei 300 px Höhe ergibt sich weiterhin exakt der bisherige Bereich 85–205.
    const previousGap = pipes.at(-1)?.gap ?? height / 2;
    const center = Math.min(
      Math.max(previousGap, GAP_TOP_MARGIN + GAP_VARIATION),
      height - GAP_BOTTOM_MARGIN - GAP_VARIATION,
    );
    pipes.push({ x: 650, gap: center - GAP_VARIATION + random() * GAP_VARIATION * 2, counted: false });
    spawn = difficulty.spawn;
  }

  // Vorbei, wenn das Flugzeug oben/unten den Rand oder eine Säule berührt.
  const hitsEdge = y < 10 || y > height - 10;
  const hitsPipe = pipes.some(
    (pipe) => pipe.x < 103 && pipe.x + PIPE_WIDTH > 77 && (y - 10 < pipe.gap - GAP_HALF || y + 10 > pipe.gap + GAP_HALF),
  );
  return { time: s.time + dt, height, y, velocity, pipes, spawn, score, over: hitsEdge || hitsPipe };
}
