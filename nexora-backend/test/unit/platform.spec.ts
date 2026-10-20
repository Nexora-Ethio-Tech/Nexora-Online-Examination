import 'reflect-metadata';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Request, Response, request as baseRequest, response as baseResponse } from 'express';
import { randomUUID } from 'crypto';
import {
  PlatformService,
  sessionToken,
  assertPlatformCsrf,
} from '../../src/platform/platform.service';
import { PlatformDb, platformKey } from '../../src/platform/platform-db';
import { actionSchema } from '../../src/platform/platform-schemas';
import { requireSchedulingSubscription } from '../../src/platform/subscription';
import { encryptMfaSecret, decryptMfaSecret, totpCode } from '../../src/common/crypto/mfa';
import { hashPassword } from '../../src/common/crypto/password';
import { PoolClient } from 'pg';

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../src/platform/platform-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/platform-db')>();
  return {
    ...actual,
    PlatformDb: class {
      query = mocks.query;
      transaction(work: (c: unknown) => unknown) {
        mocks.transaction();
        return work({ query: mocks.query });
      }
    },
  };
});
const id = randomUUID(),
  school = randomUUID(),
  sessionId = randomUUID(),
  version = randomUUID();
const now = new Date('2030-01-01T00:00:00Z'),
  secret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const step = Math.floor(now.getTime() / 30_000),
  code = totpCode(secret, step);
