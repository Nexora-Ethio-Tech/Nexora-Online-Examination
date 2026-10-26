import { blocksSchema, structureSchema } from './content-schema';
import { z } from 'zod';

const text = z.string().trim().min(1);
export const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const metadataSchema = z.object({
  title: text.max(160),
  instructions: text.max(5000),
  assignmentId: z.string().uuid(),
  language: z.enum(['en', 'am']),
  durationMinutes: z.number().int().min(1).max(480),
  passPercent: z.number().min(0).max(100),
  ordering: z.enum(['fixed', 'shuffle_questions_and_options']),
});
export const itemSchema = z
  .object({
    itemId: text,
    sectionId: text.nullable().optional(),
    passageId: text.nullable().optional(),
    content: blocksSchema.optional(),
    externalId: text.max(128),
    type: z.enum(['mcq_single', 'true_false']),
    stem: text.max(10000),
    options: z
      .array(z.object({ id: text, text: text.max(2000) }))
      .min(2)
      .max(4),
    correctOptionId: text,
    marks: z.number().int().min(1).max(1000),
    primaryTopic: z.string().max(200),
    secondaryTopics: z.array(text.max(200)).max(10),
    explanation: z.string().max(10000),
    keyConsistent: z.boolean().nullable(),
    reviewFlags: z.array(text),
    reviewed: z.boolean(),
    reviewNote: z.string().max(2000),
  })
  .superRefine((item, ctx) => {
    const ids = item.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length || !ids.includes(item.correctOptionId))
      ctx.addIssue({
        code: 'custom',
        path: ['correctOptionId'],
        message: 'Choose a valid, unique option.',
      });
    if (
      item.type === 'true_false' &&
      (ids.length !== 2 || !ids.includes('true') || !ids.includes('false'))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'True/false requires true and false options.',
      });
    if (
      item.reviewed &&
      (!item.primaryTopic.trim() ||
        !item.explanation.trim() ||
        ((item.keyConsistent === false || item.reviewFlags.length > 0) && !item.reviewNote.trim()))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['reviewed'],
        message: 'Review needs a topic, explanation and a resolution note for flagged content.',
      });
  });
export const draftSchema = metadataSchema.extend({
  structure: structureSchema.optional(),
  examId: text,
  createdAt: z.string().optional(),
  concluded: z.boolean().optional(),
  revision,
  status: z.enum(['draft', 'in_review', 'approved', 'returned']),
  totalMarks: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  reviewedCount: z.number().int().nonnegative(),
  importId: text.nullable(),
  returnComment: z.string().nullable(),
});
export const itemsSchema = z.object({ revision, items: z.array(itemSchema).max(200) });
export const assignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  subjectName: text,
  className: text,
});
export const assignmentsSchema = z.object({
  items: z.array(assignmentSchema),
  nextCursor: z.string().nullable(),
});
export const draftsSchema = z.object({
  items: z.array(draftSchema),
  nextCursor: z.string().nullable(),
});
export const jobSchema = z.object({
  importId: text,
  examId: text,
  state: z.enum(['queued', 'parsing', 'ai_queued', 'ai_running', 'ready', 'failed', 'cancelled']),
  parsedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  sourceName: text,
  sourceSha256: z.string(),
  failure: z.string().nullable(),
  diagnostics: z.array(z.object({ row: z.number().int().positive(), field: text, message: text })),
});
export type Metadata = z.infer<typeof metadataSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Job = z.infer<typeof jobSchema>;
export function reviewProblems(items: Item[]) {
  return items.filter((item) => !item.reviewed || !itemSchema.safeParse(item).success);
}
