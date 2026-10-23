import { beforeEach, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { reportSchema } from '../../src/modules/results/schemas';
import type { ResultSource } from '../../src/common/db/result-snapshot';
const mocks = vi.hoisted(() => ({ source: vi.fn(), snapshot: vi.fn() }));
vi.mock('../../src/common/db/result-snapshot', () => ({
  currentResultSource: mocks.source,
  captureResultSnapshot: mocks.snapshot,
}));
import {
  releaseDue,
  assertReleaseChange,
  releaseScheduledResults,
  changeReleaseSchedule,
} from '../../src/modules/results/scheduled-release';
const due = new Date('2026-10-23T10:00:00Z');
const source: ResultSource = {
  session: {
    sessionId: 's',
    examId: 'e',
    examVersion: 1,
    title: 'Math',
    className: 'Class',
    subjectName: 'Math',
    passPercent: 50,
    endsAt: '2026-10-23T09:00:00Z',
    publishableAfter: '2026-10-23T09:00:05Z',
    plannedReleaseAt: due.toISOString(),
    revision: 1,
  },
  items: [{ itemId: 'q', marks: 1, correctKey: 'a', topic: 'Math' }],
  rows: [
    {
      studentId: 'student',
      studentName: 'Student',
      loginId: 'STU',
      attemptId: 'attempt',
      state: 'recovery_pending',
      receiptId: null,
      pendingRecovery: true,
      score: null,
      answers: [],
    },
  ],
};
let query = vi.fn();
let published = false;
beforeEach(() => {
  vi.resetAllMocks();
  published = false;
  mocks.source.mockResolvedValue(structuredClone(source));
  query = vi.fn(async (sql: string, _params?: unknown[]) => {
    void _params;
    if (sql.includes('FROM exam_sessions'))
      return {
        rows: [
          {
            planned_results_release_at: due,
            ends_at: new Date(source.session.endsAt),
            results_revision: 1,
          },
        ],
        rowCount: 1,
      };
    if (sql.startsWith('SELECT id FROM result_publications'))
      return { rows: published ? [{ id: 'p' }] : [], rowCount: published ? 1 : 0 };
    if (sql.startsWith('INSERT INTO result_publications')) published = true;
    return { rows: [], rowCount: 1 };
  });
});
const client = () => ({ query }) as unknown as PoolClient;
it('releases at the scheduled time but only strictly after the final acceptance boundary', () => {
  expect(releaseDue(new Date(due.getTime() - 1), due, new Date(due.getTime() - 1000))).toBe(false);
  expect(releaseDue(due, due, new Date(due.getTime() - 1000))).toBe(true);
  expect(releaseDue(due, due, due)).toBe(false);
});
it('locks release-date changes at the exact old release time and rejects past or premature targets', () => {
  const before = new Date(due.getTime() - 1),
    after = new Date(due.getTime() + 60000);
  expect(() =>
    assertReleaseChange(before, due, after, new Date(source.session.publishableAfter)),
  ).not.toThrow();
  expect(() =>
    assertReleaseChange(due, due, after, new Date(source.session.publishableAfter)),
  ).toThrow();
  expect(() =>
    assertReleaseChange(before, due, before, new Date(source.session.publishableAfter)),
  ).toThrow();
  expect(() =>
    assertReleaseChange(
      new Date('2026-10-23T08:00:00Z'),
      due,
      new Date('2026-10-23T09:00:00Z'),
      new Date(source.session.publishableAfter),
    ),
  ).toThrow();
});
it('does not load scores or publish before the due time', async () => {
  await releaseScheduledResults(client(), 'school', 's', () => new Date(due.getTime() - 1));
  expect(mocks.source).not.toHaveBeenCalled();
  expect(published).toBe(false);
});
it('records one automatic snapshot without turning unresolved work into zero marks', async () => {
  await releaseScheduledResults(client(), 'school', 's', () => due);
  await releaseScheduledResults(client(), 'school', 's', () => due);
  const inserts = query.mock.calls.filter(([sql]) =>
    sql.startsWith('INSERT INTO result_publications'),
  );
  expect(inserts).toHaveLength(1);
  const call = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO result_publications'));
  if (!call?.[1]) throw new Error('Missing publication arguments');
  const report = reportSchema.parse(JSON.parse(String(call[1][7])));
  expect(report.rows[0]).toMatchObject({ status: 'recovery_pending', score: null, rank: null });
  expect(report.summary.publication?.approvedBy).toBe('Automatic scheduled release');
  expect(query.mock.calls.some(([sql]) => sql.includes('results:auto_release'))).toBe(true);
});
it('rechecks time after acquiring the lock and rejects stale date edits', async () => {
  await expect(
    changeReleaseSchedule(
      client(),
      'school',
      's',
      'admin',
      () => due,
      due.toISOString(),
      '2026-10-23T11:00:00Z',
    ),
  ).rejects.toMatchObject({ code: 'RESULTS_NOT_RELEASED' });
  await expect(
    changeReleaseSchedule(
      client(),
      'school',
      's',
      'admin',
      () => new Date(due.getTime() - 1),
      '2026-10-23T09:30:00Z',
      '2026-10-23T11:00:00Z',
    ),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
it('captures a new revision when changing an unreleased date', async () => {
  await changeReleaseSchedule(
    client(),
    'school',
    's',
    'admin',
    () => new Date(due.getTime() - 1),
    due.toISOString(),
    '2026-10-23T11:00:00Z',
  );
  expect(mocks.snapshot).toHaveBeenCalledWith(expect.anything(), 'school', 's');
  expect(query.mock.calls.some(([sql]) => sql.includes('results:reschedule'))).toBe(true);
});
