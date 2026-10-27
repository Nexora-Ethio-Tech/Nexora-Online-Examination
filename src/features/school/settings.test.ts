import { expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { schoolApi } from './api';

it('preserves school-name replay and rejects stale edits in the development simulator', async () => {
  const client = new ApiClient('/api/v1', createDemoTransport('school_admin'));
  client.setCsrfToken('demo-authenticated-csrf');
  const api = schoolApi(client);
  const original = await api.profile();
  const key = crypto.randomUUID();
  const first = { name: 'First School', expectedName: original.name };
  expect(await api.saveProfile(first, key)).toEqual({ name: 'First School' });
  await api.saveProfile(
    { name: 'Second School', expectedName: 'First School' },
    crypto.randomUUID(),
  );
  expect(await api.saveProfile(first, key)).toEqual({ name: 'First School' });
  expect(await api.profile()).toEqual({ name: 'Second School' });
  await expect(api.saveProfile(first, crypto.randomUUID())).rejects.toMatchObject({ status: 409 });
  await expect(api.saveProfile({ ...first, name: 'Another' }, key)).rejects.toMatchObject({
    status: 409,
  });
});

it.each(['teacher', 'student'] as const)(
  'denies %s access to school profile settings',
  async (role) => {
    const client = new ApiClient('/api/v1', createDemoTransport(role));
    client.setCsrfToken('demo-authenticated-csrf');
    const api = schoolApi(client);
    await expect(api.profile()).rejects.toMatchObject({ status: 403 });
    await expect(
      api.saveProfile(
        { name: 'Unauthorized', expectedName: 'Nexora Demo School' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  },
);
