import type { ApiClient } from '@/lib/api-client';
import {
  monitorListSchema,
  monitorDetailSchema,
  monitorAttemptSchema,
  transferRequestSchema,
  transferResponseSchema,
  type TransferRequest,
} from './schemas';
const page = (cursor: string | null) =>
  `?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
export function monitorApi(client: ApiClient) {
  return {
    list: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/admin/monitor/sessions${page(cursor)}`, monitorListSchema, { signal }),
    sitting: (id: string, cursor: string | null, signal?: AbortSignal) =>
      client.request(
        `/admin/monitor/sessions/${encodeURIComponent(id)}${page(cursor)}`,
        monitorDetailSchema,
        { signal },
      ),
    attempt: (id: string, cursor: string | null, signal?: AbortSignal) =>
      client.request(
        `/admin/monitor/attempts/${encodeURIComponent(id)}${page(cursor)}`,
        monitorAttemptSchema,
        { signal },
      ),
    transfer: (id: string, body: TransferRequest, key: string) =>
      client.request(
        `/attempts/${encodeURIComponent(id)}/device-transfer`,
        transferResponseSchema,
        {
          method: 'POST',
          body: transferRequestSchema.parse(body),
          idempotencyKey: key,
        },
      ),
  };
}
