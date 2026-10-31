import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthoringStore } from '@/mocks/authoring-store';
import { createAuthApi } from '@/features/auth/api';
import { schoolApi } from './api';

function setup(transport?: Transport) {
  const store = createAuthoringStore();
  const client = new ApiClient(
    '/api/v1',
    transport ?? createDemoTransport('school_admin', undefined, store),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/school'] });
  render(<App client={client} queryClient={cache} router={router} />);
  return { store, cache, client, router, user: userEvent.setup() };
}
function csvFile(text: string) {
  const bytes = new TextEncoder().encode(text);
  const file = new File([bytes], 'students.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
  return file;
}
function submitRosterPreview() {
  const button = screen.getByRole('button', { name: 'Preview roster' });
  expect(button).toBeEnabled();
  const form = button.closest('form');
  if (!form) throw new Error('Missing preview form');
  // jsdom 29 reports valueMissing for user-event FileLists even with one file.
  // Exercise the handler here; verify native file-input validation in the browser.
  fireEvent.submit(form);
}
describe('school setup UI', () => {
  it.each(['class', 'subject'])(
    'requires a fresh reason and acknowledgement before deleting a %s',
    async (kind) => {
      const { user } = setup();
      if (kind === 'subject')
        await user.click(await screen.findByRole('tab', { name: 'Subjects' }));
      const triggers = await screen.findAllByRole(
        'button',
        {
          name: new RegExp(`^Delete ${kind}: `),
        },
        { timeout: 5000 },
      );
      const trigger = triggers[0];
      if (!trigger) throw new Error('Missing class delete icon');
      expect(trigger.textContent).toBe('');
      await user.click(trigger);
      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByText(/exam records/)).toBeInTheDocument();
      const confirm = within(dialog).getByRole('button', { name: `Delete ${kind}` });
      expect(confirm).toBeDisabled();
      await user.type(within(dialog).getByLabelText('Reason'), 'Class created by mistake');
      expect(confirm).toBeDisabled();
      await user.click(within(dialog).getByRole('checkbox'));
      expect(confirm).toBeEnabled();
      await user.click(within(dialog).getByRole('button', { name: `Keep ${kind}` }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await user.click(trigger);
      expect(screen.getByLabelText('Reason')).toHaveValue('');
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(screen.getByRole('button', { name: `Delete ${kind}` })).toBeDisabled();
    },
  );

  it('renames the school and refreshes the portal header', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    const name = await screen.findByRole('textbox', { name: 'School name' });
    await screen.findByDisplayValue('Nexora Demo School');
    await user.clear(name);
    expect(screen.getByRole('button', { name: 'Save school name' })).toBeDisabled();
    await user.type(name, 'Adama School');
    await user.click(screen.getByRole('button', { name: 'Save school name' }));
    expect(
      await screen.findByText('Adama School', { selector: '.brand-heading' }),
    ).toBeInTheDocument();
    expect(name).toHaveValue('Adama School');
  });
  it('saves AI generation with a compact switch and no note or refresh controls', async () => {
    const { user, store } = setup();
    await user.click(await screen.findByRole('tab', { name: 'Settings' }));
    const toggle = await screen.findByRole('switch', { name: 'AI exam generation' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText('Note (optional)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(store.directory.aiExamSettings).toEqual({ aiExamGenerationEnabled: true, revision: 2 });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(store.directory.aiExamSettings).toEqual({ aiExamGenerationEnabled: false, revision: 3 });
  });
  it('creates a class and subject and records who changed them', async () => {
    const { user, store } = setup();
    await user.click(await screen.findByRole('button', { name: 'Add class' }, { timeout: 5000 }));
    await user.type(await screen.findByLabelText('Grade'), '9');
    await user.type(screen.getByLabelText('Section'), 'B');
    const academicYearSelect = screen.getByLabelText('Academic year');
    expect(academicYearSelect).toHaveValue('2026/27');
    await user.selectOptions(academicYearSelect, '2026/27');
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save class' }));
    expect(await screen.findByRole('heading', { name: 'Grade 9 B' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Subjects' }));
    await user.click(screen.getByRole('button', { name: 'Add subject' }));
    await user.type(screen.getByLabelText('Subject name'), 'Physics');
    await user.selectOptions(screen.getByLabelText('Grade'), '10');
    await user.type(screen.getByLabelText('Subject code'), 'PHY');
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save subject' }));
    expect(await screen.findByRole('heading', { name: 'Physics' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    await screen.findByRole('heading', { name: 'School setup activity' });
    expect(store.directory.audit[0]).toMatchObject({
      actorName: 'Hana',
      targetLabel: 'Physics',
      reason: '',
    });
  });
  it('defaults academic year to current year (2026/27) and allows selection with dropdown', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Add class' }, { timeout: 5000 }));
    const select = screen.getByLabelText('Academic year');
    expect(select).toHaveValue('2026/27');

    // Dropdown contains options with Ethiopian calendar references
    expect(screen.getByRole('option', { name: '2026/27 (2019 ዓ.ም.)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2027/28 (2020 ዓ.ም.)' })).toBeInTheDocument();

    // Changing dropdown updates academic year value
    await user.selectOptions(select, '2027/28');
    expect(select).toHaveValue('2027/28');
  });
  it('selects grade from available classes in Add subject', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('tab', { name: 'Subjects' }));
    await user.click(await screen.findByRole('button', { name: 'Add subject' }));
    const gradeSelect = screen.getByLabelText('Grade');
    expect(gradeSelect.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Grade 10' })).toBeInTheDocument();
    await user.selectOptions(gradeSelect, '10');
    expect(gradeSelect).toHaveValue('10');
  });
  it('blocks invalid imports and issues valid roster credentials only after explicit confirmation', async () => {
    const { user, store, cache, router } = setup();
    await user.click(await screen.findByRole('tab', { name: 'Roster import' }));
    await user.selectOptions(await screen.findByLabelText('Roster class'), 'demo-class-10a');
    await user.upload(
      screen.getByLabelText('Student roster file'),
      csvFile('studentRef,displayName\nDEMO-001,Duplicate'),
    );
    submitRosterPreview();
    expect(await screen.findByText(/This student reference already exists/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import validated students' })).toBeDisabled();
    expect(store.directory.accounts.size).toBe(2);
    await user.upload(
      screen.getByLabelText('Student roster file'),
      csvFile('studentRef,displayName\nNEW-1,Test Student'),
    );
    submitRosterPreview();
    await screen.findByText(/All rows passed validation/);
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import validated students' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I checked every row/ }));
    await user.click(screen.getByRole('button', { name: 'Import validated students' }));
    expect(await screen.findByText(/Imported 1 students/)).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Save these login details now' });
    const password = screen
      .getByRole('table', { name: 'New account login details' })
      .querySelector('tbody tr td:last-child')?.textContent;
    if (!password) throw new Error('Missing displayed password');
    expect(
      JSON.stringify(
        cache
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(password);
    expect(
      JSON.stringify(
        cache
          .getMutationCache()
          .getAll()
          .map((m) => m.state.data),
      ),
    ).not.toContain(password);
    expect(JSON.stringify(localStorage)).not.toContain(password);
    expect(JSON.stringify(sessionStorage)).not.toContain(password);
    expect(screen.getByRole('button', { name: 'Close login details' })).toBeDisabled();
    // Simulate browser navigation while the modal owns focus.
    await act(async () => {
      void router.navigate('/admin/results');
    });
    expect(await screen.findByText('Leave the login details?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('checkbox', { name: /I saved the login details/ }));
    await user.click(screen.getByRole('button', { name: 'Close login details' }));
    expect(screen.queryByText(password)).not.toBeInTheDocument();
    expect(await screen.findByText(/Imported 1 students/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Accounts' }));
    await user.click(await screen.findByRole('button', { name: /Grade 10 A/ }));
    expect(await screen.findByRole('heading', { name: 'Test Student' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Select Test Student for login details' }),
    ).not.toBeInTheDocument();
  });
  it('auto-generates sequential roll numbers when importing roster without roll number column', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('tab', { name: 'Roster import' }));
    await user.selectOptions(await screen.findByLabelText('Roster class'), 'demo-class-10a');
    await user.upload(
      screen.getByLabelText('Student roster file'),
      csvFile(
        "First name,Father's name,Grandfather's name\nHana,Dawit,Getachew\nSamuel,Abebe,Tesfaye",
      ),
    );
    submitRosterPreview();
    await screen.findByText(/All rows passed validation/);
    expect(screen.getByRole('columnheader', { name: 'Roll number' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Header is rows[0]. Student 1 (Hana) is rows[1]. Student 2 (Samuel) is rows[2].
    // Existing student Samira is student 1 in demo-class-10a, so auto-generated roll numbers start at 2
    if (!rows[1] || !rows[2]) throw new Error('Expected at least 3 rows in preview table');
    const hanaCells = within(rows[1]).getAllByRole('cell');
    expect(hanaCells[0]).toHaveTextContent('2'); // Row index
    expect(hanaCells[1]).toHaveTextContent('2'); // Roll number
    expect(hanaCells[2]).toHaveTextContent('Hana Dawit Getachew');

    const samuelCells = within(rows[2]).getAllByRole('cell');
    expect(samuelCells[0]).toHaveTextContent('3'); // Row index
    expect(samuelCells[1]).toHaveTextContent('3'); // Roll number
    expect(samuelCells[2]).toHaveTextContent('Samuel Abebe Tesfaye');
  });
  it('requires reset acknowledgment and invalidates an existing signed-in session', async () => {
    const { user, store } = setup();
    const studentAuth = createAuthApi(
      new ApiClient('/api/v1', createDemoTransport('student', undefined, store)),
    );
    expect(await studentAuth.session()).not.toBeNull();
    await user.click(await screen.findByRole('tab', { name: 'Accounts' }));
    await user.click(await screen.findByRole('button', { name: /Grade 10 A/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit Samira' }));
    await user.click(screen.getByText('Password', { selector: 'summary' }));
    await user.click(await screen.findByRole('button', { name: 'Reset password for Samira' }));
    await user.type(screen.getByLabelText('Reason'), 'Student lost password');
    expect(
      screen.getByRole('button', { name: 'Reset password and show login details' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I verified this account/ }));
    await user.click(screen.getByRole('button', { name: 'Reset password and show login details' }));
    await screen.findByRole('heading', { name: 'Save these login details now' });
    expect(await studentAuth.session()).toBeNull();
    expect(store.directory.audit.some((a) => a.action === 'password_reset')).toBe(true);
  });
  it('retries a lost teacher-issuance response with the same key and identifies accounts to reset', async () => {
    const store = createAuthoringStore();
    const base = createDemoTransport('school_admin', undefined, store);
    const keys: (string | null)[] = [];
    const { user } = setup(async (url, init) => {
      const result = await base(url, init);
      if (url.endsWith('/teachers') && init.method === 'POST') {
        keys.push(new Headers(init.headers).get('Idempotency-Key'));
        if (keys.length === 1) throw new TypeError('Synthetic dropped response');
      }
      return result;
    });
    await user.click(await screen.findByRole('tab', { name: 'Accounts' }));
    await user.click(screen.getByRole('button', { name: 'Teachers' }));
    await user.click(screen.getByRole('button', { name: 'Add teacher' }));
    await user.type(screen.getByLabelText('First name'), 'Teacher');
    await user.type(screen.getByLabelText("Father's name"), 'Example');
    await user.type(screen.getByLabelText("Grandfather's name"), 'Family');
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create teacher and login details' }));
    await waitFor(() => expect(keys).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create teacher and login details' }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Create teacher and login details' }));
    await screen.findByRole('heading', { name: 'Login details were already created' });
    expect(keys[1]).toBe(keys[0]);
    expect(store.directory.accounts.size).toBe(3);
    expect(
      within(screen.getByRole('dialog', { name: 'Private login details' })).getByText(
        'Teacher Example Family',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download login details (CSV)' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close login details' })).toBeEnabled();
  });
  it('connects teacher assignments to the teacher workspace', async () => {
    const { user, client, cache } = setup();
    await screen.findByRole('heading', { name: 'School setup' });
    const subject = await schoolApi(client).saveSubject(
      null,
      { name: 'Physics', code: 'PHY', reason: 'New subject' },
      crypto.randomUUID(),
    );
    await cache.invalidateQueries({ queryKey: ['school'] });
    await user.click(screen.getByRole('tab', { name: 'Assignments' }));
    await user.selectOptions(await screen.findByLabelText('Teacher'), 'demo-teacher');
    await user.selectOptions(screen.getByLabelText('Class'), 'demo-class-10a');
    await user.selectOptions(screen.getByLabelText('Subject'), subject.subjectId);
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(
      await screen.findByRole('heading', { name: 'Dawit · Grade 10 A · Physics' }),
    ).toBeInTheDocument();
  });
});
