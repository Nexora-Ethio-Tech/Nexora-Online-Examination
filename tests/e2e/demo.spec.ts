import { fillEatDateTime, readEatDateTime } from './helpers';
import { test, expect } from '@playwright/test';
import { accessible, login, navigateWorkspace } from './helpers';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
});

test('portal management: class cards, unused record deletion and reopenable onboarding', async ({
  page,
}) => {
  await login(page, 'ADMIN');
  await page.getByRole('button', { name: 'Portal guide', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Portal onboarding' })).toBeVisible();
  await page.getByRole('button', { name: 'Next tip' }).click();
  await expect(page.getByRole('button', { name: 'Open this area' })).toHaveCount(0);
  const verifyPlacement = async () => {
    await expect
      .poll(async () => {
        const target = await page.locator('.nexora-tour-target').boundingBox();
        const popup = await page
          .getByRole('complementary', { name: 'Portal onboarding' })
          .boundingBox();
        return (
          !!target &&
          !!popup &&
          (popup.x >= target.x + target.width ||
            popup.x + popup.width <= target.x ||
            popup.y >= target.y + target.height ||
            popup.y + popup.height <= target.y)
        );
      })
      .toBe(true);
  };
  await verifyPlacement();
  const bubble = page.getByRole('complementary', { name: 'Portal onboarding' });
  for (const corner of [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
  ]) {
    await expect(bubble).toHaveCSS(corner, '32px');
  }
  await expect(page.locator('[data-tour-tail]')).toBeVisible();
  await expect(page.locator('[data-tail-fill]')).toHaveAttribute('d', /^M .+ Z$/);
  await page.screenshot({
    path: test.info().outputPath('tour-bubble-' + page.viewportSize()?.width + '.png'),
  });
  if (await page.getByRole('button', { name: 'Navigation', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Navigation', exact: true }).click();
    await verifyPlacement();
  }
  await page
    .getByRole('link', { name: 'School setup', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByText('Import students into a class', { exact: true })).toBeVisible();
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute('data-tour', 'school-roster');
  await verifyPlacement();
  await accessible(page);
  await page.getByRole('button', { name: 'Close guide' }).click();
  await navigateWorkspace(page, 'School setup');
  await page.getByRole('button', { name: 'Add class', exact: true }).click();
  await page.getByLabel('Grade', { exact: true }).fill('8');
  await page.getByLabel('Section', { exact: true }).fill('Z');
  await page.getByLabel('Academic year', { exact: true }).fill('2026');
  await expect(page.getByLabel('Reason', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save class', exact: true }).click();
  await page.getByRole('button', { name: 'Delete class: Grade 8 Z', exact: true }).click();
  const removal = page.getByRole('alertdialog', { name: 'Delete class “Grade 8 Z”?' });
  await removal.getByLabel('Reason', { exact: true }).fill('Unused test class');
  await removal.getByRole('checkbox').check();
  await removal.getByRole('button', { name: 'Delete class', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grade 8 Z' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a class to manage its students' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Samira', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Grade 10 A/ }).click();
  await expect(page.getByRole('heading', { name: 'Samira', exact: true })).toBeVisible();
  await accessible(page);
});

test('speech bubble follows teacher controls as pages and tabs change', async ({ page }) => {
  await login(page, 'TEACHER');
  await page.getByRole('button', { name: 'Portal guide', exact: true }).click();
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute('data-tour', 'new-exam');
  await page.getByRole('button', { name: 'Next tip' }).click();
  const mobile = (page.viewportSize()?.width ?? 1366) < 1024;
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute(
    mobile ? 'data-tour-navigation' : 'href',
    mobile ? 'true' : '/teacher',
  );
  // Each isolated demo starts without teacher papers. Create the draft through the UI.
  await page.getByRole('button', { name: 'Close guide' }).click();
  await page.getByRole('button', { name: 'New exam', exact: true }).click();
  await page.getByLabel('Exam title', { exact: true }).fill('Tour controls rehearsal');
  await page.getByLabel('Class and subject').selectOption('demo-math-10a');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.getByRole('button', { name: 'Portal guide', exact: true }).click();
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute(
    'data-tour',
    'question-template',
  );
  await page.getByRole('button', { name: 'Close guide' }).click();
  await page.getByRole('tab', { name: 'Exam details', exact: true }).click();
  await page.getByRole('button', { name: 'Portal guide', exact: true }).click();
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute('data-tour', 'questions-tab');
  await page.getByRole('tab', { name: 'Import', exact: true }).click();
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute(
    'data-tour',
    'question-template',
  );
  await page.getByRole('button', { name: 'Next tip' }).click();
  await expect(page.locator('.nexora-tour-target')).toHaveAttribute('data-tour', 'review-tab');
  await page.screenshot({ path: test.info().outputPath('teacher-bubble.png') });
  await accessible(page);
});

test('portal management: cancel import, bulk review and remove a draft', async ({ page }) => {
  await login(page, 'TEACHER');
  await page.getByRole('button', { name: 'New exam', exact: true }).click();
  await page.getByLabel('Exam title', { exact: true }).fill('Lifecycle paper');
  await page.getByLabel('Class and subject').selectOption('demo-math-10a');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page
    .getByLabel('Question template')
    .setInputFiles('public/templates/nexora-questions.xlsx');
  await page.getByRole('button', { name: 'Upload and prepare questions' }).click();
  await page.getByRole('button', { name: 'Remove / cancel import' }).click();
  await page.getByLabel('Note (optional)').fill('Selected the wrong file');
  await page.getByRole('button', { name: 'Confirm cancel import' }).click();
  await expect(page.getByRole('button', { name: 'Remove / cancel import' })).toHaveCount(0);
  await page
    .getByLabel('Question template')
    .setInputFiles('public/templates/nexora-questions.xlsx');
  await page.getByRole('button', { name: 'Upload and prepare questions' }).click();
  await expect(
    page.getByText(/Ready to review · 2 questions found · 2 AI suggestions ready/i),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Review questions' }).click();
  await page
    .getByRole('checkbox', {
      name: 'I checked the questions without warnings and their answer keys.',
    })
    .check();
  await page.getByRole('button', { name: /Confirm all questions without warnings/ }).click();
  await expect(page.getByText('1 of 2 questions reviewed and saved')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Submit for approval', exact: true }),
  ).toBeDisabled();
  await accessible(page);
  await page.getByRole('button', { name: 'Delete / archive draft' }).click();
  await page.getByLabel('Note (optional)').fill('Finished synthetic test');
  await page.getByRole('checkbox', { name: 'I understand and want to remove this draft.' }).check();
  await page.getByRole('button', { name: 'Confirm draft removal' }).click();
  await expect(page.getByRole('heading', { name: 'My exam papers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lifecycle paper', exact: true })).toHaveCount(0);
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
    await navigateWorkspace(page, name);
    await accessible(page);
  }
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Mathematics · preparation' }) });
  await card.getByRole('link').click();
  await page.getByRole('button', { name: 'Download exam' }).click();
  await expect(page.getByRole('heading', { name: 'Exam saved for this demo' })).toBeVisible();
  await expect(
    page.getByText(/your school has not been notified that you are ready/),
  ).toBeVisible();
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
  await page.getByRole('button', { name: 'Download exam' }).click();
  await page.getByRole('button', { name: 'Start exam', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0);
  await expect(page.getByTestId('exam-watermark')).toContainText('NEXORA');
  await expect(page.getByTestId('exam-watermark')).toContainText('DEMO-STUDENT');
  await context.setOffline(true);
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByText(/1 answers saved on this device/)).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Mark for review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove review mark' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const numbers = page.getByRole('region', { name: 'Question navigator' });
  const question = page.locator('fieldset').first();
  const numberBox = await numbers.boundingBox();
  const questionBox = await question.boundingBox();
  expect(numberBox && questionBox && numberBox.y < questionBox.y).toBeTruthy();
  await page.screenshot({ path: test.info().outputPath('active-exam.png'), fullPage: true });
  await expect(page.locator('.exam-question-text').first()).toHaveCSS('user-select', 'none');
  await expect(page.getByTestId('exam-watermark')).toHaveCSS('pointer-events', 'none');
  const surfaceBox = await page.locator('.exam-question-surface').boundingBox();
  const watermarkBox = await page.getByTestId('exam-watermark').boundingBox();
  expect(
    surfaceBox && watermarkBox && watermarkBox.height >= (page.viewportSize()?.height ?? 0),
  ).toBeTruthy();
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByTestId('exam-watermark').locator('pattern')).toHaveCount(2);
  await expect(page.getByTestId('exam-watermark')).toBeVisible();
  await page.emulateMedia({ forcedColors: 'none' });
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
  await expect(
    page.getByRole('heading', { name: 'Submitted successfully', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await accessible(page);
});

test('teacher import and review through admin approval, scheduling and extra time', async ({
  page,
}, testInfo) => {
  await login(page, 'TEACHER');
  await page.getByRole('button', { name: 'New exam', exact: true }).click();
  await page.getByLabel('Exam title', { exact: true }).fill('Browser algebra');
  await page.getByLabel('Class and subject').selectOption('demo-math-10a');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page
    .getByLabel('Question template')
    .setInputFiles('public/templates/nexora-questions.xlsx');
  await page.getByRole('button', { name: 'Upload and prepare questions' }).click();
  await expect(
    page.getByText(/Ready to review · 2 questions found · 2 AI suggestions ready/i),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Review questions' }).click();
  for (const id of ['MATH-001', 'MATH-002']) {
    await page.getByRole('button', { name: new RegExp(`^Review ${id}:`) }).click();
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
  await page
    .locator('#question-editor')
    .screenshot({ path: testInfo.outputPath('compact-question-review.png') });
  await accessible(page);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('button', { name: 'Confirm send for approval' }).click();
  await expect(page.getByText(/Submitted for administrator approval/)).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await login(page, 'ADMIN');
  await page.getByRole('link', { name: 'Review and schedule' }).click();
  await page
    .getByLabel('Review note (optional for approval; required when returning)')
    .fill('Reviewed and approved.');
  await page.getByRole('checkbox', { name: /I reviewed the questions/ }).check();
  await page.getByRole('button', { name: 'Approve paper', exact: true }).click();
  const prep = page.getByRole('group', { name: 'Preparation date and time (EAT)', exact: true });
  const release = page.getByRole('group', {
    name: 'Planned results date and time (EAT)',
    exact: true,
  });
  const originalPrep = await readEatDateTime(page, 'Preparation date and time (EAT)');
  const originalRelease = await readEatDateTime(page, 'Planned results date and time (EAT)');
  for (const field of [prep, release]) {
    const toggle = field.getByRole('button', { name: /Close calendar/ });
    if (await toggle.isVisible()) await toggle.click();
    await expect(field.getByRole('combobox', { name: 'Day', exact: true })).toBeVisible();
    await expect(field.getByText(/Gregorian equivalent:/)).toBeVisible();
  }
  const prepBox = await prep.boundingBox();
  const releaseBox = await release.boundingBox();
  const durationBox = await page
    .getByLabel('Preparation duration (minutes)', { exact: true })
    .locator('..')
    .boundingBox();
  if (!prepBox || !releaseBox || !durationBox) throw new Error('Schedule fields missing');
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    expect(Math.abs(prepBox.y - releaseBox.y)).toBeLessThan(5);
    expect(releaseBox.x).toBeGreaterThan(prepBox.x + prepBox.width);
  } else {
    expect(releaseBox.y).toBeGreaterThan(durationBox.y + durationBox.height);
    expect(releaseBox.y - durationBox.y - durationBox.height).toBeLessThan(45);
  }
  await prep
    .locator('..')
    .locator('..')
    .screenshot({ path: testInfo.outputPath('compact-schedule.png') });
  await expect(prep).toContainText('Ethiopian calendar');
  await expect(prep).toContainText('AM/PM');
  await accessible(page);
  await fillEatDateTime(page, 'Preparation date and time (EAT)', '2020-01-01T10:00');
  await expect(prep).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Preparation must be later than the current EAT time shown above.'),
  ).toBeVisible();
  await fillEatDateTime(page, 'Preparation date and time (EAT)', originalPrep);
  await fillEatDateTime(page, 'Planned results date and time (EAT)', originalPrep);
  await expect(release).toHaveAttribute('aria-invalid', 'true');
  await fillEatDateTime(page, 'Planned results date and time (EAT)', originalRelease);
  await page.getByRole('checkbox', { name: /I checked the EAT/ }).check();
  await page.getByRole('button', { name: 'Confirm schedule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assign invigilators' })).toBeVisible();
  await page.getByRole('button', { name: 'Assign invigilator', exact: true }).first().click();
  const assignmentReason = page.getByLabel('Assignment change reason');
  if (await assignmentReason.count())
    await assignmentReason.fill('Assigned to supervise this sitting.');
  await page.getByRole('button', { name: 'Confirm assignment change' }).click();
  await expect(page.locator('#main-content').getByText('Staff assignment saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke assignment' })).toBeVisible();
  await page.getByRole('link', { name: 'Manage extra time' }).click();
  await page.getByRole('button', { name: 'Edit extra time for Samira' }).click();
  await page.getByLabel(/Extra minutes/).fill('15');
  await page.getByLabel('Reason for the change').fill('Approved allowance.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save extra time', exact: true }).click();
  await expect(page.getByText(/Last change: 0 → 15/)).toBeVisible();
  await accessible(page);
});

test('workspace navigation supports a keyboard drawer on mobile and a desktop sidebar', async ({
  page,
}) => {
  await login(page, 'STUDENT');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const navigation = page.getByRole('button', { name: 'Navigation', exact: true });
  const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
  if (mobile) {
    await expect(navigation).toBeInViewport();
    await navigation.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await accessible(page);
    await page.keyboard.press('Escape');
    await expect(navigation).toBeFocused();
    await navigation.click();
  }
  const workspace = page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .filter({ visible: true });
  await workspace.getByRole('link', { name: 'Register replacement browser' }).click();
  await expect(page).toHaveURL(/\/student\/device/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await accessible(page);
  if (mobile) {
    await navigation.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await accessible(page);
  } else {
    await expect(workspace).toBeInViewport();
  }
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
  await expect(
    page.getByText(/Ready to review · 2 questions found · 2 AI suggestions ready/i),
  ).toBeVisible();
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
    await navigateWorkspace(page, name);
    await accessible(page);
  }
  await navigateWorkspace(page, 'Live exams');
  await page.getByRole('button', { name: 'Load synthetic monitoring example' }).click();
  await expect(
    page.getByRole('heading', { name: 'Device replacement', exact: true }),
  ).toBeVisible();
  await accessible(page);
  await expect(page.getByRole('heading', { name: 'Activity summary' })).toBeVisible();
  const activity = page.getByRole('region', { name: 'Grouped browser activity' });
  await expect(activity.locator('details')).toHaveCount(4);
  await activity.locator('summary').first().click();
  await expect(activity.locator('details').first()).toHaveAttribute('open', '');
  await page.getByText('Advanced incident analysis', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Inspection / print action', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/recommended/i)).toHaveCount(0);
  await accessible(page);
  await page.getByLabel('Reason for supervision decision').fill('Verify the student in person.');
  await page.getByRole('button', { name: 'Suspend exam attempt', exact: true }).click();
  await expect(
    page.getByText('Suspended — administrator approval required', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Reason for supervision decision').fill('Identity verified.');
  await page.getByRole('button', { name: 'Approve resuming exam', exact: true }).click();
  await expect(page.getByText('Not suspended', { exact: true })).toBeVisible();
  await accessible(page);
  await page.getByRole('link', { name: 'Back to sitting monitor' }).click();
  await expect(page.getByText(/Ready \(last reported\)/)).toBeVisible();
  await accessible(page);
});

test('synthetic recovery acceptance retains evidence and produces an exportable report', async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();
  await login(page, 'ADMIN');
  await navigateWorkspace(page, 'Recovery review');
  await page.getByRole('button', { name: 'Load synthetic recovery example' }).click();
  await page.getByRole('combobox', { name: /^Decision/ }).selectOption('accept');
  await page.getByLabel('Decision reason').fill('Verified the retained synthetic upload.');
  await page.getByRole('checkbox', { name: /I reviewed the upload/ }).check();
  await accessible(page);
  await page.getByRole('button', { name: 'Confirm acceptance' }).click();
  await page.clock.fastForward(120000);
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
  await expect(page.getByRole('heading', { name: 'Automatic result release' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve publication' })).toHaveCount(0);
  await navigateWorkspace(page, 'Practice release');
  await page.getByRole('checkbox', { name: 'Enable practice', exact: true }).check();
  await fillEatDateTime(page, 'Practice release date and time (EAT)', release);
  await page.getByLabel('Note (optional)').fill('Release the reviewed synthetic paper.');
  await page.getByRole('checkbox', { name: /I checked the paper/ }).check();
  await page.getByRole('button', { name: 'Save practice settings' }).click();
  await expect(page.getByText(/Practice available/)).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await login(page, 'STUDENT');
  await navigateWorkspace(page, 'Official results');
  await accessible(page);
  await navigateWorkspace(page, 'Practice');
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

test('school admin enables AI exam drafts and teachers retain upload and review controls', async ({
  page,
}) => {
  await login(page, 'ADMIN');
  await navigateWorkspace(page, 'School setup');
  await page.getByRole('tab', { name: 'Settings' }).click();
  const aiToggle = page.getByRole('switch', { name: 'AI exam generation' });
  await expect(aiToggle).toBeEnabled();
  await expect(aiToggle).not.toBeChecked();
  await aiToggle.click();
  await expect(aiToggle).toBeChecked();
  await accessible(page);
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await login(page, 'TEACHER');
  await page.getByRole('button', { name: 'New exam' }).click();
  await page.getByLabel('Exam title').fill('AI algebra draft');
  await page.getByLabel('Class and subject').selectOption('demo-math-10a');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name: 'Generate an exam with AI' })).toBeVisible();
  await expect(page.getByLabel('Question template')).toBeVisible();
  await page.getByLabel('Topics and syllabus coverage').fill('Linear equations and geometry');
  await page.getByLabel('Multiple-choice questions', { exact: true }).fill('1');
  await page.getByLabel('True/false questions', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Generate exam draft', exact: true }).click();
  await expect(page.getByText('AI-generated exam (synthetic demo)', { exact: true })).toBeVisible();
  await expect(page.getByText('2 questions · 2 total marks · 0 reviewed · Pass 50%')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  await accessible(page);
  await page.getByRole('tab', { name: 'Review questions' }).click();
  await expect(page.getByRole('textbox', { name: 'Question', exact: true })).toHaveValue(
    /Synthetic example/,
  );
  await expect(
    page.getByLabel(
      'I checked the question, answer key, topic and explanation, and resolved any flags.',
    ),
  ).not.toBeChecked();
});

// Browser-dispatched events verify the DOM shield, not OS capture prevention.
test('watermark tampering requires assistance on the first interruption', async ({ page }) => {
  await login(page, 'STUDENT');
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'English · current window' }) });
  await card.getByRole('link').click();
  await page.getByRole('button', { name: 'Download exam' }).click();
  await page.getByRole('button', { name: 'Start exam', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.waitForTimeout(1200); // Let the supplied detector retain the original node.
  await page.getByTestId('exam-watermark').evaluate((el) => el.remove());
  await expect(page.getByRole('heading', { name: 'Editing is paused' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Resume/ })).toHaveCount(0);
});

test('pointer movement keeps editing available and actual fullscreen exit requires approval', async ({
  page,
}) => {
  await login(page, 'STUDENT');
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'English · current window' }) });
  await card.getByRole('link').click();
  await page.getByRole('button', { name: 'Download exam' }).click();
  await page.getByRole('button', { name: 'Start exam', exact: true }).click();
  await page.getByRole('radio').first().click();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')));
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByTestId('anti-screenshot-overlay')).toHaveCount(0);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole('heading', { name: 'Editing is paused' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('student exam categories stay usable on every screen size', async ({ page }, testInfo) => {
  await login(page, 'STUDENT');
  await page.getByRole('button', { name: 'Upcoming exams', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Physics · tomorrow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chemistry · completed' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Past exams', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chemistry · completed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Graded', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Graded', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Graded', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'All exams', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Current exams', exact: true })).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: testInfo.outputPath('student-exam-categories.png'),
    fullPage: true,
  });
});

test('compact setup: required markers, guarded edit cards, roster credential download and one offline notice', async ({
  page,
  context,
}) => {
  await login(page, 'ADMIN');
  await navigateWorkspace(page, 'School setup');
  await page.getByRole('button', { name: 'Add class', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add class', exact: true });
  const grade = editor.getByLabel('Grade', { exact: true });
  await expect(grade).toHaveAttribute('required', '');
  const marker = await grade
    .locator('..')
    .locator('.field-label')
    .evaluate((label) => getComputedStyle(label, '::after').content);
  expect(marker).toContain('*');
  await grade.fill('9');
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor.getByText('Discard your unsaved changes?')).toBeVisible();
  await editor.getByRole('button', { name: 'Keep editing' }).click();
  await expect(grade).toHaveValue('9');
  await accessible(page);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await editor.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('tab', { name: 'Assignments', exact: true }).click();
  const filters = page.locator('section[aria-label="Assignment filters"]');
  await expect(filters.getByLabel('Search assignments')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Roster import', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Roster class', exact: true })
    .selectOption('demo-class-10a');
  await page.getByLabel('Student roster file').setInputFiles({
    name: 'intake.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      "Roll number,First name,Father's name,Grandfather's name\nNEW-101,Synthetic,Learner,Test\n",
    ),
  });
  await page.getByRole('button', { name: 'Preview roster', exact: true }).click();
  await page.getByRole('checkbox', { name: /I checked every row/ }).check();
  await page.getByRole('button', { name: 'Import validated students', exact: true }).click();
  const credentials = page.getByRole('dialog', { name: 'Private login details' });
  await expect(credentials).toBeVisible();
  await expect(credentials.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await expect(credentials).toBeVisible();
  await accessible(page);
  const download = page.waitForEvent('download');
  await credentials
    .getByRole('button', { name: 'Download login details (CSV)', exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe('nexora-private-credentials.csv');
  await credentials.getByRole('checkbox', { name: /I saved the login details/ }).check();
  await credentials.getByRole('button', { name: 'Close login details', exact: true }).click();
  await expect(page.getByText(/Imported 1 students/)).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByText('Offline · reconnect to load or send changes', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Cannot connect. Check your connection and try again.', { exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
});

// The current shield requires staff approval on the first interruption; reconnection alone cannot resume it.
test('offline focus interruption preserves saved work and requires staff approval', async ({
  page,
  context,
}) => {
  await login(page, 'STUDENT');
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'English · current window' }) })
    .getByRole('link')
    .click();
  await page.getByRole('button', { name: 'Download exam' }).click();
  await page.getByRole('button', { name: 'Start exam', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('radio').first().click();
  await expect(page.getByText(/1 answers saved on this device/)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: 'Editing is paused', exact: true })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: /Resume/ })).toHaveCount(0);
  await expect(page.getByText(/1 answers saved on this device/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try opening exam again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editing is paused', exact: true })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});
