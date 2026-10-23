import { z } from 'zod';
import { draftSchema, itemSchema } from '../authoring/schemas';

const id = z.string().min(1);
const revision = z.number().int().positive();
const instant = z.string().datetime();
export const sessionSchema = z.object({
  sessionId: id,
  examId: id,
  approvedVersion: revision,
  scheduleRevision: revision,
  preparationVisibleAt: instant,
  startsAt: instant,
  endsAt: instant,
  latestDeadlineAt: instant,
  resultsReleaseAt: instant,
  rosterCount: z.number().int().nonnegative(),
  canReschedule: z.boolean(),
});
export const adminSummarySchema = z.object({
  exam: draftSchema.extend({ assignmentId: id.nullable() }),
  grade: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  teacherName: id,
  subjectName: id,
  className: id,
  approvedVersion: revision.nullable(),
  packageState: z.enum(['not_requested', 'pending', 'ready', 'failed']),
});
export const adminDetailSchema = adminSummarySchema.extend({
  items: z.array(itemSchema),
  serverNow: instant,
  packageError: z.string().nullable(),
  sessions: z.array(sessionSchema),
  history: z.array(
    z.object({
      action: z.enum([
        'submitted',
        'returned',
        'approved',
        'scheduled',
        'rescheduled',
        'accommodation_changed',
      ]),
      actorName: id,
      at: instant,
      comment: z.string(),
      revision,
    }),
  ),
});
export const adminListSchema = z.object({
  items: z.array(adminSummarySchema),
  nextCursor: z.string().nullable(),
  serverNow: instant,
});
export const decisionSchema = z.object({ revision, comment: z.string().trim().min(1).max(2000) });
export const scheduleSchema = z.object({
  revision,
  approvedVersion: revision,
  preparationVisibleAt: instant,
  preparationMinutes: z.number().int().min(0).max(120).optional(),
  resultsReleaseAt: instant,
});
export const rescheduleSchema = z.object({
  scheduleRevision: revision,
  preparationVisibleAt: instant,
  preparationMinutes: z.number().int().min(0).max(120).optional(),
  resultsReleaseAt: instant,
  reason: z.string().trim().min(1).max(2000),
});
export type AdminDetail = z.infer<typeof adminDetailSchema>;
export type Sitting = z.infer<typeof sessionSchema>;
