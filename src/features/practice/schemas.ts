import { z } from 'zod';
const id = z.string().min(1);
const version = z.number().int().positive();
const time = z.iso.datetime();
export const practiceAccessSchema = z.object({
  examId: id,
  examVersion: version,
  title: id,
  revision: version,
  enabled: z.boolean(),
  releaseAt: time.nullable(),
  available: z.boolean(),
  blockers: z.array(id),
  contentReleasedAt: time.nullable(),
  serverNow: time,
  history: z.array(
    z.object({
      enabled: z.boolean(),
      releaseAt: time.nullable(),
      reason: id,
      actorName: id,
      at: time,
    }),
  ),
});
export const practiceSettingsSchema = z
  .object({
    revision: version,
    examVersion: version,
    enabled: z.boolean(),
    releaseAt: time.nullable(),
    reason: z.string().trim().min(1).max(2000),
  })
  .refine((v) => !v.enabled || v.releaseAt !== null, {
    message: 'Choose a practice release time.',
  });
export const adminPracticeListSchema = z.object({
  items: z.array(practiceAccessSchema),
  nextCursor: id.nullable(),
  serverNow: time,
});
export const practiceSummarySchema = z.object({
  examId: id,
  examVersion: version,
  title: id,
  available: z.boolean(),
  blockers: z.array(id),
  releaseAt: time.nullable(),
  bestPercent: z.number().min(0).max(100).nullable(),
  completedCount: z.number().int().nonnegative(),
  activeAttemptId: id.nullable(),
});
export const practiceListSchema = z.object({
  items: z.array(practiceSummarySchema),
  nextCursor: id.nullable(),
  serverNow: time,
});
export const feedbackSchema = z.object({
  chosenOptionId: id,
  correctOptionId: id,
  correct: z.boolean(),
  explanation: id,
  earnedMarks: z.number().int().nonnegative(),
});
export const practiceAttemptSchema = z.object({
  practiceAttemptId: id,
  examId: id,
  examVersion: version,
  title: id,
  instructions: z.string(),
  state: z.enum(['active', 'completed']),
  items: z
    .array(
      z
        .object({
          itemId: id,
          type: z.enum(['mcq_single', 'true_false']),
          stem: id,
          marks: version,
          options: z.array(z.object({ id, text: id }).strict()),
          feedback: feedbackSchema.nullable(),
        })
        .strict(),
    )
    .min(1),
  score: z.number().int().nonnegative().nullable(),
  maxScore: version,
  percent: z.number().min(0).max(100).nullable(),
  completedAt: time.nullable(),
  bestPercent: z.number().min(0).max(100).nullable(),
  serverNow: time,
});
export const practiceAnswerSchema = z.object({ itemId: id, value: id });
export type PracticeAccess = z.infer<typeof practiceAccessSchema>;
export type PracticeSettings = z.infer<typeof practiceSettingsSchema>;
export type PracticeAttempt = z.infer<typeof practiceAttemptSchema>;
