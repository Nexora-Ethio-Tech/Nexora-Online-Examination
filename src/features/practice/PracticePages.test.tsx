import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { practiceFixture } from './test-fixture';

function show(client: ApiClient, path: string) {
  render(
    <App
      client={client}
      router={createMemoryRouter(routes, { initialEntries: [path] })}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    />,
  );
  return userEvent.setup();
}
describe('practice screens', () => {
  it('keeps locked papers readable without offering a practice start', async () => {
    const c = await practiceFixture(false);
    show(c.student.client, '/student/practice');
    await screen.findByRole('heading', { name: 'Algebra official results' });
    expect(screen.getByText('Your administrator has not enabled practice.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start new practice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Practice release' })).not.toBeInTheDocument();
  });
  it('requires an admin reason and review confirmation, then displays blockers and audit history', async () => {
    const c = await practiceFixture(false);
    const user = show(c.admin.client, '/admin/practice');
    const save = await screen.findByRole('button', { name: 'Save practice settings' });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Enable practice' }));
    await user.type(
      screen.getByLabelText('Reason for practice settings'),
      'Reviewed practice release.',
    );
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I checked the paper/ }));
    await user.click(save);
    await waitFor(() => expect(c.store.practiceAccess.get('paper')?.enabled).toBe(true));
    await screen.findByText('Settings history');
    expect(
      screen.getByText('Official results must be approved and released for every related cohort.'),
    ).toBeInTheDocument();
  });
  it('shows first-answer feedback, completes the score, and resets navigation for another attempt', async () => {
    const c = await practiceFixture();
    const user = show(c.student.client, '/student/practice');
    await user.click(await screen.findByRole('button', { name: 'Start new practice' }));
    expect(await screen.findByRole('button', { name: 'Complete practice' })).toBeDisabled();
    for (const [index, item] of c.items.entries()) {
      const correct = item.options.find((o) => o.id === item.correctOptionId);
      if (!correct) throw new Error('fixture');
      if (index) await user.click(screen.getByRole('button', { name: 'Next question' }));
      await user.click(await screen.findByRole('radio', { name: correct.text }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await screen.findByText(item.explanation);
      expect(screen.getByRole('radio', { name: correct.text })).toBeDisabled();
    }
    await user.click(screen.getByRole('button', { name: 'Complete practice' }));
    await screen.findByRole('heading', { name: 'Practice completed' });
    expect(screen.getByText('Best completed practice score: 100.0%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start new practice' }));
    await screen.findByText('0 of 2 questions answered');
    const first = c.items[0];
    if (!first) throw new Error('fixture');
    expect(screen.getByRole('heading', { name: first.stem })).toBeInTheDocument();
    expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
    expect(c.store.practiceAttempts.size).toBe(2);
  });
  it('retains the exact answer and request key after a lost response', async () => {
    const c = await practiceFixture();
    const a = await c.student.api.start('paper', 1, crypto.randomUUID());
    const requests: { body: RequestInit['body']; key: string | null }[] = [];
    const client = new ApiClient('/api/v1', async (url, init) => {
      const response = await c.student.transport(url, init);
      if (url.endsWith('/answers')) {
        requests.push({ body: init.body, key: new Headers(init.headers).get('Idempotency-Key') });
        if (requests.length === 1) throw new TypeError('Simulated response lost after commit');
      }
      return response;
    });
    const user = show(client, `/student/practice/${a.practiceAttemptId}`);
    const item = c.items[0];
    const choice = item?.options[0];
    if (!item || !choice) throw new Error('fixture');
    await user.click(await screen.findByRole('radio', { name: choice.text }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await screen.findByText(/Your answer may already be saved/);
    expect(screen.getByRole('radio', { name: choice.text })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry same answer' }));
    await screen.findByText(item.explanation);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
  });
});
