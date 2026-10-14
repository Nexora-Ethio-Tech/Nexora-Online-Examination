import type { ApiClient } from '@/lib/api-client';
import {
  adminPracticeListSchema,
  practiceAccessSchema,
  practiceAttemptSchema,
  practiceListSchema,
  type PracticeSettings,
} from './schemas';
const page = (cursor: string | null) =>
  `limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
export function practiceApi(client: ApiClient) {
  return {
    adminList: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/admin/practice-exams?${page(cursor)}`, adminPracticeListSchema, { signal }),
    access: (id: string, signal?: AbortSignal) =>
      client.request(`/exams/${encodeURIComponent(id)}/practice-access`, practiceAccessSchema, {
        signal,
      }),
    settings: (id: string, body: PracticeSettings, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/practice-access`, practiceAccessSchema, {
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
    mine: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/me/practice?${page(cursor)}`, practiceListSchema, { signal }),
    start: (id: string, examVersion: number, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/practice-attempts`, practiceAttemptSchema, {
        method: 'POST',
        body: { examVersion },
        idempotencyKey: key,
      }),
    attempt: (id: string, signal?: AbortSignal) =>
      client.request(`/practice-attempts/${encodeURIComponent(id)}`, practiceAttemptSchema, {
        signal,
      }),
    answer: (id: string, itemId: string, value: string, key: string) =>
      client.request(
        `/practice-attempts/${encodeURIComponent(id)}/answers`,
        practiceAttemptSchema,
        { method: 'POST', body: { itemId, value }, idempotencyKey: key },
      ),
    complete: (id: string, key: string) =>
      client.request(
        `/practice-attempts/${encodeURIComponent(id)}/complete`,
        practiceAttemptSchema,
        { method: 'POST', body: {}, idempotencyKey: key },
      ),
  };
}
