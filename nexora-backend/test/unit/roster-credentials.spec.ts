import 'reflect-metadata';
import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Request, request as baseRequest } from 'express';
import { RosterService } from '../../src/modules/directory/roster.service';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';
import { verifyPassword } from '../../src/common/crypto/password';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    withTenantTransaction(_school: string, work: (client: unknown) => unknown) {
      return work({ query: mocks.query });
    }
  },
}));
const school = randomUUID(),
  actor = randomUUID(),
  importId = randomUUID(),
  classId = randomUUID();
const service = new RosterService(new DbService(), new ClockService());
function request(): Request {
  const value: Request = Object.create(baseRequest);
  value.school = { id: school, name: 'School', timezone: 'Africa/Addis_Ababa' };
  value.sessionUser = { id: actor, role: 'school_admin', loginId: 'ADMIN', displayName: 'Admin' };
  return value;
}
let replay: { payload_digest: string; response_body: unknown } | null = null;
beforeEach(() => {
  replay = null;
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes('FROM directory_imports'))
      return {
        rows: [
          {
            class_id: classId,
            class_revision: 1,
            revision: 1,
            expires_at: new Date(Date.now() + 60_000),
            committed_result: null,
            preview: {
              importId,
              classId,
              className: 'Grade 10',
              revision: 1,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              canCommit: true,
              totalRows: 2,
              rows: [1, 2].map((n) => ({
                row: n,
                studentRef: `NEW-${n}`,
                displayName: `Student ${n}`,
                errors: [],
              })),
            },
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('FROM idempotency_keys'))
      return { rows: replay ? [replay] : [], rowCount: replay ? 1 : 0 };
    if (sql.includes('FROM classes'))
      return { rows: [{ revision: 1, code_or_year: '2019' }], rowCount: 1 };
    if (sql.includes('FROM schools')) return { rows: [{ account_number: 1 }], rowCount: 1 };
    if (sql.includes('RETURNING last_number')) return { rows: [{ last_number: 2 }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO idempotency_keys'))
      replay = {
        payload_digest: String(values[4]),
        response_body: JSON.parse(String(values[5])),
      };
    return { rows: [], rowCount: 0 };
  });
});
it('creates salted hashes and enrollments together, retaining no plaintext in either replay record', async () => {
  const key = randomUUID();
  const result = await service.commit(
    request(),
    importId,
    { revision: 1, issueCredentials: true },
    key,
  );
  expect(result).toMatchObject({
    createdCount: 2,
    loginDetails: { issuedCount: 2, credentials: expect.any(Array) },
  });
  const first = JSON.stringify(result);
  const parsed: { loginDetails: { credentials: { password: string }[] } } = JSON.parse(first);
  const inserts = mocks.query.mock.calls.filter(([sql]) =>
    String(sql).startsWith('INSERT INTO users'),
  );
  expect(inserts).toHaveLength(2);
  expect(
    mocks.query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO enrollments')),
  ).toHaveLength(2);
  for (const [i, credential] of parsed.loginDetails.credentials.entries()) {
    expect(credential.password).toHaveLength(8);
    const values: unknown[] = inserts[i]?.[1];
    expect(values[5]).toMatch(/^\$argon2id\$/);
    expect(values[6]).toBe(true);
    expect(await verifyPassword(String(values[5]), credential.password)).toBe(true);
    const retained = mocks.query.mock.calls.filter(([sql]) =>
      /UPDATE directory_imports|INSERT INTO idempotency_keys/.test(String(sql)),
    );
    expect(JSON.stringify(retained)).not.toContain(credential.password);
  }
  const count = inserts.length;
  expect(
    await service.commit(request(), importId, { revision: 1, issueCredentials: true }, key),
  ).toMatchObject({
    createdCount: 2,
    loginDetails: { credentials: null },
  });
  expect(
    mocks.query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO users')),
  ).toHaveLength(count);
  await expect(
    service.commit(request(), importId, { revision: 1, issueCredentials: false }, key),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
});
it('does not record a successful commit or replay when account creation fails', async () => {
  const implementation = mocks.query.getMockImplementation();
  mocks.query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.startsWith('INSERT INTO users')) throw new Error('Database write failed');
    return implementation?.(sql, values);
  });
  await expect(
    service.commit(request(), importId, { revision: 1, issueCredentials: true }, randomUUID()),
  ).rejects.toThrow('Database write failed');
  expect(
    mocks.query.mock.calls.some(([sql]) =>
      /UPDATE directory_imports|INSERT INTO idempotency_keys|INSERT INTO audit_events/.test(
        String(sql),
      ),
    ),
  ).toBe(false);
});
