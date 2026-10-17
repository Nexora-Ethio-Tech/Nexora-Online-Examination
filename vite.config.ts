/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { offlineShell } from './scripts/offline-shell';

export default defineConfig(({ command, mode }) => {
  const buildId = randomUUID();
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const serverEnv = loadEnv(mode, process.cwd(), 'API_PROXY_TARGET');
  const apiTarget =
    process.env.API_PROXY_TARGET?.trim() ||
    serverEnv.API_PROXY_TARGET?.trim() ||
    'http://127.0.0.1:3000';
  // Keep API requests out of Vite's SPA fallback, including local preview.
  const apiProxy = {
    '/api/v1': { target: apiTarget, changeOrigin: false },
  };
  if (
    command === 'build' &&
    (mode === 'demo' || (process.env.VITE_USE_MOCKS ?? env.VITE_USE_MOCKS) === 'true')
  ) {
    throw new Error(
      'Production builds must disable mocks. Use npm run dev:demo for the local demo.',
    );
  }
  return {
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
    plugins: [react(), tailwindcss(), offlineShell(buildId)],
    define: { __APP_BUILD__: JSON.stringify(buildId) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        cn: path.resolve(__dirname, './src/lib/utils.ts'),
      },
    },
    test: {
      // Bound simultaneous jsdom/transform work so lazy route imports do not starve UI checks.
      maxWorkers: 4,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
