import { z } from 'zod';
import { sessionSchema } from './schemas';

export const accommodationChangeSchema = z.object({
  scheduleRevision: z.number().int().positive(),
  studentId: z.string().min(1),
  extraMinutes: z.number().int().min(0).max(480),
  reason: z.string().trim().min(1).max(2000),
});
export const accommodationStudentSchema = z.object({
  studentId: z.string().min(1),
  loginId: z.string().min(1),
  studentName: z.string().min(1),
  extraMinutes: z.number().int().min(0).max(480),
  deadlineAt: z.string().datetime(),
  lastChange: z
    .object({
      auditId: z.string().min(1),
      actorName: z.string().min(1),
      at: z.string().datetime(),
      reason: z.string(),
      previousExtraMinutes: z.number().int().nonnegative(),
      extraMinutes: z.number().int().nonnegative(),
    })
    .nullable(),
});
export const accommodationSessionSchema = sessionSchema.extend({
  title: z.string().min(1),
  latestDeadlineAt: z.string().datetime(),
  canEdit: z.boolean(),
});
export const accommodationListSchema = z.object({
  session: accommodationSessionSchema,
  items: z.array(accommodationStudentSchema),
  nextCursor: z.string().nullable(),
  serverNow: z.string().datetime(),
});
export const accommodationResultSchema = z.object({
  session: accommodationSessionSchema,
  student: accommodationStudentSchema,
  serverNow: z.string().datetime(),
});
export type AccommodationStudent = z.infer<typeof accommodationStudentSchema>;
export type AccommodationChange = z.infer<typeof accommodationChangeSchema>;
