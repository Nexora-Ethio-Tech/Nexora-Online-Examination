import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthoringStore } from '@/mocks/authoring-store';
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXJjb2Rl') },
}));

it('redirects invigilators away from teacher tools and keeps enrollment secrets out of caches', async () => {
  let enrolled = false;
  const store = createAuthoringStore();
  const teacher = store.directory.accounts.get('demo-teacher');
  const password = store.directory.passwords.get('demo-teacher');
  if (!teacher || !password) throw new Error('Missing test fixture');
  store.directory.accounts.set('demo-invigilator', {
    ...teacher,
    userId: 'demo-invigilator',
    loginId: 'TEST-INV',
    role: 'invigilator',
  });
  store.directory.passwords.set('demo-invigilator', password);
  const demo = createDemoTransport('invigilator', undefined, store);
  const sent: unknown[] = [];
  const client = new ApiClient('/api/v1', async (url, init) => {
    if (url.endsWith('/assistance/authenticator'))
      return Response.json({ enrolled, selfSetupAllowed: !enrolled });
    if (url.endsWith('/authenticator/setup')) {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({
        secret: 'PRIVATESETUPKEY',
        otpauthUri: 'otpauth://totp/Nexora?secret=PRIVATESETUPKEY',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });
    }
    if (url.endsWith('/authenticator/confirm')) {
      sent.push(JSON.parse(String(init.body)));
      enrolled = true;
      return Response.json({ enrolled, selfSetupAllowed: false });
    }
    return demo(url, init);
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: ['/teacher'] });
  render(<App client={client} queryClient={cache} router={router} />);
  await screen.findByLabelText('Confirm your password');
  expect(router.state.location.pathname).toBe('/invigilator');
  expect(screen.queryByRole('link', { name: 'Official results' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'School setup' })).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Confirm your password'), 'private-password');
  await user.click(screen.getByRole('button', { name: 'Set up authenticator' }));
  await screen.findByAltText('Your private Nexora authenticator setup QR code');
  await user.type(screen.getByLabelText('Authenticator setup code'), '654321');
  await user.click(screen.getByRole('button', { name: 'Confirm authenticator' }));
  await waitFor(() =>
    expect(
      screen.queryByAltText('Your private Nexora authenticator setup QR code'),
    ).not.toBeInTheDocument(),
  );
  expect(sent).toEqual([{ password: 'private-password' }, { code: '654321' }]);
  const cached = JSON.stringify(
    cache
      .getQueryCache()
      .getAll()
      .map((q) => q.state.data),
  );
  for (const secret of ['private-password', 'PRIVATESETUPKEY', '654321'])
    expect(cached).not.toContain(secret);
  expect(cache.getMutationCache().getAll()).toHaveLength(0);
  cache.clear();
});
