import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineBuild } from './scripts/offline-build.mjs';

export default defineConfig({ plugins: [react(), offlineBuild()] });
