import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10000,
    browserName: 'chromium',
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'demo-desktop',
      testMatch: /demo\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:5178', viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'demo-mobile',
      testMatch: /demo\.spec\.ts/,
      use: {
        baseURL: 'http://127.0.0.1:5178',
        viewport: { width: 360, height: 800 },
        hasTouch: true,
      },
    },
    {
      name: 'production-mobile',
      testMatch: /production\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4178', viewport: { width: 360, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:demo -- --host 127.0.0.1 --port 5178 --strictPort',
      url: 'http://127.0.0.1:5178',
      reuseExistingServer: false,
    },
    {
      command: 'npm exec vite preview -- --host 127.0.0.1 --port 4178 --strictPort',
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: false,
    },
  ],
});
