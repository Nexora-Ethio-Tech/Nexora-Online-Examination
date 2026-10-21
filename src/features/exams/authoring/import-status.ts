import type { Job } from './schemas';

/** Display wording only: API states and worker transitions remain unchanged. */
export const importStatus: Record<Job['state'], string> = {
  queued: 'Waiting to read your file',
  parsing: 'Reading questions from your file',
  ai_queued: 'Waiting for AI suggestions',
  ai_running: 'Preparing AI suggestions',
  ready: 'Ready to review',
  failed: 'Import needs attention',
  cancelled: 'Import cancelled',
};
