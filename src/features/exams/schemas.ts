import { z } from 'zod';
const id = z.string().min(1);
const time = z.iso.datetime();
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const attemptState = z.enum([
  'preparing',
  'active',
  'awaiting_upload',
  'recovery_pending',
  'submitted',
  'invalidated',
]);
export const examSchema = z.object({
  examId: id,
  sessionId: id,
  title: id,
  subjectName: id,
  className: id,
  durationMinutes: version,
  preparationVisibleAt: time,
  startsAt: time,
  endsAt: time,
  deadlineAt: time,
  scheduleRevision: version,
  phase: z.enum(['scheduled', 'preparing', 'open', 'ended']),
  attemptId: id.nullable(),
  attemptState: attemptState.nullable(),
});
export const listSchema = z.object({
  items: z.array(examSchema),
  nextCursor: id.nullable(),
  serverNow: time,
});
export const detailSchema = z.object({ exam: examSchema, serverNow: time });
export const attemptSchema = z.object({
  attemptId: id,
  sessionId: id,
  examVersion: version,
  scheduleRevision: version,
  deviceGeneration: version,
  state: attemptState,
  serverNow: time,
  startsAt: time,
  deadlineAt: time,
  finalAcceptUntil: time,
  lastServerSaveAt: time.nullable(),
  highestAcceptedSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  answers: z.array(
    z.object({ itemId: id, value: id.nullable(), clientSeq: z.number().int().nonnegative() }),
  ),
  receipt: z
    .object({
      status: z.literal('submitted'),
      receiptId: id,
      acceptedAt: time,
      snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
      idempotencyKey: id,
      finalSeq: z.number().int().nonnegative(),
    })
    .nullable(),
  recovery: z
    .object({
      recoveryId: id,
      status: z.enum(['recovery_pending', 'accepted', 'rejected']),
      receivedAt: time,
    })
    .nullable(),
});
export const packageSchema = z
  .object({
    packageId: id,
    examVersion: version,
    scheduleRevision: version,
    algorithm: z.literal('AES-GCM'),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Exam = z.infer<typeof examSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export type EncryptedPackage = z.infer<typeof packageSchema>;
