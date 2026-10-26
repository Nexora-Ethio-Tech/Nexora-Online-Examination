import 'reflect-metadata';
import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Request, request as baseRequest } from 'express';
import { DirectoryService } from '../../src/modules/directory/directory.service';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';
import { actionSchema, inspectSchema } from '../../src/platform/platform-schemas';
import { aiExamSettingsInputSchema } from '../../src/modules/authoring/generation-schemas';
import { practiceSettingsSchema } from '../../src/modules/practice/schemas';
import { rescheduleSchema } from '../../src/modules/administration/schemas';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    withTenantTransaction(_school: string, work: (client: unknown) => unknown) {
      return work({ query: mocks.query });
    }
  },
}));
const school = randomUUID(),
  user = randomUUID(),
  target = randomUUID();
const service = new DirectoryService(new DbService(), new ClockService());
function req(): Request {
  const value: Request = Object.create(baseRequest);
  value.school = { id: school, name: 'School', timezone: 'Africa/Addis_Ababa' };
  value.sessionUser = { id: user, role: 'school_admin', loginId: 'ADMIN', displayName: 'Admin' };
  return value;
}
const account = {
  id: target,
  display_name: 'Teacher',
  login_id: 'TCH/001/0001',
  role: 'teacher',
  student_ref: null,
  class_id: null,
  status: 'active',
  credentials_issued: true,
  revision: 1,
};
beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('SELECT u.id,u.display_name') ? [account] : [],
    rowCount: 0,
  }));
});
it('audits ordinary account edits without a note', async () => {
  await expect(
    service.editAccount(
      req(),
      'teacher',
      target,
      {
        revision: 1,
        displayName: 'Updated Teacher',
        classId: null,
        status: 'active',
      },
      randomUUID(),
    ),
  ).resolves.toMatchObject({ displayName: 'Updated Teacher', status: 'active' });
  const audit = mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_events'));
  expect(audit?.[1][4]).toBe('');
  expect(audit?.[1][1]).toBe(user);
});
it('rejects an account status change without a reason before any update', async () => {
  await expect(
    service.editAccount(
      req(),
      'teacher',
      target,
      {
        revision: 1,
        displayName: 'Teacher',
        classId: null,
        status: 'inactive',
        reason: ' ',
      },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('keeps password reset and directory removal reasons mandatory', async () => {
  await expect(
    service.credentials(req(), 'teacher', target, { revision: 1 }, randomUUID()),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(
    service.remove(
      req(),
      'teachers',
      target,
      { revision: 1, confirmed: true, reason: '' },
      randomUUID(),
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(mocks.query).not.toHaveBeenCalled();
});
it('accepts omitted optional notes for settings and schedule changes', () => {
  expect(
    aiExamSettingsInputSchema.parse({ revision: 1, aiExamGenerationEnabled: true }).reason,
  ).toBe('');
  expect(
    practiceSettingsSchema.parse({ revision: 1, examVersion: 1, enabled: false, releaseAt: null })
      .reason,
  ).toBe('');
  expect(
    rescheduleSchema.parse({
      scheduleRevision: 1,
      preparationVisibleAt: '2030-01-01T00:00:00Z',
      resultsReleaseAt: '2030-01-02T00:00:00Z',
    }).reason,
  ).toBe('');
});
it('separates routine owner actions from sensitive recovery and status reasons', () => {
  const shared = { requestId: randomUUID(), code: '123456', schoolId: school };
  expect(inspectSchema.parse({}).reason).toBe('');
  expect(
    actionSchema.parse({
      ...shared,
      action: 'subscription',
      state: 'active',
      expiresAt: null,
      expectedRevision: 1,
    }).reason,
  ).toBe('');
  expect(
    actionSchema.safeParse({
      ...shared,
      action: 'status',
      status: 'inactive',
      expectedRevision: 1,
      confirmedImpact: true,
      reason: '',
    }).success,
  ).toBe(false);
  expect(
    actionSchema.safeParse({
      ...shared,
      action: 'reset_admin',
      adminId: target,
      resetMfa: true,
      identityVerified: true,
      reason: '',
    }).success,
  ).toBe(false);
});
