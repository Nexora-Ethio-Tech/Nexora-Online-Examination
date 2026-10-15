import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';
export function loadRecoveryExample(client: ApiClient) {
  return client.request('/demo/recovery-example', z.object({ recoveryId: z.string().min(1) }), {
    method: 'POST',
    body: {},
    idempotencyKey: crypto.randomUUID(),
  });
}
