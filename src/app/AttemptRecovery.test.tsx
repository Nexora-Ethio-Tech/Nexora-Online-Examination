import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { App } from './App';
import { routes } from './router';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { sessionSchema } from '@/features/auth/schemas';
import { authenticatedDestination, rememberAttempt } from '@/features/auth/attempt-resume';
import * as store from '@/features/runner/store';
import { attemptSchema } from '@/features/exams/schemas';
import { paperSchema } from '@/features/runner/schemas';
import fixture from '../../docs/fixtures/student-exam-v1.json';

// Web Locks are covered by runner tests; jsdom has no browser lock manager.
vi.mock('@/features/runner/lock', () => ({ acquireWriter: async () => () => undefined }));

afterEach(() => sessionStorage.removeItem('nexora-attempt-return'));
async function student() {
  return sessionSchema.parse(
    await (await createDemoTransport('student')('/api/v1/auth/me', {})).json(),
  );
}
it('shows private-free recovery guidance on a cold offline route and retries without reading attempts', async () => {
  const demo = createDemoTransport('student');
  const session = await student();
  rememberAttempt(session, '/student/attempts/missing-attempt');
  const attempt = attemptSchema.parse({
    attemptId: 'missing-attempt',
    sessionId: 's',
    examVersion: 1,
    scheduleRevision: 1,
    deviceGeneration: 1,
    state: 'active',
    serverNow: '2026-10-15T06:00:00Z',
    startsAt: '2026-10-15T06:00:00Z',
    deadlineAt: '2026-10-15T07:00:00Z',
    finalAcceptUntil: '2026-10-15T07:00:05Z',
    lastServerSaveAt: null,
    highestAcceptedSeq: 0,
    answers: [],
    receipt: null,
    recovery: null,
  });
  const row = await store.initialize(
    { schoolId: session.school.id, userId: session.user.id },
    attempt,
    paperSchema.parse(fixture.plaintext),
  );
  await store.saveAnswer(row.key, 'q1', 'option-b', 0);
  const frozen = await store.freeze(row.key);
  let offline = true;
  const paths: string[] = [];
  const transport: Transport = (url, init) => {
    paths.push(url);
    return offline ? Promise.reject(new Error('offline')) : demo(url, init);
  };
  const router = createMemoryRouter(routes, {
    initialEntries: ['/student/attempts/missing-attempt'],
  });
  render(
    <App
      router={router}
      client={new ApiClient('/api/v1', transport)}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    />,
  );
  await screen.findByRole('heading', { name: 'Reconnect to recover your exam' });
  expect(screen.getByText(/Do not clear site storage/)).toBeInTheDocument();
  expect(paths.every((p) => p.endsWith('/auth/me'))).toBe(true);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(await store.readRecord(row.key)).toEqual(frozen);
  offline = false;
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(paths.some((p) => p.includes('/attempts/missing-attempt'))).toBe(true),
  );
  expect((await store.readRecord(row.key))?.final).toEqual(frozen.final);
});
it('returns the same student to the retained attempt after expired-session login', async () => {
  const session = await student();
  rememberAttempt(session, '/student/attempts/missing-attempt');
  const router = createMemoryRouter(routes, {
    initialEntries: ['/student/attempts/missing-attempt'],
  });
  render(
    <App
      router={router}
      client={new ApiClient('/api/v1', createDemoTransport())}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    />,
  );
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('User ID'), 'DEMO-STUDENT');
  await user.type(screen.getByLabelText('Password'), 'NexoraDemo!');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/student/attempts/missing-attempt'),
  );
});
it('does not resume another identity or school and rejects external redirect hints', async () => {
  const session = await student();
  rememberAttempt(session, '/student/attempts/retained');
  expect(authenticatedDestination({ ...session, user: { ...session.user, id: 'different' } })).toBe(
    '/student',
  );
  expect(
    authenticatedDestination({ ...session, school: { ...session.school, id: 'different' } }),
  ).toBe('/student');
  sessionStorage.setItem(
    'nexora-attempt-return',
    JSON.stringify({
      path: 'https://example.com',
      userId: session.user.id,
      schoolId: session.school.id,
    }),
  );
  expect(authenticatedDestination(session)).toBe('/student');
});
