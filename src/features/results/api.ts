import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';
import {
  analyticsSchema,
  myResultsSchema,
  reportSchema,
  resultsSchema,
  sessionsSchema,
  summarySchema,
  type PublishRequest,
} from './schemas';

const page = (cursor: string | null) =>
  `limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
export function resultsApi(client: ApiClient) {
  return {
    sessions: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/results/sessions?${page(cursor)}`, sessionsSchema, { signal }),
    mine: (cursor: string | null, signal?: AbortSignal) =>
      client.request(`/me/results?${page(cursor)}`, myResultsSchema, { signal }),
    results: (id: string, cursor: string | null, signal?: AbortSignal) =>
      client.request(`/sessions/${encodeURIComponent(id)}/results?${page(cursor)}`, resultsSchema, {
        signal,
      }),
    analytics: (id: string, revision: number, signal?: AbortSignal) =>
      client.request(
        `/sessions/${encodeURIComponent(id)}/analytics?revision=${revision}`,
        analyticsSchema,
        { signal },
      ),
    publish: (id: string, body: PublishRequest, key: string) =>
      client.request(`/sessions/${encodeURIComponent(id)}/results-publication`, summarySchema, {
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
    report: (id: string, revision: number, signal?: AbortSignal) =>
      client.request(
        `/exports/report?sessionId=${encodeURIComponent(id)}&revision=${revision}`,
        reportSchema,
        { signal },
      ),
    csv: (id?: string, revision?: number) =>
      client.request(
        `/exports/results.csv${id ? `?sessionId=${encodeURIComponent(id)}&revision=${revision}` : ''}`,
        z.string(),
        { responseType: 'text' },
      ),
  };
}
