import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { adminDetailSchema } from './schemas';

it('prepares an existing pending paper explicitly and opens scheduling only after server readiness', async () => {
  let ready = false;
  let requested = 0;
  const detail = adminDetailSchema.parse({
    exam: {
      examId: 'pending-paper',
      revision: 1,
      title: 'Pending mathematics',
      instructions: 'Answer all.',
      assignmentId: 'demo-math-10a',
      language: 'en',
      durationMinutes: 20,
      passPercent: 50,
      ordering: 'fixed',
      status: 'approved',
      totalMarks: 2,
      itemCount: 1,
      reviewedCount: 1,
      importId: null,
      returnComment: null,
    },
    teacherName: 'Dawit',
    className: 'Grade 10 A',
    subjectName: 'Mathematics',
    approvedVersion: 1,
    packageState: 'pending',
    packageError: null,
    items: [],
    sessions: [],
    history: [],
    serverNow: new Date().toISOString(),
  });
  const demo = createDemoTransport('school_admin');
  const client = new ApiClient('/api/v1', async (url, init) => {
    if (url.endsWith('/exams/pending-paper/package-retry') && init.method === 'POST') {
      expect(JSON.parse(String(init.body))).toEqual({ revision: 1 });
      expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
      requested++;
      ready = true;
      return Response.json({
        ...detail,
        exam: { ...detail.exam, revision: 2 },
        packageState: 'ready',
      });
    }
    if (url.endsWith('/admin/exams/pending-paper'))
      return Response.json({
        ...detail,
        exam: { ...detail.exam, revision: ready ? 2 : 1 },
        packageState: ready ? 'ready' : 'pending',
      });
    return demo(url, init);
  });
  render(
    <App
      client={client}
      router={createMemoryRouter(routes, { initialEntries: ['/admin/exams/pending-paper'] })}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    />,
  );
  const user = userEvent.setup();
  const prepare = await screen.findByRole('button', { name: 'Prepare student paper now' });
  expect(
    screen.queryByRole('heading', { name: 'Schedule a class sitting' }),
  ).not.toBeInTheDocument();
  await user.click(prepare);
  expect(
    await screen.findByRole('heading', { name: 'Schedule a class sitting' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Prepare student paper now' }),
  ).not.toBeInTheDocument();
  expect(requested).toBe(1);
});
