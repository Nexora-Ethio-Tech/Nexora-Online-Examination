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
  await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
}
export async function accessible(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // Audit the settled interface, not intermediate fade/slide opacity.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

export async function navigateWorkspace(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .filter({ visible: true })
    .getByRole('link', { name, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
