import { test, expect } from '@playwright/test';
import { accessible, login } from './helpers';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
});

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed') {
    await page.screenshot({ path: info.outputPath('final-screen.png'), fullPage: true });
  }
});

test('keyboard login, invalid credentials and student routes remain accessible', async ({
  page,
}) => {
  await accessible(page);
  await page.getByLabel('User ID', { exact: true }).fill('DEMO-STUDENT');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await login(page, 'STUDENT');
  await page.getByRole('link', { name: 'Skip to main content' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await accessible(page);
  for (const name of ['Official results', 'Practice', 'Register replacement browser', 'My exams']) {
    await page.getByRole('link', { name, exact: true }).click();
    await accessible(page);
  }
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Mathematics · preparation' }) });
  await card.getByRole('link').click();
  await page.getByRole('button', { name: 'Download encrypted paper' }).click();
  await expect(page.getByRole('heading', { name: 'Encrypted paper saved' })).toBeVisible();
  await expect(page.getByText(/No verified readiness report/)).toBeVisible();
  await accessible(page);
});

test('student answers offline, navigates questions and receives a confirmed submission', async ({
  page,
  context,
}) => {
  await login(page, 'STUDENT');
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'English · current window' }) });
  await card.getByRole('link').click();
  await page.getByRole('button', { name: 'Download encrypted paper' }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByText(/1 answers saved on this device/)).toBeVisible();
  await page.getByRole('button', { name: 'Show question numbers' }).click();
  await expect(page.getByRole('button', { name: 'Hide question numbers' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByText(/2 answers saved on this device/)).toBeVisible();
  await context.setOffline(false);
  await accessible(page);
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByRole('button', { name: 'Confirm submission' }).click();
  await expect(page.getByRole('heading', { name: 'Submitted', exact: true })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await accessible(page);
});

test('teacher import and review through admin approval, scheduling and extra time', async ({
  page,
}) => {
  await login(page, 'TEACHER');
  await page.getByRole('button', { name: 'New exam', exact: true }).click();
  await page.getByLabel('Exam title', { exact: true }).fill('Browser algebra');
  await page.getByLabel('Class and subject').selectOption('demo-math-10a');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page
    .getByLabel('Question template')
    .setInputFiles('public/templates/nexora-questions.xlsx');
  await page.getByRole('button', { name: 'Upload and prepare questions' }).click();
  await expect(page.getByText(/ready · 2 parsed · 2 AI suggestions ready/i)).toBeVisible();
  await page.getByRole('tab', { name: 'Review questions' }).click();
  for (const id of ['MATH-001', 'MATH-002']) {
    const section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: id, exact: true }) });
    await section
      .getByLabel('Review note / flag resolution')
      .fill('Checked definition and answer.');
    await section.getByRole('checkbox').check();
    await section.getByRole('button', { name: 'Save question review' }).click();
    await expect(section.getByRole('button', { name: 'Save question review' })).toBeEnabled();
  }
  await accessible(page);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/Submitted for administrator approval/)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'ADMIN');
  await page.getByRole('link', { name: 'Review and schedule' }).click();
  await page.getByLabel('Review comment or required corrections').fill('Reviewed and approved.');
  await page.getByRole('checkbox', { name: /I reviewed the questions/ }).check();
  await page.getByRole('button', { name: 'Approve paper', exact: true }).click();
  const prep = page.getByLabel('Preparation date and time (EAT)', { exact: true });
  const release = page.getByLabel('Planned results date and time (EAT)', { exact: true });
  const originalPrep = await prep.inputValue();
  const originalRelease = await release.inputValue();
  await prep.fill('2020-01-01T10:00');
  await expect(prep).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Preparation must be later than the current EAT time shown above.'),
  ).toBeVisible();
  await prep.fill(originalPrep);
  await release.fill(originalPrep);
  await expect(release).toHaveAttribute('aria-invalid', 'true');
  await release.fill(originalRelease);
  await page.getByRole('checkbox', { name: /I checked the EAT/ }).check();
  await page.getByRole('button', { name: 'Confirm schedule', exact: true }).click();
  await page.getByRole('link', { name: 'Manage extra time' }).click();
  await page.getByRole('button', { name: 'Edit extra time for Samira' }).click();
  await page.getByLabel(/Extra minutes/).fill('15');
  await page.getByLabel('Reason for the change').fill('Approved allowance.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save extra time', exact: true }).click();
  await expect(page.getByText(/Last change: 0 → 15/)).toBeVisible();
  await accessible(page);
});

