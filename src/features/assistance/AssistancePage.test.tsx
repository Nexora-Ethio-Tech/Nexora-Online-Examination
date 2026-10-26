import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';

describe('staff assistance screen', () => {
  it('allows reopening approval without a note, requires a rejection reason and clears failed codes', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const requestId = '22222222-2222-4222-8222-222222222222';
    const demo = createDemoTransport('teacher');
    const sent: unknown[] = [];
    const client = new ApiClient('/api/v1', async (url, init) => {
      if (url.endsWith('/assistance/sessions'))
        return Response.json({
          sessions: [{ id: sessionId, title: 'Test sitting', startsAt: '2030-01-01T06:00:00Z' }],
        });
      if (url.endsWith('/requests'))
        return Response.json({
          requests: [
            {
              id: requestId,
              attemptId: sessionId,
              status: 'pending',
              expiresAt: '2030-01-01T07:00:00Z',
              reason: null,
              displayName: 'Student A',
              loginId: 'STUDENT-1',
              deviceGeneration: 1,
            },
          ],
        });
      if (url.endsWith('/decision')) {
        sent.push(JSON.parse(String(init.body)));
        return Response.json(
          { code: 'FORBIDDEN', message: 'Incorrect code', details: [], requestId },
          { status: 403 },
        );
      }
      return demo(url, init);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <App
        client={client}
        queryClient={queryClient}
        router={createMemoryRouter(routes, { initialEntries: ['/teacher/assistance'] })}
      />,
    );
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /Test sitting/ });
    expect(screen.getByLabelText('Filter by exam (optional)')).toHaveValue('');
    const approve = await screen.findByRole('button', { name: 'Approve reopening' });
    expect(approve).toBeDisabled();
    await user.type(screen.getByLabelText('Your authenticator code'), '654321');
    expect(approve).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject request' })).toBeDisabled();
    await user.click(approve);
    await screen.findByText('Incorrect code');
    expect(screen.getByLabelText('Your authenticator code')).toHaveValue('');
    expect(sent).toEqual([{ action: 'approve', reason: '', code: '654321' }]);
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('654321');
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(screen.queryByText('Assign teachers to this sitting')).not.toBeInTheDocument();
    queryClient.clear();
  });
});
