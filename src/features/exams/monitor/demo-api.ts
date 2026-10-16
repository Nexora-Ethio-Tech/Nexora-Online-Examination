import { z } from 'zod';
import type { ApiClient } from '@/lib/api-client';
export function loadMonitorExample(client: ApiClient) {
  return client.request(
    '/demo/monitor-example',
    z.object({ sessionId: z.string().min(1), attemptId: z.string().min(1) }),
    {
      method: 'POST',
      body: {},
      idempotencyKey: crypto.randomUUID(),
    },
  );
}
