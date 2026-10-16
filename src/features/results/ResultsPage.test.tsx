import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import type { Role } from '@/features/auth/schemas';
import { createDemoTransport } from '@/mocks/auth';
import { resultsFixture } from './test-fixture';

function setup(role: Role, pending = false) {
  const fixture = resultsFixture();
  if (pending) {
    fixture.attempt.state = 'recovery_pending';
    fixture.attempt.receipt = null;
  }
  const path =
    role === 'school_admin'
      ? '/admin/results/sitting'
      : role === 'teacher'
        ? '/teacher/results/sitting'
        : '/student/results';
  render(
    <App
      router={createMemoryRouter(routes, { initialEntries: [path] })}
      client={
        new ApiClient(
          '/api/v1',
          createDemoTransport(role, () => Date.parse('2026-10-17T06:30:00.000Z'), fixture.store),
        )
      }
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    />,
  );
  return { ...fixture, user: userEvent.setup() };
}
describe('results screens', () => {
  it('requires a reason, review confirmation and an explicit recovery exclusion before approval', async () => {
    const { user, store } = setup('school_admin', true);
    await screen.findByRole('heading', { name: 'Approve result publication' });
    expect(screen.getByRole('button', { name: 'Approve publication' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Publication reason'),
      'Reviewed marks and pending case.',
    );
    await user.click(screen.getByRole('checkbox', { name: /I reviewed the marks/ }));
    expect(screen.getByRole('button', { name: 'Approve publication' })).toBeDisabled();
    await user.type(
      screen.getByLabelText(/Exclusion reason for Samira/),
      'Evidence under investigation.',
    );
    await user.click(screen.getByRole('button', { name: 'Approve publication' }));
    await screen.findByRole('heading', { name: 'Publication approved' });
    await waitFor(() =>
      expect(store.publications.get('sitting')?.[0]?.rows[0]).toMatchObject({
        status: 'excluded',
        score: null,
        exclusionReason: 'Evidence under investigation.',
      }),
    );
  });
  it('shows teacher marks and charts with exports but no publication controls', async () => {
    setup('teacher');
    await screen.findByRole('heading', { name: 'Algebra official results' });
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Primary-topic performance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download sitting CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Print report / Save as PDF' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Approve publication' })).not.toBeInTheDocument();
  });
  it('shows a waiting status to students without revealing marks or staff controls', async () => {
    setup('student');
    await screen.findByRole('heading', { name: 'Algebra official results' });
    expect(screen.getByText(/Not released. Planned release:/)).toBeInTheDocument();
    expect(screen.queryByText('4 / 4')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
  });
});
