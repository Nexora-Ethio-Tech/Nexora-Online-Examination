import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { PlatformApp } from './PlatformApp';

const schoolId = '11111111-1111-4111-8111-111111111111';
const failure = () =>
  Response.json(
    { code: 'AUTH_REQUIRED', message: 'Owner login required', details: [], requestId: 'test' },
    { status: 401 },
  );
describe('owner portal', () => {
  it('uses its own login and clears password and code after a failed attempt', async () => {
    const sent: unknown[] = [];
    const client = new ApiClient('/platform-api/v1', async (url, init) => {
      if (url.endsWith('/auth/csrf')) return Response.json({ csrfToken: 'owner-csrf' });
      if (url.endsWith('/auth/login')) sent.push(JSON.parse(String(init.body)));
      return failure();
    });
    render(<PlatformApp client={client} />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Owner sign-in' });
    await user.type(screen.getByLabelText('Owner ID'), 'OWNER');
    await user.type(screen.getByLabelText('Password'), 'private-password');
    await user.type(screen.getByLabelText('Authenticator code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Sign in as owner' }));
    await screen.findByText('Owner login required');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Authenticator code')).toHaveValue('');
    expect(sent).toEqual([{ loginId: 'OWNER', password: 'private-password', code: '654321' }]);
    expect(screen.queryByRole('heading', { name: 'Schools' })).not.toBeInTheDocument();
  });
  it('preserves the operation key after a lost response and explains that replay cannot retrieve a password', async () => {
    const sent: Record<string, unknown>[] = [];
    const client = new ApiClient('/platform-api/v1', async (url, init) => {
      if (url.endsWith('/auth/csrf')) return Response.json({ csrfToken: 'owner-csrf' });
      if (url.endsWith('/auth/me')) return Response.json({ displayName: 'Owner' });
      if (url.endsWith('/schools')) return Response.json({ schools: [], nextCursor: null });
      if (url.endsWith('/health'))
        return Response.json({
          database: 'reachable',
          sampledAt: '2030-01-01T00:00:00Z',
          queues: [],
        });
      if (url.endsWith('/audit')) return Response.json({ events: [], nextCursor: null });
      if (url.endsWith('/actions')) {
        sent.push(JSON.parse(String(init.body)));
        if (sent.length === 1) throw new TypeError('Lost response');
        return Response.json({
          schoolId,
          adminId: schoolId,
          message: 'School created; MFA pending',
          credential: null,
          replayed: true,
        });
      }
      return failure();
    });
    render(<PlatformApp client={client} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add school' }));
    await user.type(screen.getByLabelText('School name'), 'Example School');
    await user.type(screen.getByLabelText('School address name (lowercase)'), 'example-school');
    await user.type(screen.getByLabelText('First administrator ID'), 'ADMIN-EXAMPLE');
    await user.type(screen.getByLabelText('Administrator name'), 'Example Admin');
    await user.type(screen.getByLabelText('Reason'), 'Verified school registration');
    await user.type(screen.getByLabelText('Fresh owner authenticator code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm owner action' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Fresh owner authenticator code')).toHaveValue('');
    await user.type(screen.getByLabelText('Fresh owner authenticator code'), '987654');
    await user.click(screen.getByRole('button', { name: 'Confirm owner action' }));
    await screen.findByText(/Credentials cannot be retrieved again/);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.requestId).toBe(sent[0]?.requestId);
    expect(sent[1]?.code).toBe('987654');
  });
});
