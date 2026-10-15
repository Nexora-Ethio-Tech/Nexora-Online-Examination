// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createAuthApi } from '@/features/auth/api';
import { authoringApi } from '@/features/exams/authoring/api';
import { adminExamApi } from '@/features/exams/admin/api';
import { examApi } from '@/features/exams/api';
import { monitorApi } from '@/features/exams/monitor/api';
import { resultsApi } from '@/features/results/api';
import { practiceApi } from '@/features/practice/api';
import { decryptPaper, snapshotDigest } from '@/features/runner/crypto';
import { submittedSchema, unlockSchema } from '@/features/runner/schemas';
import { createDemoTransport } from './auth';
import { math20Items } from './math20';
import { markResults } from './result-math';

const metadata = {
  title: 'Mathematics demo 20 questions',
  instructions: 'Choose one answer for each question. Each question is worth two marks.',
  assignmentId: 'demo-math-10a',
  language: 'en' as const,
  durationMinutes: 20,
  passPercent: 50,
  ordering: 'fixed' as const,
};
const expectedKeys = [
  'B',
  'C',
  'D',
  'A',
  'false',
  'C',
  'B',
  'D',
  'A',
  'true',
  'C',
  'B',
  'D',
  'A',
  'true',
  'B',
  'C',
  'A',
  'D',
  'false',
];
const mixedAnswers = [
  'B',
  'C',
  'D',
  'A',
  'true',
  'C',
  'B',
  'D',
  'A',
  'false',
  'C',
  'B',
  'D',
  'A',
  'false',
  'B',
  'C',
  'A',
  'A',
  'true',
];
async function uploadFile(name = 'nexora-math-20-demo.xlsx') {
  return new File([await readFile(`public/templates/${name}`)], name);
}
async function setup() {
  let time = Date.parse('2026-10-17T06:00:00.000Z');
  const client = new ApiClient(
    '/api/v1',
    createDemoTransport('teacher', () => time),
  );
  const auth = createAuthApi(client);
  await auth.session();
  return {
    client,
    teacher: authoringApi(client),
    admin: adminExamApi(client),
    student: examApi(client),
    monitor: monitorApi(client),
    results: resultsApi(client),
    practice: practiceApi(client),
    advance: (ms: number) => {
      time += ms;
    },
    setTime: (value: string) => {
      time = Date.parse(value);
    },
    login: async (role: 'TEACHER' | 'ADMIN' | 'STUDENT') => {
      await auth.logout();
      await auth.login({ loginId: `DEMO-${role}`, password: 'NexoraDemo!' });
      if (role === 'ADMIN') await auth.verify({ code: '123456' });
      await auth.session();
    },
  };
}

