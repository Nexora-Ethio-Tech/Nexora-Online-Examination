import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthoringStore } from '@/mocks/authoring-store';
import { sampleItems } from '@/mocks/teacher';

function setup() {
  const store = createAuthoringStore();
  const id = 'school-paper';
  store.drafts.set(id, {
    examId: id,
    revision: 4,
    title: 'Teacher submitted algebra',
    instructions: 'Choose one answer.',
    assignmentId: 'demo-math-10a',
    language: 'en',
    durationMinutes: 60,
    passPercent: 50,
    ordering: 'fixed',
    status: 'in_review',
    itemCount: 2,
    totalMarks: 4,
    reviewedCount: 2,
    importId: null,
    returnComment: null,
  });
  store.papers.set(
    id,
    sampleItems().map((i) => ({ ...i, reviewed: true, reviewNote: 'Checked.' })),
  );
  const router = createMemoryRouter(routes, { initialEntries: [`/admin/exams/${id}`] });
  render(
    <App
      router={router}
      client={
        new ApiClient(
          '/api/v1',
          createDemoTransport('school_admin', () => Date.parse('2026-10-17T06:00:00Z'), store),
        )
      }
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    />,
  );
  return { user: userEvent.setup(), store, id };
}
describe('admin review and schedule screens', () => {
  it('requires review confirmation and schedules with an EAT ten-minute preview', async () => {
    const { user, store, id } = setup();
    expect(
      await screen.findByRole('heading', { name: 'Teacher submitted algebra' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve paper' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Review comment or required corrections'),
      'Checked both questions and keys.',
    );
    expect(screen.getByRole('button', { name: 'Approve paper' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I reviewed the questions/ }));
    await user.click(screen.getByRole('button', { name: 'Approve paper' }));
    expect(await screen.findByRole('heading', { name: 'Approved version 1' })).toBeInTheDocument();
    const prep = screen.getByLabelText('Preparation date and time (EAT)');
    expect(prep).toHaveValue('2026-10-17T09:02');
    fireEvent.change(prep, { target: { value: '2026-10-17T09:30' } });
    fireEvent.change(screen.getByLabelText('Planned results date and time (EAT)'), {
      target: { value: '2026-10-17T11:00' },
    });
    expect(screen.getByText(/17 Oct 2026, 09:40 am EAT/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm schedule' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I checked the EAT dates/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm schedule' }));
    expect(
      await screen.findByRole('heading', { name: 'Scheduled sitting · 1 students' }),
    ).toBeInTheDocument();
    const sitting = [...store.sessions.values()][0];
    expect(sitting?.session.preparationVisibleAt).toBe('2026-10-17T06:30:00.000Z');
    expect(sitting?.session.startsAt).toBe('2026-10-17T06:40:00.000Z');
    expect(store.drafts.get(id)?.status).toBe('approved');
    expect(
      screen.getByText('Planned results (publication approval still required)'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change schedule' }));
    fireEvent.change(screen.getByLabelText('Preparation date and time (EAT)'), {
      target: { value: '2026-10-17T09:40' },
    });
    await user.type(screen.getByLabelText('Reason for changing the schedule'), 'Room change.');
    await user.click(screen.getByRole('checkbox', { name: /I checked the EAT dates/ }));
    await user.click(screen.getByRole('button', { name: 'Save schedule change' }));
    await waitFor(() => expect(screen.getByText(/Schedule revision 2/)).toBeInTheDocument());
  });
  it('returns mandatory feedback without granting scheduling access', async () => {
    const { user, store, id } = setup();
    await screen.findByRole('heading', { name: 'Approval decision' });
    expect(screen.getByRole('button', { name: 'Return to teacher' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Review comment or required corrections'),
      'Please clarify the explanation.',
    );
    await user.click(screen.getByRole('button', { name: 'Return to teacher' }));
    expect(
      await screen.findByText('Returned to the teacher: Please clarify the explanation.'),
    ).toBeInTheDocument();
    expect(store.drafts.get(id)?.returnComment).toBe('Please clarify the explanation.');
    expect(screen.queryByRole('button', { name: 'Confirm schedule' })).not.toBeInTheDocument();
  });
});
