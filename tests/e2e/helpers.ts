import AxeBuilder from '@axe-core/playwright';
import { toEC, toGC } from 'kenat';
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
  const guide = page.getByRole('button', { name: 'Close guide' });
  await expect(guide).toBeVisible();
  await guide.click();
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

export async function fillEatDateTime(page: Page, label: string, wall: string) {
  const [year = 0, month = 0, day = 0] = wall.slice(0, 10).split('-').map(Number);
  const eth = toEC(year, month, day);
  const [hour = 0, minute = 0] = wall.slice(11).split(':').map(Number);
  const field = page.getByRole('group', { name: label, exact: true });
  for (const [name, value] of [
    ['Day', 1],
    ['Year', eth.year],
    ['Month', eth.month],
    ['Day', eth.day],
    ['Hour', hour % 12 || 12],
    ['Minute', minute],
    ['AM / PM', hour >= 12 ? 'PM' : 'AM'],
  ] as const)
    await field.getByRole('combobox', { name, exact: true }).selectOption(String(value));
}

export async function readEatDateTime(page: Page, label: string) {
  const field = page.getByRole('group', { name: label, exact: true });
  const value = (name: string) => field.getByRole('combobox', { name, exact: true }).inputValue();
  const gc = toGC(
    Number(await value('Year')),
    Number(await value('Month')),
    Number(await value('Day')),
  );
  const hour = (Number(await value('Hour')) % 12) + ((await value('AM / PM')) === 'PM' ? 12 : 0);
  const pad = (n: number | string) => String(n).padStart(2, '0');
  return `${gc.year}-${pad(gc.month)}-${pad(gc.day)}T${pad(hour)}:${pad(await value('Minute'))}`;
}
