import { z } from 'zod';
import type { Attempt } from '@/features/exams/schemas';
import {
  interruptionSchema,
  supervisionCommandSchema,
  supervisionSchema,
} from '@/features/runner/supervision';
export function createSupervisionDemo(
  find: (id: string) => Attempt | undefined,
  clock: () => number,
) {
  const states = new Map<string, z.infer<typeof supervisionSchema>>();
  const replays = new Map<string, string>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const error = (message: string, status = 409) =>
    json({ code: 'REVISION_CONFLICT', message, details: [], requestId: 'demo' }, status);
  const now = () => new Date(clock()).toISOString();
  return {
    suspended: (id: string) => states.get(id)?.suspended ?? false,
    handle: async (
      id: string,
      action: string,
      method: string,
      body: unknown,
      headers: Headers,
      role: string,
      actorId: string,
    ) => {
      if (
        !['student', 'school_admin'].includes(role) ||
        (role === 'student' && actorId !== 'demo-student')
      )
        return error('Access denied', 403);
      const a = find(id);
      if (!a) return error('Attempt unavailable', 404);
      const d = states.get(id) ?? {
        attemptId: id,
        suspended: false,
        revision: 0,
        deadlineAt: a.deadlineAt,
        serverNow: now(),
        events: [],
        history: [],
      };
      states.set(id, d);
      d.serverNow = now();
      if (method === 'GET' && action === 'supervision') return json(d);
      if (method !== 'POST') return error('Method unavailable', 405);
      if (action === 'interruptions') {
        if (role !== 'student') return error('Student only', 403);
        const input = z
          .object({ events: z.array(interruptionSchema).min(1).max(50) })
          .strict()
          .safeParse(body);
        if (!input.success) return error('Invalid reports', 422);
        for (const e of input.data.events) {
          if (e.deviceGeneration > a.deviceGeneration) return error('Unknown generation', 422);
          const old = d.events.find((x) => x.id === e.id);
          if (old && JSON.stringify(interruptionSchema.parse(old)) !== JSON.stringify(e))
            return error('Event ID reused');
          if (!old) d.events.push({ ...e, receivedAt: now() });
        }
        return json({ acceptedIds: input.data.events.map((e) => e.id) });
      }
      if (role !== 'school_admin') return error('Administrator only', 403);
      const input = supervisionCommandSchema.safeParse(body);
      const key = headers.get('Idempotency-Key');
      if (!input.success || !z.uuid().safeParse(key).success) return error('Invalid decision', 422);
      const signature = JSON.stringify([actorId, input.data]);
      const replayKey = `${id}:${key}`;
      if (replays.has(replayKey))
        return replays.get(replayKey) === signature ? json(d) : error('Request key reused');
      if (input.data.expectedRevision !== d.revision) return error('Refresh before deciding');
      if (!['active', 'preparing'].includes(a.state) || clock() >= Date.parse(a.deadlineAt))
        return error('Attempt is closed');
      d.suspended = input.data.action === 'suspend';
      d.revision++;
      d.history.push({
        action: input.data.action,
        reason: input.data.reason,
        actorId,
        at: now(),
        revision: d.revision,
      });
      replays.set(replayKey, signature);
      return json(d);
    },
  };
}
