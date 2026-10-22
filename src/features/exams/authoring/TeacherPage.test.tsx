import { render, screen, waitFor, within } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';

describe('teacher workspace', () => {
  it('creates a draft, saves metadata, and prevents submitting an empty paper', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ['/teacher'] });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <App
        client={new ApiClient('/api/v1', createDemoTransport('teacher'))}
        router={router}
        queryClient={queryClient}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'New exam' }));
    await user.type(screen.getByLabelText('Exam title'), 'Weekly algebra');
    await user.selectOptions(screen.getByLabelText('Class and subject'), 'demo-math-10a');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    // The refreshed list briefly has the same title before navigation reaches the detail page.
    expect(
      await screen.findByRole('heading', { name: 'Weekly algebra', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Download Word example' })).toHaveAttribute(
      'href',
      '/templates/nexora-questions.docx',
    );
    await user.click(screen.getByRole('tab', { name: 'Exam details' }));
    await user.clear(screen.getByLabelText('Exam title'));
    await user.type(screen.getByLabelText('Exam title'), 'Revised algebra');
    await user.click(screen.getByRole('link', { name: 'Back to my papers' }));
    expect(await screen.findByText('You have unsaved edits.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('button', { name: 'Save exam details' }));
    expect(await screen.findByRole('heading', { name: 'Revised algebra' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save exam details' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('link', { name: 'Back to my papers' }));
    expect(await screen.findByRole('heading', { name: 'My exam papers' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Revised algebra' })).toBeInTheDocument();
  });
  it('uploads an example and requires saved reviews before read-only submission', async () => {
    let now = Date.now();
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ['/teacher'] });
    render(
      <App
        client={
          new ApiClient(
            '/api/v1',
            createDemoTransport('teacher', () => now),
          )
        }
        router={router}
        queryClient={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'New exam' }));
    await user.type(screen.getByLabelText('Exam title'), 'Review journey');
    await user.selectOptions(screen.getByLabelText('Class and subject'), 'demo-math-10a');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    const upload = await screen.findByLabelText('Question template');
    const bytes = await readFile('public/templates/nexora-questions.xlsx');
    const file = new File([bytes], 'questions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    // jsdom omits Blob.arrayBuffer; retain real fixture bytes for the demo hash check.
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => Uint8Array.from(bytes).buffer,
    });
    await user.upload(upload, file);
    await user.click(screen.getByRole('button', { name: 'Upload and prepare questions' }));
    await screen.findByText(/AI suggestions ready/);
    now += 5000;
    await waitFor(
      () =>
        expect(
          screen.getByText(/Ready to review · 2 questions found · 2 AI suggestions ready/i),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
    await user.click(screen.getByRole('tab', { name: 'Review questions' }));
    expect(
      screen.queryByRole('button', { name: 'Go to question reviews' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm all questions without warnings (1)' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous question' })).toBeDisabled();
    const first = (await screen.findByRole('heading', { name: 'MATH-001' })).closest('section');
    if (!first) throw new Error('Missing first question');
    await user.click(within(first).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Review MATH-002' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled();
    await user.click(within(first).getByRole('button', { name: 'Save and next' }));
    await waitFor(() => expect(screen.getByText(/1 reviewed/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    const second = (await screen.findByRole('heading', { name: 'MATH-002' })).closest('section');
    if (!second) throw new Error('Missing second question');
    await user.click(within(second).getByRole('checkbox'));
    await user.click(within(second).getByRole('button', { name: 'Save and next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('resolution note');
    await user.type(
      within(second).getByLabelText('Review note / flag resolution'),
      'Checked against the taught definition.',
    );
    await user.click(within(second).getByRole('button', { name: 'Save question review' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Needs review' }));
    expect(screen.getByText('No questions match this filter.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reviewed' }));
    expect(screen.getByRole('button', { name: 'Review MATH-001' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await user.click(screen.getByRole('button', { name: 'Confirm send for approval' }));
    expect(
      await screen.findByText('Submitted for administrator approval. This paper is now read-only.'),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('button', { name: 'Save question review' })
        .every((button) => button.hasAttribute('disabled') || button.closest('fieldset')?.disabled),
    ).toBe(true);
  }, 15000);
});
