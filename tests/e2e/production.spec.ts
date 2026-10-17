import { test, expect } from '@playwright/test';
import { accessible, navigateWorkspace } from './helpers';
import { submissionFixture } from './submission-fixture';

test('a failed feature download shows recoverable guidance', async ({ page, context }) => {
  const fixture = await submissionFixture(context);
  await context.route('**/assets/RunnerPage-*.js', (route) => route.abort('connectionfailed'));
  await page.goto(`/student/attempts/${fixture.attemptId}`);
  await expect(page.getByRole('heading', { name: 'This page couldn’t open' })).toBeVisible();
  await expect(page.getByText(/Saved exam work has not been cleared/)).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await accessible(page);
  await context.unroute('**/assets/RunnerPage-*.js');
  await page.getByRole('button', { name: 'Reload this page' }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
});

test('lost final response retains the exact submission across a production reload', async ({
  page,
  context,
}) => {
  const fixture = await submissionFixture(context);
  await page.goto(`/student/attempts/${fixture.attemptId}`);
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await expect(page.getByRole('radio', { name: '4', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Review and submit', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pending upload', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry submission', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Submitted successfully', exact: true }),
  ).toHaveCount(0);
  const original = fixture.sent[0];
  expect(original?.body).toContain('option-b');
  expect(original?.key).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry submission', exact: true })).toBeEnabled();
  await expect(page.getByRole('radio')).toHaveCount(0);
  fixture.restore();
  await page.getByRole('button', { name: 'Retry submission', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submitted successfully', exact: true }),
  ).toBeVisible();
  expect(fixture.sent.length).toBeGreaterThanOrEqual(2);
  for (const sent of fixture.sent) expect(sent).toEqual(original);
  await accessible(page);
});

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
  const cachedAssets = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('nexora-shell-'));
    const name = names[0];
    if (!name) throw new Error('Offline shell cache is missing.');
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedAssets.some((path) => path.includes('RunnerPage-'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Reconnect to recover your exam' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText(/Do not clear site storage/)).toBeVisible();
  expect(
    await page.evaluate(async (paths) => {
      for (const path of paths) {
        if (!(await fetch(path)).ok) return false;
      }
      return true;
    }, cachedAssets),
  ).toBe(true);
  await accessible(page);
});

test('production role guard and expired session return the student to sign-in', async ({
  page,
  context,
}) => {
  let expired = false;
  const requested: string[] = [];
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    requested.push(path);
    const serverNow = new Date().toISOString();
    if (expired)
      return route.fulfill({
        status: 401,
        json: {
          code: 'AUTH_REQUIRED',
          message: 'Synthetic expired session',
          details: [],
          requestId: 'expiry-test',
        },
      });
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          user: {
            id: 'synthetic-student',
            loginId: 'SYNTHETIC',
            displayName: 'Synthetic student',
            role: 'student',
          },
          school: {
            id: 'synthetic-school',
            name: 'Synthetic school',
            timezone: 'Africa/Addis_Ababa',
          },
          csrfToken: 'synthetic-csrf',
          serverNow,
        },
      });
    if (path.endsWith('/me/exams'))
      return route.fulfill({ json: { items: [], nextCursor: null, serverNow } });
    return route.fulfill({
      status: 500,
      json: {
        code: 'UNEXPECTED_REQUEST',
        message: 'Unexpected synthetic request',
        details: [],
        requestId: 'unexpected',
      },
    });
  });
  await page.goto('/admin/school');
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole('heading', { name: 'My exams', exact: true })).toBeVisible();
  expect(requested.some((path) => path.includes('/admin/'))).toBe(false);
  await expect(page.getByRole('link', { name: 'School setup', exact: true })).toHaveCount(0);
  expired = true;
  await navigateWorkspace(page, 'Official results');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
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
