import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadStagingEnv } from './scripts/stagingEnv.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (mode !== 'staging') return { plugins: [react()] };

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
    envDir: fileURLToPath(new URL('./scripts/no-env/', import.meta.url)),
    define: Object.fromEntries(
      Object.entries(report.env).map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)]),
    ),
  };
});
