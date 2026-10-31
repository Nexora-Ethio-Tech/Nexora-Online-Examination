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
    await user.type(screen.getByLabelText('School short name'), 'Example School');
    await user.type(screen.getByLabelText('First administrator ID'), 'ADMIN-EXAMPLE');
    await user.type(screen.getByLabelText('First name'), 'Example');
    await user.type(screen.getByLabelText("Father's name"), 'Admin');
    await user.type(screen.getByLabelText("Grandfather's name"), 'Test');
    expect(screen.getByLabelText('Phone number (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Recovery email (optional)')).not.toBeRequired();
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Authentication code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm owner action' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Authentication code')).toHaveValue('');
    await user.type(screen.getByLabelText('Authentication code'), '987654');
    await user.click(screen.getByRole('button', { name: 'Confirm owner action' }));
    await screen.findByText(/Credentials cannot be retrieved again/);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.slug).toBe('example-school');
    expect(sent[0]?.phoneNumber).toBe('');
    expect(sent[0]?.recoveryEmail).toBe('');
    expect(sent[1]?.requestId).toBe(sent[0]?.requestId);
    expect(sent[1]?.code).toBe('987654');
  });

  it('auto-generates a short first administrator ID reflecting the school name without typing and displays it after creation', async () => {
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
        const payload = JSON.parse(String(init.body));
        sent.push(payload);
        return Response.json({
          schoolId,
          adminId: schoolId,
          loginId: payload.loginId,
          message: 'School created. Admin is inactive until protected MFA enrollment is confirmed.',
          credential: 'temp-password-123',
          replayed: false,
        });
      }
      return failure();
    });
    render(<PlatformApp client={client} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add school' }));

    // Type only school name: First administrator ID should be automatically generated!
    await user.type(screen.getByLabelText('School name'), 'Bole Secondary School');
    const adminIdInput = screen.getByLabelText('First administrator ID') as HTMLInputElement;
    expect(adminIdInput.value).toMatch(/^ADM-BOLE-[2-9A-HJ-NP-Z]{4}$/);
    const generatedId = adminIdInput.value;
    expect(generatedId.length).toBeLessThanOrEqual(16);

    // Clicking "Generate new ID" regenerates a unique suffix
    await user.click(screen.getByRole('button', { name: 'Generate new ID' }));
    const regeneratedId = (screen.getByLabelText('First administrator ID') as HTMLInputElement)
      .value;
    expect(regeneratedId).toMatch(/^ADM-BOLE-[2-9A-HJ-NP-Z]{4}$/);
    expect(regeneratedId).not.toBe(generatedId);

    // Complete the rest of required fields without typing into First administrator ID
    await user.type(screen.getByLabelText('School short name'), 'Bole School');
    await user.type(screen.getByLabelText('First name'), 'Abebe');
    await user.type(screen.getByLabelText("Father's name"), 'Kebede');
    await user.type(screen.getByLabelText("Grandfather's name"), 'Tesfaye');
    await user.type(screen.getByLabelText('Authentication code'), '123456');

    await user.click(screen.getByRole('button', { name: 'Confirm owner action' }));

    // Confirm that the auto-generated ID was submitted
    expect(sent).toHaveLength(1);
    expect(sent[0]?.loginId).toBe(regeneratedId);

    // And verify that after creating the school, First administrator ID is displayed
    await screen.findByText(
      'School created. Admin is inactive until protected MFA enrollment is confirmed.',
    );
    expect(screen.getAllByText(regeneratedId).length).toBeGreaterThan(0);
    expect(screen.getAllByText('First administrator ID').length).toBeGreaterThan(0);
  });

  it('auto-generates a short first administrator ID reflecting the school name without typing and displays it after creation', async () => {
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
        const payload = JSON.parse(String(init.body));
        sent.push(payload);
        return Response.json({
          schoolId,
          adminId: schoolId,
          loginId: payload.loginId,
          message: 'School created. Admin is inactive until protected MFA enrollment is confirmed.',
          credential: 'temp-password-123',
          replayed: false,
        });
      }
      return failure();
    });
    render(<PlatformApp client={client} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add school' }));

    // Type only school name: First administrator ID should be automatically generated!
    await user.type(screen.getByLabelText('School name'), 'Bole Secondary School');
    const adminIdInput = screen.getByLabelText('First administrator ID') as HTMLInputElement;
    expect(adminIdInput.value).toMatch(/^ADM-BOLE-[2-9A-HJ-NP-Z]{4}$/);
    const generatedId = adminIdInput.value;
    expect(generatedId.length).toBeLessThanOrEqual(16);

    // Clicking "Generate new ID" regenerates a unique suffix
    await user.click(screen.getByRole('button', { name: 'Generate new ID' }));
    const regeneratedId = (screen.getByLabelText('First administrator ID') as HTMLInputElement).value;
    expect(regeneratedId).toMatch(/^ADM-BOLE-[2-9A-HJ-NP-Z]{4}$/);
    expect(regeneratedId).not.toBe(generatedId);

    // Complete the rest of required fields without typing into First administrator ID
    await user.type(screen.getByLabelText('School short name'), 'Bole School');
    await user.type(screen.getByLabelText('First name'), 'Abebe');
    await user.type(screen.getByLabelText("Father's name"), 'Kebede');
    await user.type(screen.getByLabelText("Grandfather's name"), 'Tesfaye');
    await user.type(screen.getByLabelText('Authentication code'), '123456');

    await user.click(screen.getByRole('button', { name: 'Confirm owner action' }));

    // Confirm that the auto-generated ID was submitted
    expect(sent).toHaveLength(1);
    expect(sent[0]?.loginId).toBe(regeneratedId);

    // And verify that after creating the school, First administrator ID is displayed
    await screen.findByText('School created. Admin is inactive until protected MFA enrollment is confirmed.');
    expect(screen.getAllByText(regeneratedId).length).toBeGreaterThan(0);
    expect(screen.getAllByText('First administrator ID').length).toBeGreaterThan(0);
  });
});
