import { DeliveryService } from '../../src/modules/delivery/delivery.service';
import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, request as baseRequest } from 'express';
import { randomUUID } from 'node:crypto';
import { SupervisionService } from '../../src/modules/delivery/supervision.service';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';
const dbMock = vi.hoisted(() => ({ query: vi.fn(), tenant: vi.fn() }));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    tenantQuery(_school: string, sql: string, values: unknown[]) {
      return dbMock.query(sql, values);
    }
    withTenantTransaction(school: string, work: (client: unknown) => unknown) {
      dbMock.tenant(school);
      return work({ query: dbMock.query });
    }
  },
}));
const schoolId = randomUUID(),
  studentId = randomUUID(),
  adminId = randomUUID(),
  attemptId = randomUUID();
const deadline = new Date('2030-01-01T01:00:00Z');
function request(role: 'student' | 'school_admin' | 'teacher', userId: string): Request {
  const req: Request = Object.create(baseRequest);
  req.school = { id: schoolId, name: 'School', timezone: 'Africa/Addis_Ababa' };
  req.sessionUser = { id: userId, role, loginId: 'TEST', displayName: 'Test user' };
  return req;
}
let attempt = {
  id: attemptId,
  student_id: studentId,
  suspended: false,
  supervision_revision: 0,
  deadline_at: deadline,
  state: 'active',
  device_generation: 1,
};
let events: {
  id: string;
  actor_id: string;
  payload: Record<string, unknown>;
  received_at: Date;
}[] = [];
let now = new Date('2030-01-01T00:00:00Z');
const clock = new ClockService();
const service = new SupervisionService(new DbService(), clock);
beforeEach(() => {
  events = [];
  now = new Date('2030-01-01T00:00:00Z');
  attempt = { ...attempt, suspended: false, supervision_revision: 0, state: 'active' };
  dbMock.tenant.mockClear();
  dbMock.query.mockClear();
  vi.spyOn(clock, 'now').mockImplementation(() => now);
  dbMock.query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.startsWith('SELECT es.id FROM exam_sessions'))
      return { rows: [{ id: attemptId }], rowCount: 1 };
    if (sql.startsWith('SELECT * FROM attempts') || sql.startsWith('SELECT a.*'))
      return { rows: [{ ...attempt }] };
    if (sql.startsWith('SELECT count'))
      return { rows: [{ count: String(events.filter((e) => e.payload.kind).length) }] };
    if (sql.startsWith('SELECT * FROM attempt_supervision_events'))
      return { rows: values.length === 3 ? events.filter((e) => e.id === values[2]) : events };
    if (sql.startsWith('UPDATE attempts')) {
      attempt.suspended = values[0] === true;
      attempt.supervision_revision = Number(values[1]);
    }
    if (sql.startsWith('INSERT INTO attempt_supervision_events')) {
      const [, , id, actor_id, payload, received_at] = values;
      if (
        typeof id !== 'string' ||
        typeof actor_id !== 'string' ||
        !payload ||
        typeof payload !== 'object' ||
        !(received_at instanceof Date)
      )
        throw new Error('Invalid insert');
      events.push({
        id,
        actor_id,
        payload: Object.fromEntries(Object.entries(payload)),
        received_at,
      });
    }
    return { rows: [] };
  });
});
describe('supervision service authorization, replay and deadlines (database double)', () => {
  it('rejects teachers and another student before returning records', async () => {
    await expect(service.read(request('teacher', adminId), attemptId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.read(request('student', randomUUID()), attemptId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.decide(request('student', studentId), attemptId, {}, randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('audits suspend/resume, rejects stale revisions and replays without extending the deadline', async () => {
    const req = request('school_admin', adminId),
      key = randomUUID();
    const body = { action: 'suspend', reason: 'Identity check', expectedRevision: 0 };
    const suspended = await service.decide(req, attemptId, body, key);
    expect(suspended.suspended).toBe(true);
    expect(events).toHaveLength(1);
    await service.decide(req, attemptId, body, key);
    expect(events).toHaveLength(1);
    await expect(
      service.decide(req, attemptId, { ...body, action: 'resume' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const resumed = await service.decide(
      req,
      attemptId,
      { action: 'resume', reason: 'Checked', expectedRevision: 1 },
      randomUUID(),
    );
    expect(resumed.suspended).toBe(false);
    expect(resumed.deadlineAt).toBe(deadline.toISOString());
    expect(dbMock.tenant).toHaveBeenCalledWith(schoolId);
  });
  it('rejects reuse with a different decision and reopening after the deadline', async () => {
    const req = request('school_admin', adminId),
      key = randomUUID();
    const body = { action: 'suspend', reason: 'Review', expectedRevision: 0 };
    await service.decide(req, attemptId, body, key);
    await expect(
      service.decide(req, attemptId, { ...body, reason: 'Changed' }, key),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    now = deadline;
    await expect(
      service.decide(
        req,
        attemptId,
        { action: 'resume', reason: 'Done', expectedRevision: 1 },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_FINALIZED' });
    await service.decide(req, attemptId, body, key);
    expect(events).toHaveLength(1);
  });
  it.each(['hidden', 'focus_lost'])(
    'deduplicates %s telemetry without suspending or changing exam state',
    async (kind) => {
      const req = request('student', studentId);
      const event = {
        id: randomUUID(),
        kind,
        observedAt: now.toISOString(),
        deviceGeneration: 1,
      };
      await service.report(req, attemptId, { events: [event] });
      await service.report(req, attemptId, { events: [event] });
      expect(events).toHaveLength(1);
      expect(attempt.suspended).toBe(false);
      expect(attempt.state).toBe('active');
      await expect(
        service.report(req, attemptId, { events: [{ ...event, kind: 'returned' }] }),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    },
  );
});

it('rejects answer uploads and new final submissions while suspended', async () => {
  attempt.suspended = true;
  const delivery = new DeliveryService(new DbService(), clock);
  const req = request('student', studentId);
  const body = { examVersion: 1, scheduleRevision: 1, deviceGeneration: 1, answers: [] };
  await expect(delivery.saveAnswers(req, attemptId, body)).rejects.toMatchObject({
    code: 'ATTEMPT_SUSPENDED',
  });
  await expect(
    delivery.submitAttempt(req, attemptId, randomUUID(), { ...body, finalSeq: 0 }),
  ).rejects.toMatchObject({ code: 'ATTEMPT_SUSPENDED' });
  expect(dbMock.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT'))).toBe(false);
});
