// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from '@/features/auth/api';
import { resultsFixture } from '@/features/results/test-fixture';
import { resultsApi } from '@/features/results/api';
import { examApi } from '../api';
import { runnerApi } from '@/features/runner/api';
import { snapshotDigest } from '@/features/runner/crypto';
import { recoveryApi } from './api';
import { loadRecoveryExample } from './demo-api';

async function setup() {
  const fixture = resultsFixture();
  fixture.store.resultAttempts.clear();
  let time = Date.parse('2026-10-17T06:00:00.000Z');
  const transport = createDemoTransport('student', () => time, fixture.store);
  const client = new ApiClient('/api/v1', transport);
  const auth = createAuthApi(client);
  await auth.session();
  const exams = examApi(client);
  const runner = runnerApi(client);
  const api = recoveryApi(client);
  const results = resultsApi(client);
  const device = crypto.randomUUID();
  await exams.enroll(device);
  const attempt = await exams.create('sitting', device, crypto.randomUUID());
  await runner.unlock(attempt, await exams.package(attempt.attemptId));
  const first = fixture.items[0];
  if (!first) throw new Error('fixture');
  await runner.save(attempt, [{ itemId: first.itemId, value: null, clientSeq: 1 }]);
  const final = {
    examVersion: 1,
    scheduleRevision: 1,
    deviceGeneration: 1,
    finalSeq: 2,
    answers: fixture.items.map((i) => ({ itemId: i.itemId, value: i.correctOptionId })),
  };
  time = Date.parse(attempt.finalAcceptUntil) + 1;
  const uploadKey = crypto.randomUUID();
  const upload = await runner.recovery(
    attempt.attemptId,
    final,
    'Connection failed after the exam.',
    uploadKey,
  );
  const login = async (role: string) => {
    await auth.logout();
    await auth.login({ loginId: `DEMO-${role}`, password: 'NexoraDemo!' });
    if (role === 'ADMIN') await auth.verify({ code: '123456' });
    await auth.session();
  };
  return {
    ...fixture,
    client,
    transport,
    api,
    runner,
    results,
    attempt,
    final,
    upload,
    uploadKey,
    login,
    setTime: (value: string) => {
      time = Date.parse(value);
    },
  };
}
describe('recovery decisions', () => {
  it('loads an explicit synthetic example once and accepts it into an unpublished result', async () => {
    const c = await setup();
    await c.login('ADMIN');
    const sample = await loadRecoveryExample(c.client);
    expect(await loadRecoveryExample(c.client)).toEqual(sample);
    const detail = await c.api.get(sample.recoveryId);
    expect(detail.title).toContain('synthetic');
    expect(detail.canAccept).toBe(true);
    await c.api.decide(
      sample.recoveryId,
      { decision: 'accept', reason: 'Training example reviewed.' },
      crypto.randomUUID(),
    );
    expect((await c.results.results(detail.sessionId, null)).rows[0]?.score).toBe(4);
    expect((await c.results.results(detail.sessionId, null)).summary.publication).toBeNull();
  });
  it('invalidates the publication candidate when a distinct upload arrives with unchanged marks', async () => {
    const c = await setup();
    await c.login('ADMIN');
    await c.results.publish(
      'sitting',
      {
        revision: 1,
        releaseAt: '2026-10-17T06:20:05.000Z',
        reason: 'Reviewed pending evidence.',
        exclusions: [{ attemptId: c.attempt.attemptId, reason: 'Under review.' }],
      },
      crypto.randomUUID(),
    );
    await c.login('STUDENT');
    await c.runner.recovery(
      c.attempt.attemptId,
      c.final,
      'Another retained upload.',
      crypto.randomUUID(),
    );
    await c.login('ADMIN');
    expect((await c.results.results('sitting', null)).summary.revision).toBe(2);
    expect((await c.results.report('sitting', 1)).rows[0]?.status).toBe('excluded');
  });
  it('retains immutable evidence and timely saves, then accepts the exact digest and upload key', async () => {
    const c = await setup();
    await c.login('ADMIN');
    const detail = await c.api.get(c.upload.recoveryId);
    expect(detail.snapshotDigest).toBe(await snapshotDigest(c.attempt.attemptId, c.final));
    expect(detail.latestTimelySave.answers[0]?.value).toBeNull();
    expect(detail.snapshot.answers[0]?.value).not.toBeNull();
    expect(detail.latestTimelySave.highestAcceptedSeq).toBe(1);
    const body = {
      decision: 'accept' as const,
      reason: 'Reviewed the upload and school incident record.',
    };
    const key = crypto.randomUUID();
    const decided = await c.api.decide(c.upload.recoveryId, body, key);
    expect(decided.resultRevision).toBe(2);
    expect(await c.api.decide(c.upload.recoveryId, body, key)).toEqual(decided);
    await expect(
      c.api.decide(c.upload.recoveryId, { ...body, reason: 'Different reason' }, key),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await c.api.get(c.upload.recoveryId)).snapshot).toEqual(detail.snapshot);
    expect((await c.api.list('pending', null)).items).toHaveLength(0);
    expect((await c.api.list('all', null)).items[0]?.status).toBe('accepted');
    await c.login('STUDENT');
    const receipt = await c.runner.receipt(c.attempt.attemptId);
    expect(receipt).toMatchObject({
      state: 'submitted',
      recovery: { status: 'accepted' },
      receipt: { snapshotDigest: detail.snapshotDigest, finalSeq: 2, idempotencyKey: c.uploadKey },
    });
    expect(JSON.stringify(receipt)).not.toContain('score');
    expect((await c.results.mine(null)).items[0]?.result).toBeNull();
    await expect(
      c.runner.submit(c.attempt.attemptId, c.final, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
  });
  it('rejects without a receipt or score, preserves evidence and permits new distinct uploads', async () => {
    const c = await setup();
    await c.login('ADMIN');
    const result = await c.api.decide(
      c.upload.recoveryId,
      { decision: 'reject', reason: 'Evidence does not justify acceptance.' },
      crypto.randomUUID(),
    );
    expect(result.resultRevision).toBeNull();
    await expect(
      c.api.decide(
        c.upload.recoveryId,
        { decision: 'accept', reason: 'Competing decision' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await c.login('STUDENT');
    expect(await c.runner.receipt(c.attempt.attemptId)).toMatchObject({
      state: 'awaiting_upload',
      receipt: null,
      recovery: { status: 'rejected' },
    });
    const next = await c.runner.recovery(
      c.attempt.attemptId,
      c.final,
      'Additional incident evidence.',
      crypto.randomUUID(),
    );
    expect(next.recoveryId).not.toBe(c.upload.recoveryId);
    await c.login('ADMIN');
    expect((await c.api.get(next.recoveryId)).relatedUploads[0]?.status).toBe('rejected');
  });
  it('settles competing pending uploads and preserves published history until reapproval', async () => {
    const c = await setup();
    const other = await c.runner.recovery(
      c.attempt.attemptId,
      { ...c.final, answers: c.final.answers.map((a) => ({ ...a, value: null })) },
      'Second browser evidence.',
      crypto.randomUUID(),
    );
    await c.login('ADMIN');
    expect((await c.api.get(c.upload.recoveryId)).relatedUploads[0]?.recoveryId).toBe(
      other.recoveryId,
    );
    await c.results.publish(
      'sitting',
      {
        revision: 1,
        releaseAt: '2026-10-17T06:20:05.000Z',
        reason: 'Release settled results with explicit exclusion.',
        exclusions: [{ attemptId: c.attempt.attemptId, reason: 'Recovery investigation ongoing.' }],
      },
      crypto.randomUUID(),
    );
    await c.api.decide(
      c.upload.recoveryId,
      { decision: 'accept', reason: 'First upload verified.' },
      crypto.randomUUID(),
    );
    expect((await c.api.get(other.recoveryId)).decision?.reason).toContain('Superseded');
    await expect(
      c.api.decide(
        other.recoveryId,
        { decision: 'accept', reason: 'Concurrent acceptance' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await c.results.report('sitting', 1)).rows[0]?.status).toBe('excluded');
    expect((await c.results.results('sitting', null)).rows[0]?.score).toBe(4);
    await c.login('STUDENT');
    expect((await c.results.mine(null)).items[0]?.result?.status).toBe('excluded');
    await c.login('ADMIN');
    await c.results.publish(
      'sitting',
      {
        revision: 2,
        releaseAt: '2026-10-17T06:20:05.000Z',
        reason: 'Approve recovered result revision.',
        exclusions: [],
      },
      crypto.randomUUID(),
    );
    await c.login('STUDENT');
    expect((await c.results.mine(null)).items[0]?.result?.score).toBe(4);
  });
  it('denies student/teacher evidence access, validates reasons and blocks replacing a final result', async () => {
    const c = await setup();
    await expect(c.api.list('all', null)).rejects.toMatchObject({ status: 403 });
    await expect(c.api.get(c.upload.recoveryId)).rejects.toMatchObject({ status: 403 });
    await c.login('TEACHER');
    await expect(
      c.api.decide(
        c.upload.recoveryId,
        { decision: 'accept', reason: 'Teacher attempt' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await c.login('ADMIN');
    const raw = await c.transport(`/api/v1/recovery/${c.upload.recoveryId}/decision`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': 'demo-authenticated-csrf',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ decision: 'reject', reason: '   ' }),
    });
    expect(raw.status).toBe(422);
    await expect(c.api.get('foreign-case')).rejects.toMatchObject({ status: 404 });
    const record = c.store.resultAttempts.get('sitting');
    if (!record) throw new Error('fixture');
    record.attempt.receipt = resultsFixture().attempt.receipt;
    record.attempt.state = 'submitted';
    expect((await c.api.get(c.upload.recoveryId)).canAccept).toBe(false);
    await expect(
      c.api.decide(
        c.upload.recoveryId,
        { decision: 'accept', reason: 'Replace result' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
  });
});
