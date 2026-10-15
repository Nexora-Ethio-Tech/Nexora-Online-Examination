import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { DesignPreview } from './DesignPreview';
import { routes } from './router';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';

function setup(transport = createDemoTransport(), path = '/login') {
  const client = new ApiClient('/api/v1', transport);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<App client={client} router={router} queryClient={queryClient} />);
  return { user: userEvent.setup(), client, router, queryClient };
}
async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  id: string,
  password = 'NexoraDemo!',
) {
  await user.type(await screen.findByLabelText('User ID'), id);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('authentication and routing', () => {
  it('retains the existing design preview', () => {
    render(<DesignPreview />);
    expect(screen.getByRole('heading', { name: 'Exam Platform' })).toBeInTheDocument();
  });
  it.each([
    ['DEMO-STUDENT', '/student'],
    ['DEMO-TEACHER', '/teacher'],
  ])('signs in %s and opens its role workspace', async (id, path) => {
    const { user, router } = setup();
    await signIn(user, id);
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });
  it('keeps an administrator out until MFA succeeds, and allows a bad code to be retried', async () => {
    const { user, router } = setup();
    await signIn(user, 'DEMO-ADMIN');
    await user.type(await screen.findByLabelText('Verification code'), '000000');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/mfa');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByText('The verification code is incorrect.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
  });
  it('rejects bad credentials without an auth redirect or retaining the password', async () => {
    const { user, router } = setup();
    await signIn(user, 'DEMO-STUDENT', 'wrong');
    expect(await screen.findByText('The user ID or password is incorrect.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(router.state.location.pathname).toBe('/login');
  });
  it('restores an authenticated session and redirects a wrong-role URL', async () => {
    const { router } = setup(createDemoTransport('teacher'), '/admin');
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/teacher');
  });
  it('redirects anonymous protected URLs to login', async () => {
    const { router } = setup(createDemoTransport(), '/student');
    expect(await screen.findByLabelText('User ID')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
  it('clears private query data on logout without touching unrelated browser evidence', async () => {
    const { user, queryClient } = setup(createDemoTransport('student'), '/student');
    await screen.findByRole('button', { name: 'Sign out' });
    queryClient.setQueryData(['school', 'private'], { students: ['private'] });
    sessionStorage.setItem('test-unrelated-evidence', 'retained');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('User ID')).toBeInTheDocument();
    expect(queryClient.getQueryData(['school', 'private'])).toBeUndefined();
    expect(sessionStorage.getItem('test-unrelated-evidence')).toBe('retained');
    sessionStorage.removeItem('test-unrelated-evidence');
  });
  it('does not pretend logout succeeded when the server fails', async () => {
    const demo = createDemoTransport('student');
    const transport: Transport = (url, init) =>
      url.endsWith('/auth/logout')
        ? Promise.resolve(new Response('unavailable', { status: 503 }))
        : demo(url, init);
    const { user, router } = setup(transport, '/student');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The server could not complete');
    expect(router.state.location.pathname).toBe('/student');
  });
  it('provides a retry when the initial session cannot be checked', async () => {
    const demo = createDemoTransport();
    let fail = true;
    const transport: Transport = (url, init) =>
      fail ? Promise.reject(new Error('offline')) : demo(url, init);
    const { user } = setup(transport);
    expect(
      await screen.findByRole('heading', { name: 'We couldn’t check your session' }),
    ).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('User ID')).toBeInTheDocument();
  });
  it('invalidates the UI session after a protected API returns 401', async () => {
    const demo = createDemoTransport('student');
    const transport: Transport = (url, init) =>
      url.endsWith('/private')
        ? Promise.resolve(new Response('{}', { status: 401 }))
        : demo(url, init);
    const { client, queryClient } = setup(transport, '/student');
    await screen.findByRole('button', { name: 'Sign out' });
    queryClient.setQueryData(['private'], 'secret');
    const { z } = await import('zod');
    await expect(client.request('/private', z.unknown())).rejects.toMatchObject({ status: 401 });
    await waitFor(() => expect(screen.getByLabelText('User ID')).toBeInTheDocument());
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });
});
