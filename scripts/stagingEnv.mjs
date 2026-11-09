/**
 * Staging-Zugang (DeutschConnect-Staging) sicher prüfen – OHNE Keys auszugeben.
 *
 *   node scripts/stagingEnv.mjs        → Prüfbericht (nur Hostnamen, keine Keys)
 *   npm run dev:staging                → App mit Staging-Projekt starten (vite.config.js nutzt
 *                                        loadStagingEnv und lädt .env.local dann GAR NICHT)
 *
 * Regeln:
 *   * .env.staging.local braucht VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.
 *   * Nur der publishable Key – ein secret/service_role Key führt zum Abbruch.
 *   * Datenbank-Passwörter / Service-Keys haben in der Datei nichts zu suchen (Abbruch).
 *   * Die Staging-URL muss sich von der URL in .env.local (Live) unterscheiden (Abbruch).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGING_FILE = '.env.staging.local';

/** Einfacher .env-Parser (KEY=VALUE, # Kommentare, optionale Anführungszeichen). */
export function parseEnv(text) {
  const result = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

const FORBIDDEN_KEYS = /SERVICE|SECRET|PASSWORD|DB_|DATABASE_URL|PG/i;
const looksSecret = (key) => typeof key === 'string' && (key.startsWith('sb_secret_') || key.includes('service_role'));

/**
 * Prüft Staging- gegen Live-Werte. Gibt { ok, problems, stagingHost, env } zurück.
 * env enthält NUR die erlaubten Variablen für die App.
 */
export function checkStagingEnv(staging, live = {}) {
  const problems = [];
  const url = staging.VITE_SUPABASE_URL;
  const key = staging.VITE_SUPABASE_PUBLISHABLE_KEY;
  const stagingHost = hostOf(url);
  if (!url) problems.push('VITE_SUPABASE_URL fehlt');
  else if (!stagingHost || !stagingHost.endsWith('.supabase.co')) problems.push('VITE_SUPABASE_URL ist keine Supabase-Projekt-URL');
  if (!key) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY fehlt');
  else if (looksSecret(key)) problems.push('Der Key ist ein GEHEIMER Key – nur den publishable Key verwenden');
  for (const name of Object.keys(staging)) {
    if (FORBIDDEN_KEYS.test(name)) problems.push(`Variable ${name} gehört nicht in die Datei (keine Passwörter/Service-Keys)`);
  }
  const liveHost = hostOf(live.VITE_SUPABASE_URL);
  if (stagingHost && liveHost && stagingHost === liveHost) {
    problems.push('Staging-URL ist identisch mit .env.local (LIVE-Projekt) – Abbruch');
  }
  return {
    ok: problems.length === 0,
    problems,
    stagingHost,
    differsFromLive: Boolean(stagingHost && liveHost && stagingHost !== liveHost),
    env: {
      VITE_SUPABASE_URL: url ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: key ?? '',
      VITE_ENABLE_SIGNUP: staging.VITE_ENABLE_SIGNUP === 'true' ? 'true' : 'false',
      VITE_DC_TARGET: 'staging',
    },
  };
}

/** Liest beide Dateien (Live nur zum Vergleich der Hostnamen) und prüft. */
export function loadStagingEnv(root) {
  const stagingPath = process.env.DC_STAGING_ENV_FILE || join(root, STAGING_FILE);
  if (!existsSync(stagingPath)) {
    return { ok: false, problems: [`${STAGING_FILE} nicht gefunden`], stagingHost: null, env: null };
  }
  const staging = parseEnv(readFileSync(stagingPath, 'utf8'));
  const livePath = join(root, '.env.local');
  const live = existsSync(livePath) ? parseEnv(readFileSync(livePath, 'utf8')) : {};
  return checkStagingEnv(staging, live);
}

// Direkt aufgerufen: Prüfbericht ohne Keys
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = loadStagingEnv(resolve(fileURLToPath(import.meta.url), '..', '..'));
  console.log(`Staging-Projekt (Host): ${report.stagingHost ?? '–'}`);
  console.log(`Unterscheidet sich von .env.local (Live): ${report.differsFromLive ? 'ja' : 'nein/unklar'}`);
  if (report.ok) console.log('OK – Staging-Zugang ist gültig. Start mit: npm run dev:staging');
  else for (const problem of report.problems) console.log(`FEHLER: ${problem}`);
  process.exit(report.ok ? 0 : 1);
}
