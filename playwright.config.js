import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep browser binaries out of OneDrive (its directory locks interrupt downloads).
process.env.PLAYWRIGHT_BROWSERS_PATH ||= join(tmpdir(),'deutschconnect-playwright');
const live=process.env.DC_E2E_LIVE==='1';
if(live){try{process.loadEnvFile('.env.e2e.local');}catch{/* supplied by environment */}}
const port=live?4173:4180;
export default defineConfig({
  testDir:'./tests/e2e',
  testMatch:live?'live.spec.js':'local.spec.js',
  outputDir:live?'test-results/live':'test-results/local',
  timeout:60000,
  expect:{timeout:10000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:live?[['list']]:[['list'],['json',{outputFile:'test-results/results.json'}]],
  use:{baseURL:'http://127.0.0.1:'+port,serviceWorkers:'block',actionTimeout:10000,trace:'off',screenshot:live?'off':'only-on-failure'},
  projects:live?[{name:'live-chromium',use:{...devices['Desktop Chrome']}}]:[
    {name:'desktop',use:{...devices['Desktop Chrome']}},
    {name:'mobile',use:{...devices['Pixel 7']}},
  ],
  webServer:{
    command:`node node_modules/vite/bin/vite.js --configLoader native --host 127.0.0.1 --port ${port} --strictPort`,
    url:'http://127.0.0.1:'+port,reuseExistingServer:false,
    env:live?{}:{VITE_SUPABASE_URL:'http://127.0.0.1:4181',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_e2e'},
  },
});
