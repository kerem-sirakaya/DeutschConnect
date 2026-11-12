// Darstellung: Akzentfarben (6 feste Themes, localStorage) + Schwarz-Rot-Gold-Marke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCENTS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  applyAccent,
  normalizeAccent,
  readStoredAccent,
  storeAccent,
} from '../src/lib/theme.js';

const read = (...parts) => readFileSync(new URL(`../${parts.join('/')}`, import.meta.url), 'utf8');
const themesCss = read('src', 'styles', 'themes.css');
const variablesCss = read('src', 'styles', 'variables.css');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
const brokenStorage = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('voll'); }, removeItem() { throw new Error('x'); } };

// --- Kontrast (WCAG 2.1) ---
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function block(id) {
  const sel = id === 'ocean' ? ":root,\n:root[data-accent='ocean'] {" : `:root[data-accent='${id}'] {`;
  const start = themesCss.indexOf(sel);
  assert.ok(start >= 0, `Theme ${id} fehlt in themes.css`);
  const body = themesCss.slice(start, themesCss.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
// Helles Design: Creme-Hintergrund, Karten fast weiß, warm-hellgraue Flächen (variables.css)
const SURFACE = '#fdfcf8', SURFACE2 = '#f2efe7', SURFACE3 = '#e8e4da', BG = '#f8f6f0';

test('genau die sechs vorgegebenen Farben, Ocean Blue ist Standard', () => {
  assert.deepEqual(ACCENTS.map((a) => [a.id, a.swatch]), [
    ['ocean', '#3478CF'], ['forest', '#39866A'], ['lavender', '#9271CD'],
    ['sunset', '#D98946'], ['rose', '#D46B87'], ['midnight', '#47516E'],
  ]);
  assert.equal(DEFAULT_ACCENT, 'ocean');
});

test('gespeicherte Werte werden geprüft – alles Ungültige → Ocean Blue', () => {
  for (const id of ACCENTS.map((a) => a.id)) assert.equal(normalizeAccent(id), id);
  for (const bad of [null, undefined, '', 'OCEAN', ' forest', 'red', '<script>', 42, {}]) assert.equal(normalizeAccent(bad), 'ocean');
  assert.equal(readStoredAccent(fakeStorage()), 'ocean', 'neue Nutzer:innen');
  assert.equal(readStoredAccent(fakeStorage({ [ACCENT_STORAGE_KEY]: 'rose' })), 'rose');
  assert.equal(readStoredAccent(fakeStorage({ [ACCENT_STORAGE_KEY]: 'hacker' })), 'ocean');
  assert.equal(readStoredAccent(brokenStorage), 'ocean', 'gesperrter Speicher');
});

test('Speichern: Auswahl wird gemerkt, Standard entfernt den Eintrag, Fehler stören nicht', () => {
  const storage = fakeStorage();
  assert.equal(storeAccent('lavender', storage), 'lavender');
  assert.equal(storage.data[ACCENT_STORAGE_KEY], 'lavender');
  assert.equal(storeAccent('ocean', storage), 'ocean');
  assert.equal(ACCENT_STORAGE_KEY in storage.data, false);
  assert.equal(storeAccent('ungültig', storage), 'ocean');
  assert.equal(storeAccent('rose', brokenStorage), 'rose');
  const root = { dataset: {} };
  assert.equal(applyAccent('midnight', root), 'midnight');
  assert.equal(root.dataset.accent, 'midnight');
  assert.equal(applyAccent('kaputt', root), 'ocean');
});

test('Tab-Abgleich: nur localStorage zählt, sessionStorage.clear() setzt die Farbe nicht zurück', async () => {
  const { accentFromStorageEvent } = await import('../src/lib/theme.js');
  const local = fakeStorage({ [ACCENT_STORAGE_KEY]: 'rose' });
  const session = fakeStorage();
  assert.equal(accentFromStorageEvent({ key: ACCENT_STORAGE_KEY, newValue: 'forest', storageArea: local }, local), 'forest');
  assert.equal(accentFromStorageEvent({ key: ACCENT_STORAGE_KEY, newValue: 'kaputt', storageArea: local }, local), 'ocean');
  assert.equal(accentFromStorageEvent({ key: null, newValue: null, storageArea: session }, local), null, 'sessionStorage.clear()');
  assert.equal(accentFromStorageEvent({ key: null, newValue: null, storageArea: local }, local), 'rose', 'liest neu statt blind zurückzusetzen');
  assert.equal(accentFromStorageEvent({ key: 'deutschconnect.language', newValue: 'en', storageArea: local }, local), null);
  const emptied = fakeStorage();
  assert.equal(accentFromStorageEvent({ key: null, storageArea: emptied }, emptied), 'ocean', 'localStorage.clear() → Standard');
});

test('index.html setzt die Farbe vor dem ersten Zeichnen – gleiche Liste, gleicher Schlüssel', () => {
  const html = read('index.html');
  const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  assert.ok(html.indexOf('<script>') < html.indexOf('<script type="module"'), 'vor dem App-Skript');
  assert.ok(script.includes(`'${ACCENT_STORAGE_KEY}'`));
  const list = JSON.parse(script.match(/\[([^\]]+)\]\.indexOf/)[0].replace('.indexOf', '').replace(/'/g, '"'));
  assert.deepEqual(list, ACCENTS.map((a) => a.id));
  assert.match(script, /var accent = 'ocean';/);
});

test('alle sechs Themes: vollständige Variablen und ausreichender Kontrast', () => {
  const tokens = ['--color-primary', '--color-primary-strong', '--color-primary-hover', '--color-primary-text',
    '--color-primary-soft', '--color-primary-border', '--color-primary-tile', '--color-nav-active-bg',
    '--color-nav-hover-bg', '--color-on-primary', '--color-on-primary-muted', '--color-focus'];
  for (const { id } of ACCENTS) {
    const t = block(id);
    assert.deepEqual(Object.keys(t).sort(), [...tokens].sort(), id);
    assert.ok(contrast('#ffffff', t['--color-primary-strong']) >= 4.5, `${id}: weiße Schrift auf Button`);
    assert.ok(contrast('#ffffff', t['--color-primary-hover']) >= 4.5, `${id}: weiße Schrift auf Button (Hover)`);
    assert.ok(contrast(t['--color-primary-text'], SURFACE2) >= 4.5, `${id}: Links auf Karten`);
    assert.ok(contrast(t['--color-primary-text'], SURFACE3) >= 4.5, `${id}: Links auf Hover-Flächen`);
    assert.ok(contrast(t['--color-primary-text'], t['--color-primary-tile']) >= 4.5, `${id}: Icons auf Kacheln`);
    assert.ok(contrast(t['--color-primary'], SURFACE) >= 4.5, `${id}: Akzent-Text auf Karten`);
    assert.ok(contrast(t['--color-on-primary'], t['--color-primary']) >= 4.5, `${id}: Begrüßungskarte`);
    assert.ok(contrast(t['--color-on-primary-muted'], t['--color-primary']) >= 4.5, `${id}: Begrüßungskarte (Untertitel)`);
    assert.ok(contrast(t['--color-focus'], BG) >= 3, `${id}: Fokusrahmen`);
  }
});

test('Status- und Markenfarben sind fest und gehören NICHT zu den Themes', () => {
  for (const [name, value] of [['--color-success', '#1d7a46'], ['--color-warning', '#8a5a00'], ['--color-danger', '#b42318'],
    ['--color-danger-strong', '#b42318'], ['--brand-black', '#000000'], ['--brand-red', '#dd0000'], ['--brand-gold', '#ffce00']]) {
    assert.match(variablesCss, new RegExp(`${name}: ${value};`), name);
    assert.ok(!themesCss.includes(`${name}:`), `${name} darf kein Theme-Wert sein`);
  }
  // Akzent nur an EINER Stelle definiert (keine doppelte Theme-Verwaltung)
  assert.doesNotMatch(variablesCss, /--color-primary[\w-]*:/);
  assert.match(read('src', 'main.jsx'), /import '\.\/styles\/variables\.css';\r?\nimport '\.\/styles\/themes\.css';/);
});

test('Marke: Schwarz-Rot-Gold unter dem Schriftzug, Logo-Farben unabhängig vom Theme', () => {
  const layout = read('src', 'styles', 'layout.css');
  assert.match(layout, /linear-gradient\(90deg, var\(--brand-black\)[^;]*var\(--brand-red\)[^;]*var\(--brand-gold\)/);
  // Logo-Kachel = deutsche Flagge: drei waagrechte Streifen (180deg), feste Markenfarben
  assert.match(layout, /\.brand-mark \{[\s\S]*?background: linear-gradient\(180deg, var\(--brand-black\) 0 33\.34%, var\(--brand-red\) 33\.34% 66\.67%, var\(--brand-gold\) 66\.67% 100%\);/);
  assert.match(layout, /\.brand-accent \{\s*color: var\(--brand-blue-text\);/);
  assert.match(read('src', 'components', 'layout', 'TopBar.jsx'), /Connect<span className="brand-accent">\/ED<\/span>/);
});

test('fest eingetragene Blautöne an Akzent-Stellen ersetzt', () => {
  const modules = read('src', 'styles', 'modules.css');
  assert.match(modules, /background: var\(--color-primary\);\n\s*color: var\(--color-on-primary\);/);
  assert.match(read('src', 'styles', 'layout.css'), /\.main-nav__link\.active \{[\s\S]*?background: var\(--color-nav-active-bg\);/);
  assert.match(read('src', 'styles', 'chat.css'), /\.chat-message--own \{[\s\S]*?border-color: var\(--color-primary-border\);/);
});

test('Darstellungs-Komponente (nicht mehr eingebunden): echte Radio-Buttons, Vorschau, Zurücksetzen', () => {
  const ui = read('src', 'components', 'AppearanceSettings.jsx');
  assert.match(ui, /type="radio"/);
  assert.match(ui, /<legend/);
  assert.match(ui, /onClick=\{\(\) => choose\(DEFAULT_ACCENT\)\}/);
  assert.match(ui, /className="accent-preview"/);
  // Farbwahl unter Mein Bereich → Einstellungen entfernt; Farbwahl nur noch über das Paletten-Symbol
  assert.doesNotMatch(read('src', 'pages', 'SettingsPage.jsx'), /<AppearanceSettings/);
  assert.doesNotMatch(read('src', 'components', 'AccentPicker.jsx'), /settings#appearance/);
});

test('alle neuen Texte in drei Sprachen', () => {
  for (const lang of ['de', 'en', 'tr']) {
    const a = JSON.parse(read('src', 'locales', `${lang}.json`)).appearance;
    for (const key of ['title', 'intro', 'accentLegend', 'default', 'preview', 'previewPrimary', 'previewSecondary',
      'previewChip', 'previewLink', 'current', 'localOnly', 'reset']) assert.ok(a?.[key], `${lang}: appearance.${key}`);
    for (const { id } of ACCENTS) assert.ok(a.accents[id], `${lang}: appearance.accents.${id}`);
    assert.match(a.current, /\{name\}/);
  }
});

// ---------- Helles Design + Paletten-Symbol + Kopfzeile ----------
test('helles Design: Creme-Hintergrund, Schrift #111111, Grauwerte lesbar, Statusfarben auf Weiß lesbar', () => {
  assert.match(variablesCss, /--color-bg: #f8f6f0;/);
  assert.match(variablesCss, /--border-width: 2px;/);
  assert.match(variablesCss, /--color-text: #111111;/);
  assert.match(variablesCss, /color-scheme: light;/);
  const v = (name) => variablesCss.match(new RegExp(`${name}: (#[0-9a-f]{6});`))[1];
  for (const [fg, bgs] of [['--color-text', ['--color-bg', '--color-surface-2', '--color-surface-3']],
    ['--color-text-muted', ['--color-bg', '--color-surface-2', '--color-surface-3']],
    ['--color-text-subtle', ['--color-bg', '--color-surface-2']],
    ['--color-success', ['--color-bg']], ['--color-warning', ['--color-bg']], ['--color-danger', ['--color-bg']],
    ['--color-info-text', ['--color-info-bg']], ['--brand-blue-text', ['--color-bg']]]) {
    for (const bg of bgs) assert.ok(contrast(v(fg), v(bg)) >= 4.5, `${fg} auf ${bg}: ${contrast(v(fg), v(bg)).toFixed(2)}`);
  }
  assert.ok(contrast('#ffffff', v('--color-danger-strong')) >= 4.5, 'weiße Schrift auf Lösch-Button');
});

test('keine dunklen Flächen mehr fest im CSS (außer Schachbrett und Medaillen)', () => {
  for (const file of ['base.css', 'layout.css', 'components.css', 'pages.css', 'modules.css', 'chat.css', 'feedback.css']) {
    const css = read('src', 'styles', file);
    for (const dark of ['#091522', '#0c1827', '#172231', '#222e3e', '#263345', '#284263', '#2c425e', 'rgba(12, 24, 39', 'rgba(34, 46, 62']) {
      assert.ok(!css.includes(dark), `${file} enthält noch ${dark}`);
    }
  }
});

test('Paletten-Symbol oben rechts: gleiche Farben, gemeinsamer Zustand mit den Einstellungen', () => {
  const picker = read('src', 'components', 'AccentPicker.jsx');
  assert.match(picker, /ACCENTS\.map/);
  assert.match(picker, /onChange=\{\(\) => chooseAccent\(option\.id\)\}/);
  assert.match(picker, /aria-expanded=\{open\}/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(read('src', 'components', 'layout', 'TopBar.jsx'), /<AccentPicker \/>\s*<LanguageSwitcher \/>/);
  assert.match(read('src', 'components', 'AppearanceSettings.jsx'), /const accent = useAccent\(\);/);
  assert.match(read('src', 'hooks', 'useAccent.js'), /useSyncExternalStore\(subscribeAccent, getAccent/);
  for (const lang of ['de', 'en', 'tr']) {
    const a = JSON.parse(read('src', 'locales', `${lang}.json`)).appearance;
    assert.ok(a.paletteButton && a.moreSettings, lang);
  }
});

test('gemeinsamer Zustand: Anwenden benachrichtigt alle Anzeigen', async () => {
  const { subscribeAccent } = await import('../src/lib/theme.js');
  const seen = [];
  const stop = subscribeAccent((a) => seen.push(a));
  applyAccent('forest', { dataset: {} });
  applyAccent('ungültig', { dataset: {} });
  stop();
  applyAccent('rose', { dataset: {} });
  assert.deepEqual(seen, ['forest', 'ocean']);
});

test('Kopfzeile auf schmalen Handys: kurze Kennzeichen, Logo bleibt', () => {
  const layout = read('src', 'styles', 'layout.css');
  assert.match(layout, /@media \(max-width: 559px\) \{[\s\S]*?\.topbar--staging \.topbar__brand-text/);
  // Grundregel (Kurztext aus) steht VOR dem Handy-Block – sonst würde sie ihn überschreiben
  assert.ok(layout.indexOf('.demo-pill__short {\n  display: none;') < layout.indexOf('@media (max-width: 559px)')
    || layout.indexOf('.demo-pill__short {\r\n  display: none;') < layout.indexOf('@media (max-width: 559px)'));
  assert.match(layout, /\.demo-pill__short \{\s*display: inline;/);
  assert.match(read('src', 'components', 'layout', 'TopBar.jsx'), /<span className="demo-pill__short" aria-hidden="true">STG<\/span>/);
});
