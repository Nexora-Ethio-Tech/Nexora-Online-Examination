import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, request as baseRequest } from 'express';
import { randomUUID } from 'node:crypto';
import { AssistanceService } from '../../src/modules/delivery/assistance.service';
import {
  assertAssistanceMatches,
  assertAssistanceOpen,
} from '../../src/modules/delivery/assistance-policy';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  rate: vi.fn(),
  tenant: vi.fn(),
  binding: vi.fn(),
  decrypt: vi.fn(),
  step: vi.fn(),
}));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    query = mocks.rate;
    withTenantTransaction(school: string, work: (client: unknown) => unknown) {
      mocks.tenant(school);
      return work({ query: mocks.query });
    }
  },
}));
vi.mock('../../src/common/crypto/device-credential', () => ({
  requireDeviceBinding: mocks.binding,
}));
vi.mock('../../src/common/crypto/mfa', () => ({
  decryptMfaSecret: mocks.decrypt,
  matchingTotpStep: mocks.step,
}));
const school = randomUUID(),
  student = randomUUID(),
  teacher = randomUUID();
const attemptId = randomUUID(),
  sessionId = randomUUID(),
  requestId = randomUUID();
const now = new Date('2030-01-01T00:00:00Z');
const clock = new ClockService();
const service = new AssistanceService(new DbService(), clock);
function req(
  role: 'student' | 'teacher' | 'school_admin' | 'invigilator',
  userId = teacher,
): Request {
  const value: Request = Object.create(baseRequest);
  value.school = { id: school, name: 'Test', timezone: 'Africa/Addis_Ababa' };
  value.sessionUser = { id: userId, role, loginId: 'TEST', displayName: 'Test' };
  return value;
}
const attempt = () => ({
  id: attemptId,
  session_id: sessionId,
  student_id: student,
  device_id: randomUUID(),
  device_generation: 2,
  supervision_revision: 4,
  state: 'active',
  suspended: false,
  assistance_paused: true,
  deadline_at: new Date(now.getTime() + 600_000),
});
type AssistanceFixture = {
  id: string;
  attempt_id: string;
  student_id: string;
  device_generation: number;
  supervision_revision: number;
  state: string;
  expires_at: Date;
  requested_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  reason: string | null;
};
const request = (): AssistanceFixture => ({
  id: requestId,
  attempt_id: attemptId,
  student_id: student,
  device_generation: 2,
  supervision_revision: 4,
  state: 'pending',
  expires_at: new Date(now.getTime() + 300_000),
  requested_at: now,
  decided_by: null,
  decided_at: null,
  reason: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  clock.setMockTime(now);
  mocks.rate.mockResolvedValue({ rows: [{ retry: 0 }] });
  mocks.binding.mockResolvedValue(undefined);
  mocks.decrypt.mockReturnValue('test-only-secret');
  mocks.step.mockReturnValue(123);
});
function decisionQueries(
  options: {
    assigned?: boolean;
    staffRole?: 'teacher' | 'invigilator' | 'school_admin';
    current?: ReturnType<typeof attempt>;
    pending?: ReturnType<typeof request>;
    consumed?: boolean;
  } = {},
) {
  const current = options.current ?? attempt();
  const pending = options.pending ?? request();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM users'))
      return {
        rows: [
          {
            role: options.staffRole ?? 'teacher',
            mfa_enrolled_at: now,
            mfa_secret_enc: 'encrypted',
            mfa_secret_version: randomUUID(),
          },
        ],
      };
    if (sql.includes('FROM sitting_staff_assignments'))
      return { rows: options.assigned === false ? [] : [{}] };
    if (sql.startsWith('SELECT session_id')) return { rows: [{ session_id: sessionId }] };
    if (sql.includes('SELECT * FROM attempts')) return { rows: [current] };
    if (sql.includes('SELECT * FROM exam_assistance_requests')) return { rows: [pending] };
    if (sql.includes('INSERT INTO mfa_consumed_steps'))
      return { rows: options.consumed === false ? [] : [{ step: 123 }] };
    if (sql.includes('UPDATE exam_assistance_requests'))
      return {
        rows: [{ ...pending, state: 'approved', decided_by: teacher, reason: 'Identity checked' }],
      };
    return { rows: [] };
  });
}
const decision = { action: 'approve', reason: 'Identity checked', code: '654321' };
describe('assistance authorization and decision boundaries', () => {
  it('rejects students from staff actions and teachers from assignment management before DB access', async () => {
    await expect(
      service.decide(req('student', student), requestId, decision),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.assignments(req('teacher'), sessionId, {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.tenant).not.toHaveBeenCalled();
  });
  it('blocks an unassigned teacher before examining MFA or mutating the attempt', async () => {
    decisionQueries({ assigned: false });
    await expect(service.decide(req('teacher'), requestId, decision)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it.each([
    { device_generation: 3 },
    { supervision_revision: 5 },
    { suspended: true },
    { state: 'submitted' },
    { deadline_at: now },
    { assistance_paused: false },
  ])('rejects stale or closed attempt %j before consuming MFA', async (change) => {
    decisionQueries({ current: { ...attempt(), ...change } });
    await expect(service.decide(req('teacher'), requestId, decision)).rejects.toThrow();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it('rejects expired requests even before the exam deadline', async () => {
    decisionQueries({ pending: { ...request(), expires_at: now } });
    await expect(service.decide(req('teacher'), requestId, decision)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
  });
  it('charges failed codes outside the tenant transaction and never unlocks', async () => {
    decisionQueries();
    mocks.step.mockReturnValue(undefined);
    await expect(service.decide(req('teacher'), requestId, decision)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.rate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tenant.mock.invocationCallOrder[0],
    );
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE attempts'))).toBe(false);
  });
  it('rejects a consumed MFA step without clearing the pause', async () => {
    decisionQueries({ consumed: false });
    await expect(service.decide(req('teacher'), requestId, decision)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE attempts'))).toBe(false);
  });
  it('approves and audits without changing timing, administrative suspension or submission state', async () => {
    decisionQueries();
    expect(await service.decide(req('teacher'), requestId, decision)).toMatchObject({
      status: 'approved',
    });
    const updates = mocks.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE attempts'));
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain('assistance_paused=false');
    expect(updates[0][0]).not.toMatch(/deadline|final_accept|suspended|state=/);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_events'))).toBe(
      true,
    );
    expect(mocks.tenant).toHaveBeenCalledWith(school);
  });
  it('replays an identical committed decision without consuming another code', async () => {
    decisionQueries({
      pending: { ...request(), state: 'approved', decided_by: teacher, reason: 'Identity checked' },
    });
    expect(await service.decide(req('teacher'), requestId, decision)).toMatchObject({
      status: 'approved',
    });
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
});
describe('student ownership and device checks', () => {
  it('reports a request obsoleted by a supervision change as expired so a fresh request is possible', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ ...attempt(), supervision_revision: 5 }] })
      .mockResolvedValueOnce({ rows: [request()] });
    expect(await service.student(req('student', student), attemptId)).toMatchObject({
      paused: true,
      request: { status: 'expired' },
    });
  });
  it('creates a short-lived pause without changing the deadline or final acceptance window', async () => {
    const current = {
      ...attempt(),
      assistance_paused: false,
      deadline_at: new Date(now.getTime() + 60_000),
    };
    mocks.query
      .mockResolvedValueOnce({ rows: [current] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...request(), supervision_revision: 5, expires_at: current.deadline_at }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await service.student(req('student', student), attemptId, {
      requestId,
      deviceGeneration: 2,
    });
    expect(result).toMatchObject({
      paused: true,
      request: { status: 'pending', expiresAt: current.deadline_at.toISOString() },
    });
    const insert = mocks.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO exam_assistance_requests'),
    );
    expect(insert?.[1]).toEqual([
      requestId,
      school,
      attemptId,
      student,
      2,
      5,
      now,
      current.deadline_at,
      'manual',
    ]);
    expect(mocks.query.mock.calls.at(-1)?.[0]).not.toMatch(
      /deadline|final_accept|suspended|state=/,
    );
  });
  it('coalesces duplicate pending requests without increasing the revision again', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [attempt()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [request()] });
    expect(
      await service.student(req('student', student), attemptId, {
        requestId: randomUUID(),
        deviceGeneration: 2,
      }),
    ).toMatchObject({ paused: true, request: { id: requestId } });
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('UPDATE attempts'))).toBe(false);
  });
  it('hides another student attempt before consulting the binding', async () => {
    mocks.query.mockResolvedValue({ rows: [attempt()] });
    await expect(service.student(req('student', randomUUID()), attemptId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.binding).not.toHaveBeenCalled();
  });
  it('checks the browser credential inside the tenant transaction on reads too', async () => {
    mocks.query.mockResolvedValue({ rows: [attempt()] });
    mocks.binding.mockRejectedValue(new Error('Device replaced'));
    await expect(service.student(req('student', student), attemptId)).rejects.toThrow(
      'Device replaced',
    );
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.binding).toHaveBeenCalledOnce();
  });
  it('rejects a stale generation even with a valid current binding', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [attempt()] }).mockResolvedValueOnce({ rows: [] });
    await expect(
      service.student(req('student', student), attemptId, { requestId, deviceGeneration: 1 }),
    ).rejects.toMatchObject({ code: 'DEVICE_REPLACED' });
  });
});
describe('time boundaries', () => {
  it('allows an open matching request and rejects at the exact deadline', () => {
    expect(() => assertAssistanceOpen(attempt(), now)).not.toThrow();
    expect(() => assertAssistanceMatches(attempt(), request(), now)).not.toThrow();
    expect(() => assertAssistanceOpen(attempt(), attempt().deadline_at)).toThrow();
  });
});

