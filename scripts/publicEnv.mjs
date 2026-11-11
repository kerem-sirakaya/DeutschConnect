/**
 * Öffentlicher Build (npm run build = npm run build:public) – Zugangsdaten sicher bestimmen, OHNE Keys auszugeben.
 *
 * Entscheidung (2026-11-11): Die öffentliche Connect/ED-Website nutzt das bisherige
 * Staging-Supabase-Projekt. Das alte Live-Projekt wird NICHT verwendet.
 *
 * Woher kommen die Werte? (.env.local wird NIE gelesen)
 *   * Gehosteter Build (Umgebungsvariable CI, VERCEL oder NETLIFY gesetzt): NUR Umgebungsvariablen,
 *     alle drei Pflicht: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_ENABLE_SIGNUP.
 *     Keine Datei als Ersatz.
 *   * Lokal: Umgebungsvariablen, falls URL oder Key gesetzt sind – sonst die Datei .env.staging.local
 *     (wie bei npm run dev:staging).
 *   VITE_ENABLE_SIGNUP muss immer AUSDRÜCKLICH true oder false sein (keine stille Voreinstellung).
 *
 * Der Build bricht ab, wenn
 *   * URL oder publishable Key fehlen,
 *   * die URL nicht GENAU das freigegebene Projekt ist (oder auf das alte Live-Projekt zeigt),
 *   * der Key geheim aussieht (secret/service_role) oder kein publishable Key ist,
 *   * VITE_ENABLE_SIGNUP fehlt oder einen anderen Wert als true/false hat.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGING_FILE, hostOf, parseEnv } from './stagingEnv.mjs';

/** Das einzige Supabase-Projekt, gegen das der öffentliche Build bauen darf. */
export const APPROVED_PUBLIC_HOST = 'ycyqdqmiawhzzrduxupe.supabase.co';
/** Altes Live-Projekt – darf in keinem öffentlichen Build vorkommen. */
export const FORBIDDEN_PROJECT_REFS = ['zjwygmvzezjofoxaofhv'];

const looksSecret = (key) => key.startsWith('sb_secret_') || key.includes('service_role');

/** Prüft die Werte. Gibt { ok, problems, host, env } zurück – env enthält nur erlaubte App-Variablen. */
export function checkPublicEnv(values = {}) {
  const problems = [];
  const url = (values.VITE_SUPABASE_URL ?? '').trim();
  const key = (values.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const signup = (values.VITE_ENABLE_SIGNUP ?? '').trim();
  const host = hostOf(url);

  if (!url) problems.push('VITE_SUPABASE_URL fehlt');
  else if (!host) problems.push('VITE_SUPABASE_URL ist keine gültige URL');
  else {
    if (!url.startsWith('https://')) problems.push('VITE_SUPABASE_URL muss mit https:// beginnen');
    if (FORBIDDEN_PROJECT_REFS.some((ref) => url.toLowerCase().includes(ref))) {
      problems.push('VITE_SUPABASE_URL zeigt auf das ALTE LIVE-Projekt – Abbruch');
    } else if (host !== APPROVED_PUBLIC_HOST) {
      problems.push(`VITE_SUPABASE_URL ist nicht das freigegebene Projekt (${APPROVED_PUBLIC_HOST})`);
    }
  }
  if (!key) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY fehlt');
  else if (looksSecret(key)) problems.push('Der Key ist ein GEHEIMER Key – nur den publishable Key verwenden');
  else if (!key.startsWith('sb_publishable_')) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY ist kein publishable Key (sb_publishable_…)');
  if (!signup) problems.push('VITE_ENABLE_SIGNUP fehlt (ausdrücklich true oder false angeben)');
  else if (signup !== 'true' && signup !== 'false') problems.push('VITE_ENABLE_SIGNUP muss true oder false sein');

  return {
    ok: problems.length === 0,
    problems,
    host,
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      VITE_ENABLE_SIGNUP: signup,
      VITE_DC_TARGET: 'public',
    },
  };
}

/** Läuft der Build bei einem Hoster / in CI? (CI=false bzw. 0 zählt nicht) */
export function isHostedBuild(environment = process.env) {
  return ['CI', 'VERCEL', 'NETLIFY'].some((name) => {
    const value = String(environment[name] ?? '').trim().toLowerCase();
    return value !== '' && value !== 'false' && value !== '0';
  });
}

/**
 * Liest die Werte (Umgebungsvariablen ODER – nur lokal – .env.staging.local; nie .env.local) und prüft sie.
 * Gibt zusätzlich `source` ('environment' | STAGING_FILE) und `hosted` zurück.
 */
export function loadPublicEnv(root, environment = process.env) {
  const hosted = isHostedBuild(environment);
  if (hosted) {
    const report = checkPublicEnv(environment);
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_ENABLE_SIGNUP']
      .filter((name) => !String(environment[name] ?? '').trim())
      .map((name) => `Gehosteter Build: ${name} muss beim Hoster als Umgebungsvariable gesetzt sein`);
    const problems = [...new Set([...missing, ...report.problems])];
    return { ...report, ok: problems.length === 0, problems, source: 'environment', hosted };
  }
  const fromEnvironment = environment.VITE_SUPABASE_URL || environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (fromEnvironment) {
    return { ...checkPublicEnv(environment), source: 'environment', hosted };
  }
  const stagingPath = join(root, STAGING_FILE);
  if (!existsSync(stagingPath)) {
    return { ok: false, problems: [`Weder Umgebungsvariablen noch ${STAGING_FILE} gefunden`], host: null, env: null, source: null, hosted };
  }
  return { ...checkPublicEnv(parseEnv(readFileSync(stagingPath, 'utf8'))), source: STAGING_FILE, hosted };
}

/**
 * Letzte Sicherung NACH dem Bauen: Der fertige Code muss den freigegebenen Host enthalten
 * und darf keinen verbotenen Projekt-Ref und kein STAGING-Kennzeichen enthalten.
 * `code` = zusammengefügter Text aller erzeugten JS-Dateien.
 */
export function checkPublicBundle(code) {
  const problems = [];
  if (!code.includes(APPROVED_PUBLIC_HOST)) problems.push('Der freigegebene Supabase-Host fehlt im Build');
  for (const ref of FORBIDDEN_PROJECT_REFS) {
    if (code.includes(ref)) problems.push('Der Build enthält das ALTE LIVE-Projekt');
  }
  if (/sb_secret_[A-Za-z0-9]/.test(code)) problems.push('Der Build enthält einen geheimen Key');
  if (code.includes('demo-pill--staging')) problems.push('Der Build enthält das STAGING-Kennzeichen');
  return problems;
}

// Direkt aufgerufen: Prüfbericht ohne Keys
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = loadPublicEnv(resolve(fileURLToPath(import.meta.url), '..', '..'));
  console.log(`Quelle: ${report.source ?? '–'}${report.hosted ? ' (gehosteter Build)' : ''}`);
  console.log(`Supabase-Projekt (Host): ${report.host ?? '–'}`);
  if (report.ok) console.log('OK – öffentlicher Build ist erlaubt. Bauen mit: npm run build');
  else for (const problem of report.problems) console.log(`FEHLER: ${problem}`);
  process.exit(report.ok ? 0 : 1);
}
