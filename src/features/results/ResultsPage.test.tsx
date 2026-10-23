import { render, screen } from '@testing-library/react';
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
  it('replaces publication approval with a release-date editor and preserves pending cases', async () => {
    const { store } = setup('school_admin', true);
    await screen.findByRole('heading', { name: 'Automatic result release' });
    expect(screen.queryByRole('button', { name: 'Approve publication' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save release date' })).toBeEnabled();
    expect(store.resultAttempts.get('sitting')?.attempt.state).toBe('recovery_pending');
    expect(screen.getByText(/Pending uploads and recovery cases stay pending/)).toBeInTheDocument();
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
