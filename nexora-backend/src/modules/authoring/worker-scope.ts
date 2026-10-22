import { z } from 'zod';

/** Operator-supplied scope; never enumerate schools through an unscoped RLS query. */
export function workerSchoolIds(value = process.env.WORKER_SCHOOL_IDS): string[] {
  if (!value?.trim()) throw new Error('WORKER_SCHOOL_IDS_REQUIRED');
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .parse(value.split(',').map((id) => id.trim().toLowerCase()));
  return [...new Set(ids)].sort();
}
