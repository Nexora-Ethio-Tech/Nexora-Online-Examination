import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { it, expect } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
it('opens assignment confirmation before requiring a reason and uses the same flow for removal', async () => {
  const session = '11111111-1111-4111-8111-111111111111',
    staff = '22222222-2222-4222-8222-222222222222';
  let active = false;
  const sent: unknown[] = [];
  const demo = createDemoTransport('school_admin');
  const client = new ApiClient('/api/v1', async (url, init) => {
    if (url.endsWith('/assistance/sessions'))
      return Response.json({
        sessions: [{ id: session, title: 'Exam', startsAt: '2030-01-01T06:00:00Z' }],
      });
    if (url.endsWith('/staff')) {
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body));
        sent.push(body);
        active = body.active;
      }
      return Response.json({
        staff: [
          {
            id: staff,
            displayName: 'Staff Member',
            role: 'teacher',
            mfaEnrolled: true,
            active,
            revision: active ? 1 : 0,
          },
        ],
      });
    }
    if (url.endsWith('/assistance/report'))
      return Response.json({ events: [], totals: [], nextCursor: null });
    return demo(url, init);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <App
      client={client}
      queryClient={queryClient}
      router={createMemoryRouter(routes, { initialEntries: ['/admin/assistance'] })}
    />,
  );
  const user = userEvent.setup();
  await screen.findByRole('option', { name: /Exam —/ });
  await user.selectOptions(screen.getByLabelText('Filter by exam (optional)'), session);
  const assign = await screen.findByRole('button', { name: 'Assign invigilator' });
  expect(assign).toBeEnabled();
  expect(screen.queryByLabelText('Assignment change reason')).not.toBeInTheDocument();
  await user.click(assign);
  let dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Confirm assignment change' })).toBeDisabled();
  await user.type(within(dialog).getByLabelText('Assignment change reason'), 'Supervise this exam');
  await user.click(within(dialog).getByRole('button', { name: 'Confirm assignment change' }));
  await user.click(await screen.findByRole('button', { name: 'Revoke assignment' }));
  dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Assignment change reason'), 'Staff replacement');
  await user.click(within(dialog).getByRole('button', { name: 'Confirm assignment change' }));
  await screen.findByRole('button', { name: 'Assign invigilator' });
  expect(sent).toEqual([
    { staffId: staff, active: true, expectedRevision: 0, reason: 'Supervise this exam' },
    { staffId: staff, active: false, expectedRevision: 1, reason: 'Staff replacement' },
  ]);
  queryClient.clear();
});
