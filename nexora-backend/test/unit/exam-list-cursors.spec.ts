import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Request, request as baseRequest } from 'express';
import { expect, it, vi } from 'vitest';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';
import { PreparationService } from '../../src/modules/delivery/preparation.service';
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    withTenantTransaction(_school: string, work: (c: { query: typeof mock.query }) => unknown) {
      return work({ query: mock.query });
    }
  },
}));
function fixture() {
  mock.query.mockReset();
  const req: Request = Object.create(baseRequest);
  req.school = { id: randomUUID(), name: 'School', timezone: 'Africa/Addis_Ababa' };
  req.sessionUser = { id: randomUUID(), role: 'student', loginId: 'TEST', displayName: 'Student' };
  const service = new PreparationService(new DbService(), new ClockService());
  const cursor = {
    schoolId: req.school.id,
    studentId: req.sessionUser.id,
    sessionId: randomUUID(),
    startsAt: '2026-10-01T06:00:00.000Z',
    title: 'Biology',
    category: 'current',
    sort: 'title',
  };
  return { req, service, cursor };
}
it.each(['schoolId', 'studentId', 'category', 'sort'])(
  'rejects a cursor from a different %s before querying',
  async (field) => {
    const { req, service, cursor } = fixture();
    const encoded = Buffer.from(
      JSON.stringify({
        ...cursor,
        [field]: field.endsWith('Id') ? randomUUID() : field === 'category' ? 'past' : 'start',
      }),
    ).toString('base64url');
    await expect(
      service.getMyExams(req, { cursor: encoded, category: 'current', sort: 'title' }),
    ).rejects.toThrow();
    expect(mock.query).not.toHaveBeenCalled();
  },
);
it('uses title and identity together at the page boundary and binds filters before the limit', async () => {
  const { req, service, cursor } = fixture();
  mock.query.mockResolvedValue({ rows: [] });
  await service.getMyExams(req, {
    cursor: Buffer.from(JSON.stringify(cursor)).toString('base64url'),
    category: 'current',
    sort: 'title',
    limit: '25',
  });
  const [sql, params] = mock.query.mock.calls[0];
  expect(sql).toContain('(lower(e.title), es.id) > (lower($3), $4::uuid)');
  expect(sql).toContain('ORDER BY lower(e.title) ASC, es.id ASC');
  expect(params.slice(0, 4)).toEqual([
    req.school?.id,
    req.sessionUser?.id,
    'Biology',
    cursor.sessionId,
  ]);
  expect(params.slice(-2)).toEqual(['current', 26]);
});
