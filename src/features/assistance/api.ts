import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';

const requestSchema = z.object({
  id: z.string().uuid(),
  attemptId: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  expiresAt: z.string().datetime(),
  reason: z.string().nullable(),
});
const studentSchema = z.object({ paused: z.boolean(), request: requestSchema.nullable() });
const staffSchema = z.object({
  staff: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      role: z.enum(['teacher', 'school_admin']),
      mfaEnrolled: z.boolean(),
      active: z.boolean(),
      revision: z.number().int(),
    }),
  ),
});
export const inboxSchema = z.object({
  requests: z.array(
    requestSchema.extend({
      displayName: z.string(),
      loginId: z.string(),
      deviceGeneration: z.number().int(),
    }),
  ),
});
export function assistanceApi(client: ApiClient) {
  return {
    read: (id: string, signal?: AbortSignal) =>
      client.request(`/attempts/${encodeURIComponent(id)}/assistance`, studentSchema, { signal }),
    request: (id: string, requestId: string, deviceGeneration: number) =>
      client.request(`/attempts/${encodeURIComponent(id)}/assistance`, studentSchema, {
        method: 'POST',
        body: { requestId, deviceGeneration },
      }),
    sessions: (signal?: AbortSignal) =>
      client.request(
        '/assistance/sessions',
        z.object({
          sessions: z.array(
            z.object({ id: z.string().uuid(), title: z.string(), startsAt: z.string().datetime() }),
          ),
        }),
        { signal },
      ),
    inbox: (id: string, signal?: AbortSignal) =>
      client.request(`/assistance/sessions/${encodeURIComponent(id)}/requests`, inboxSchema, {
        signal,
      }),
    staff: (id: string, signal?: AbortSignal) =>
      client.request(`/assistance/sessions/${encodeURIComponent(id)}/staff`, staffSchema, {
        signal,
      }),
    assign: (
      id: string,
      body: { staffId: string; active: boolean; expectedRevision: number; reason: string },
    ) =>
      client.request(`/assistance/sessions/${encodeURIComponent(id)}/staff`, staffSchema, {
        method: 'POST',
        body,
      }),
    decide: (id: string, body: { action: 'approve' | 'reject'; reason: string; code: string }) =>
      client.request(`/assistance/requests/${encodeURIComponent(id)}/decision`, requestSchema, {
        method: 'POST',
        body,
      }),
  };
}
