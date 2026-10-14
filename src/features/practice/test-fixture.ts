import { createAuthApi } from '@/features/auth/api';
import type { Role } from '@/features/auth/schemas';
import { resultsApi } from '@/features/results/api';
import { resultsFixture } from '@/features/results/test-fixture';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { practiceApi } from './api';

export async function practiceFixture(released = true) {
  const fixture = resultsFixture();
  let time = Date.parse('2026-10-17T06:30:00.000Z');
  const clientFor = async (role: Role) => {
    const transport = createDemoTransport(role, () => time, fixture.store);
    const client = new ApiClient('/api/v1', transport);
    await createAuthApi(client).session();
    return { client, transport, api: practiceApi(client), results: resultsApi(client) };
  };
  const admin = await clientFor('school_admin');
  const student = await clientFor('student');
  const publish = () =>
    admin.results.publish(
      'sitting',
      {
        revision: 1,
        releaseAt: '2026-10-17T07:00:00.000Z',
        reason: 'Reviewed official results.',
        exclusions: [],
      },
      crypto.randomUUID(),
    );
  const enable = async (releaseAt = '2026-10-17T07:00:00.000Z') => {
    const access = await admin.api.access('paper');
    return admin.api.settings(
      'paper',
      {
        revision: access.revision,
        examVersion: 1,
        enabled: true,
        releaseAt,
        reason: 'Release the reviewed paper for practice.',
      },
      crypto.randomUUID(),
    );
  };
  if (released) {
    await publish();
    await enable();
    time = Date.parse('2026-10-17T08:00:00.000Z');
  }
  return {
    ...fixture,
    admin,
    student,
    clientFor,
    publish,
    enable,
    setTime: (value: string) => {
      time = Date.parse(value);
    },
  };
}
