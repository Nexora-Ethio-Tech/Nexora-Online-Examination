// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from '@/features/auth/api';
import { monitorApi } from './api';
import { monitorListSchema, monitorRowSchema, sittingSchema } from './schemas';
import { monitorFixture } from './test-fixture';
import { loadMonitorExample } from './demo-api';

describe('live monitor and device replacement contract', () => {
  it('loads one explicitly synthetic rehearsal without extending its deadline or resetting its generation', async () => {
    const c = await monitorFixture();
    const example = await loadMonitorExample(c.client);
    const before = await c.monitor.attempt(example.attemptId, null);
    expect(before.sitting.title).toContain('synthetic rehearsal');
    expect(before.student.attempt?.serverAnsweredCount).toBe(1);
    await c.monitor.transfer(example.attemptId, c.body, crypto.randomUUID());
    c.advance(60_000);
    expect(await loadMonitorExample(c.client)).toEqual(example);
    const after = await c.monitor.attempt(example.attemptId, null);
    expect(after.student.deadlineAt).toBe(before.student.deadlineAt);
    expect(after.student.attempt?.deviceGeneration).toBe(2);
    await c.login('STUDENT');
    expect((await c.exams.detail(example.sessionId)).exam.attemptState).toBe('preparing');
    const attempt = await c.exams.attempt(example.attemptId);
    await c.runner.unlock(attempt, await c.exams.package(example.attemptId));
    c.setTime(attempt.deadlineAt);
    expect((await c.exams.detail(example.sessionId)).exam.phase).toBe('ended');
    await expect(loadMonitorExample(c.client)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects contradictory roster totals and submission claims without a receipt', async () => {
    const c = await monitorFixture();
    const value = await c.monitor.sitting('sitting', null);
    expect(sittingSchema.safeParse({ ...value.sitting, rosterCount: 20 }).success).toBe(false);
    const row = value.rows[0];
    if (!row?.attempt) throw new Error('Fixture');
    expect(monitorRowSchema.safeParse({ ...row, status: 'submitted' }).success).toBe(false);
    expect(monitorRowSchema.safeParse({ ...row, attempt: null }).success).toBe(false);
    expect(
      monitorRowSchema.safeParse({
        ...row,
        status: 'submitted',
        attempt: { ...row.attempt, state: 'submitted', receiptAcceptedAt: value.serverNow },
      }).success,
    ).toBe(true);
  });
  it('reports the frozen roster, confirmed saves and contact without mutating attempts on admin reads', async () => {
    const c = await monitorFixture();
    const first = await c.monitor.sitting('sitting', null);
    expect(first.sitting.counts.active).toBe(1);
    expect(first.rows[0]?.attempt?.serverAnsweredCount).toBe(1);
    expect(first.rows[0]?.attempt?.lastServerSaveAt).toBe('2026-10-17T06:00:00.000Z');
    c.advance(60_000);
    const second = await c.monitor.sitting('sitting', null);
    expect(second.rows).toEqual(first.rows);
    expect(second.serverNow).not.toBe(first.serverNow);
    expect(JSON.stringify(second)).not.toMatch(
      /correctOptionId|ciphertext|"answers"|"key"|deviceId/,
    );
    const future = await c.monitor.sitting('demo-session-5', null);
    expect(future.rows[0]?.attempt).toBeNull();
    expect(future.sitting.counts.not_started).toBe(1);
    c.setTime(c.attempt.deadlineAt);
    expect((await c.monitor.sitting('sitting', null)).sitting.counts.recovery_needed).toBe(1);
    expect(c.store.resultAttempts.get('sitting')?.attempt.state).toBe('active');
    expect(c.store.resultAttempts.get('sitting')?.attempt.receipt).toBeNull();
  });
  it('paginates stable scoped sitting reads and rejects foreign IDs and wrong-role access', async () => {
    const c = await monitorFixture();
    const first = await c.client.request('/admin/monitor/sessions?limit=1', monitorListSchema);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const next = await c.client.request(
      `/admin/monitor/sessions?limit=1&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      monitorListSchema,
    );
    expect(next.items[0]?.sessionId).not.toBe(first.items[0]?.sessionId);
    await expect(c.monitor.attempt('foreign-attempt', null)).rejects.toMatchObject({ status: 404 });
    await expect(c.monitor.sitting('foreign-sitting', null)).rejects.toMatchObject({ status: 404 });
    await expect(c.monitor.sitting('sitting', first.nextCursor)).rejects.toMatchObject({
      status: 422,
    });
    for (const role of ['TEACHER', 'STUDENT'] as const) {
      await c.login(role);
      await expect(c.monitor.list(null)).rejects.toMatchObject({ status: 403 });
      await expect(
        c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID()),
      ).rejects.toMatchObject({ status: 403 });
    }
    await c.auth.logout();
    await c.auth.login({ loginId: 'DEMO-ADMIN', password: 'NexoraDemo!' });
    await expect(c.monitor.list(null)).rejects.toMatchObject({ status: 401 });
  });
  it('carries confirmed answers at sequence zero, preserves deadline/order, blocks the old device, and records one audited replay', async () => {
    const c = await monitorFixture();
    const key = crypto.randomUUID();
    const result = await c.monitor.transfer(c.attempt.attemptId, c.body, key);
    expect(result).toMatchObject({
      deviceGeneration: 2,
      state: 'preparing',
      deadlineAt: c.attempt.deadlineAt,
    });
    expect(await c.monitor.transfer(c.attempt.attemptId, c.body, key)).toEqual(result);
    await expect(
      c.monitor.transfer(c.attempt.attemptId, { ...c.body, reason: 'Changed reason' }, key),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const detail = await c.monitor.attempt(c.attempt.attemptId, null);
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({
      fromGeneration: 1,
      toGeneration: 2,
      actorName: 'Hana',
      reason: c.body.reason,
    });
    expect(detail.student.attempt?.lastServerSaveAt).toBe('2026-10-17T06:00:00.000Z');
    await c.login('STUDENT');
    await c.exams.enroll(c.device);
    await expect(c.exams.attempt(c.attempt.attemptId)).rejects.toMatchObject({
      code: 'DEVICE_REPLACED',
    });
    await expect(
      c.runner.save(c.attempt, [{ itemId: c.first.itemId, value: null, clientSeq: 2 }]),
    ).rejects.toMatchObject({ code: 'DEVICE_REPLACED' });
    await c.exams.enroll(c.replacement);
    const a = await c.exams.attempt(c.attempt.attemptId);
    expect(a.answers).toHaveLength(1);
    expect(a.answers[0]?.clientSeq).toBe(0);
    expect(a.highestAcceptedSeq).toBe(0);
    expect(a.deadlineAt).toBe(c.attempt.deadlineAt);
    await expect(
      c.runner.save(c.attempt, [{ itemId: c.first.itemId, value: null, clientSeq: 2 }]),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
    const unlocked = await c.runner.unlock(a, await c.exams.package(a.attemptId));
    expect(unlocked.questionOrder).toEqual(c.unlock.questionOrder);
    expect(unlocked.optionOrders).toEqual(c.unlock.optionOrders);
    const saved = await c.runner.save(a, [{ itemId: c.first.itemId, value: null, clientSeq: 1 }]);
    expect(saved.highestAcceptedSeq).toBe(1);
    await expect(
      c.runner.save(c.attempt, [{ itemId: c.first.itemId, value: null, clientSeq: 2 }]),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await c.login('ADMIN');
    c.setTime(c.attempt.finalAcceptUntil);
    expect(await c.monitor.transfer(c.attempt.attemptId, c.body, key)).toEqual(result);
  });
  it('allows only one competing transfer and rejects same-device, unknown-device and expired operations', async () => {
    const c = await monitorFixture();
    await expect(
      c.monitor.transfer(
        c.attempt.attemptId,
        { ...c.body, newDeviceId: c.device },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(
      c.monitor.transfer(
        c.attempt.attemptId,
        { ...c.body, newDeviceId: crypto.randomUUID() },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const results = await Promise.allSettled([
      c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID()),
      c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await c.monitor.attempt(c.attempt.attemptId, null)).history).toHaveLength(1);
    c.setTime(c.attempt.deadlineAt);
    await expect(
      c.monitor.transfer(
        c.attempt.attemptId,
        { ...c.body, expectedDeviceGeneration: 2, newDeviceId: c.device },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  });
  it('does not transfer submitted or recovery-pending attempts, and keeps old-generation recovery evidence', async () => {
    const c = await monitorFixture();
    await c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID());
    await c.login('STUDENT');
    c.setTime(new Date(Date.parse(c.attempt.finalAcceptUntil) + 1).toISOString());
    const snapshot = {
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      finalSeq: 2,
      answers: c.items.map((i) => ({ itemId: i.itemId, value: null })),
    };
    const upload = await c.runner.recovery(
      c.attempt.attemptId,
      snapshot,
      'Retained unsynced work from old browser.',
      crypto.randomUUID(),
    );
    expect(c.store.recoveries.get(upload.recoveryId)?.detail.snapshot.deviceGeneration).toBe(1);
    expect(c.store.recoveries.get(upload.recoveryId)?.detail.currentDeviceGeneration).toBe(2);
    await c.login('ADMIN');
    const d = await c.monitor.attempt(c.attempt.attemptId, null);
    expect(d.transferBlocker).toBe('closed');
    expect(d.student.status).toBe('recovery_needed');
    await expect(
      c.monitor.transfer(
        c.attempt.attemptId,
        { ...c.body, expectedDeviceGeneration: 2, newDeviceId: c.device },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
    const closed = await monitorFixture();
    await closed.login('STUDENT');
    await closed.exams.enroll(closed.device);
    await closed.runner.submit(
      closed.attempt.attemptId,
      { ...snapshot, answers: closed.items.map((i) => ({ itemId: i.itemId, value: null })) },
      crypto.randomUUID(),
    );
    await closed.login('ADMIN');
    expect((await closed.monitor.attempt(closed.attempt.attemptId, null)).student.status).toBe(
      'submitted',
    );
    await expect(
      closed.monitor.transfer(closed.attempt.attemptId, closed.body, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
  });
  it('validates mandatory preconditions even if a client bypasses the typed wrapper', async () => {
    const c = await monitorFixture();
    await expect(
      c.client.request(`/attempts/${c.attempt.attemptId}/device-transfer`, z.unknown(), {
        method: 'POST',
        body: { newDeviceId: c.replacement, reason: 'No generation' },
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 422 });
    const client = new ApiClient('/api/v1', createDemoTransport('school_admin'));
    await createAuthApi(client).session();
    await expect(
      monitorApi(client).transfer('foreign', c.body, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });
});
