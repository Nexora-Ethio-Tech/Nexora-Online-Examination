import { z } from 'zod';

const id = z.string().min(1);
const instant = z.iso.datetime();
const count = z.number().int().nonnegative();
const revision = z.number().int().positive();
export const resultRowSchema = z.object({
  studentId: id,
  studentName: id,
  loginId: id,
  attemptId: id.nullable(),
  status: z.enum([
    'finalized',
    'absent',
    'awaiting_upload',
    'recovery_pending',
    'invalidated',
    'excluded',
  ]),
  score: count.nullable(),
  maxScore: count.positive(),
  percent: z.number().min(0).max(100).nullable(),
  rank: revision.nullable(),
  passed: z.boolean().nullable(),
  exclusionReason: z.string().nullable(),
});
export const publicationSchema = z.object({
  revision,
  approvedAt: instant,
  approvedBy: id,
  releaseAt: instant,
  reason: id,
  exclusions: z.array(z.object({ attemptId: id, reason: id })),
});
export const summarySchema = z.object({
  sessionId: id,
  title: id,
  className: id,
  subjectName: id,
  endsAt: instant,
  publishableAfter: instant,
  plannedReleaseAt: instant,
  revision,
  publication: publicationSchema.nullable(),
});
export const analyticsSchema = z.object({
  revision,
  includedCount: count,
  statusCount: count,
  distribution: z.array(z.object({ label: id, count })),
  topics: z.array(
    z.object({
      topic: id,
      itemCount: count,
      studentCount: count,
      earnedMarks: count,
      availableMarks: count,
      percent: z.number().min(0).max(100).nullable(),
    }),
  ),
});
export const reportSchema = z.object({
  summary: summarySchema,
  rows: z.array(resultRowSchema),
  analytics: analyticsSchema,
  serverNow: instant,
});
export const resultsSchema = reportSchema
  .omit({ analytics: true })
  .extend({ nextCursor: z.string().nullable() });
export const sessionsSchema = z.object({
  items: z.array(summarySchema),
  nextCursor: z.string().nullable(),
  serverNow: instant,
});
export const myResultSchema = z.object({
  sessionId: id,
  title: id,
  className: id,
  plannedReleaseAt: instant,
  publicationRevision: revision.nullable(),
  result: resultRowSchema
    .omit({ studentId: true, studentName: true, loginId: true, attemptId: true })
    .nullable(),
  bestPracticePercent: z.number().min(0).max(100).nullable(),
});
export const myResultsSchema = z.object({
  items: z.array(myResultSchema),
  nextCursor: z.string().nullable(),
  serverNow: instant,
});
export const publishSchema = z.object({
  revision,
  releaseAt: instant,
  reason: z.string().trim().min(1).max(2000),
  exclusions: z.array(z.object({ attemptId: id, reason: z.string().trim().min(1).max(2000) })),
});
export type ResultRow = z.infer<typeof resultRowSchema>;
export type ResultSummary = z.infer<typeof summarySchema>;
export type Report = z.infer<typeof reportSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type PublishRequest = z.infer<typeof publishSchema>;
