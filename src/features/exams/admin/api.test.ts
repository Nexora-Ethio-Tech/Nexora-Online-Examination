// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from '@/features/auth/api';
import { authoringApi } from '../authoring/api';
import { examApi } from '../api';
import { adminExamApi } from './api';
import { parseEatInput, scheduleTimes, toEatInput } from './schemas';
import { unlockSchema, submittedSchema } from '@/features/runner/schemas';
import { decryptPaper, snapshotDigest } from '@/features/runner/crypto';
import { resultsApi } from '@/features/results/api';

async function setup() {
  let time = Date.parse('2026-10-17T06:00:00Z');
  const client = new ApiClient(
    '/api/v1',
    createDemoTransport('teacher', () => time),
  );
  const auth = createAuthApi(client);
  await auth.session();
  const teacher = authoringApi(client);
  const admin = adminExamApi(client);
  const draft = await teacher.create(
    {
      title: 'Approved algebra',
      assignmentId: 'demo-math-10a',
      instructions: 'Choose one answer.',
      language: 'en',
      durationMinutes: 2,
      passPercent: 50,
      ordering: 'shuffle_questions_and_options',
    },
    crypto.randomUUID(),
  );
  const bytes = await readFile('public/templates/nexora-questions.xlsx');
  await teacher.upload(draft.examId, 1, new File([bytes], 'sample.xlsx'), crypto.randomUUID());
  time += 5000;
  let items = await teacher.items(draft.examId);
  for (const item of items.items) {
    await teacher.saveItem(
      draft.examId,
      { ...item, reviewed: true, reviewNote: 'Checked definition and key.' },
      items.revision,
      crypto.randomUUID(),
    );
    items = await teacher.items(draft.examId);
  }
  const submitted = await teacher.submit(draft.examId, items.revision, crypto.randomUUID());
  async function login(role: 'ADMIN' | 'TEACHER' | 'STUDENT') {
    await auth.logout();
    await auth.login({ loginId: `DEMO-${role}`, password: 'NexoraDemo!' });
    if (role === 'ADMIN') await auth.verify({ code: '123456' });
    await auth.session();
  }
  await login('ADMIN');
  return {
    client,
    teacher,
    admin,
    auth,
    login,
    id: draft.examId,
    submitted,
    setTime: (value: number) => {
      time = value;
    },
    now: () => time,
  };
}
describe('administrator approval and scheduling', () => {
  it('returns feedback to the teacher, rejects stale approval and freezes the resubmitted version', async () => {
    const c = await setup();
    const first = await c.admin.get(c.id);
    const body = { revision: first.exam.revision, comment: 'Clarify the instructions.' };
    const key = crypto.randomUUID();
    const returned = await c.admin.decide(c.id, 'return', body, key);
    expect(returned.exam.status).toBe('returned');
    expect(await c.admin.decide(c.id, 'return', body, key)).toEqual(returned);
    await expect(
      c.admin.decide(
        c.id,
        'approve',
        { revision: first.exam.revision, comment: 'Approve stale' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await c.login('TEACHER');
    const d = await c.teacher.get(c.id);
    expect(d.returnComment).toBe(body.comment);
    const updated = await c.teacher.save(
      c.id,
      { ...d, instructions: 'Choose exactly one answer.' },
      d.revision,
      crypto.randomUUID(),
    );
    await c.teacher.submit(c.id, updated.revision, crypto.randomUUID());
    await c.login('ADMIN');
    const next = await c.admin.get(c.id);
    const approved = await c.admin.decide(
      c.id,
      'approve',
      { revision: next.exam.revision, comment: 'All corrections checked.' },
      crypto.randomUUID(),
    );
    expect(approved).toMatchObject({
      approvedVersion: 1,
      packageState: 'ready',
      exam: { status: 'approved' },
    });
    expect(approved.history.map((h) => h.action)).toEqual([
      'submitted',
      'returned',
      'submitted',
      'approved',
    ]);
    await c.login('TEACHER');
    await expect(
      c.teacher.save(c.id, d, approved.exam.revision, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it('delivers the exact approved paper to the student with timed unlock and a matching final receipt', async () => {
    const c = await setup();
    const a = await c.admin.decide(
      c.id,
      'approve',
      { revision: c.submitted.revision, comment: 'Reviewed all content.' },
      crypto.randomUUID(),
    );
    const prep = '2026-10-17T06:02:00.000Z';
    const body = {
      revision: a.exam.revision,
      approvedVersion: 1,
      preparationVisibleAt: prep,
      resultsReleaseAt: '2026-10-17T07:00:00.000Z',
    };
    const key = crypto.randomUUID();
    const scheduled = await c.admin.schedule(c.id, body, key);
    expect(await c.admin.schedule(c.id, body, key)).toEqual(scheduled);
    const s = scheduled.sessions[0];
    if (!s) throw new Error('Missing session');
    expect(s.startsAt).toBe('2026-10-17T06:12:00.000Z');
    expect(s.endsAt).toBe('2026-10-17T06:14:00.000Z');
    expect(s.rosterCount).toBe(1);
    await c.login('STUDENT');
    const student = examApi(c.client);
    expect((await student.detail(s.sessionId)).exam.phase).toBe('scheduled');
    const device = crypto.randomUUID();
    await student.enroll(device);
    await expect(student.create(s.sessionId, device, crypto.randomUUID())).rejects.toMatchObject({
      code: 'NOT_PREPARING',
    });
    c.setTime(Date.parse(prep));
    const attempt = await student.create(s.sessionId, device, crypto.randomUUID());
    const packet = await student.package(attempt.attemptId);
    const unlockBody = {
      packageId: packet.packageId,
      examVersion: attempt.examVersion,
      scheduleRevision: attempt.scheduleRevision,
      deviceGeneration: 1,
    };
    const unlock = () =>
      c.client.request(`/attempts/${attempt.attemptId}/unlock`, unlockSchema, {
        method: 'POST',
        body: unlockBody,
      });
    await expect(unlock()).rejects.toMatchObject({ code: 'NOT_STARTED' });
    c.setTime(Date.parse(s.startsAt));
    const released = await unlock();
    expect(await unlock()).toEqual(released);
    const paper = await decryptPaper(packet, released, attempt);
    expect(paper.title).toBe('Approved algebra');
    expect(paper.items).toHaveLength(2);
    expect(paper.items.reduce((n, i) => n + i.marks, 0)).toBe(4);
    for (const item of paper.items) {
      expect(item).not.toHaveProperty('correctOptionId');
      expect(item).not.toHaveProperty('explanation');
      expect(item).not.toHaveProperty('reviewNote');
    }
    const final = {
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      finalSeq: 0,
      answers: paper.items.map((i) => ({ itemId: i.itemId, value: null })),
    };
    const receipt = await c.client.request(
      `/attempts/${attempt.attemptId}/submit`,
      submittedSchema,
      { method: 'POST', body: final, idempotencyKey: crypto.randomUUID() },
    );
    expect(receipt.snapshotDigest).toBe(await snapshotDigest(attempt.attemptId, final));
    expect(
      (await resultsApi(c.client).mine(null)).items.find((r) => r.sessionId === s.sessionId)
        ?.result,
    ).toBeNull();
    await c.login('ADMIN');
    const result = await resultsApi(c.client).results(s.sessionId, null);
    expect(result.rows[0]).toMatchObject({ score: 0, maxScore: 4, rank: 1, status: 'finalized' });
  });
  it('allows rescheduling before old preparation, locks at the boundary and replays after the lock', async () => {
    const c = await setup();
    const a = await c.admin.decide(
      c.id,
      'approve',
      { revision: c.submitted.revision, comment: 'Ready.' },
      crypto.randomUUID(),
    );
    const d = await c.admin.schedule(
      c.id,
      {
        revision: a.exam.revision,
        approvedVersion: 1,
        preparationVisibleAt: '2026-10-17T06:02:00.000Z',
        resultsReleaseAt: '2026-10-17T07:00:00.000Z',
      },
      crypto.randomUUID(),
    );
    const s = d.sessions[0];
    if (!s) throw new Error('Missing session');
    c.setTime(Date.parse(s.preparationVisibleAt) - 1);
    const body = {
      scheduleRevision: 1,
      preparationVisibleAt: '2026-10-17T06:04:00.000Z',
      resultsReleaseAt: '2026-10-17T07:00:00.000Z',
      reason: 'Room availability changed.',
    };
    const key = crypto.randomUUID();
    const updated = await c.admin.reschedule(s.sessionId, body, key);
    expect(updated.sessions[0]?.scheduleRevision).toBe(2);
    c.setTime(Date.parse(body.preparationVisibleAt));
    expect((await c.admin.get(c.id)).sessions[0]?.canReschedule).toBe(false);
    await expect(
      c.admin.reschedule(
        s.sessionId,
        { ...body, scheduleRevision: 2, preparationVisibleAt: '2026-10-17T06:06:00.000Z' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(await c.admin.reschedule(s.sessionId, body, key)).toEqual(updated);
    await expect(
      c.admin.reschedule(s.sessionId, { ...body, reason: 'Changed' }, key),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it('rejects premature scheduling, early results and overlapping sittings', async () => {
    const c = await setup();
    const base = {
      revision: c.submitted.revision,
      approvedVersion: 1,
      preparationVisibleAt: '2026-10-17T06:02:00.000Z',
      resultsReleaseAt: '2026-10-17T07:00:00.000Z',
    };
    await expect(c.admin.schedule(c.id, base, crypto.randomUUID())).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const approved = await c.admin.decide(
      c.id,
      'approve',
      { revision: c.submitted.revision, comment: 'Reviewed.' },
      crypto.randomUUID(),
    );
    const body = { ...base, revision: approved.exam.revision };
    await expect(
      c.admin.schedule(
        c.id,
        { ...body, resultsReleaseAt: '2026-10-17T06:03:00.000Z' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      c.admin.schedule(
        c.id,
        { ...body, preparationVisibleAt: '2026-10-17T06:00:00.000Z' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const scheduled = await c.admin.schedule(c.id, body, crypto.randomUUID());
    await expect(
      c.admin.schedule(c.id, { ...body, revision: scheduled.exam.revision }, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it.each(['TEACHER', 'STUDENT'] as const)('denies %s admin reads and decisions', async (role) => {
    const c = await setup();
    await c.login(role);
    await expect(c.admin.list(null)).rejects.toMatchObject({ status: 403 });
    await expect(
      c.admin.decide(
        c.id,
        'approve',
        { revision: c.submitted.revision, comment: 'Forbidden' },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('keeps admin access locked until MFA succeeds', async () => {
    const client = new ApiClient('/api/v1', createDemoTransport());
    const auth = createAuthApi(client);
    const result = await auth.login({ loginId: 'DEMO-ADMIN', password: 'NexoraDemo!' });
    expect(result.status).toBe('mfa_required');
    await expect(adminExamApi(client).list(null)).rejects.toMatchObject({ status: 401 });
  });
  it('converts EAT explicitly and rejects rolled-over calendar dates', () => {
    expect(parseEatInput('2026-10-17T09:00')).toBe('2026-10-17T06:00:00.000Z');
    expect(toEatInput('2026-10-17T06:00:00.000Z')).toBe('2026-10-17T09:00');
    expect(parseEatInput('2026-02-30T09:00')).toBeNull();
    expect(parseEatInput('2026-10-17T25:00')).toBeNull();
    expect(scheduleTimes('2026-10-17T06:00:00.000Z', 60)).toEqual({
      startsAt: '2026-10-17T06:10:00.000Z',
      endsAt: '2026-10-17T07:10:00.000Z',
    });
  });
});
