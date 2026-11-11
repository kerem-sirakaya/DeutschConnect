import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadStagingEnv } from './scripts/stagingEnv.mjs';
import { checkPublicBundle, loadPublicEnv } from './scripts/publicEnv.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
// Ordner OHNE .env-Dateien: So lädt Vite weder .env.local (alt: Live) noch andere Dateien still dazu.
const emptyEnvDir = fileURLToPath(new URL('./scripts/no-env/', import.meta.url));
const defineEnv = (env) =>
  Object.fromEntries(Object.entries(env).map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)]));

/** Nach dem Bauen: freigegebener Host vorhanden, altes Live-Projekt / STAGING-Kennzeichen / Secret nicht. */
function verifyPublicBundle() {
  return {
    name: 'connected-verify-public-bundle',
    generateBundle(_options, bundle) {
      const code = Object.values(bundle)
        .map((file) => (file.type === 'chunk' ? file.code : ''))
        .join('\n');
      const problems = checkPublicBundle(code);
      if (problems.length) this.error(`Öffentlicher Build abgebrochen:\n  - ${problems.join('\n  - ')}`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  if (mode === 'public') {
    // ÖFFENTLICHER BUILD (npm run build bzw. build:public): nur das freigegebene Supabase-Projekt,
    // kein STAGING-Kennzeichen. Werte aus Umgebungsvariablen (Hoster: Pflicht) oder lokal aus
    // .env.staging.local – nie aus .env.local.
    const report = loadPublicEnv(root);
    if (!report.ok) {
      throw new Error(`Öffentlicher Build abgebrochen:\n  - ${report.problems.join('\n  - ')}`);
    }
    console.info(
      `[Öffentlich] Supabase-Projekt: ${report.host} · Quelle: ${report.source}${report.hosted ? ' (gehostet)' : ''} (.env.local wird NICHT geladen)`,
    );
    return {
      plugins: [react(), verifyPublicBundle()],
      envDir: emptyEnvDir,
      define: defineEnv(report.env),
    };
  }

  if (mode !== 'staging') {
    // „vite preview“ zeigt nur den fertigen Ordner dist/ an – lädt selbst keine Zugangsdaten.
    if (isPreview) return { plugins: [react()] };
    // Kein Build ohne geprüften Modus: „vite build“ ohne --mode würde .env.local (altes Live-Projekt) laden.
    if (command === 'build') {
      throw new Error(
        `Build im Modus "${mode}" abgebrochen: Bitte "npm run build" (öffentlicher Build, Modus public) verwenden. ` +
          'Ein Build mit .env.local (altes Live-Projekt) ist nicht vorgesehen.',
      );
    }
    // ENTWICKLUNG (npm run dev / npx vite): dieselben Werte und dieselbe Prüfung wie der öffentliche Build –
    // nur das freigegebene Supabase-Projekt, nie .env.local. KEIN STAGING-Kennzeichen (VITE_DC_TARGET=development);
    // die Warnung steht stattdessen hier im Terminal.
    if (mode !== 'development') {
      throw new Error(`Start im Modus "${mode}" abgebrochen: Bitte "npm run dev" oder "npm run dev:staging" verwenden.`);
    }
    const report = loadPublicEnv(root);
    if (!report.ok) {
      throw new Error(`Entwicklungsstart abgebrochen:\n  - ${report.problems.join('\n  - ')}`);
    }
    console.info(
      `[Entwicklung] Supabase-Projekt: ${report.host} · Quelle: ${report.source} (.env.local wird NICHT geladen)\n` +
        '[Entwicklung] ACHTUNG: Das ist dieselbe Datenbank wie die öffentliche Website – Änderungen sehen echte Nutzer:innen.',
    );
    return {
      plugins: [react()],
      envDir: emptyEnvDir,
      define: defineEnv({ ...report.env, VITE_DC_TARGET: 'development' }),
    };
  }

  // STAGING (npm run dev:staging): NUR .env.staging.local verwenden.
  // Vite würde sonst zusätzlich .env.local (LIVE) laden und fehlende Werte still daraus nehmen.
  // Deshalb: envDir auf einen Ordner ohne .env-Dateien und die geprüften Werte selbst einsetzen.
  const report = loadStagingEnv(root);
  if (!report.ok) {
    throw new Error(`Staging-Start abgebrochen:\n  - ${report.problems.join('\n  - ')}`);
  }
  console.info(`[Staging] Supabase-Projekt: ${report.stagingHost} (.env.local wird NICHT geladen)`);
  return {
    plugins: [react()],
    envDir: emptyEnvDir,
    define: defineEnv(report.env),
  };
});
