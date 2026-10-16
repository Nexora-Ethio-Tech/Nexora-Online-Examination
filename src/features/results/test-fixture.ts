import { createAuthoringStore } from '@/mocks/authoring-store';
import { sampleItems } from '@/mocks/teacher';
import type { Attempt } from '@/features/exams/schemas';

export function resultsFixture() {
  const store = createAuthoringStore();
  const items = sampleItems();
  const draft = {
    examId: 'paper',
    revision: 1,
    title: 'Algebra official results',
    instructions: 'Choose one answer.',
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
  store.approved.set('paper', { version: 1, items, draft });
  store.sessions.set('sitting', {
    title: draft.title,
    durationMinutes: 20,
    shuffle: false,
    session: {
      sessionId: 'sitting',
      examId: 'paper',
      approvedVersion: 1,
      scheduleRevision: 1,
      preparationVisibleAt: '2026-10-17T05:50:00.000Z',
      startsAt: '2026-10-17T06:00:00.000Z',
      endsAt: '2026-10-17T06:20:00.000Z',
      latestDeadlineAt: '2026-10-17T06:20:00.000Z',
      resultsReleaseAt: '2026-10-17T07:00:00.000Z',
      rosterCount: 1,
      canReschedule: false,
    },
    paper: {
      examVersion: 1,
      title: draft.title,
      instructions: draft.instructions,
      items: items.map(({ itemId, stem, options, marks, type }) => ({
        itemId,
        stem,
        options,
        marks,
        type,
      })),
    },
  });
  const attempt: Attempt = {
    attemptId: 'attempt',
    sessionId: 'sitting',
    examVersion: 1,
    scheduleRevision: 1,
    deviceGeneration: 1,
    state: 'submitted',
    serverNow: '2026-10-17T06:20:00.000Z',
    startsAt: '2026-10-17T06:00:00.000Z',
    deadlineAt: '2026-10-17T06:20:00.000Z',
    finalAcceptUntil: '2026-10-17T06:20:05.000Z',
    lastServerSaveAt: null,
    highestAcceptedSeq: 0,
    answers: [],
    recovery: null,
    receipt: {
      status: 'submitted',
      receiptId: 'receipt',
      acceptedAt: '2026-10-17T06:20:00.000Z',
      snapshotDigest: 'a'.repeat(64),
      idempotencyKey: crypto.randomUUID(),
      finalSeq: 0,
    },
  };
  store.resultAttempts.set('sitting', {
    attempt,
    answers: items.map((i) => ({ itemId: i.itemId, value: i.correctOptionId })),
  });
  return { store, items, attempt };
}
