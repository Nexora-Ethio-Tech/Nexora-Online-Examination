import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';
const uuid = z.string().uuid();
export const schoolSchema = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  revision: z.number().int(),
  students: z.number().int(),
  teachers: z.number().int(),
  subscription: z.enum(['legacy', 'trial', 'active', 'restricted']),
  expiresAt: z.string().datetime().nullable(),
  subscriptionRevision: z.number().int(),
});
const adminSchema = z.object({
  id: uuid,
  loginId: z.string(),
  displayName: z.string(),
  status: z.string(),
  mfaEnrolled: z.boolean(),
});
const reason = z.string().trim().min(5).max(500);
const shared = { requestId: uuid, code: z.string().regex(/^\d{6}$/), reason };
export const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...shared,
      action: z.literal('create_admin'),
      schoolId: uuid,
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
      schoolId: uuid,
      status: z.enum(['active', 'inactive']),
      expectedRevision: z.number().int().positive(),
      confirmedImpact: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...shared,
      action: z.literal('reset_admin'),
      schoolId: uuid,
      adminId: uuid,
      resetMfa: z.boolean(),
      identityVerified: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...shared,
      action: z.literal('subscription'),
      schoolId: uuid,
      state: z.enum(['trial', 'active', 'restricted']),
      expiresAt: z.string().datetime().nullable(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
const resultSchema = z.object({
  message: z.string(),
  schoolId: uuid,
  adminId: uuid.optional(),
  credential: z.string().nullable(),
  replayed: z.boolean(),
});
export type School = z.infer<typeof schoolSchema>;
export type Admin = z.infer<typeof adminSchema>;
export type ActionResult = z.infer<typeof resultSchema>;
export function platformApi(client: ApiClient) {
  return {
    csrf: () =>
      client.request('/auth/csrf', z.object({ csrfToken: z.string() }), {
        notifyUnauthorized: false,
      }),
    me: () =>
      client.request('/auth/me', z.object({ displayName: z.string() }), {
        notifyUnauthorized: false,
      }),
    login: (body: { loginId: string; password: string; code: string }) =>
      client.request('/auth/login', z.object({ displayName: z.string(), csrfToken: z.string() }), {
        method: 'POST',
        body,
        notifyUnauthorized: false,
      }),
    logout: () => client.request('/auth/logout', z.object({ ok: z.boolean() }), { method: 'POST' }),
    schools: (after: string | null, signal?: AbortSignal) =>
      client.request(
        `/schools${after ? `?after=${encodeURIComponent(after)}` : ''}`,
        z.object({ schools: z.array(schoolSchema), nextCursor: uuid.nullable() }),
        { signal },
      ),
    inspect: (id: string, reason: string) =>
      client.request(
        `/schools/${encodeURIComponent(id)}/inspect`,
        z.object({ admins: z.array(adminSchema) }),
        { method: 'POST', body: { reason } },
      ),
    health: (signal?: AbortSignal) =>
      client.request(
        '/health',
        z.object({
          database: z.literal('reachable'),
          sampledAt: z.string().datetime(),
          queues: z.array(
            z.object({ queue: z.string(), status: z.string(), count: z.number().int() }),
          ),
        }),
        { signal },
      ),
    audit: (before: string | null, signal?: AbortSignal) =>
      client.request(
        `/audit${before ? `?before=${encodeURIComponent(before)}` : ''}`,
        z.object({
          events: z.array(
            z.object({
              id: z.string(),
              ownerId: uuid.nullable(),
              schoolId: uuid.nullable(),
              action: z.string(),
              reason: z.string(),
              at: z.string().datetime(),
              details: z.record(z.string(), z.unknown()),
            }),
          ),
          nextCursor: z.string().nullable(),
        }),
        { signal },
      ),
    action: (body: unknown) =>
      client.request('/actions', resultSchema, { method: 'POST', body: actionSchema.parse(body) }),
  };
}
