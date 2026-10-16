import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec,e2e-spec}.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    swc.vite(),
  ],
});