const key = Buffer.alloc(32, 42);
let account = {
  id,
  display_name: 'Owner',
  password_hash: '',
  mfa_secret_enc: '',
  mfa_version: version,
  last_step: String(step - 1),
  active: true,
  enrolled_at: new Date('2029-01-01'),
};
let session = {
  id: sessionId,
  owner_id: id,
  csrf_token: 'csrf',
  authenticated_at: new Date('2029-02-01'),
};
let existingOperation: { fingerprint: string; result: Record<string, unknown> } | undefined;
const service = new PlatformService(new PlatformDb());
function req(method = 'GET'): Request {
  const r: Request = Object.create(baseRequest);
  Object.defineProperty(r, 'ip', { value: '127.0.0.1' });
  r.method = method;
  r.cookies = { nexora_platform: 'a'.repeat(43) };
  r.headers = { origin: 'http://localhost:5173', 'x-csrf-token': 'csrf' };
  return r;
}
function res(): Response {
  return Object.assign(Object.create(baseResponse), { cookie: vi.fn(), clearCookie: vi.fn() });
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PLATFORM_MFA_ENCRYPTION_KEY', key.toString('base64url'));
  account = {
    ...account,
    active: true,
    enrolled_at: new Date('2029-01-01'),
    last_step: String(step - 1),
    password_hash: await hashPassword('synthetic-owner-password'),
    mfa_secret_enc: encryptMfaSecret(secret, { schoolId: 'platform', userId: id, version }, key),
  };
  session = {
    id: sessionId,
    owner_id: id,
    csrf_token: 'csrf',
    authenticated_at: new Date('2029-02-01'),
  };
  existingOperation = undefined;
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('nexora_take_request_limit')) return { rows: [{ retry: 0 }] };
    if (sql.includes('FROM platform.sessions')) return { rows: [session] };
    if (sql.includes('SELECT * FROM platform.accounts')) return { rows: [account] };
    if (sql === 'SELECT clock_timestamp() AS now') return { rows: [{ now }] };
    if (sql.includes('FROM platform.operations'))
      return { rows: existingOperation ? [existingOperation] : [] };
    if (sql === 'SELECT id FROM public.schools WHERE id=$1') return { rows: [{ id: school }] };
    if (sql.includes('platform.school_status')) return { rows: [{ revision: 2 }] };
    if (sql.includes('platform.reset_admin')) return { rows: [{ ok: true }] };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('platform authentication boundary', () => {
  it('never accepts a school cookie as a platform session', async () => {
    const r = req();
    r.cookies = { nexora_session: 'a'.repeat(43) };
    expect(sessionToken(r)).toBeNull();
    await expect(service.me(r)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
  it('rejects malformed cookies', () => {
    const r = req();
    r.cookies = { nexora_platform: ['bad'] };
    expect(sessionToken(r)).toBeNull();
  });
  it.each(['schools', 'health', 'audits', 'inspect', 'action', 'logout'] as const)(
    'requires authentication for %s',
    async (endpoint) => {
      const r = req(
        endpoint === 'inspect' || endpoint === 'action' || endpoint === 'logout' ? 'POST' : 'GET',
      );
      r.cookies = {};
      const call =
        endpoint === 'schools'
          ? service.schools(r)
          : endpoint === 'health'
            ? service.health(r)
            : endpoint === 'audits'
              ? service.audits(r)
              : endpoint === 'inspect'
                ? service.inspect(r, school, { reason: 'Support investigation' })
                : endpoint === 'action'
                  ? service.action(r, statusAction())
                  : service.logout(r, res());
      await expect(call).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    },
  );
  it('rejects inactive owners even with an existing authenticated session', async () => {
    account.active = false;
    await expect(service.me(req())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
  it('rejects sessions predating MFA re-enrollment', async () => {
    account.enrolled_at = now;
    await expect(service.me(req())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
  it('requires exact trusted Origin and CSRF for every mutation', async () => {
    const r = req('POST');
    r.headers.origin = 'https://untrusted.example';
    expect(() => assertPlatformCsrf(r, 'csrf')).toThrow();
    await expect(service.action(r, statusAction())).rejects.toMatchObject({ code: 'CSRF_INVALID' });
    r.headers.origin = 'http://localhost:5173';
    r.headers['x-csrf-token'] = 'wrong';
    expect(() => assertPlatformCsrf(r, 'csrf')).toThrow();
  });
  it('rotates the session after successful password and MFA login without returning secrets', async () => {
    const response = res();
    const result = await service.login(req('POST'), response, {
      loginId: 'OWNER',
      password: 'synthetic-owner-password',
      code,
    });
    expect(result.displayName).toBe('Owner');
    expect(result.csrfToken).not.toBe('csrf');
    expect(response.cookie).toHaveBeenCalledWith(
      'nexora_platform',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', maxAge: 1_800_000 }),
    );
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE platform.sessions'))).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it('rejects a wrong password without creating an authenticated session', async () => {
    await expect(
      service.login(req('POST'), res(), { loginId: 'OWNER', password: 'wrong', code }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(
      mocks.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO platform.sessions')),
    ).toBe(false);
  });
  it('keeps platform and school encryption keys separate', () => {
    expect(() => platformKey({})).toThrow();
    expect(() =>
      decryptMfaSecret(
        account.mfa_secret_enc,
        { schoolId: 'platform', userId: id, version },
        Buffer.alloc(32, 1),
      ),
    ).toThrow();
  });
});
function statusAction() {
  return {
    action: 'status',
    requestId: randomUUID(),
    schoolId: school,
    status: 'inactive',
    expectedRevision: 1,
    reason: 'Emergency security incident',
    code,
    confirmedImpact: true,
  };
}
describe('privileged platform operations', () => {
  it('requires explicit impact and identity confirmation', () => {
    expect(actionSchema.safeParse({ ...statusAction(), confirmedImpact: false }).success).toBe(
      false,
    );
    expect(
      actionSchema.safeParse({
        action: 'reset_admin',
        requestId: randomUUID(),
        schoolId: school,
        adminId: randomUUID(),
        resetMfa: true,
        identityVerified: false,
        reason: 'Recovery request',
        code,
      }).success,
    ).toBe(false);
  });
  it('rejects an already consumed MFA code and charges the limit outside the mutation', async () => {
    account.last_step = String(step);
    await expect(service.action(req('POST'), statusAction())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('platform.school_status'))).toBe(
      false,
    );
    const rate = mocks.query.mock.calls.findIndex(([sql]) =>
      sql.includes('nexora_take_request_limit'),
    );
    const codeCheck = mocks.query.mock.calls.findIndex(
      ([sql]) => sql === 'SELECT clock_timestamp() AS now',
    );
    expect(rate).toBeLessThan(codeCheck);
  });
  it('uses the fixed school-status operation and records an audit without recording MFA', async () => {
    const result = await service.action(req('POST'), statusAction());
    expect(result).toMatchObject({ schoolId: school, credential: null, replayed: false });
    const audit = mocks.query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO platform.audit'),
    );
    expect(audit?.[1][0]).toBe(id);
    expect(audit?.[1][1]).toBe(school);
    expect(audit?.[1][4]).not.toHaveProperty('code');
  });
  it('does not replay credentials from a committed operation or consume another MFA step', async () => {
    const body = statusAction();
    const { code: unusedCode, requestId: unusedId, ...command } = actionSchema.parse(body);
    expect(unusedCode).toBe(code);
    expect(unusedId).toBeTruthy();
    const { hashSha256 } = await import('../../src/common/crypto/password');
    existingOperation = {
      fingerprint: hashSha256(JSON.stringify(command)),
      result: { schoolId: school, message: 'Already completed' },
    };
    const result = await service.action(req('POST'), body);
    expect(result).toMatchObject({ credential: null, replayed: true });
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE platform.accounts'))).toBe(
      false,
    );
  });
  it('rejects reuse of an idempotency key for a different operation', async () => {
    existingOperation = { fingerprint: 'different', result: {} };
    await expect(service.action(req('POST'), statusAction())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('returns a new administrator password once, persists only its hash and never caches it in the operation result', async () => {
    const result = await service.action(req('POST'), {
      action: 'provision',
      requestId: randomUUID(),
      name: 'School A',
      slug: 'school-a',
      loginId: 'ADMIN-A',
      displayName: 'Administrator A',
      reason: 'Verified new customer',
      code,
    });
    expect(result.credential).toEqual(expect.any(String));
    const provision = mocks.query.mock.calls.find(([sql]) =>
      sql.includes('platform.provision_school'),
    );
    expect(provision?.[1][6]).toMatch(/^\$argon2id\$/);
    const persisted = mocks.query.mock.calls.filter(
      ([sql]) =>
        sql.includes('INSERT INTO platform.audit') ||
        sql.includes('INSERT INTO platform.operations'),
    );
    expect(JSON.stringify(persisted)).not.toContain(result.credential);
  });
  it('keeps MFA reset explicit and school-scoped', async () => {
    const adminId = randomUUID();
    await service.action(req('POST'), {
      action: 'reset_admin',
      requestId: randomUUID(),
      schoolId: school,
      adminId,
      resetMfa: true,
      identityVerified: true,
      reason: 'Verified lost authenticator',
      code,
    });
    const call = mocks.query.mock.calls.find(([sql]) => sql.includes('platform.reset_admin'));
    expect(call?.[1]).toEqual([school, adminId, expect.stringMatching(/^\$argon2id\$/), true]);
  });
});
describe('subscription scheduling policy', () => {
  it.each([undefined, true, false])(
    'handles legacy/allowed/restricted state %s',
    async (allowed) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: allowed === undefined ? [] : [{ allowed }] });
      const c: PoolClient = Object.assign(Object.create(null), { query });
      const result = requireSchedulingSubscription(c, school);
      if (allowed === false) await expect(result).rejects.toMatchObject({ code: 'FORBIDDEN' });
      else await expect(result).resolves.toBeUndefined();
      expect(query.mock.calls[0][1]).toEqual([`subscription:${school}`]);
      expect(query.mock.calls[1][0]).not.toContain('FOR SHARE');
    },
  );
});