describe('20-question math rehearsal', () => {
  it('keeps concurrent examples separate, reports real fixture counts and preserves items after a changed upload', async () => {
    const c = await setup();
    const large = await c.teacher.create(metadata, crypto.randomUUID());
    const small = await c.teacher.create(
      { ...metadata, title: 'Original example' },
      crypto.randomUUID(),
    );
    const file = await uploadFile();
    const key = crypto.randomUUID();
    const job = await c.teacher.upload(large.examId, 1, file, key);
    expect(job).toMatchObject({ state: 'ai_running', parsedCount: 20, completedCount: 0 });
    expect(await c.teacher.upload(large.examId, 1, file, key)).toEqual(job);
    await c.teacher.upload(
      small.examId,
      1,
      await uploadFile('nexora-questions.docx'),
      crypto.randomUUID(),
    );
    c.advance(5000);
    expect(await c.teacher.job(job.importId)).toMatchObject({
      state: 'ready',
      parsedCount: 20,
      completedCount: 20,
    });
    const before = await c.teacher.items(large.examId);
    expect(before.items).toHaveLength(20);
    expect(before.items.map((i) => i.correctOptionId)).toEqual(expectedKeys);
    expect((await c.teacher.items(small.examId)).items).toHaveLength(2);
    expect(await c.teacher.get(large.examId)).toMatchObject({
      itemCount: 20,
      totalMarks: 40,
      reviewedCount: 0,
    });
    const edited = new File([await file.arrayBuffer(), 'edited'], file.name);
    const failed = await c.teacher.upload(
      large.examId,
      before.revision,
      edited,
      crypto.randomUUID(),
    );
    expect(failed).toMatchObject({ state: 'failed', parsedCount: 0 });
    expect((await c.teacher.items(large.examId)).items).toEqual(before.items);
  });

  it('carries the uploaded paper through review, encrypted delivery, monitoring, 75% reports, publication and separate repeated practice', async () => {
    const c = await setup();
    const draft = await c.teacher.create(metadata, crypto.randomUUID());
    await c.teacher.upload(draft.examId, 1, await uploadFile(), crypto.randomUUID());
    c.advance(5000);
    let review = await c.teacher.items(draft.examId);
    await expect(
      c.teacher.submit(draft.examId, review.revision, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'AI_REVIEW_REQUIRED' });
    for (const item of review.items) {
      if (item.externalId === 'M20-020') {
        await expect(
          c.teacher.saveItem(
            draft.examId,
            { ...item, reviewed: true },
            review.revision,
            crypto.randomUUID(),
          ),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      await c.teacher.saveItem(
        draft.examId,
        {
          ...item,
          reviewed: true,
          reviewNote: item.reviewFlags.length
            ? 'Confirmed that a certain event has probability 1 and an impossible event has probability 0.'
            : '',
        },
        review.revision,
        crypto.randomUUID(),
      );
      review = await c.teacher.items(draft.examId);
    }
    const submitted = await c.teacher.submit(draft.examId, review.revision, crypto.randomUUID());
    expect(submitted).toMatchObject({
      status: 'in_review',
      itemCount: 20,
      totalMarks: 40,
      reviewedCount: 20,
    });
    await c.login('ADMIN');
    const approved = await c.admin.decide(
      draft.examId,
      'approve',
      { revision: submitted.revision, comment: 'Verified all 20 keys and explanations.' },
      crypto.randomUUID(),
    );
    const scheduled = await c.admin.schedule(
      draft.examId,
      {
        revision: approved.exam.revision,
        approvedVersion: 1,
        preparationVisibleAt: '2026-10-17T06:05:00.000Z',
        resultsReleaseAt: '2026-10-17T06:36:00.000Z',
      },
      crypto.randomUUID(),
    );
    const sitting = scheduled.sessions[0];
    expect(sitting).toBeDefined();
    if (!sitting) throw new Error('Missing scheduled sitting');
    expect(sitting).toMatchObject({
      startsAt: '2026-10-17T06:15:00.000Z',
      endsAt: '2026-10-17T06:35:00.000Z',
      rosterCount: 1,
    });
    expect((await c.monitor.sitting(sitting.sessionId, null)).sitting.counts.not_started).toBe(1);

    await c.login('STUDENT');
    const deviceId = crypto.randomUUID();
    await c.student.enroll(deviceId);
    c.setTime(sitting.preparationVisibleAt);
    const attempt = await c.student.create(sitting.sessionId, deviceId, crypto.randomUUID());
    const packet = await c.student.package(attempt.attemptId);
    const unlock = () =>
      c.client.request(`/attempts/${attempt.attemptId}/unlock`, unlockSchema, {
        method: 'POST',
        body: {
          packageId: packet.packageId,
          examVersion: 1,
          scheduleRevision: 1,
          deviceGeneration: 1,
        },
      });
    await expect(unlock()).rejects.toMatchObject({ code: 'NOT_STARTED' });
    c.setTime(sitting.startsAt);
    const paper = await decryptPaper(packet, await unlock(), attempt);
    expect(paper.items).toHaveLength(20);
    expect(paper.items.map((i) => i.stem)).toEqual(review.items.map((i) => i.stem));
    for (const item of paper.items) {
      expect(item).not.toHaveProperty('correctOptionId');
      expect(item).not.toHaveProperty('explanation');
      expect(item).not.toHaveProperty('primaryTopic');
    }
    const final = {
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      finalSeq: 0,
      answers: paper.items.map((item, index) => ({
        itemId: item.itemId,
        value: mixedAnswers[index] ?? null,
      })),
    };
    const receipt = await c.client.request(
      `/attempts/${attempt.attemptId}/submit`,
      submittedSchema,
      { method: 'POST', body: final, idempotencyKey: crypto.randomUUID() },
    );
    expect(receipt.snapshotDigest).toBe(await snapshotDigest(attempt.attemptId, final));
    expect(
      (await c.results.mine(null)).items.find((i) => i.sessionId === sitting.sessionId)?.result,
    ).toBeNull();

    await c.login('ADMIN');
    const monitored = await c.monitor.sitting(sitting.sessionId, null);
    expect(monitored.sitting.counts.submitted).toBe(1);
    expect(monitored.rows[0]?.attempt?.receiptAcceptedAt).toBeTruthy();
    const report = await c.results.results(sitting.sessionId, null);
    expect(report.rows[0]).toMatchObject({
      status: 'finalized',
      score: 30,
      maxScore: 40,
      percent: 75,
      passed: true,
      rank: 1,
    });
    const charts = await c.results.analytics(sitting.sessionId, report.summary.revision);
    expect(charts).toMatchObject({ includedCount: 1, statusCount: 0 });
    expect(
      charts.topics.map((t) => [t.topic, t.itemCount, t.availableMarks, t.earnedMarks, t.percent]),
    ).toEqual([
      ['Algebra', 5, 10, 8, 80],
      ['Geometry', 5, 10, 8, 80],
      ['Number and proportion', 5, 10, 8, 80],
      ['Statistics and probability', 5, 10, 6, 60],
    ]);
    expect(charts.distribution.map((b) => b.count)).toEqual([0, 0, 0, 1, 0]);
    expect((await c.results.report(sitting.sessionId, report.summary.revision)).rows).toEqual(
      report.rows,
    );
    expect(await c.results.csv(sitting.sessionId, report.summary.revision)).toContain(
      '"30","40","75","1"',
    );
    const publication = {
      revision: report.summary.revision,
      releaseAt: '2026-10-17T06:36:00.000Z',
      reason: 'Verified rehearsal results.',
      exclusions: [],
    };
    await expect(
      c.results.publish(sitting.sessionId, publication, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'RESULTS_NOT_RELEASED' });
    c.setTime('2026-10-17T06:35:06.000Z');
    await c.results.publish(sitting.sessionId, publication, crypto.randomUUID());
    await c.login('STUDENT');
    expect(
      (await c.results.mine(null)).items.find((i) => i.sessionId === sitting.sessionId)?.result,
    ).toBeNull();
    c.setTime(publication.releaseAt);
    expect(
      (await c.results.mine(null)).items.find((i) => i.sessionId === sitting.sessionId)?.result,
    ).toMatchObject({ score: 30, maxScore: 40, percent: 75, rank: 1 });
    await c.login('TEACHER');
    expect((await c.results.results(sitting.sessionId, null)).rows[0]?.score).toBe(30);
    await expect(
      c.results.publish(sitting.sessionId, publication, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await c.login('ADMIN');
    const access = await c.practice.access(draft.examId);
    await c.practice.settings(
      draft.examId,
      {
        revision: access.revision,
        examVersion: 1,
        enabled: true,
        releaseAt: publication.releaseAt,
        reason: 'Release reviewed practice.',
      },
      crypto.randomUUID(),
    );
    await c.login('STUDENT');
    for (const [answers, score] of [
      [expectedKeys, 40],
      [mixedAnswers, 30],
    ] as const) {
      let practice = await c.practice.start(draft.examId, 1, crypto.randomUUID());
      expect(practice.items).toHaveLength(20);
      expect(practice.items.every((i) => i.feedback === null)).toBe(true);
      for (const [index, item] of practice.items.entries()) {
        practice = await c.practice.answer(
          practice.practiceAttemptId,
          item.itemId,
          answers[index] ?? '',
          crypto.randomUUID(),
        );
      }
      const finished = await c.practice.complete(practice.practiceAttemptId, crypto.randomUUID());
      expect(finished).toMatchObject({ state: 'completed', score, maxScore: 40, bestPercent: 100 });
      expect(finished.items.every((i) => i.feedback?.explanation)).toBe(true);
    }
    expect(
      (await c.practice.mine(null)).items.find((i) => i.examId === draft.examId),
    ).toMatchObject({ completedCount: 2, bestPercent: 100 });
    expect(
      (await c.results.mine(null)).items.find((i) => i.sessionId === sitting.sessionId),
    ).toMatchObject({ result: { score: 30, percent: 75, rank: 1 }, bestPracticePercent: 100 });
  });

  it.each([
    { correct: 20, score: 40, percent: 100, passed: true },
    { correct: 10, score: 20, percent: 50, passed: true },
    { correct: 9, score: 18, percent: 45, passed: false },
    { correct: 0, score: 0, percent: 0, passed: false },
  ])(
    'grades $correct correct answers and blanks against the 40-mark paper',
    ({ correct, ...expected }) => {
      const items = math20Items();
      const { rows } = markResults(
        items,
        [
          {
            studentId: 'student',
            studentName: 'Student',
            loginId: 'STUDENT',
            attemptId: 'attempt',
            status: 'finalized',
            answers: items.map((item, index) => ({
              itemId: item.itemId,
              value: index < correct ? (expectedKeys[index] ?? null) : null,
            })),
          },
        ],
        50,
      );
      expect(rows[0]).toMatchObject({ ...expected, maxScore: 40, rank: 1 });
    },
  );
});
