import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  return { store, cache, client, user: userEvent.setup() };
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
  it('requires a fresh reason and acknowledgement before deleting a class', async () => {
    const { user } = setup();
    const triggers = await screen.findAllByRole('button', { name: /^Delete class: / });
    const trigger = triggers[0];
    if (!trigger) throw new Error('Missing class delete icon');
    expect(trigger.textContent).toBe('');
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Students’ accounts/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: /^Delete class$/ });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Class created by mistake');
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    expect(confirm).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Keep class' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByLabelText('Reason')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Delete class$/ })).toBeDisabled();
  });

  it('shows the saved AI generation policy and requires a reason for enabling it', async () => {
    const { user, store } = setup();
    await user.click(await screen.findByRole('tab', { name: 'AI settings' }));
    expect(
      await screen.findByText('AI exam generation is off for this school.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on AI exam generation' })).toBeDisabled();
    await user.type(screen.getByLabelText('Reason'), 'Enable exam drafting');
    await user.click(screen.getByRole('button', { name: 'Turn on AI exam generation' }));
    expect(
      await screen.findByText('AI exam generation is on for this school.'),
    ).toBeInTheDocument();
    expect(store.directory.aiExamSettings).toEqual({ aiExamGenerationEnabled: true, revision: 2 });
    expect(screen.getByRole('button', { name: 'Turn off AI exam generation' })).toBeDisabled();
  });
  it('creates a class and subject and records who changed them', async () => {
    const { user, store } = setup();
    await user.click(await screen.findByRole('button', { name: 'Add class' }, { timeout: 5000 }));
    await user.type(await screen.findByLabelText('Grade'), '9');
    await user.type(screen.getByLabelText('Section'), 'B');
    await user.type(screen.getByLabelText('Academic year'), '2026');
    await user.type(screen.getByLabelText('Reason'), 'New intake');
    await user.click(screen.getByRole('button', { name: 'Save class' }));
    expect(await screen.findByRole('heading', { name: 'Grade 9 B' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Subjects' }));
    await user.click(screen.getByRole('button', { name: 'Add subject' }));
    await user.type(screen.getByLabelText('Subject name'), 'Physics');
    await user.type(screen.getByLabelText('Grade'), '10');
    await user.type(screen.getByLabelText('Subject code'), 'PHY');
    await user.type(screen.getByLabelText('Reason'), 'New subject');
    await user.click(screen.getByRole('button', { name: 'Save subject' }));
    expect(await screen.findByRole('heading', { name: 'Physics' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText('New subject')).toBeInTheDocument();
    expect(store.directory.audit[0]).toMatchObject({ actorName: 'Hana', targetLabel: 'Physics' });
  });
  it('blocks invalid imports and issues valid roster credentials only after explicit confirmation', async () => {
    const { user, store, cache } = setup();
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
    await user.type(screen.getByLabelText('Reason'), 'Test intake');
    expect(screen.getByRole('button', { name: 'Import validated students' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I checked every row/ }));
    await user.click(screen.getByRole('button', { name: 'Import validated students' }));
    expect(await screen.findByText(/Imported 1 students/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Accounts' }));
    await user.click(await screen.findByRole('button', { name: /Grade 10 A/ }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select Test Student for login details' }),
    );
    await user.type(screen.getByLabelText('Reason'), 'Distribute privately');
    expect(
      screen.getByRole('button', { name: 'Create login details for selected accounts' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I checked the selected students/ }));
    await user.click(
      screen.getByRole('button', { name: 'Create login details for selected accounts' }),
    );
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
    await user.click(screen.getByRole('link', { name: 'Official results' }));
    expect(await screen.findByText('Leave the login details?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('checkbox', { name: /I saved the login details/ }));
    await user.click(screen.getByRole('button', { name: 'Close login details' }));
    expect(screen.queryByText(password)).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Test Student' })).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Reason'), 'New staff');
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
    expect(screen.getByText('Teacher Example Family')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download login details (CSV)' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close login details' })).toBeEnabled();
  });
  it('connects teacher assignments to the teacher workspace', async () => {
    const { user, client } = setup();
    await screen.findByRole('heading', { name: 'School setup' });
    const subject = await schoolApi(client).saveSubject(
      null,
      { name: 'Physics', code: 'PHY', reason: 'New subject' },
      crypto.randomUUID(),
    );
    await user.click(screen.getByRole('tab', { name: 'Assignments' }));
    await user.selectOptions(await screen.findByLabelText('Teacher'), 'demo-teacher');
    await user.selectOptions(screen.getByLabelText('Class'), 'demo-class-10a');
    await user.selectOptions(screen.getByLabelText('Subject'), subject.subjectId);
    await user.type(screen.getByLabelText('Reason'), 'Assign physics');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(
      await screen.findByRole('heading', { name: 'Dawit · Grade 10 A · Physics' }),
    ).toBeInTheDocument();
  });
});
