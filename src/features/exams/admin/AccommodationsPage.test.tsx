import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { resultsFixture } from '@/features/results/test-fixture';

function setup(loseResponse = false) {
  const { store } = resultsFixture();
  store.resultAttempts.clear();
  let now = Date.parse('2026-10-17T05:40:00Z');
  const transport = createDemoTransport('school_admin', () => now, store);
  const saves: { key: string | null; body: unknown }[] = [];
  render(
    <App
      router={createMemoryRouter(routes, {
        initialEntries: ['/admin/sessions/sitting/accommodations'],
      })}
      client={
        new ApiClient('/api/v1', async (url, init) => {
          const result = await transport(url, init);
          if (init.method === 'PATCH') {
            saves.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: init.body });
            if (loseResponse && saves.length === 1) throw new TypeError('Lost response');
          }
          return result;
        })
      }
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    />,
  );
  return {
    store,
    saves,
    user: userEvent.setup(),
    setTime: (value: string) => {
      now = Date.parse(value);
    },
  };
}
async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit extra time for Samira' }));
  fireEvent.change(screen.getByLabelText(/Extra minutes/), { target: { value: '15' } });
  await user.type(screen.getByLabelText('Reason for the change'), 'Approval A-12');
}
it('requires confirmation, previews EAT and refreshes the audited saved allowance', async () => {
  const { user, store } = setup();
  await edit(user);
  expect(screen.getByText(/New student deadline:.*09:35 am EAT/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save extra time' })).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Save extra time' }));
  await screen.findByText(/Extra time saved/);
  expect(store.sessions.get('sitting')?.accommodations?.[0]?.extraMinutes).toBe(15);
  expect(await screen.findByText(/Last change: 0 → 15/)).toBeInTheDocument();
});
it('retains the same key and payload after a lost response and safely replays after the cutoff', async () => {
  const { user, saves, store, setTime } = setup(true);
  await edit(user);
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Save extra time' }));
  await screen.findByRole('button', { name: 'Retry the same save' });
  expect(screen.getByLabelText(/Extra minutes/)).toBeDisabled();
  setTime('2026-10-17T05:50:00Z');
  await user.click(screen.getByRole('button', { name: 'Retry the same save' }));
  await screen.findByText(/Extra time saved/);
  expect(saves).toHaveLength(2);
  expect(saves[0]).toEqual(saves[1]);
  expect(store.history.get('paper')).toHaveLength(1);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Edit extra time for Samira' })).toBeDisabled(),
  );
});
it('blocks results conflicts and locks an open editor when preparation opens', async () => {
  const { user, setTime, saves } = setup();
  await edit(user);
  fireEvent.change(screen.getByLabelText(/Extra minutes/), { target: { value: '60' } });
  await user.click(screen.getByRole('checkbox'));
  expect(screen.getByText(/Move planned results/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save extra time' })).toBeDisabled();
  setTime('2026-10-17T05:50:00Z');
  await user.click(screen.getByRole('button', { name: 'Refresh roster and time' }));
  await screen.findByText(/Extra time is locked/);
  expect(screen.getByLabelText(/Extra minutes/)).toBeDisabled();
  expect(saves).toHaveLength(0);
});
