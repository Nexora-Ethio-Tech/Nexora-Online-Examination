import { z } from 'zod';

export const readinessRequestSchema = z
  .object({
    packageId: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    examVersion: z.number().int().positive(),
    scheduleRevision: z.number().int().positive(),
    deviceGeneration: z.number().int().positive(),
    shellBuild: z.string().min(1).max(200),
  })
  .strict();
export const readinessSchema = readinessRequestSchema
  .extend({
    acknowledgementId: z.string().min(1),
    receivedAt: z.iso.datetime(),
  })
  .strict();
export const readinessResponseSchema = z
  .object({
    attemptId: z.string().min(1),
    readiness: readinessSchema,
    serverNow: z.iso.datetime(),
  })
  .strict();
export type Readiness = z.infer<typeof readinessSchema>;
export type ReadinessRequest = z.infer<typeof readinessRequestSchema>;