it('denies an unassigned non-teaching invigilator before verifying MFA', async () => {
  decisionQueries({ assigned: false, staffRole: 'invigilator' });
  await expect(service.decide(req('invigilator'), requestId, decision)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(mocks.decrypt).not.toHaveBeenCalled();
});
it('allows an assigned non-teaching invigilator to approve with fresh MFA', async () => {
  decisionQueries({ staffRole: 'invigilator' });
  const result = await service.decide(req('invigilator'), requestId, decision);
  expect(result.status).toBe('approved');
  expect(
    mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO mfa_consumed_steps')),
  ).toBe(true);
});

it.each(['teacher', 'invigilator', 'school_admin'])(
  'allows scheduling assignment for %s before MFA enrollment',
  async (role) => {
    let staffRead = 0;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users') && sql.includes('FOR UPDATE'))
        return {
          rows: [{ role: staffRead++ === 0 ? 'school_admin' : role, mfa_enrolled_at: null }],
        };
      if (sql.includes('FROM exam_sessions')) return { rows: [{ id: sessionId }] };
      return { rows: [] };
    });
    await service.assignments(req('school_admin'), sessionId, {
      staffId: teacher,
      active: true,
      expectedRevision: 0,
      reason: 'Assigned before the sitting',
    });
    expect(
      mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO sitting_staff_assignments')),
    ).toBe(true);
  },
);
it('does not let an assigned staff member without enrolled MFA approve a request', async () => {
  decisionQueries();
  const original = mocks.query.getMockImplementation();
  if (!original) throw new Error('Missing query fixture');
  mocks.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.includes('FROM users'))
      return { rows: [{ role: 'invigilator', mfa_enrolled_at: null }] };
    return original(sql, ...args);
  });
  await expect(service.decide(req('invigilator'), requestId, decision)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(mocks.decrypt).not.toHaveBeenCalled();
});
