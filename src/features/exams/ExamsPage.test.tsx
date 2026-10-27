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
import { listSchema, packageSchema } from './schemas';
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
  expect(screen.queryByRole('button', { name: 'Download exam' })).not.toBeInTheDocument();
});
it('confirms a manual refresh even when the schedule is unchanged', async () => {
  const user = setup('/student/exams/demo-session-5');
  await user.click(await screen.findByRole('button', { name: 'Refresh schedule' }));
  expect(await screen.findByText(/Schedule updated. Last checked:/)).toBeInTheDocument();
});
it('downloads and verifies a paper without claiming offline readiness or submission', async () => {
  const user = setup('/student/exams/demo-session-4');
  await user.click(await screen.findByRole('button', { name: 'Download exam' }));
  expect(
    await screen.findByRole('heading', { name: 'Exam saved for this demo' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/your school has not been notified that you are ready/),
  ).toBeInTheDocument();
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
  expect(
    await screen.findByRole('heading', { name: 'No exams in this category' }),
  ).toBeInTheDocument();
});
it('shows the failed integrity step, hides readiness and allows a successful retry', async () => {
  const demo = createDemoTransport('student');
  let corrupt = true;
  const user = setup('/student/exams/demo-session-4', async (url, init) => {
    const response = await demo(url, init);
    return corrupt && url.endsWith('/package')
      ? Response.json({ ...packageSchema.parse(await response.json()), sha256: '0'.repeat(64) })
      : response;
  });
  await user.click(await screen.findByRole('button', { name: 'Download exam' }));
  expect(
    await screen.findByText('Download could not finish. Please try again.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Exam saved for this demo' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Ready for your exam' })).not.toBeInTheDocument();
  corrupt = false;
  await user.click(screen.getByRole('button', { name: 'Try download again' }));
  await screen.findByRole('heading', { name: 'Exam saved for this demo' });
  expect(screen.getByText('Exam downloaded. Keep this page open.')).toBeInTheDocument();
  expect(screen.queryByText(/Check that you can keep working/)).not.toBeInTheDocument();
  expect(
    screen.queryByText('Download could not finish. Please try again.'),
  ).not.toBeInTheDocument();
});
it('shows one opaque-cursor page at a time and returns to the cached first page', async () => {
  const demo = createDemoTransport('student');
  let firstTitle = '';
  const user = setup('/student', async (url, init) => {
    if (!url.includes('/me/exams?')) return demo(url, init);
    const response = await demo(url.replace('&cursor=next-page', ''), init);
    const data = listSchema.parse(await response.json());
    if (!url.includes('cursor=next-page')) firstTitle = data.items[0]?.title ?? '';
    return Response.json({
      ...data,
      items: url.includes('cursor=next-page') ? data.items.slice(1) : data.items.slice(0, 1),
      nextCursor: url.includes('cursor=next-page') ? null : 'next-page',
    });
  });
  await user.click(await screen.findByRole('button', { name: 'Next page' }));
  expect(
    await screen.findByRole('heading', { name: 'Mathematics · preparation' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chemistry · completed' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(await screen.findByRole('heading', { name: firstTitle })).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Mathematics · preparation' }),
  ).not.toBeInTheDocument();
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

it('filters upcoming exams without confusing submission and result publication', async () => {
  const user = setup();
  await user.click(await screen.findByRole('button', { name: 'Upcoming exams' }));
  expect(screen.getByRole('heading', { name: 'Physics · tomorrow' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Chemistry · completed' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Past exams' }));
  expect(screen.getByRole('heading', { name: 'Chemistry · completed' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Physics · tomorrow' })).not.toBeInTheDocument();
});
it('keeps past exams visible when result lookup fails instead of inventing grade status', async () => {
  const demo = createDemoTransport('student');
  const user = setup('/student', (url, init) =>
    url.includes('/me/results?')
      ? Promise.resolve(new Response('', { status: 503 }))
      : demo(url, init),
  );
  await screen.findByText(/Result status could not be checked/);
  await user.click(screen.getByRole('button', { name: 'Past exams' }));
  expect(screen.getByRole('heading', { name: 'Chemistry · completed' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Graded' })).toBeDisabled();
  expect(screen.getAllByText('Result status not confirmed').length).toBeGreaterThan(0);
});
