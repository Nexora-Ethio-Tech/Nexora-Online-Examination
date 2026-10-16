import { z } from 'zod';
import { readinessSchema } from '../readiness';
import { attemptState } from '../schemas';
const id = z.string().min(1);
const time = z.iso.datetime();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const generation = count.positive();
export const monitorStatus = z.enum([
  'not_started',
  'preparing',
  'active',
  'submitted',
  'recovery_needed',
  'invalidated',
]);
export const statusLabels: Record<z.infer<typeof monitorStatus>, string> = {
  not_started: 'Not started',
  preparing: 'Preparing',
  active: 'Active',
  submitted: 'Submitted',
  recovery_needed: 'Recovery needed',
  invalidated: 'Invalidated',
};
export const sittingSchema = z
  .object({
    sessionId: id,
    examId: id,
    title: id,
    className: id,
    subjectName: id,
    preparationVisibleAt: time,
    startsAt: time,
    endsAt: time,
    latestDeadlineAt: time,
    scheduleRevision: generation,
    rosterCount: count,
    readyCount: count,
    counts: z
      .object({
        not_started: count,
        preparing: count,
        active: count,
        submitted: count,
        recovery_needed: count,
        invalidated: count,
      })
      .strict(),
  })
  .strict()
  .refine(
    (s) => Object.values(s.counts).reduce((sum, n) => sum + n, 0) === s.rosterCount,
    'Counts must cover the frozen roster.',
  )
  .refine((s) => s.readyCount <= s.counts.preparing, 'Ready count must be a subset of preparing.');
export const monitorRowSchema = z
  .object({
    studentId: id,
    loginId: id,
    studentName: id,
    deadlineAt: time,
    status: monitorStatus,
    attempt: z
      .object({
        attemptId: id,
        readiness: readinessSchema.nullable(),
        state: attemptState,
        deviceGeneration: generation,
        lastContactAt: time.nullable(),
        lastServerSaveAt: time.nullable(),
        serverAnsweredCount: count,
        receiptAcceptedAt: time.nullable(),
        recoveryId: id.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((row) => {
    if (!row.attempt) return row.status === 'not_started';
    if (row.status === 'not_started') return false;
    if (
      row.attempt.readiness &&
      row.attempt.readiness.deviceGeneration !== row.attempt.deviceGeneration
    )
      return false;
    const submitted = row.status === 'submitted';
    return (
      submitted === (row.attempt.state === 'submitted') &&
      submitted === (row.attempt.receiptAcceptedAt !== null)
    );
  }, 'Attempt status must agree with a committed receipt.');
export const transferRequestSchema = z
  .object({
    newDeviceId: z.uuid(),
    expectedDeviceGeneration: generation,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const transferResponseSchema = z
  .object({
    attemptId: id,
    deviceGeneration: generation,
    state: z.literal('preparing'),
    deadlineAt: time,
    transferredAt: time,
    transferId: id,
  })
  .strict();
export const transferEventSchema = z
  .object({
    transferId: id,
    actorName: id,
    actorId: id,
    reason: id,
    transferredAt: time,
    fromGeneration: generation,
    toGeneration: generation,
  })
  .strict();
export const monitorListSchema = z
  .object({
    items: z.array(sittingSchema),
    nextCursor: id.nullable(),
    serverNow: time,
  })
  .strict();
export const monitorDetailSchema = z
  .object({
    sitting: sittingSchema,
    rows: z.array(monitorRowSchema),
    nextCursor: id.nullable(),
    serverNow: time,
  })
  .strict();
export const monitorAttemptSchema = z
  .object({
    sitting: sittingSchema,
    student: monitorRowSchema,
    transferBlocker: z.enum(['no_attempt', 'closed', 'deadline_passed']).nullable(),
    history: z.array(transferEventSchema),
    nextCursor: id.nullable(),
    serverNow: time,
  })
  .strict();
export type MonitorSitting = z.infer<typeof sittingSchema>;
export type MonitorRow = z.infer<typeof monitorRowSchema>;
export type MonitorAttempt = z.infer<typeof monitorAttemptSchema>;
export type TransferRequest = z.infer<typeof transferRequestSchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
export type TransferEvent = z.infer<typeof transferEventSchema>;
