import type { ApiClient } from '@/lib/api-client';
import {
  adminDetailSchema,
  adminListSchema,
  scheduleSchema,
  rescheduleSchema,
  decisionSchema,
} from './schemas';
import type { z } from 'zod';
import {
  accommodationChangeSchema,
  accommodationListSchema,
  accommodationResultSchema,
  type AccommodationChange,
} from './accommodation-schemas';
export function adminExamApi(client: ApiClient) {
  return {
    accommodations: (id: string, cursor: string | null = null, signal?: AbortSignal) =>
      client.request(
        `/admin/sessions/${encodeURIComponent(id)}/accommodations?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        accommodationListSchema,
        { signal },
      ),
    setAccommodation: (id: string, body: AccommodationChange, key: string) =>
      client.request(
        `/sessions/${encodeURIComponent(id)}/accommodations`,
        accommodationResultSchema,
        {
          method: 'PATCH',
          body: accommodationChangeSchema.parse(body),
          idempotencyKey: key,
        },
      ),
    list: (cursor: string | null, signal?: AbortSignal) =>
      client.request(
        `/admin/exams?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        adminListSchema,
        { signal },
      ),
    get: (id: string, signal?: AbortSignal) =>
      client.request(`/admin/exams/${encodeURIComponent(id)}`, adminDetailSchema, { signal }),
    decide: (
      id: string,
      decision: 'approve' | 'return',
      body: z.infer<typeof decisionSchema>,
      key: string,
    ) =>
      client.request(`/exams/${encodeURIComponent(id)}/${decision}`, adminDetailSchema, {
        method: 'POST',
        body: decisionSchema.parse(body),
        idempotencyKey: key,
      }),
    schedule: (id: string, body: z.infer<typeof scheduleSchema>, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/sessions`, adminDetailSchema, {
        method: 'POST',
        body: scheduleSchema.parse(body),
        idempotencyKey: key,
      }),
    reschedule: (id: string, body: z.infer<typeof rescheduleSchema>, key: string) =>
      client.request(`/sessions/${encodeURIComponent(id)}/schedule`, adminDetailSchema, {
        method: 'PATCH',
        body: rescheduleSchema.parse(body),
        idempotencyKey: key,
      }),
    retryPackage: (id: string, revision: number, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/package-retry`, adminDetailSchema, {
        method: 'POST',
        body: { revision },
        idempotencyKey: key,
      }),
  };
}
