import type { ApiClient } from '@/lib/api-client';
import type { Attempt, EncryptedPackage } from '@/features/exams/schemas';
import {
  finalSchema,
  receiptReadSchema,
  recoveryResponseSchema,
  saveResponseSchema,
  submittedSchema,
  unlockSchema,
  type Answer,
  type FinalBody,
} from './schemas';
export function runnerApi(client: ApiClient, signal?: AbortSignal) {
  const request = { signal, notifyUnauthorized: true };
  const path = (id: string) => `/attempts/${encodeURIComponent(id)}`;
  return {
    unlock: (attempt: Attempt, packet: EncryptedPackage) =>
      client.request(`${path(attempt.attemptId)}/unlock`, unlockSchema, {
        ...request,
        method: 'POST',
        body: {
          packageId: packet.packageId,
          examVersion: attempt.examVersion,
          scheduleRevision: attempt.scheduleRevision,
          deviceGeneration: attempt.deviceGeneration,
        },
      }),
    save: (attempt: Attempt, answers: Answer[]) =>
      client.request(`${path(attempt.attemptId)}/answers`, saveResponseSchema, {
        ...request,
        method: 'POST',
        body: {
          examVersion: attempt.examVersion,
          scheduleRevision: attempt.scheduleRevision,
          deviceGeneration: attempt.deviceGeneration,
          answers,
        },
      }),
    submit: (attemptId: string, body: FinalBody, key: string) =>
      client.request(`${path(attemptId)}/submit`, submittedSchema, {
        ...request,
        method: 'POST',
        body: finalSchema.parse(body),
        idempotencyKey: key,
      }),
    receipt: (attemptId: string) =>
      client.request(`${path(attemptId)}/receipt`, receiptReadSchema, request),
    recovery: (attemptId: string, body: FinalBody, reason: string, key: string) =>
      client.request(`${path(attemptId)}/recovery`, recoveryResponseSchema, {
        ...request,
        method: 'POST',
        body: { ...body, reason },
        idempotencyKey: key,
      }),
  };
}
