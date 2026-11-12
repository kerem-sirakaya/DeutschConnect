// Zeichen-Hilfen für die Reaktionsspiele (Canvas 2D).
//
// Die Formen (Himmel, Hügel, Wolkenlinie) stammen aus Kerems SVG-Zeichnung in der
// Codex-Version (Branch `codex-version-1.0`, `src/games/ArcadeGame.jsx`) und wurden
// 1:1 in Canvas-Befehle übersetzt. Gezeichnet wird in Spielfeld-Koordinaten (640 × 300);
// die Umrechnung auf die echte Bildschirmgröße macht `setTransform` in ArcadeGame.jsx.
//
// Warum Canvas statt SVG? Bei SVG ändert React in jedem Bild Attribute vieler Elemente;
// der Browser muss dafür jedes Mal Styles neu berechnen und die Grafik neu aufbauen.
// Canvas zeichnet nur Pixel – ohne DOM-Änderungen.

export const ARCADE_FIELD = { width: 640, height: 300 };

/**
 * Farben aus unseren CSS-Variablen (variables.css) lesen – einmal beim Einbauen/Größenwechsel,
 * nicht in jedem Bild.
 */
export function readArcadeColors(element) {
  const style = getComputedStyle(element);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    sky: read('--color-bg-elevated', '#0c1827'),
    hill: read('--color-surface-2', '#222e3e'),
    line: read('--color-border-strong', '#4b5b70'),
    primary: read('--color-primary', '#4b91ea'),
    primaryText: read('--color-primary-text', '#85b9ff'),
    text: read('--color-text', '#f1f4f8'),
  };
}

/** Abgerundetes Rechteck; ältere Browser ohne `roundRect` bekommen ein normales Rechteck. */
export function fillRoundRect(ctx, x, y, width, height, radius) {
  if (width <= 0 || height <= 0) return;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  else ctx.rect(x, y, width, height);
  ctx.fill();
}

/** Himmel, Hügel und Wolkenlinie (gleich für beide Spiele). */
export function drawBackground(ctx, colors) {
  ctx.fillStyle = colors.sky;
  ctx.fillRect(0, 0, ARCADE_FIELD.width, ARCADE_FIELD.height);

  // SVG: M0 250 Q160 185 320 250 T640 250 V300 H0Z  (T = gespiegelter Kontrollpunkt → 480 315)
  ctx.fillStyle = colors.hill;
  ctx.beginPath();
  ctx.moveTo(0, 250);
  ctx.quadraticCurveTo(160, 185, 320, 250);
  ctx.quadraticCurveTo(480, 315, 640, 250);
  ctx.lineTo(640, 300);
  ctx.lineTo(0, 300);
  ctx.closePath();
  ctx.fill();

  // SVG: M0 110 Q160 30 320 110 T640 110  (gespiegelter Kontrollpunkt → 480 190)
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.quadraticCurveTo(160, 30, 320, 110);
  ctx.quadraticCurveTo(480, 190, 640, 110);
  ctx.stroke();
}
