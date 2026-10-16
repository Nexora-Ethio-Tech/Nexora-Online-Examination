import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { loadBackendEnvironment } from './src/common/db/database-config';

loadBackendEnvironment();

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec,e2e-spec}.ts'],
    // Legacy suites share seeded accounts; races use independent requests within a suite.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [swc.vite()],
});
