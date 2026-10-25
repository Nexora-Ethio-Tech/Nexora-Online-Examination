import { z } from 'zod';
const id = z.string().min(1);
const name = z.string().trim().min(1).max(160);
const revision = z.number().int().positive();
const time = z.iso.datetime();
export const reasonSchema = z.string().trim().min(1, 'Enter a reason.').max(2000);
export const classInputSchema = z.object({
  name,
  grade: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  academicYear: z.string().trim().min(1).max(30),
});
export const subjectInputSchema = z.object({
  name,
  grade: z.string().nullable().optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,30}$/, 'Use letters, numbers, underscores or hyphens for the code.'),
});
export const classSchema = classInputSchema.extend({
  classId: id,
  revision,
  active: z.boolean(),
  studentCount: z.number().int().nonnegative().optional(),
});
export const subjectSchema = subjectInputSchema.extend({
  subjectId: id,
  revision,
  active: z.boolean(),
});
export const accountSchema = z.object({
  userId: id,
  displayName: name,
  loginId: id,
  role: z.enum(['student', 'teacher', 'invigilator']),
  studentRef: id.nullable(),
  classId: id.nullable(),
  status: z.enum(['active', 'inactive']),
  credentialState: z.enum(['unissued', 'issued']),
  revision,
});
export const accountEditSchema = z.object({
  revision,
  loginId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_/-]{1,160}$/)
    .optional(),
  displayName: name,
  classId: id.nullable(),
  status: z.enum(['active', 'inactive']),
  reason: reasonSchema,
});
export const assignmentInputSchema = z.object({ teacherId: id, classId: id, subjectId: id });
export const assignmentSchema = assignmentInputSchema.extend({
  assignmentId: id,
  active: z.boolean(),
  revision,
  teacherName: name,
  grade: z.string().nullable().optional(),
  className: name,
  subjectName: name,
});
export const auditSchema = z.object({
  auditId: id,
  action: id,
  target: id,
  targetLabel: id,
  actorName: name,
  reason: id,
  at: time,
});
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: id.nullable(), serverNow: time });
}
export const previewSchema = z.object({
  importId: id,
  revision,
  classId: id,
  className: name,
  expiresAt: time,
  rows: z.array(
    z.object({
      row: z.number().int().positive(),
      studentRef: z.string(),
      rollNumber: z.string().optional(),
      displayName: z.string(),
      errors: z.array(z.object({ field: id, message: id })),
    }),
  ),
  canCommit: z.boolean(),
  totalRows: z.number().int().nonnegative(),
});
export const importResultSchema = z.object({
  importId: id,
  createdCount: z.number().int().nonnegative(),
  userIds: z.array(id),
});
export const credentialIssueSchema = z.object({
  issueId: id,
  issuedCount: z.number().int().positive(),
  issuedAt: time,
  accounts: z.array(z.object({ userId: id, displayName: name, loginId: id })),
  // Null on replay: successful requests never regenerate or retrieve an old password.
  credentials: z
    .array(z.object({ userId: id, displayName: name, loginId: id, password: id }))
    .nullable(),
});
export const targetsSchema = z
  .array(z.object({ userId: id, revision }))
  .min(1)
  .max(500);
export type SchoolClass = z.infer<typeof classSchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type DirectoryAudit = z.infer<typeof auditSchema>;
export type RosterPreview = z.infer<typeof previewSchema>;
export type CredentialIssue = z.infer<typeof credentialIssueSchema>;
export type AccountEdit = z.infer<typeof accountEditSchema>;
