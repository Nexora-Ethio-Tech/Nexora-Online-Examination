import { blocksSchema, structureSchema, structureProblems } from '@/features/exams/content/schema';
import { z } from 'zod';
import { attemptSchema, attemptState } from '@/features/exams/schemas';
export const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = integer.min(1);
const time = z.iso.datetime();
const option = z.object({ id: identifier, text: z.string().min(1) }).strict();
export const paperSchema = z
  .object({
    structure: structureSchema.optional(),
    examVersion: version,
    title: z.string().min(1),
    instructions: z.string(),
    items: z
      .array(
        z
          .object({
            sectionId: identifier.nullable().optional(),
            passageId: identifier.nullable().optional(),
            content: blocksSchema.optional(),
            itemId: identifier,
            type: z.enum(['mcq_single', 'true_false']),
            stem: z.string().min(1),
            marks: version,
            options: z.array(option).min(2),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((paper, ctx) => {
    for (const message of structureProblems(
      paper.structure ?? { sections: [], passages: [] },
      paper.items,
    ))
      ctx.addIssue({ code: 'custom', message });
  });
export const unlockSchema = z.object({
  packageId: identifier,
  key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  serverNow: time,
  deadlineAt: time,
  finalAcceptUntil: time,
  deviceGeneration: version,
  questionOrder: z.array(identifier),
  optionOrders: z.record(identifier, z.array(identifier)),
});
export const answerSchema = z.object({
  itemId: identifier,
  value: identifier.nullable(),
  clientSeq: integer,
});
export const finalSchema = z.object({
  examVersion: version,
  scheduleRevision: version,
  deviceGeneration: version,
  finalSeq: integer,
  answers: z.array(z.object({ itemId: identifier, value: identifier.nullable() })),
});
export const submittedSchema = z.object({
  status: z.literal('submitted'),
  receiptId: identifier,
  acceptedAt: time,
  snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const receiptReadSchema = z.object({
  attemptId: identifier,
  state: attemptState,
  receipt: attemptSchema.shape.receipt,
  recovery: attemptSchema.shape.recovery,
});
export const saveResponseSchema = z.object({
  acknowledged: z.array(z.object({ itemId: identifier, clientSeq: integer })),
  superseded: z.array(z.object({ itemId: identifier, clientSeq: integer, currentSeq: integer })),
  highestAcceptedSeq: integer,
  lastServerSaveAt: time,
  serverNow: time,
});
export const recoveryResponseSchema = z.object({
  status: z.literal('recovery_pending'),
  recoveryId: identifier,
  receivedAt: time,
});
export type Paper = z.infer<typeof paperSchema>;
export type Unlock = z.infer<typeof unlockSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type FinalBody = z.infer<typeof finalSchema>;
export type Receipt = z.infer<typeof submittedSchema>;
export type SaveResponse = z.infer<typeof saveResponseSchema>;
