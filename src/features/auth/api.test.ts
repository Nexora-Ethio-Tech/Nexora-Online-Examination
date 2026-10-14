import { describe, expect, it } from 'vitest';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from './api';

describe('authentication wire contract', () => {
  it('uses anonymous, MFA-challenge and authenticated CSRF tokens in order', async () => {
    const demo = createDemoTransport();
    const tokens: (string | null)[] = [];
    const transport: Transport = (url, init) => {
      if (init.method === 'POST') tokens.push(new Headers(init.headers).get('X-CSRF-Token'));
      return demo(url, init);
    };
    const api = createAuthApi(new ApiClient('/api/v1', transport));
    expect(await api.session()).toBeNull();
    expect(await api.login({ loginId: 'DEMO-ADMIN', password: 'NexoraDemo!' })).toMatchObject({
      status: 'mfa_required',
    });
    await api.verify({ code: '123456' });
    expect(await api.session()).toMatchObject({ user: { role: 'school_admin' } });
    await api.logout();
    expect(tokens).toEqual([
      'demo-anonymous-csrf',
      'demo-challenge-csrf',
      'demo-authenticated-csrf',
    ]);
    expect(await api.session()).toBeNull();
  });
});
