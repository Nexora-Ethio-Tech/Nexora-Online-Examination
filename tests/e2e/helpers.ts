import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export async function login(page: Page, role: 'STUDENT' | 'TEACHER' | 'ADMIN') {
  await page.getByLabel('User ID', { exact: true }).fill(`DEMO-${role}`);
  await page.getByLabel('Password', { exact: true }).fill('NexoraDemo!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (role === 'ADMIN') {
    await page.getByLabel('Verification code').fill('123456');
    await page.getByRole('button', { name: /Verify/i }).click();
  }
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
export async function accessible(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}
