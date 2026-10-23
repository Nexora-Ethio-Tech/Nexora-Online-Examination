import 'reflect-metadata';
import { beforeEach, expect, it, vi } from 'vitest';
import { Request, request } from 'express';
import { randomUUID } from 'crypto';
import { StaffAuthenticatorService } from '../../src/modules/delivery/staff-authenticator.service';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';
import { encryptMfaSecret, newMfaSecret, totpCode } from '../../src/common/crypto/mfa';
const mocks = vi.hoisted(() => ({ query: vi.fn(), rate: vi.fn(), password: vi.fn() }));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    query = mocks.rate;
    withTenantTransaction(_school: string, work: (c: unknown) => unknown) {
      return work({ query: mocks.query });
    }
  },
}));
vi.mock('../../src/common/crypto/password', () => ({
  verifyPassword: mocks.password,
  hashSha256: (s: string) => s,
}));
const school = randomUUID(),
  user = randomUUID(),
  version = randomUUID();
const now = new Date('2030-01-01T00:00:00Z');
const clock = new ClockService();
const service = new StaffAuthenticatorService(new DbService(), clock);
const secret = newMfaSecret();
let row: {
  role: string;
  login_id: string;
  password_hash: string;
  mfa_enrolled_at: Date | null;
  mfa_secret_version: string;
  mfa_pending_secret_enc: string | null;
  mfa_pending_expires_at: Date;
};
function req(role: 'invigilator' | 'student' | 'school_admin' = 'invigilator'): Request {
  const r: Request = Object.create(request);
  r.school = { id: school, name: 'Test', timezone: 'Africa/Addis_Ababa' };
  r.sessionUser = { id: user, loginId: 'INV-1', displayName: 'Staff', role };
  return r;
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64url');
  clock.setMockTime(now);
  row = {
    role: 'invigilator',
    login_id: 'INV-1',
    password_hash: 'hash',
    mfa_enrolled_at: null,
    mfa_secret_version: version,
    mfa_pending_secret_enc: encryptMfaSecret(secret, { schoolId: school, userId: user, version }),
    mfa_pending_expires_at: new Date(now.getTime() + 300000),
  };
  mocks.password.mockResolvedValue(true);
  mocks.rate.mockResolvedValue({ rows: [{ retry: 0 }] });
  mocks.query.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT login_id') ? { rows: [row] } : { rows: [{ step: 1 }], rowCount: 1 },
  );
});
it('denies student access before database queries', async () => {
  await expect(service.execute(req('student'), 'status')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(mocks.query).not.toHaveBeenCalled();
});
it('returns readiness without enrollment material', async () => {
  expect(await service.execute(req(), 'status')).toEqual({
    enrolled: false,
    selfSetupAllowed: true,
  });
});
it('requires the current password and charges failures before the transaction', async () => {
  mocks.password.mockResolvedValue(false);
  await expect(service.execute(req(), 'begin', { password: 'wrong' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(mocks.rate).toHaveBeenCalled();
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('encrypts a fresh expiring secret for first-time setup without enrolling yet', async () => {
  const result = await service.execute(req(), 'begin', { password: 'verified' });
  expect(result).toMatchObject({
    otpauthUri: expect.stringContaining('otpauth://totp/'),
    expiresAt: '2030-01-01T00:05:00.000Z',
  });
  const update = mocks.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
  expect(update?.[0]).not.toContain('mfa_enrolled_at=');
  expect(update?.[1][3]).toMatch(/^v1\./);
});
it.each(['already enrolled', 'administrator', 'expired', 'wrong code', 'replayed code'])(
  'rejects %s without enabling a factor',
  async (scenario) => {
    if (scenario === 'already enrolled') row.mfa_enrolled_at = now;
    if (scenario === 'administrator') row.role = 'school_admin';
    if (scenario === 'expired') row.mfa_pending_expires_at = now;
    if (scenario === 'replayed code')
      mocks.query.mockImplementation(async (sql: string) =>
        sql.startsWith('SELECT login_id') ? { rows: [row] } : { rows: [], rowCount: 0 },
      );
    const code =
      scenario === 'wrong code'
        ? String(
            (Number(totpCode(secret, Math.floor(now.getTime() / 30000))) + 1) % 1000000,
          ).padStart(6, '0')
        : totpCode(secret, Math.floor(now.getTime() / 30000));
    await expect(service.execute(req(), 'confirm', { code })).rejects.toThrow();
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  },
);
it('consumes the confirmation step atomically and clears pending enrollment', async () => {
  const code = totpCode(secret, Math.floor(now.getTime() / 30000));
  expect(await service.execute(req(), 'confirm', { code })).toEqual({
    enrolled: true,
    selfSetupAllowed: false,
  });
  expect(
    mocks.query.mock.calls.some(([sql]) => sql.includes('ON CONFLICT DO NOTHING RETURNING step')),
  ).toBe(true);
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes('mfa_pending_secret_enc=NULL'))).toBe(
    true,
  );
});
