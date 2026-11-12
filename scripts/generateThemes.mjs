// Erzeugt src/styles/themes.css: pro Akzentfarbe alle Varianten mit geprüftem Kontrast (WCAG 2.1).
import { writeFileSync } from 'node:fs';

const THEMES = [
  ['ocean', 'Ocean Blue', '#3478CF'],
  ['forest', 'Forest Green', '#39866A'],
  ['lavender', 'Lavender', '#9271CD'],
  ['sunset', 'Sunset Orange', '#D98946'],
  ['rose', 'Rose', '#D46B87'],
  ['midnight', 'Midnight', '#47516E'],
];
// Helles Design (variables.css): Creme-Hintergrund, Karten fast weiß, Flächen warm-hellgrau
const BG = '#f8f6f0', SURFACE = '#fdfcf8', SURFACE2 = '#f2efe7', SURFACE3 = '#e8e4da', WHITE = '#ffffff';

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = (h) => {
  const [r, g, b] = hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex([h, s, l]) {
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) return rgbToHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbToHex([f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((v) => v * 255));
}
// Helligkeit (HSL) in Schritten ändern, bis die Bedingung erfüllt ist – Farbton bleibt
function adjust(hex, dir, ok) {
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  for (let i = 0; i < 200 && !ok(hslToHex([h, s, l])); i++) l = Math.max(0, Math.min(1, l + dir * 0.005));
  return hslToHex([h, s, l]);
}
const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v * t + hexToRgb(b)[i] * (1 - t)));
const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(', ')}, ${a})`;

const report = [];
let css = `/*
 * Akzentfarben (Darstellung → Farbe). ERZEUGT mit scripts/generateThemes.mjs – Werte nicht von Hand ändern.
 * Pro Farbe werden aus dem Grundton Varianten mit geprüftem Kontrast (WCAG 2.1) abgeleitet:
 *   --color-primary         Akzent für Rahmen, Markierungen, Akzent-Text, Begrüßungskarte (≥ 4.5:1 auf Weiß/Flächen)
 *   --color-primary-strong  Hintergrund von Buttons mit weißer Schrift      (weiß ≥ 4.5:1)
 *   --color-primary-hover   Button bei Hover                                 (weiß ≥ 4.5:1)
 *   --color-primary-text    Links, aktive Navigation, Icons                  (≥ 6:1 auf Weiß, ≥ 5.5:1 auf Hover-Flächen)
 *   --color-primary-soft    zarte Fläche (ausgewählte Chips, eigene Nachrichten)
 *   --color-primary-border  halbtransparente Rahmenfarbe
 *   --color-primary-tile    Icon-Kacheln
 *   --color-nav-active-bg / --color-nav-hover-bg   Hauptnavigation
 *   --color-on-primary / --color-on-primary-muted  Schrift auf --color-primary (Begrüßungskarte)
 *   --color-focus           Fokusrahmen (≥ 3.5:1 auf dem Hintergrund)
 * Status-Farben (Erfolg, Warnung, Fehler) und die Markenfarben (Logo, Schwarz-Rot-Gold) sind NICHT betroffen.
 * Ocean Blue ist der Standard (:root ohne data-accent).
 */
`;
for (const [id, name, base] of THEMES) {
  const primary = adjust(base, -1, (c) => contrast(c, SURFACE) >= 4.6 && contrast(c, SURFACE2) >= 4.5);
  const strong = adjust(base, -1, (c) => contrast(c, WHITE) >= 4.8);
  const hover = adjust(strong, -1, (c) => contrast(c, WHITE) >= contrast(strong, WHITE) + 0.8); // auf Hell: Hover dunkler
  const text = adjust(base, -1, (c) => contrast(c, WHITE) >= 6.0 && contrast(c, SURFACE3) >= 5.5 && contrast(c, mix(base, WHITE, 0.14)) >= 5.0);
  const focus = adjust(base, -1, (c) => contrast(c, BG) >= 3.5);
  // Schrift auf der Akzentfläche (Begrüßungskarte): weiß, Untertitel leicht getönt – beide ≥ 4.5:1
  const ink = '#ffffff';
  const inkMuted = adjust(mix(WHITE, primary, 0.86), +1, (c) => contrast(c, primary) >= 4.5);
  const t = {
    '--color-primary': primary, '--color-primary-strong': strong, '--color-primary-hover': hover,
    '--color-primary-text': text, '--color-primary-soft': rgba(primary, 0.1), '--color-primary-border': rgba(primary, 0.38),
    '--color-primary-tile': mix(base, WHITE, 0.14), '--color-nav-active-bg': mix(base, WHITE, 0.1),
    '--color-nav-hover-bg': mix(base, SURFACE2, 0.08), '--color-on-primary': ink, '--color-on-primary-muted': inkMuted,
    '--color-focus': focus,
  };
  const sel = id === 'ocean' ? `:root,\n:root[data-accent='ocean']` : `:root[data-accent='${id}']`;
  css += `\n/* ${name} – Grundton ${base} */\n${sel} {\n` + Object.entries(t).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}\n';
  report.push({
    id, primaryOnSurface: contrast(primary, SURFACE).toFixed(2), whiteOnButton: contrast(WHITE, strong).toFixed(2),
    whiteOnHover: contrast(WHITE, hover).toFixed(2), linkOnSurface2: contrast(text, SURFACE2).toFixed(2),
    linkOnSurface3: contrast(text, SURFACE3).toFixed(2), linkOnTile: contrast(text, mix(base, WHITE, 0.14)).toFixed(2), focusOnBg: contrast(focus, BG).toFixed(2),
    inkOnCard: contrast(ink, primary).toFixed(2), inkMutedOnCard: contrast(inkMuted, primary).toFixed(2),
  });
}
// Aufruf: node scripts/generateThemes.mjs src/styles/themes.css
writeFileSync(process.argv[2], css);
console.table(report);
