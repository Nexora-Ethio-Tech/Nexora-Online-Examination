import { test, expect } from '@playwright/test';
import { accessible } from './helpers';

test('built shell survives offline reload without exposing a private attempt', async ({
  page,
  context,
}) => {
  await context.route('**/api/v1/**', (route) => route.abort('internetdisconnected'));
  await page.goto('/student/attempts/retained-example');
  await expect(page.getByRole('heading', { name: 'Reconnect to recover your exam' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Reconnect to recover your exam' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText(/Do not clear site storage/)).toBeVisible();
  await accessible(page);
});

test('production auth failures show retry guidance without demo credentials', async ({
  page,
  context,
}) => {
  await context.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'UNAVAILABLE',
        message: 'Synthetic server outage',
        details: [],
        requestId: 'e2e',
      },
    }),
  );
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'We couldn’t check your session' })).toBeVisible();
  await expect(page.getByText(/Development demo/)).toHaveCount(0);
  await accessible(page);
});
