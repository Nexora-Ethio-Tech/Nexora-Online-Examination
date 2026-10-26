import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { captureRecovery } from '@/mocks/recovery';
import { resultsFixture } from '@/features/results/test-fixture';

function setup() {
  const fixture = resultsFixture();
  const { attempt, store, items } = fixture;
  attempt.state = 'recovery_pending';
  attempt.receipt = null;
  attempt.recovery = {
    recoveryId: 'case-review',
    status: 'recovery_pending',
    receivedAt: '2026-10-17T06:21:00.000Z',
  };
  const sitting = store.sessions.get('sitting');
  if (!sitting) throw new Error('fixture');
  captureRecovery(
    store,
    attempt,
    {
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      finalSeq: 2,
      answers: items.map((i) => ({ itemId: i.itemId, value: i.correctOptionId })),
    },
    'The network disconnected.',
    crypto.randomUUID(),
    'a'.repeat(64),
    sitting.paper,
  );
  render(
    <App
      router={createMemoryRouter(routes, { initialEntries: ['/admin/recovery/case-review'] })}
      client={
        new ApiClient(
          '/api/v1',
          createDemoTransport('school_admin', () => Date.parse('2026-10-17T06:30:00.000Z'), store),
        )
      }
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    />,
  );
  return { store, user: userEvent.setup() };
}
describe('administrator recovery review screen', () => {
  it('requires an explicit decision, reason and confirmation before acceptance and shows the audit', async () => {
    const { user, store } = setup();
    await screen.findByRole('heading', { name: 'Answer comparison' }, { timeout: 5000 });
    expect(screen.getByText('Upload reason: The network disconnected.')).toBeInTheDocument();
    expect(screen.getAllByText('No timely answer saved')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Confirm decision' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Decision'), 'accept');
    await user.type(
      screen.getByLabelText('Decision reason'),
      'Verified against the incident record.',
    );
    expect(screen.getByRole('button', { name: 'Confirm acceptance' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I reviewed the upload/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm acceptance' }));
    await screen.findByRole('heading', { name: 'Decision recorded' });
    expect(screen.getByText(/Result revision 2 requires separate/)).toBeInTheDocument();
    expect(store.resultAttempts.get('sitting')?.attempt.receipt).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm acceptance' })).not.toBeInTheDocument();
  });
  it('rejects with a reason while retaining the snapshot and no official receipt', async () => {
    const { user, store } = setup();
    await screen.findByRole('heading', { name: 'Record your decision' });
    await user.selectOptions(screen.getByLabelText('Decision'), 'reject');
    await user.type(
      screen.getByLabelText('Decision reason'),
      'Insufficient corroborating evidence.',
    );
    await user.click(screen.getByRole('checkbox', { name: /I reviewed the upload/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    await screen.findByRole('heading', { name: 'Decision recorded' });
    expect(store.resultAttempts.get('sitting')?.attempt.receipt).toBeNull();
    expect(store.recoveries.get('case-review')?.detail.snapshot.answers).toHaveLength(2);
  });
});
