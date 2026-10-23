import type { ApiClient } from '@/lib/api-client';
import { resultsApi } from '@/features/results/api';
import type { Exam } from './schemas';

export const examGroups = [
  'Current exams',
  'Needs attention',
  'Upcoming exams',
  'Past exams',
] as const;
export function examGroup(exam: Pick<Exam, 'phase' | 'attemptState'>) {
  if (exam.attemptState === 'submitted' || exam.attemptState === 'invalidated') return 'Past exams';
  if (
    exam.attemptState === 'awaiting_upload' ||
    exam.attemptState === 'recovery_pending' ||
    (exam.phase === 'ended' && exam.attemptState)
  )
    return 'Needs attention';
  if (exam.phase === 'scheduled') return 'Upcoming exams';
  if (exam.phase === 'preparing' || exam.phase === 'open') return 'Current exams';
  return 'Past exams';
}
export type GradeStatus = 'Graded' | 'Awaiting results' | 'No grade';
/** Read only the student's already-authorized result endpoint, including every cursor page. */
export async function studentGradeStatuses(client: ApiClient, signal?: AbortSignal) {
  const statuses: Record<string, GradeStatus> = {};
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await resultsApi(client).mine(cursor, signal);
    for (const row of page.items) {
      statuses[row.sessionId] =
        row.publicationRevision !== null && row.result
          ? row.result.status === 'finalized' && row.result.score !== null
            ? 'Graded'
            : row.result.status === 'awaiting_upload' || row.result.status === 'recovery_pending'
              ? 'Awaiting results'
              : 'No grade'
          : 'Awaiting results';
    }
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor))
      throw new Error('Results could not finish loading. Please refresh.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return statuses;
}
