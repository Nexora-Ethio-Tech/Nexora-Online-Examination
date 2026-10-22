import { expect, it } from 'vitest';
import { processingLabel } from './language';
it('describes failed processing without concealing unknown states', () => {
  expect(processingLabel('failed')).toBe('Needs attention');
  expect(processingLabel('import_jobs')).toBe('Question file reading');
  expect(processingLabel('new_future_state')).toBe('New future state');
});
