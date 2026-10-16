import type { AuthoringStore } from './authoring-store';
import { sampleItems } from './teacher';
import { captureRecovery } from './recovery';
import { snapshotDigest } from '@/features/runner/crypto';
import type { Attempt } from '@/features/exams/schemas';

// Explicit synthetic example, loaded only by the development demo transport.
export async function recoveryExample(store: AuthoringStore, clock = Date.now) {
  const recoveryId = 'demo-recovery-example';
  if (store.recoveries.has(recoveryId)) return { recoveryId };
  const sessionId = 'demo-recovery-sitting';
  const examId = 'demo-recovery-paper';
  const iso = (offset: number) => new Date(clock() + offset).toISOString();
  const items = sampleItems();
  const draft = {
    examId,
    revision: 1,
    title: 'Recovery review example · synthetic',
    instructions: 'Synthetic recovery evidence for staff training.',
    assignmentId: 'demo-math-10a',
    language: 'en' as const,
    durationMinutes: 20,
    passPercent: 50,
    ordering: 'fixed' as const,
    status: 'approved' as const,
    itemCount: 2,
    totalMarks: 4,
    reviewedCount: 2,
    importId: null,
    returnComment: null,
  };
  const paper = {
    examVersion: 1,
    title: draft.title,
    instructions: draft.instructions,
    items: items.map(({ itemId, type, stem, marks, options }) => ({
      itemId,
      type,
      stem,
      marks,
      options,
    })),
  };
  const attempt: Attempt = {
    attemptId: 'demo-recovery-attempt',
    sessionId,
    examVersion: 1,
    scheduleRevision: 1,
    deviceGeneration: 1,
    state: 'recovery_pending',
    serverNow: iso(0),
    startsAt: iso(-1500000),
    deadlineAt: iso(-300000),
    finalAcceptUntil: iso(-295000),
    lastServerSaveAt: iso(-600000),
    highestAcceptedSeq: 1,
    answers: [{ itemId: items[0]?.itemId ?? 'q1', value: null, clientSeq: 1 }],
    receipt: null,
    recovery: { recoveryId, status: 'recovery_pending', receivedAt: iso(-120000) },
  };
  const final = {
    examVersion: 1,
    scheduleRevision: 1,
    deviceGeneration: 1,
    finalSeq: 2,
    answers: items.map((i) => ({ itemId: i.itemId, value: i.correctOptionId })),
  };
  const digest = await snapshotDigest(attempt.attemptId, final);
  if (store.recoveries.has(recoveryId)) return { recoveryId };
  store.approved.set(examId, { version: 1, items, draft });
  store.sessions.set(sessionId, {
    title: draft.title,
    durationMinutes: 20,
    shuffle: false,
    paper,
    session: {
      sessionId,
      examId,
      approvedVersion: 1,
      scheduleRevision: 1,
      preparationVisibleAt: iso(-2100000),
      startsAt: attempt.startsAt,
      endsAt: attempt.deadlineAt,
      latestDeadlineAt: attempt.deadlineAt,
      resultsReleaseAt: iso(60000),
      rosterCount: 1,
      canReschedule: false,
    },
  });
  store.resultAttempts.set(sessionId, { attempt, answers: [] });
  captureRecovery(
    store,
    attempt,
    final,
    'Synthetic example: the connection failed at the deadline and the retained answers arrived later.',
    crypto.randomUUID(),
    digest,
    paper,
  );
  return { recoveryId };
}
