import { z } from 'zod';
export const schoolProfileSchema = z.object({ name: z.string().trim().min(1).max(200) });
export const schoolProfileInputSchema = schoolProfileSchema
  .extend({
    expectedName: z.string().min(1).max(200),
  })
  .strict();
