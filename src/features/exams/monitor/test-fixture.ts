import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from '@/features/auth/api';
import { resultsFixture } from '@/features/results/test-fixture';
import { examApi } from '../api';
import { runnerApi } from '@/features/runner/api';
import { monitorApi } from './api';

export async function monitorFixture(
  intercept?: (url: string, init: RequestInit, next: Transport) => Promise<Response>,
) {
  const fixture = resultsFixture();
  fixture.store.resultAttempts.clear();
  let time = Date.parse('2026-10-17T06:00:00.000Z');
  const transport = createDemoTransport('student', () => time, fixture.store);
  const client = new ApiClient(
    '/api/v1',
    intercept ? (url, init) => intercept(url, init, transport) : transport,
  );
  const auth = createAuthApi(client);
  await auth.session();
  const exams = examApi(client);
  const runner = runnerApi(client);
  const monitor = monitorApi(client);
  const device = crypto.randomUUID();
  await exams.enroll(device);
  const attempt = await exams.create('sitting', device, crypto.randomUUID());
  const packet = await exams.package(attempt.attemptId);
  const unlock = await runner.unlock(attempt, packet);
  const first = fixture.items[0];
  if (!first) throw new Error('Fixture missing item');
  await runner.save(attempt, [
    { itemId: first.itemId, value: first.correctOptionId, clientSeq: 1 },
  ]);
  const replacement = crypto.randomUUID();
  await exams.enroll(replacement);
  const login = async (role: 'ADMIN' | 'TEACHER' | 'STUDENT') => {
    await auth.logout();
    await auth.login({ loginId: `DEMO-${role}`, password: 'NexoraDemo!' });
    if (role === 'ADMIN') await auth.verify({ code: '123456' });
    await auth.session();
  };
  await login('ADMIN');
  return {
    ...fixture,
    first,
    client,
    auth,
    exams,
    runner,
    monitor,
    attempt,
    packet,
    unlock,
    device,
    replacement,
    login,
    body: {
      newDeviceId: replacement,
      expectedDeviceGeneration: 1,
      reason: 'School staff verified the replacement after a damaged screen.',
    },
    advance: (ms: number) => {
      time += ms;
    },
    setTime: (iso: string) => {
      time = Date.parse(iso);
    },
  };
}
