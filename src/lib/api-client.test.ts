import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient } from './api-client';

describe('API client', () => {
  it('honors Retry-After without sending another request during the wait', async () => {
    const transport = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }),
    );
    const client = new ApiClient('/api/v1', transport);
    await expect(client.request('/auth/me', z.unknown())).rejects.toMatchObject({ status: 429 });
    await expect(client.request('/auth/me', z.unknown())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('times out a stalled request without retrying it', async () => {
    const transport = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const client = new ApiClient('/api/v1', transport, 10);
    await expect(client.request('/auth/me', z.unknown())).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('sends credentialed cookies and CSRF without retrying a mutation', async () => {
    const transport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'CSRF_INVALID',
            message: 'Expired token',
            details: [],
            requestId: 'r1',
          }),
          { status: 403 },
        ),
    );
    const client = new ApiClient('/api/v1', transport);
    client.setCsrfToken('token');
    await expect(
      client.request('/auth/logout', z.undefined(), { method: 'POST' }),
    ).rejects.toMatchObject({ code: 'CSRF_INVALID', requestId: 'r1' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        cache: 'no-store',
        headers: expect.any(Headers),
      }),
    );
  });
  it('refuses a mutation without a CSRF token', async () => {
    const transport = vi.fn();
    await expect(
      new ApiClient('/api/v1', transport).request('/auth/logout', z.undefined(), {
        method: 'POST',
      }),
    ).rejects.toMatchObject({ code: 'CSRF_REQUIRED' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects malformed success responses', async () => {
    const client = new ApiClient('/api/v1', async () => new Response('{"role":"owner"}'));
    await expect(
      client.request('/auth/me', z.object({ user: z.object({ id: z.string() }) })),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('normalizes non-JSON failures and preserves retry-after', async () => {
    const client = new ApiClient(
      '/api/v1',
      async () => new Response('busy', { status: 429, headers: { 'Retry-After': '30' } }),
    );
    await expect(client.request('/auth/me', z.unknown())).rejects.toMatchObject({
      code: 'HTTP_429',
      retryAfterSeconds: 30,
    });
  });
  it('notifies on protected 401s, but not on invalid login', async () => {
    const client = new ApiClient('/api/v1', async () => new Response('{}', { status: 401 }));
    const listener = vi.fn();
    client.onUnauthorized(listener);
    await expect(
      client.request('/auth/me', z.unknown(), { notifyUnauthorized: false }),
    ).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.request('/private', z.unknown())).rejects.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

it('reports connection loss once and clears it after a response without treating cancellation as offline', async () => {
  let fail = true;
  const client = new ApiClient('/api/v1', async () => {
    if (fail) throw new TypeError('Network lost');
    return Response.json({});
  });
  const changed = vi.fn();
  const unsubscribe = client.onConnectionChange(changed);
  await expect(client.request('/first', z.unknown())).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
  });
  await expect(client.request('/second', z.unknown())).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
  });
  expect(client.connectionUnavailable()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  fail = false;
  await client.request('/first', z.unknown());
  expect(client.connectionUnavailable()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    client.request('/cancelled', z.unknown(), { signal: aborted.signal }),
  ).rejects.toThrow();
  expect(client.connectionUnavailable()).toBe(false);
});
