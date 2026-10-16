import type { ApiClient } from '@/lib/api-client';
import {
  decisionRequestSchema,
  recoveryListSchema,
  recoveryDetailSchema,
  decisionResponseSchema,
  type DecisionRequest,
} from './schemas';
export function recoveryApi(client: ApiClient) {
  return {
    list: (status: 'pending' | 'all', cursor: string | null, signal?: AbortSignal) =>
      client.request(
        `/admin/recovery?status=${status}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        recoveryListSchema,
        { signal },
      ),
    get: (id: string, signal?: AbortSignal) =>
      client.request(`/admin/recovery/${encodeURIComponent(id)}`, recoveryDetailSchema, { signal }),
    decide: (id: string, body: DecisionRequest, key: string) =>
      client.request(`/recovery/${encodeURIComponent(id)}/decision`, decisionResponseSchema, {
        method: 'POST',
        body: decisionRequestSchema.parse(body),
        idempotencyKey: key,
      }),
  };
}
