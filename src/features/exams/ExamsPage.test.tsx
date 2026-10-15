/// <reference types="node" />
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { listSchema } from './schemas';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
function setup(path = '/student', transport: Transport = createDemoTransport('student')) {
  const client = new ApiClient('/api/v1', transport);
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
it('shows assigned exams with EAT times and independent submission states', async () => {
  setup();
  expect(
    await screen.findByRole('heading', { name: 'Mathematics · preparation' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Submission recorded')).toBeInTheDocument();
  expect(screen.getAllByText(/EAT/).length).toBeGreaterThan(1);
});
it('opens scheduled detail without offering early download', async () => {
  setup('/student/exams/demo-session-5');
  await screen.findByRole('heading', { name: 'Physics · tomorrow' });
  expect(
    screen.queryByRole('button', { name: 'Download encrypted paper' }),
  ).not.toBeInTheDocument();
});
it('confirms a manual refresh even when the schedule is unchanged', async () => {
  const user = setup('/student/exams/demo-session-5');
  await user.click(await screen.findByRole('button', { name: 'Refresh schedule' }));
  expect(await screen.findByText(/Schedule updated. Last checked:/)).toBeInTheDocument();
});
it('downloads and verifies a paper without claiming offline readiness or submission', async () => {
  const user = setup('/student/exams/demo-session-4');
  await user.click(await screen.findByRole('button', { name: 'Download encrypted paper' }));
  expect(await screen.findByRole('heading', { name: 'Encrypted paper saved' })).toBeInTheDocument();
  expect(screen.getByText(/This is not full offline readiness/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Start exam' })).not.toBeInTheDocument();
});
it('shows an empty assignment state', async () => {
  const demo = createDemoTransport('student');
  setup('/student', (url, init) =>
    url.includes('/me/exams?')
      ? Promise.resolve(
          Response.json({ items: [], nextCursor: null, serverNow: new Date().toISOString() }),
        )
      : demo(url, init),
  );
  expect(await screen.findByRole('heading', { name: 'No exams assigned yet' })).toBeInTheDocument();
});
it('loads the next opaque cursor without dropping the first page', async () => {
  const demo = createDemoTransport('student');
  const user = setup('/student', async (url, init) => {
    const response = await demo(url, init);
    if (!url.includes('/me/exams?')) return response;
    const data = listSchema.parse(await response.json());
    return Response.json({
      ...data,
      items: url.includes('cursor=next-page') ? data.items.slice(1) : data.items.slice(0, 1),
      nextCursor: url.includes('cursor=next-page') ? null : 'next-page',
    });
  });
  await user.click(await screen.findByRole('button', { name: 'Load more exams' }));
  expect(
    await screen.findByRole('heading', { name: 'Mathematics · preparation' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chemistry · completed' })).toBeInTheDocument();
});
it('shows a retryable error when the assignment service fails', async () => {
  const demo = createDemoTransport('student');
  let unavailable = true;
  const user = setup('/student', (url, init) =>
    url.includes('/me/exams?') && unavailable
      ? Promise.resolve(new Response('', { status: 503 }))
      : demo(url, init),
  );
  await screen.findByRole('button', { name: 'Try again' });
  unavailable = false;
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(
    await screen.findByRole('heading', { name: 'Mathematics · preparation' }),
  ).toBeInTheDocument();
});
