// @vitest-environment node
import { expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from '@/features/auth/api';
import { resultsFixture } from '@/features/results/test-fixture';
import { examApi } from './api';
import { monitorApi } from './monitor/api';
import { runnerApi } from '@/features/runner/api';

async function setup() {
  const { store } = resultsFixture();
  store.resultAttempts.clear();
  let time = Date.parse('2026-10-17T05:55:00Z');
  const client = new ApiClient(
    '/api/v1',
    createDemoTransport('student', () => time, store),
  );
  const auth = createAuthApi(client);
  await auth.session();
  const api = examApi(client),
    monitor = monitorApi(client);
  const device = crypto.randomUUID();
  await api.enroll(device);
  const attempt = await api.create('sitting', device, crypto.randomUUID());
  const packet = await api.package(attempt.attemptId);
  const body = {
    packageId: packet.packageId,
    sha256: packet.sha256,
    examVersion: attempt.examVersion,
    scheduleRevision: attempt.scheduleRevision,
    deviceGeneration: attempt.deviceGeneration,
    shellBuild: 'verified-test-build',
  };
  const login = async (role: 'ADMIN' | 'STUDENT') => {
    await auth.logout();
    await auth.login({ loginId: `DEMO-${role}`, password: 'NexoraDemo!' });
    if (role === 'ADMIN') await auth.verify({ code: '123456' });
    await auth.session();
  };
  return {
    api,
    monitor,
    attempt,
    body,
    packet,
    client,
    login,
    setTime: (iso: string) => {
      time = Date.parse(iso);
    },
  };
}
it('reports readiness separately, replays once and monitor reads do not create or refresh it', async () => {
  const c = await setup();
  await c.login('ADMIN');
  const before = await c.monitor.sitting('sitting', null);
  expect(before.sitting.readyCount).toBe(0);
  expect(before.sitting.counts.preparing).toBe(1);
  await expect(c.api.ready(c.attempt.attemptId, c.body, crypto.randomUUID())).rejects.toMatchObject(
    { status: 403 },
  );
  await c.login('STUDENT');
  const key = crypto.randomUUID();
  const response = await c.api.ready(c.attempt.attemptId, c.body, key);
  expect(await c.api.ready(c.attempt.attemptId, c.body, key)).toEqual(response);
  await expect(
    c.api.ready(c.attempt.attemptId, { ...c.body, shellBuild: 'other' }, key),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await c.login('ADMIN');
  const first = await c.monitor.sitting('sitting', null);
  expect(first.sitting.readyCount).toBe(1);
  expect(first.sitting.counts.preparing).toBe(1);
  c.setTime('2026-10-17T05:56:00Z');
  expect((await c.monitor.sitting('sitting', null)).rows).toEqual(first.rows);
  await c.login('STUDENT');
  c.setTime(c.attempt.startsAt);
  await runnerApi(c.client).unlock(c.attempt, c.packet);
  await c.login('ADMIN');
  expect((await c.monitor.sitting('sitting', null)).sitting).toMatchObject({
    readyCount: 0,
    counts: { active: 1 },
  });
});
it('rejects wrong package/version/generation and clears readiness on device transfer', async () => {
  const c = await setup();
  for (const bad of [
    { ...c.body, sha256: '0'.repeat(64) },
    { ...c.body, examVersion: 2 },
    { ...c.body, scheduleRevision: 2 },
    { ...c.body, deviceGeneration: 2 },
  ]) {
    await expect(c.api.ready(c.attempt.attemptId, bad, crypto.randomUUID())).rejects.toMatchObject({
      code: 'READINESS_MISMATCH',
    });
  }
  const key = crypto.randomUUID();
  await c.api.ready(c.attempt.attemptId, c.body, key);
  const replacement = crypto.randomUUID();
  await c.api.enroll(replacement);
  await c.login('ADMIN');
  await c.monitor.transfer(
    c.attempt.attemptId,
    { newDeviceId: replacement, expectedDeviceGeneration: 1, reason: 'Broken device' },
    crypto.randomUUID(),
  );
  const current = await c.monitor.sitting('sitting', null);
  expect(current.sitting.readyCount).toBe(0);
  expect(current.rows[0]?.attempt?.readiness).toBeNull();
  await c.login('STUDENT');
  await expect(c.api.ready(c.attempt.attemptId, c.body, key)).rejects.toMatchObject({
    code: 'READINESS_MISMATCH',
  });
});
it('rejects a new report at the deadline but can reconcile a committed same-generation report', async () => {
  const c = await setup();
  const key = crypto.randomUUID();
  const saved = await c.api.ready(c.attempt.attemptId, c.body, key);
  c.setTime(c.attempt.deadlineAt);
  await expect(c.api.ready(c.attempt.attemptId, c.body, crypto.randomUUID())).rejects.toMatchObject(
    { code: 'STATE_CHANGED' },
  );
  expect(await c.api.ready(c.attempt.attemptId, c.body, key)).toEqual(saved);
  await c.login('ADMIN');
  expect((await c.monitor.sitting('sitting', null)).sitting.readyCount).toBe(0);
});
