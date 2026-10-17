import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { renderReport } from '../../src/modules/results/render-report';
import { ResultSource } from '../../src/common/db/result-snapshot';
const fixture = z
  .object({
    passPercent: z.number(),
    items: z.array(
      z.object({
        itemId: z.string(),
        marks: z.number(),
        correctOptionId: z.string(),
        primaryTopic: z.string(),
      }),
    ),
    finalizedStudents: z.array(
      z.object({
        studentId: z.string(),
        answers: z.record(z.string().nullable()),
        expectedScore: z.number(),
        expectedRank: z.number(),
      }),
    ),
    expectedDistributionCounts: z.array(z.number()),
    expectedTopic: z.object({
      topic: z.string(),
      itemCount: z.number(),
      studentCount: z.number(),
      earnedMarks: z.number(),
      availableMarks: z.number(),
      percent: z.number(),
    }),
  })
  .parse(
    JSON.parse(
      readFileSync(
        resolve('docs/Nexora_Backend_BE11_v0.12/docs/fixtures/official-results-v1.json'),
        'utf8',
      ),
    ),
  );
const now = '2026-10-17T12:00:00.000Z';
function source(): ResultSource {
  return {
    session: {
      sessionId: 'session',
      examId: 'exam',
      examVersion: 1,
      title: 'Math',
      className: 'Class',
      subjectName: 'Math',
      passPercent: fixture.passPercent,
      endsAt: now,
      publishableAfter: now,
      plannedReleaseAt: now,
      revision: 1,
    },
    items: fixture.items.map((i) => ({
      itemId: i.itemId,
      marks: i.marks,
      correctKey: i.correctOptionId,
      topic: i.primaryTopic,
    })),
    rows: fixture.finalizedStudents.map((s) => ({
      studentId: s.studentId,
      studentName: s.studentId,
      loginId: s.studentId,
      attemptId: s.studentId,
      state: 'submitted',
      receiptId: s.studentId,
      pendingRecovery: false,
      score: s.expectedScore,
      answers: Object.entries(s.answers).map(([itemId, value]) => ({ itemId, value })),
    })),
  };
}
describe('official report grading vectors', () => {
  it('reproduces issued ranking, topic denominator and distribution without rounding', () => {
    const report = renderReport(source(), null, now);
    expect(report.rows.map((r) => r.rank)).toEqual(
      fixture.finalizedStudents.map((s) => s.expectedRank),
    );
    expect(report.analytics.topics).toEqual([fixture.expectedTopic]);
    expect(report.analytics.distribution.map((b) => b.count)).toEqual(
      fixture.expectedDistributionCounts,
    );
    expect(report.rows[1].percent).toBe((100 * 4) / 6);
  });
  it('keeps non-finalized rows ungraded while ranking a valid zero', () => {
    const s = source();
    s.rows[0] = {
      ...s.rows[0],
      score: 0,
      answers: s.items.map((i) => ({ itemId: i.itemId, value: null })),
    };
    s.rows[1] = { ...s.rows[1], state: 'invalidated' };
    s.rows[2] = {
      ...s.rows[2],
      receiptId: null,
      state: 'recovery_pending',
      pendingRecovery: true,
      score: null,
    };
    s.rows[3] = { ...s.rows[3], attemptId: null, receiptId: null, state: null, score: null };
    const r = renderReport(s, null, now);
    expect(r.rows[0]).toMatchObject({ score: 0, percent: 0, rank: 2, passed: false });
    for (const row of r.rows.slice(1, 4))
      expect(row).toMatchObject({ score: null, percent: null, rank: null, passed: null });
  });
  it('fails instead of publishing inconsistent stored grades', () => {
    const s = source();
    s.rows[0].score = 1;
    expect(() => renderReport(s, null, now)).toThrow('Stored grade');
  });
  it('keeps empty topic aggregates and excluded marks null', () => {
    const s = source();
    const r = renderReport(
      s,
      null,
      now,
      s.rows.map((row) => ({ attemptId: row.attemptId ?? row.studentId, reason: 'Review' })),
    );
    expect(r.analytics.topics[0]).toMatchObject({
      studentCount: 0,
      availableMarks: 0,
      percent: null,
    });
    expect(r.rows.every((row) => row.status === 'excluded' && row.score === null)).toBe(true);
  });
});
