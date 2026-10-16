import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { monitorFixture } from './test-fixture';
import type { ApiClient, Transport } from '@/lib/api-client';

afterEach(() => vi.restoreAllMocks());
function show(client: ApiClient, path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <App
      router={createMemoryRouter(routes, { initialEntries: [path] })}
      client={client}
      queryClient={queryClient}
    />,
  );
  return { user: userEvent.setup(), queryClient };
}
describe('administrator monitor screen', () => {
  it('requires a valid registered ID, reason and student confirmation, then reports the unchanged deadline and audit', async () => {
    const c = await monitorFixture();
    const { user } = show(c.client, `/admin/monitor/attempts/${c.attempt.attemptId}`);
    await screen.findByRole('heading', { name: 'Approve a replacement browser' });
    const button = screen.getByRole('button', { name: 'Approve device replacement' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Registered replacement browser ID'), c.replacement);
    await user.type(
      screen.getByLabelText('Reason for replacement'),
      'Broken screen; student identity verified.',
    );
    expect(button).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I verified this student/ }));
    expect(button).toBeEnabled();
    await user.click(button);
    await screen.findByText(/Replacement approved: generation 2/);
    expect(await screen.findByText('Generation 1 → 2 · Hana')).toBeInTheDocument();
    expect(screen.getByText('Broken screen; student identity verified.')).toBeInTheDocument();
    expect((await c.monitor.attempt(c.attempt.attemptId, null)).student.deadlineAt).toBe(
      c.attempt.deadlineAt,
    );
  });
  it('retains the exact operation after a lost transfer response and replays without another generation', async () => {
    const sent: { body: BodyInit | null | undefined; key: string | null }[] = [];
    const intercept: (
      url: string,
      init: RequestInit,
      next: Transport,
    ) => Promise<Response> = async (url, init, next) => {
      const result = await next(url, init);
      if (url.endsWith('/device-transfer')) {
        sent.push({ body: init.body, key: new Headers(init.headers).get('Idempotency-Key') });
        if (sent.length === 1) throw new TypeError('Synthetic lost response');
      }
      return result;
    };
    const c = await monitorFixture(intercept);
    const { user } = show(c.client, `/admin/monitor/attempts/${c.attempt.attemptId}`);
    await screen.findByRole('heading', { name: 'Approve a replacement browser' });
    await user.type(screen.getByLabelText('Registered replacement browser ID'), c.replacement);
    await user.type(screen.getByLabelText('Reason for replacement'), 'Screen failed.');
    await user.click(screen.getByRole('checkbox', { name: /I verified this student/ }));
    await user.click(screen.getByRole('button', { name: 'Approve device replacement' }));
    await screen.findByText(/The outcome is not confirmed/);
    expect(screen.queryByLabelText('Registered replacement browser ID')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh monitor' }));
    await screen.findByText('Generation 1 → 2 · Hana');
    await user.click(screen.getByRole('button', { name: 'Retry same transfer' }));
    await screen.findByText(/Replacement approved: generation 2/);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect((await c.monitor.attempt(c.attempt.attemptId, null)).history).toHaveLength(1);
  });
  it('preserves the last snapshot but disables replacement after a refresh fails', async () => {
    let fail = false;
    const c = await monitorFixture(async (url, init, next) => {
      if (fail && url.includes('/admin/monitor/attempts/')) throw new TypeError('Offline');
      return next(url, init);
    });
    const { user } = show(c.client, `/admin/monitor/attempts/${c.attempt.attemptId}`);
    await screen.findByRole('heading', { name: 'Approve a replacement browser' });
    fail = true;
    await user.click(screen.getByRole('button', { name: 'Refresh monitor' }));
    await screen.findByText(/Snapshot is stale/);
    expect(screen.getByText('Samira · DEMO-STUDENT')).toBeInTheDocument();
    expect(screen.getByLabelText('Registered replacement browser ID')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve device replacement' })).toBeDisabled();
  });
  it('resets confirmation when another administrator changes the generation', async () => {
    const c = await monitorFixture();
    const { user } = show(c.client, `/admin/monitor/attempts/${c.attempt.attemptId}`);
    await screen.findByRole('heading', { name: 'Approve a replacement browser' });
    await user.type(screen.getByLabelText('Registered replacement browser ID'), c.replacement);
    await user.type(screen.getByLabelText('Reason for replacement'), 'Device broken.');
    await user.click(screen.getByRole('checkbox', { name: /I verified this student/ }));
    await c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID());
    await user.click(screen.getByRole('button', { name: 'Refresh monitor' }));
    await screen.findByText('Generation 1 → 2 · Hana');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Approve device replacement' })).toBeDisabled();
  });
  it('disables a previously valid form when its server-sampled deadline passes without a new response', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const c = await monitorFixture();
    c.setTime(new Date(Date.parse(c.attempt.deadlineAt) - 500).toISOString());
    show(c.client, `/admin/monitor/attempts/${c.attempt.attemptId}`);
    await screen.findByRole('heading', { name: 'Approve a replacement browser' });
    expect(screen.getByLabelText('Registered replacement browser ID')).toBeEnabled();
    elapsed = 1000;
    await waitFor(
      () => expect(screen.getByLabelText('Registered replacement browser ID')).toBeDisabled(),
      { timeout: 1800 },
    );
  });
});

it('shows last-reported readiness separately from the preparing roster count', async () => {
  const c = await monitorFixture();
  await c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID());
  await c.login('STUDENT');
  await c.exams.ready(
    c.attempt.attemptId,
    {
      packageId: c.packet.packageId,
      sha256: c.packet.sha256,
      examVersion: c.attempt.examVersion,
      scheduleRevision: c.attempt.scheduleRevision,
      deviceGeneration: 2,
      shellBuild: 'test-build',
    },
    crypto.randomUUID(),
  );
  await c.login('ADMIN');
  show(c.client, '/admin/monitor/sitting');
  expect(await screen.findByText(/Ready \(last reported\)/)).toHaveTextContent(
    '1 of 1 preparing students',
  );
  expect(await screen.findByText(/Verified checks reported at/)).toHaveTextContent(
    'does not prove continuing connectivity',
  );
});
