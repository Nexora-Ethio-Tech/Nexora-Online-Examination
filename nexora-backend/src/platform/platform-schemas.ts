import { z } from 'zod';
const reason = z.string().trim().min(5).max(500);
const id = z.string().uuid();
const shared = { requestId: id, reason, code: z.string().regex(/^\d{6}$/) };
export const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...shared,
      action: z.literal('create_admin'),
      schoolId: id,
      loginId: z.string().trim().min(1).max(100),
      displayName: z.string().trim().min(1).max(150),
    })
    .strict(),
  z
    .object({
      ...shared,
      action: z.literal('provision'),
      name: z.string().trim().min(1).max(150),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100),
      loginId: z.string().trim().min(1).max(100),
      displayName: z.string().trim().min(1).max(150),
    })
    .strict(),
  z
    .object({
      ...shared,
      action: z.literal('status'),
      schoolId: id,
      status: z.enum(['active', 'inactive']),
      expectedRevision: z.number().int().positive(),
      confirmedImpact: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...shared,
      action: z.literal('reset_admin'),
      schoolId: id,
      adminId: id,
      resetMfa: z.boolean(),
      identityVerified: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...shared,
      action: z.literal('subscription'),
      schoolId: id,
      state: z.enum(['trial', 'active', 'restricted']),
      expiresAt: z.string().datetime().nullable(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const inspectSchema = z.object({ reason }).strict();
export const loginSchema = z
  .object({
    loginId: z.string().trim().min(1).max(100),
    password: z.string().min(1).max(1024),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export const cursorSchema = z
  .string()
  .regex(/^\d{1,18}$/)
  .default('0');
