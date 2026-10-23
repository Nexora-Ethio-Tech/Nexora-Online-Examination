import { expect, it } from 'vitest';
import { scheduleSchema, rescheduleSchema } from '../../src/modules/administration/schemas';

const schedule = {
  revision: 1,
  approvedVersion: 1,
  preparationVisibleAt: '2026-12-01T05:00:00Z',
  resultsReleaseAt: '2026-12-01T09:00:00Z',
};
it.each([-1, 121, 2.5, '20', null])(
  'rejects invalid preparation minutes %s',
  (preparationMinutes) => {
    expect(scheduleSchema.safeParse({ ...schedule, preparationMinutes }).success).toBe(false);
    expect(
      rescheduleSchema.safeParse({
        scheduleRevision: 1,
        reason: 'Change time',
        preparationVisibleAt: schedule.preparationVisibleAt,
        resultsReleaseAt: schedule.resultsReleaseAt,
        preparationMinutes,
      }).success,
    ).toBe(false);
  },
);
it('accepts legacy requests and supported whole-minute values', () => {
  expect(scheduleSchema.parse(schedule).preparationMinutes).toBeUndefined();
  for (const preparationMinutes of [0, 1, 10, 25, 120])
    expect(scheduleSchema.parse({ ...schedule, preparationMinutes }).preparationMinutes).toBe(
      preparationMinutes,
    );
});
