import { generationInputSchema, type GenerationInput } from './generation-schemas';
import type { ApiClient } from '@/lib/api-client';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import {
  assignmentsSchema,
  draftSchema,
  draftsSchema,
  itemsSchema,
  jobSchema,
  type Item,
  type Metadata,
} from './schemas';

export function authoringApi(client: ApiClient) {
  return {
    removeDraft: (id: string, revision: number, reason: string, key: string) =>
      client.request(
        `/exams/${encodeURIComponent(id)}/remove`,
        z.object({ id: z.string(), outcome: z.enum(['deleted', 'archived']) }),
        { method: 'POST', body: { revision, reason, confirmed: true }, idempotencyKey: key },
      ),
    reviewAll: (id: string, revision: number, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/review-all`, draftSchema, {
        method: 'POST',
        body: { revision, confirmed: true },
        idempotencyKey: key,
      }),
    cancelImport: (id: string, revision: number, reason: string, key: string) =>
      client.request(
        `/imports/${encodeURIComponent(id)}/cancel`,
        z.object({ importId: z.string(), cancelled: z.literal(true) }),
        {
          method: 'POST',
          body: { revision, reason },
          idempotencyKey: key,
        },
      ),
    assignments: (cursor: string | null, signal?: AbortSignal) =>
      client.request(
        `/me/teaching-assignments?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        assignmentsSchema,
        { signal },
      ),
    list: (cursor: string | null, signal?: AbortSignal, category = 'all', status = '') =>
      client.request(
        `/exams?limit=25&category=${category}${status ? `&status=${status}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        draftsSchema,
        { signal },
      ),
    get: (id: string, signal?: AbortSignal) =>
      client.request(`/exams/${encodeURIComponent(id)}`, draftSchema, { signal }),
    items: (id: string, signal?: AbortSignal) =>
      client.request(`/exams/${encodeURIComponent(id)}/items`, itemsSchema, { signal }),
    create: (body: Metadata, key: string) =>
      client.request('/exams', draftSchema, { method: 'POST', body, idempotencyKey: key }),
    save: (id: string, body: Metadata, revision: number, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}`, draftSchema, {
        method: 'PATCH',
        body: { ...body, revision },
        idempotencyKey: key,
      }),
    saveItem: (id: string, item: Item, revision: number, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/items`, draftSchema, {
        method: 'PATCH',
        body: { revision, item },
        idempotencyKey: key,
      }),
    job: (id: string, signal?: AbortSignal) =>
      client.request(`/imports/${encodeURIComponent(id)}`, jobSchema, { signal }),
    upload: (id: string, revision: number, file: File, key: string) => {
      if (!/\.(docx|xlsx)$/i.test(file.name) || file.size === 0 || file.size > 5 * 1024 * 1024)
        throw new ApiError(
          'VALIDATION_ERROR',
          'Choose a nonempty DOCX or XLSX template, up to 5 MB.',
        );
      const body = new FormData();
      body.append('examId', id);
      body.append('revision', String(revision));
      body.append('file', file);
      return client.request('/imports', jobSchema, { method: 'POST', body, idempotencyKey: key });
    },
    generate: (id: string, body: GenerationInput, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/generate`, jobSchema, {
        method: 'POST',
        body: generationInputSchema.parse(body),
        idempotencyKey: key,
      }),
    retry: (id: string, revision: number, key: string) =>
      client.request(`/imports/${encodeURIComponent(id)}/ai-retry`, jobSchema, {
        method: 'POST',
        body: { revision },
        idempotencyKey: key,
      }),
    submit: (id: string, revision: number, key: string) =>
      client.request(`/exams/${encodeURIComponent(id)}/submit-for-approval`, draftSchema, {
        method: 'POST',
        body: { revision },
        idempotencyKey: key,
      }),
  };
}
