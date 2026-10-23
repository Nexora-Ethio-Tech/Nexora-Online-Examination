import { expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { examGroup, studentGradeStatuses } from './exam-groups';

it('keeps early submissions past and unresolved uploads visible separately', () => {
  expect(examGroup({ phase: 'open', attemptState: 'submitted' })).toBe('Past exams');
  expect(examGroup({ phase: 'ended', attemptState: 'awaiting_upload' })).toBe('Needs attention');
  expect(examGroup({ phase: 'ended', attemptState: 'recovery_pending' })).toBe('Needs attention');
  expect(examGroup({ phase: 'scheduled', attemptState: null })).toBe('Upcoming exams');
  expect(examGroup({ phase: 'preparing', attemptState: null })).toBe('Current exams');
});
const row = (
  sessionId: string,
  publicationRevision: number | null,
  status: 'finalized' | 'absent' | 'recovery_pending' | null,
) => ({
  sessionId,
  title: 'Paper',
  className: 'Grade 10',
  plannedReleaseAt: '2026-10-23T10:00:00Z',
  publicationRevision,
  result: status
    ? {
        status,
        score: status === 'finalized' ? 0 : null,
        maxScore: 10,
        percent: status === 'finalized' ? 0 : null,
        rank: null,
        passed: false,
        exclusionReason: null,
      }
    : null,
  bestPracticePercent: null,
});
it('follows result cursors and distinguishes a published zero mark from no grade', async () => {
  const urls: string[] = [];
  const client = new ApiClient('/api/v1', async (url) => {
    urls.push(url);
    return Response.json({
      items: url.includes('cursor=second')
        ? [row('absent', 1, 'absent'), row('recovery', 1, 'recovery_pending')]
        : [row('zero', 1, 'finalized'), row('waiting', null, null)],
      nextCursor: url.includes('cursor=second') ? null : 'second',
      serverNow: '2026-10-23T11:00:00Z',
    });
  });
  expect(await studentGradeStatuses(client)).toEqual({
    zero: 'Graded',
    waiting: 'Awaiting results',
    absent: 'No grade',
    recovery: 'Awaiting results',
  });
  expect(urls).toHaveLength(2);
});
it('does not expose a grade when publication is absent and stops repeated cursors', async () => {
  const client = new ApiClient('/api/v1', async () =>
    Response.json({
      items: [row('unreleased', null, 'finalized')],
      nextCursor: null,
      serverNow: '2026-10-23T11:00:00Z',
    }),
  );
  expect(await studentGradeStatuses(client)).toEqual({ unreleased: 'Awaiting results' });
  const looping = new ApiClient('/api/v1', async () =>
    Response.json({ items: [], nextCursor: 'same', serverNow: '2026-10-23T11:00:00Z' }),
  );
  await expect(studentGradeStatuses(looping)).rejects.toThrow('Results could not finish loading');
});
