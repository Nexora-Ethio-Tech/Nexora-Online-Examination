import { z } from 'zod';
import { answerSchema, finalSchema, paperSchema } from '@/features/runner/schemas';
const id = z.string().min(1);
const time = z.iso.datetime();
export const decisionRequestSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  reason: z.string().trim().min(1).max(2000),
});
export const decisionResponseSchema = z.object({
  recoveryId: id,
  decision: z.enum(['accept', 'reject']),
  decidedAt: time,
  resultRevision: z.number().int().positive().nullable(),
});
export const recoverySummarySchema = z.object({
  recoveryId: id,
  attemptId: id,
  sessionId: id,
  title: id,
  className: id,
  studentName: id,
  loginId: id,
  receivedAt: time,
  status: z.enum(['recovery_pending', 'accepted', 'rejected']),
});
export const recoveryListSchema = z.object({
  items: z.array(recoverySummarySchema),
  nextCursor: id.nullable(),
  serverNow: time,
});
export const recoveryDetailSchema = recoverySummarySchema.extend({
  serverNow: time,
  reason: id,
  deadlineAt: time,
  finalAcceptUntil: time,
  snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: finalSchema,
  currentDeviceGeneration: z.number().int().positive(),
  latestTimelySave: z.object({
    savedAt: time.nullable(),
    highestAcceptedSeq: z.number().int().nonnegative(),
    answers: z.array(answerSchema),
  }),
  paper: paperSchema,
  relatedUploads: z.array(recoverySummarySchema),
  canAccept: z.boolean(),
  acceptanceBlocker: z.string().nullable(),
  decision: z
    .object({
      decision: z.enum(['accept', 'reject']),
      reason: id,
      decidedAt: time,
      decidedBy: id,
      resultRevision: z.number().int().positive().nullable(),
    })
    .nullable(),
});
export type RecoveryDetail = z.infer<typeof recoveryDetailSchema>;
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
