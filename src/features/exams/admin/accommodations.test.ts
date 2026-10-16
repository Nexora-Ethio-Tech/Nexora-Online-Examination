// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { resultsFixture } from '@/features/results/test-fixture';
import { createAuthApi } from '@/features/auth/api';
import { examApi } from '../api';
import { adminExamApi } from './api';
import { resultsApi } from '@/features/results/api';
import { practiceAccess } from '@/mocks/practice';
import { monitorApi } from '../monitor/api';

async function setup() {
  const { store } = resultsFixture();
  store.resultAttempts.clear();
  const approved = store.approved.get('paper');
  if (!approved) throw Error('Fixture missing');
  store.drafts.set('paper', structuredClone(approved.draft));
  let time = Date.parse('2026-10-17T05:40:00Z');
  const client = new ApiClient(
    '/api/v1',
    createDemoTransport('school_admin', () => time, store),
  );
  const auth = createAuthApi(client);
  await auth.session();
  return {
    store,
    client,
    admin: adminExamApi(client),
    setTime: (t: string) => {
      time = Date.parse(t);
    },
    login: async (role: string) => {
      await auth.logout();
      await auth.login({ loginId: `DEMO-${role}`, password: 'NexoraDemo!' });
      if (role === 'ADMIN') await auth.verify({ code: '123456' });
      await auth.session();
    },
  };
}
const change = {
  scheduleRevision: 1,
  studentId: 'demo-student',
  extraMinutes: 15,
  reason: 'Approved allowance A-12',
};
describe('extra-time accommodation integrity', () => {
  it('sets an audited personal deadline, blocks publication for absent students and preserves the deadline on late joining', async () => {
    const c = await setup();
    const result = await c.admin.setAccommodation('sitting', change, crypto.randomUUID());
    expect(result.student).toMatchObject({
      extraMinutes: 15,
      deadlineAt: '2026-10-17T06:35:00.000Z',
      lastChange: { previousExtraMinutes: 0, reason: change.reason },
    });
    expect(result.session).toMatchObject({
      endsAt: '2026-10-17T06:20:00.000Z',
      latestDeadlineAt: '2026-10-17T06:35:00.000Z',
      scheduleRevision: 2,
    });
    expect((await resultsApi(c.client).results('sitting', null)).summary.publishableAfter).toBe(
      '2026-10-17T06:35:05.000Z',
    );
    c.setTime('2026-10-17T06:25:00Z');
    expect(
      practiceAccess(c.store, 'paper', () => Date.parse('2026-10-17T06:25:00Z'))?.blockers,
    ).toContain('All related sittings, including extra-time submission windows, must close first.');
    const monitor = await monitorApi(c.client).sitting('sitting', null);
    expect(monitor.sitting.latestDeadlineAt).toBe('2026-10-17T06:35:00.000Z');
    await c.login('STUDENT');
    const student = examApi(c.client);
    expect((await student.detail('sitting')).exam).toMatchObject({
      phase: 'open',
      endsAt: '2026-10-17T06:20:00.000Z',
      deadlineAt: '2026-10-17T06:35:00.000Z',
    });
    const device = crypto.randomUUID();
    await student.enroll(device);
    const attempt = await student.create('sitting', device, crypto.randomUUID());
    expect(attempt).toMatchObject({
      scheduleRevision: 2,
      deadlineAt: '2026-10-17T06:35:00.000Z',
      finalAcceptUntil: '2026-10-17T06:35:05.000Z',
    });
  });
  it('replays a committed change after cutoff, rejects changed payload, stale revision and new changes at the boundary', async () => {
    const c = await setup();
    const key = crypto.randomUUID();
    const result = await c.admin.setAccommodation('sitting', change, key);
    await expect(
      c.admin.setAccommodation('sitting', { ...change, extraMinutes: 20 }, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    c.setTime('2026-10-17T05:50:00Z');
    expect((await c.admin.accommodations('sitting')).session.canEdit).toBe(false);
    await expect(
      c.admin.setAccommodation(
        'sitting',
        { ...change, scheduleRevision: 2, extraMinutes: 0 },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ACCOMMODATIONS_LOCKED' });
    expect(await c.admin.setAccommodation('sitting', change, key)).toEqual(result);
    await expect(
      c.admin.setAccommodation('sitting', { ...change, extraMinutes: 20 }, key),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(c.store.history.get('paper')).toHaveLength(1);
  });
  it('retains minutes on reschedule, validates latest deadline and permits removal before preparation', async () => {
    const c = await setup();
    await c.admin.setAccommodation('sitting', change, crypto.randomUUID());
    const body = {
      scheduleRevision: 2,
      preparationVisibleAt: '2026-10-17T05:55:00Z',
      resultsReleaseAt: '2026-10-17T06:30:00Z',
      reason: 'Room change',
    };
    await expect(c.admin.reschedule('sitting', body, crypto.randomUUID())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await c.admin.reschedule(
      'sitting',
      { ...body, resultsReleaseAt: '2026-10-17T07:00:00Z' },
      crypto.randomUUID(),
    );
    expect((await c.admin.accommodations('sitting')).items[0]).toMatchObject({
      extraMinutes: 15,
      deadlineAt: '2026-10-17T06:40:00.000Z',
    });
    const removed = await c.admin.setAccommodation(
      'sitting',
      { ...change, scheduleRevision: 3, extraMinutes: 0 },
      crypto.randomUUID(),
    );
    expect(removed.student.deadlineAt).toBe(removed.session.endsAt);
  });
  it('rejects early results, out-of-roster students, unauthorized roles, overlaps and stale cursor pages', async () => {
    const c = await setup();
    await expect(
      c.admin.setAccommodation('sitting', { ...change, extraMinutes: 60 }, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'RESULTS_TIME_CONFLICT' });
    await expect(
      c.admin.setAccommodation(
        'sitting',
        { ...change, studentId: 'other-school' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const sitting = c.store.sessions.get('sitting');
    if (!sitting) throw Error('Missing sitting');
    c.store.sessions.set('later', {
      ...structuredClone(sitting),
      session: {
        ...sitting.session,
        sessionId: 'later',
        preparationVisibleAt: '2026-10-17T06:30:00Z',
      },
    });
    await expect(
      c.admin.setAccommodation('sitting', change, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'SCHEDULE_OVERLAP' });
    c.store.sessions.delete('later');
    await c.admin.setAccommodation('sitting', change, crypto.randomUUID());
    await expect(c.admin.accommodations('sitting', '1:25')).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await c.login('TEACHER');
    await expect(c.admin.accommodations('sitting')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      c.admin.setAccommodation('sitting', change, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
