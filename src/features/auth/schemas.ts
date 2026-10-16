import { z } from 'zod';

export const roleSchema = z.enum(['student', 'teacher', 'school_admin']);
export type Role = z.infer<typeof roleSchema>;
export const loginSchema = z.object({
  loginId: z.string().trim().min(1, 'Enter your user ID.'),
  password: z.string().min(1, 'Enter your password.'),
});
export const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code.'),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type MfaInput = z.infer<typeof mfaSchema>;
export const csrfSchema = z.object({ csrfToken: z.string().min(1), serverNow: z.iso.datetime() });
export const authenticatedSchema = z.object({ status: z.literal('authenticated') });
export const loginResponseSchema = z.discriminatedUnion('status', [
  authenticatedSchema,
  z.object({ status: z.literal('mfa_required'), csrfToken: z.string().min(1) }),
]);
export const sessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    loginId: z.string().min(1),
    displayName: z.string().min(1),
    role: roleSchema,
  }),
  school: z.object({ id: z.string().min(1), name: z.string().min(1), timezone: z.string().min(1) }),
  csrfToken: z.string().min(1),
  serverNow: z.iso.datetime(),
});
export type Session = z.infer<typeof sessionSchema>;
