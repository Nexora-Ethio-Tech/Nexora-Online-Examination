import { z } from 'zod';
import {
  readinessRequestSchema,
  readinessResponseSchema,
  type ReadinessRequest,
} from './readiness';
import type { ApiClient } from '@/lib/api-client';
import { attemptSchema, detailSchema, listSchema, packageSchema } from './schemas';
export function examApi(client: ApiClient) {
  const part = encodeURIComponent;
  return {
    ready: (attemptId: string, body: ReadinessRequest, key: string, signal?: AbortSignal) =>
      client.request(`/attempts/${part(attemptId)}/readiness`, readinessResponseSchema, {
        method: 'POST',
        body: readinessRequestSchema.parse(body),
        idempotencyKey: key,
        signal,
      }),
    list: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/me/exams?limit=25${cursor ? `&cursor=${part(cursor)}` : ''}`, listSchema, {
        signal,
      }),
    detail: (sessionId: string, signal?: AbortSignal) =>
      client.request(`/me/exams/${part(sessionId)}`, detailSchema, { signal }),
    enroll: (deviceId: string, signal?: AbortSignal) =>
      client.request('/auth/device', z.object({ deviceId: z.uuid() }), {
        method: 'POST',
        body: { deviceId },
        signal,
      }),
    create: (sessionId: string, deviceId: string, idempotencyKey: string, signal?: AbortSignal) =>
      client.request(`/sessions/${part(sessionId)}/attempts`, attemptSchema, {
        method: 'POST',
        body: { deviceId },
        idempotencyKey,
        signal,
      }),
    attempt: (attemptId: string, signal?: AbortSignal) =>
      client.request(`/attempts/${part(attemptId)}`, attemptSchema, { signal }),
    package: (attemptId: string, signal?: AbortSignal) =>
      client.request(`/attempts/${part(attemptId)}/package`, packageSchema, { signal }),
  };
}