test('workspace navigation stays reachable after scrolling and with enlarged text', async ({
  page,
}) => {
  await login(page, 'STUDENT');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const navigation = page.getByRole('link', { name: 'Navigation', exact: true });
  await expect(navigation).toBeInViewport();
  await navigation.focus();
  await page.keyboard.press('Enter');
  const workspace = page.getByRole('navigation', { name: 'Workspace', exact: true });
  await expect(workspace).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(workspace.getByRole('link').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/student\/device/);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await accessible(page);
  await navigation.click();
  await expect(workspace).toBeFocused();
  expect(
    await workspace.evaluate((element) => {
      const header = document.querySelector('header');
      return (
        !!header && element.getBoundingClientRect().top >= header.getBoundingClientRect().bottom
      );
    }),
  ).toBe(true);
});

test('teacher can recover from a rejected custom import without submitting an empty paper', async ({
  page,
}) => {
  await login(page, 'TEACHER');
  await page.getByRole('button', { name: 'New exam', exact: true }).click();
  await page.getByLabel('Exam title', { exact: true }).fill('Import retry');
  await page.getByLabel('Class and subject').selectOption('demo-math-10a');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByLabel('Question template').setInputFiles({
    name: 'edited.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('Synthetic invalid document'),
  });
  await page.getByRole('button', { name: 'Upload and prepare questions' }).click();
  await expect(
    page.getByText(/Demo accepts only the unchanged downloadable examples/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  await accessible(page);
  await page
    .getByLabel('Question template')
    .setInputFiles('public/templates/nexora-questions.xlsx');
  await page.getByRole('button', { name: 'Upload and prepare questions' }).click();
  await expect(page.getByText(/ready · 2 parsed · 2 AI suggestions ready/i)).toBeVisible();
});

test('administrator navigation, recovery and monitor screens are accessible', async ({ page }) => {
  await login(page, 'ADMIN');
  for (const name of [
    'School setup',
    'Practice release',
    'Recovery review',
    'Official results',
    'Live exams',
    'Exam approvals',
  ]) {
    await page.getByRole('link', { name, exact: true }).click();
    await accessible(page);
  }
  await page.getByRole('link', { name: 'Live exams', exact: true }).click();
  await page.getByRole('button', { name: 'Load synthetic monitoring example' }).click();
  await expect(
    page.getByRole('heading', { name: 'Device replacement', exact: true }),
  ).toBeVisible();
  await accessible(page);
  await page.getByRole('link', { name: 'Back to sitting monitor' }).click();
  await expect(page.getByText(/Ready \(last reported\)/)).toBeVisible();
  await accessible(page);
});

test('synthetic recovery acceptance retains evidence and produces an exportable report', async ({
  page,
}) => {
  await login(page, 'ADMIN');
  await page.getByRole('link', { name: 'Recovery review', exact: true }).click();
  await page.getByRole('button', { name: 'Load synthetic recovery example' }).click();
  await page.getByRole('combobox', { name: /^Decision/ }).selectOption('accept');
  await page.getByLabel('Decision reason').fill('Verified the retained synthetic upload.');
  await page.getByRole('checkbox', { name: /I reviewed the upload/ }).check();
  await accessible(page);
  await page.getByRole('button', { name: 'Confirm acceptance' }).click();
  await page.getByRole('link', { name: 'Review sitting results' }).click();
  await expect(page.getByRole('button', { name: 'Download sitting CSV' })).toBeEnabled();
  await accessible(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sitting CSV' }).click();
  expect((await download).suggestedFilename()).toBe('nexora-official-results.csv');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.results-print')).toBeVisible();
  await expect(page.locator('header')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  const release = new Date(Date.now() + 3 * 3600000 - 60000).toISOString().slice(0, 16);
  await page.getByLabel('Results release date and time (EAT)').fill(release);
  await page.getByLabel('Publication reason').fill('Reviewed synthetic marks and recovery.');
  await page.getByRole('checkbox', { name: /I reviewed the marks/ }).check();
  await page.getByRole('button', { name: 'Approve publication' }).click();
  await expect(page.getByRole('heading', { name: 'Publication approved' })).toBeVisible();
  await page.getByRole('link', { name: 'Practice release', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Enable practice', exact: true }).check();
  await page.getByLabel('Practice release date and time (EAT)').fill(release);
  await page
    .getByLabel('Reason for practice settings')
    .fill('Release the reviewed synthetic paper.');
  await page.getByRole('checkbox', { name: /I checked the paper/ }).check();
  await page.getByRole('button', { name: 'Save practice settings' }).click();
  await expect(page.getByText(/Practice available/)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'STUDENT');
  await page.getByRole('link', { name: 'Official results', exact: true }).click();
  await accessible(page);
  await page.getByRole('link', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start new practice' }).click();
  for (let index = 0; index < 2; index++) {
    await page.getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.getByText(/Your first answer is saved/)).toBeVisible();
    if (index === 0) await page.getByRole('button', { name: 'Next question', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Complete practice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice completed' })).toBeVisible();
  await accessible(page);
});
