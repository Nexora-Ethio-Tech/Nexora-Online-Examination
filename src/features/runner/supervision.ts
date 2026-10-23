import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';
export const interruptionSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum([
      'hidden',
      'returned',
      'pagehide',
      'fullscreen_exit',
      'focus_lost',
      'screenshot_attempt',
      'devtools',
      'window_blur',
      'watermark_tamper',
    ]),
    reason: z.string().max(500).optional(),
    observedAt: z.iso.datetime(),
    deviceGeneration: z.number().int().positive(),
  })
  .strict();
export type Interruption = z.infer<typeof interruptionSchema>;
export const supervisionSchema = z.object({
  attemptId: z.string(),
  suspended: z.boolean(),
  assistancePaused: z.boolean().default(false),
  revision: z.number().int().nonnegative(),
  deadlineAt: z.iso.datetime(),
  serverNow: z.iso.datetime(),
  events: z.array(interruptionSchema.extend({ receivedAt: z.iso.datetime() })),
  history: z.array(
    z.object({
      action: z.enum(['suspend', 'resume']),
      reason: z.string(),
      actorId: z.string(),
      at: z.iso.datetime(),
      revision: z.number().int(),
    }),
  ),
});
export const supervisionCommandSchema = z
  .object({
    action: z.enum(['suspend', 'resume']),
    reason: z.string().trim().min(1).max(500),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export function supervisionApi(client: ApiClient, signal?: AbortSignal) {
  const path = (id: string) => `/attempts/${encodeURIComponent(id)}`;
  return {
    read: (id: string) => client.request(`${path(id)}/supervision`, supervisionSchema, { signal }),
    report: (id: string, events: Interruption[]) =>
      client.request(`${path(id)}/interruptions`, z.object({ acceptedIds: z.array(z.uuid()) }), {
        signal,
        method: 'POST',
        body: { events },
      }),
    decide: (id: string, body: z.infer<typeof supervisionCommandSchema>, key: string) =>
      client.request(`${path(id)}/supervision`, supervisionSchema, {
        signal,
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
  };
}
