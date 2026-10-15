// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { adminExamApi } from '@/features/exams/admin/api';
import { practiceAttemptSchema } from './schemas';
import { practiceFixture } from './test-fixture';

const key = () => crypto.randomUUID();
describe('practice release and scoring', () => {
  it('requires admin enablement, official publication and the exact release time', async () => {
    const c = await practiceFixture(false);
    await c.enable('2026-10-17T08:00:00.000Z');
    c.setTime('2026-10-17T08:00:00.000Z');
    await expect(c.student.api.start('paper', 1, key())).rejects.toMatchObject({
      code: 'PRACTICE_NOT_RELEASED',
    });
    await c.publish();
    c.setTime('2026-10-17T07:59:59.999Z');
    expect((await c.student.api.mine(null)).items[0]?.available).toBe(false);
    c.setTime('2026-10-17T08:00:00.000Z');
    expect((await c.student.api.mine(null)).items[0]?.available).toBe(true);
    const access = await c.admin.api.access('paper');
    await c.admin.api.settings(
      'paper',
      { ...access, enabled: false, reason: 'Pause practice.' },
      key(),
    );
    await expect(c.student.api.start('paper', 1, key())).rejects.toMatchObject({
      code: 'PRACTICE_NOT_RELEASED',
    });
  });
  it('keeps list payloads free of questions, keys and explanations while locked', async () => {
    const c = await practiceFixture(false);
    const raw = await c.student.transport('/api/v1/me/practice', { method: 'GET' });
    expect(await raw.text()).not.toMatch(/"stem"|"options"|"correctOptionId"|"explanation"/);
    await expect(c.student.api.start('paper', 1, key())).rejects.toMatchObject({
      code: 'PRACTICE_NOT_RELEASED',
    });
  });
  it('waits for every related sitting and accommodated acceptance window', async () => {
    const c = await practiceFixture();
    const original = c.store.sessions.get('sitting');
    if (!original) throw new Error('fixture');
    c.store.sessions.set('later', {
      ...structuredClone(original),
      session: {
        ...original.session,
        sessionId: 'later',
        startsAt: '2026-10-17T09:00:00.000Z',
        endsAt: '2026-10-17T09:20:00.000Z',
      },
    });
    expect((await c.student.api.mine(null)).items[0]?.available).toBe(false);
    c.setTime('2026-10-17T10:00:00.000Z');
    expect((await c.student.api.mine(null)).items[0]?.available).toBe(false);
    const later = await c.admin.results.results('later', null);
    await c.admin.results.publish(
      'later',
      {
        revision: later.summary.revision,
        releaseAt: '2026-10-17T10:00:00.000Z',
        reason: 'Reviewed second cohort.',
        exclusions: [],
      },
      key(),
    );
    c.attempt.finalAcceptUntil = '2026-10-17T10:00:05.000Z';
    c.setTime('2026-10-17T10:00:05.000Z');
    expect((await c.student.api.mine(null)).items[0]?.available).toBe(false);
    c.setTime('2026-10-17T10:00:05.001Z');
    expect((await c.student.api.mine(null)).items[0]?.available).toBe(true);
  });
  it('enforces role, ownership, enrollment, version and invalidation checks', async () => {
    const c = await practiceFixture();
    const teacher = await c.clientFor('teacher');
    await expect(teacher.api.access('paper')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c.student.api.adminList(null)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c.admin.api.start('paper', 1, key())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c.student.api.start('unknown', 1, key())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(c.student.api.start('paper', 2, key())).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const a = await c.student.api.start('paper', 1, key());
    const record = c.store.practiceAttempts.get(a.practiceAttemptId);
    if (!record) throw new Error('fixture');
    record.studentId = 'someone-else';
    await expect(c.student.api.attempt(a.practiceAttemptId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    record.studentId = 'demo-student';
    record.valid = false;
    await expect(c.student.api.attempt(a.practiceAttemptId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    c.store.sessions.clear();
    expect((await c.student.api.mine(null)).items).toHaveLength(0);
    await expect(c.student.api.start('paper', 1, key())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('reveals feedback only for the first saved answer and rejects changing it', async () => {
    const c = await practiceFixture();
    const startKey = key();
    const a = await c.student.api.start('paper', 1, startKey);
    expect(await c.student.api.start('paper', 1, startKey)).toEqual(a);
    expect(JSON.stringify(a)).not.toMatch(/"correctOptionId"|"explanation"/);
    expect(c.store.practiceAttempts.size).toBe(1);
    const first = c.items[0];
    if (!first) throw new Error('fixture');
    const wrong = first.options.find((o) => o.id !== first.correctOptionId)?.id;
    if (!wrong) throw new Error('fixture');
    const answerKey = key();
    const answered = await c.student.api.answer(
      a.practiceAttemptId,
      first.itemId,
      wrong,
      answerKey,
    );
    expect(answered.items[0]?.feedback).toMatchObject({
      correct: false,
      earnedMarks: 0,
      explanation: first.explanation,
    });
    expect(answered.items[1]?.feedback).toBeNull();
    expect(await c.student.api.answer(a.practiceAttemptId, first.itemId, wrong, answerKey)).toEqual(
      answered,
    );
    await expect(
      c.student.api.answer(a.practiceAttemptId, first.itemId, first.correctOptionId, answerKey),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(
      c.student.api.answer(a.practiceAttemptId, first.itemId, first.correctOptionId, key()),
    ).rejects.toMatchObject({ code: 'ALREADY_ANSWERED' });
    await expect(c.student.api.complete(a.practiceAttemptId, key())).rejects.toMatchObject({
      code: 'PRACTICE_INCOMPLETE',
    });
    await expect(
      c.student.client.request(
        `/practice-attempts/${a.practiceAttemptId}/answers`,
        practiceAttemptSchema,
        {
          method: 'POST',
          body: { itemId: first.itemId, value: null },
          idempotencyKey: key(),
        },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      c.student.api.answer(a.practiceAttemptId, first.itemId, 'invalid', key()),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await c.student.api.mine(null)).items[0]).toMatchObject({
      bestPercent: null,
      completedCount: 0,
    });
  });
  it('keeps the maximum completed score through retries, lower repeats and abandoned attempts without altering official records', async () => {
    const c = await practiceFixture();
    const before = await c.admin.results.report('sitting', 1);
    const csvBefore = await c.admin.results.csv('sitting', 1);
    const officialBefore = structuredClone(c.store.resultAttempts.get('sitting'));
    const receiptsBefore = structuredClone(c.store.publications.get('sitting'));
    const finish = async (correctCount: number) => {
      const a = await c.student.api.start('paper', 1, key());
      for (const [index, item] of c.items.entries()) {
        const value =
          index < correctCount
            ? item.correctOptionId
            : item.options.find((o) => o.id !== item.correctOptionId)?.id;
        if (!value) throw new Error('fixture');
        await c.student.api.answer(a.practiceAttemptId, item.itemId, value, key());
      }
      const completeKey = key();
      const completed = await c.student.api.complete(a.practiceAttemptId, completeKey);
      expect(await c.student.api.complete(a.practiceAttemptId, completeKey)).toEqual(completed);
      return completed;
    };
    const best = await finish(2);
    expect(best).toMatchObject({ score: 4, percent: 100, bestPercent: 100 });
    const lower = await finish(0);
    expect(lower).toMatchObject({ score: 0, percent: 0, bestPercent: 100 });
    const middle = await finish(1);
    expect(middle).toMatchObject({ score: 2, percent: 50, bestPercent: 100 });
    await c.student.api.start('paper', 1, key());
    await Promise.all([
      c.student.api.complete(best.practiceAttemptId, key()),
      c.student.api.complete(best.practiceAttemptId, key()),
    ]);
    expect((await c.student.api.mine(null)).items[0]).toMatchObject({
      bestPercent: 100,
      completedCount: 3,
    });
    expect((await c.student.results.mine(null)).items[0]).toMatchObject({
      bestPracticePercent: 100,
      result: { score: 4, rank: 1 },
    });
    expect(await c.admin.results.report('sitting', 1)).toEqual(before);
    expect(await c.admin.results.csv('sitting', 1)).toEqual(csvBefore);
    expect(c.store.resultAttempts.get('sitting')).toEqual(officialBefore);
    expect(c.store.publications.get('sitting')).toEqual(receiptsBefore);
    const record = c.store.practiceAttempts.get(best.practiceAttemptId);
    const corrected = c.store.practiceAttempts.get(middle.practiceAttemptId);
    if (!record || !corrected) throw new Error('fixture');
    record.valid = false;
    expect((await c.student.api.mine(null)).items[0]).toMatchObject({
      bestPercent: 50,
      completedCount: 2,
    });
    corrected.attempt.score = 1;
    corrected.attempt.percent = 25;
    expect((await c.student.results.mine(null)).items[0]?.bestPracticePercent).toBe(25);
  });
  it('rechecks revocation before detail reads and idempotent feedback replays', async () => {
    const c = await practiceFixture();
    const a = await c.student.api.start('paper', 1, key());
    const item = c.items[0];
    if (!item) throw new Error('fixture');
    const answerKey = key();
    await c.student.api.answer(a.practiceAttemptId, item.itemId, item.correctOptionId, answerKey);
    const access = await c.admin.api.access('paper');
    await c.admin.api.settings(
      'paper',
      { ...access, enabled: false, reason: 'Pause access.' },
      key(),
    );
    await expect(c.student.api.attempt(a.practiceAttemptId)).rejects.toMatchObject({
      code: 'PRACTICE_NOT_RELEASED',
    });
    await expect(
      c.student.api.answer(a.practiceAttemptId, item.itemId, item.correctOptionId, answerKey),
    ).rejects.toMatchObject({ code: 'PRACTICE_NOT_RELEASED' });
    await c.enable();
    expect((await c.student.api.attempt(a.practiceAttemptId)).items[0]?.feedback?.correct).toBe(
      true,
    );
  });
  it('audits settings with revision protection and prevents official reuse after practice release', async () => {
    const c = await practiceFixture();
    const access = await c.admin.api.access('paper');
    const body = { ...access, enabled: false, reason: 'Pause practice.' };
    const saveKey = key();
    const saved = await c.admin.api.settings('paper', body, saveKey);
    expect(saved.history).toHaveLength(2);
    expect(saved.contentReleasedAt).not.toBeNull();
    expect(await c.admin.api.settings('paper', body, saveKey)).toEqual(saved);
    await expect(c.admin.api.settings('paper', body, key())).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const approved = c.store.approved.get('paper');
    if (!approved) throw new Error('fixture');
    c.store.drafts.set('paper', structuredClone(approved.draft));
    await expect(
      adminExamApi(c.admin.client).schedule(
        'paper',
        {
          revision: 1,
          approvedVersion: 1,
          preparationVisibleAt: '2026-10-18T05:50:00.000Z',
          resultsReleaseAt: '2026-10-18T07:00:00.000Z',
        },
        key(),
      ),
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      message: expect.stringContaining('released for practice'),
    });
  });
  it('paginates practice lists and rejects invalid page sizes', async () => {
    const c = await practiceFixture(false);
    const paper = c.store.approved.get('paper');
    const sitting = c.store.sessions.get('sitting');
    if (!paper || !sitting) throw new Error('fixture');
    for (let n = 1; n <= 25; n++) {
      c.store.approved.set(`paper-${n}`, {
        ...structuredClone(paper),
        draft: { ...paper.draft, examId: `paper-${n}` },
      });
      c.store.sessions.set(`sitting-${n}`, {
        ...structuredClone(sitting),
        session: { ...sitting.session, sessionId: `sitting-${n}`, examId: `paper-${n}` },
      });
    }
    const page = await c.student.api.mine(null);
    expect(page.items).toHaveLength(25);
    expect((await c.student.api.mine(page.nextCursor)).items).toHaveLength(1);
    const adminPage = await c.admin.api.adminList(null);
    expect(adminPage.items).toHaveLength(25);
    expect((await c.admin.api.adminList(adminPage.nextCursor)).items).toHaveLength(1);
    expect(
      (await c.student.transport('/api/v1/me/practice?limit=0', { method: 'GET' })).status,
    ).toBe(422);
  });
});
