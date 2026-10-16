import { z } from 'zod';
import { draftSchema, itemSchema } from '../authoring/schemas';

const id = z.string().min(1);
const revision = z.number().int().positive();
const instant = z.iso.datetime();
export const sessionSchema = z.object({
  sessionId: id,
  examId: id,
  approvedVersion: revision,
  scheduleRevision: revision,
  preparationVisibleAt: instant,
  startsAt: instant,
  endsAt: instant,
  resultsReleaseAt: instant,
  rosterCount: z.number().int().nonnegative(),
  canReschedule: z.boolean(),
});
export const adminSummarySchema = z.object({
  exam: draftSchema,
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
      action: z.enum(['submitted', 'returned', 'approved', 'scheduled', 'rescheduled']),
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
  resultsReleaseAt: instant,
});
export const rescheduleSchema = z.object({
  scheduleRevision: revision,
  preparationVisibleAt: instant,
  resultsReleaseAt: instant,
  reason: z.string().trim().min(1).max(2000),
});
export type AdminDetail = z.infer<typeof adminDetailSchema>;
export type Sitting = z.infer<typeof sessionSchema>;

// datetime-local is explicitly EAT, never the browser's timezone.
export function parseEatInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+03:00`);
  if (!Number.isFinite(ms) || new Date(ms + 3 * 3600000).toISOString().slice(0, 16) !== value)
    return null;
  return new Date(ms).toISOString();
}
export function toEatInput(iso: string) {
  return new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 16);
}
export function scheduleTimes(preparation: string, durationMinutes: number) {
  const startsAt = new Date(Date.parse(preparation) + 10 * 60000).toISOString();
  return {
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + durationMinutes * 60000).toISOString(),
  };
}
