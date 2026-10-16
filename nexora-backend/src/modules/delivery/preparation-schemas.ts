import { z } from 'zod';
import { DomainException } from '../../common/errors/domain.exception';

const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const deviceRequestSchema = z.object({ deviceId: z.string().uuid() }).strict();
export const idempotencyKeySchema = z.string().uuid();
export const resourceIdSchema = z.string().uuid();
export const unlockRequestSchema = z
  .object({
    packageId: resourceIdSchema,
    examVersion: revision,
    scheduleRevision: revision,
    deviceGeneration: revision,
  })
  .strict();

const time = z.string().datetime();
export const attemptResponseSchema = z
  .object({
    attemptId: resourceIdSchema,
    sessionId: resourceIdSchema,
    examVersion: revision,
    scheduleRevision: revision,
    deviceGeneration: revision,
    state: z.enum([
      'preparing',
      'active',
      'awaiting_upload',
      'recovery_pending',
      'submitted',
      'invalidated',
    ]),
    serverNow: time,
    startsAt: time,
    deadlineAt: time,
    finalAcceptUntil: time,
    lastServerSaveAt: time.nullable(),
    highestAcceptedSeq: z.number().int().nonnegative(),
    answers: z.array(
      z.object({
        itemId: z.string(),
        value: z.string().nullable(),
        clientSeq: z.number().int().nonnegative(),
      }),
    ),
    receipt: z
      .object({
        status: z.literal('submitted'),
        receiptId: resourceIdSchema,
        acceptedAt: time,
        snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
        idempotencyKey: resourceIdSchema,
        finalSeq: z.number().int().nonnegative(),
      })
      .nullable(),
    recovery: z
      .object({
        recoveryId: resourceIdSchema,
        status: z.enum(['recovery_pending', 'accepted', 'rejected']),
        receivedAt: time,
      })
      .nullable(),
  })
  .strict();

export function parsePreparationInput<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw DomainException.validation(
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
