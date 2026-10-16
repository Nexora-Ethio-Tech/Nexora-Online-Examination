import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool, PoolClient } from 'pg';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock/clock.service';
import { DbService } from '../src/common/db/db.service';
import { databasePoolConfig } from '../src/common/db/database-config';
import { hashPassword, hashSha256, verifyPassword } from '../src/common/crypto/password';
import {
  encryptMfaSecret,
  matchingTotpStep,
  MFA_WINDOW_MS,
  newMfaSecret,
  totpCode,
} from '../src/common/crypto/mfa';
import {
  beginMfaEnrollment,
  bootstrapMfaAdministrator,
  confirmMfaEnrollment,
} from '../src/modules/auth/mfa-operator';
import { verifyAdminMfa } from '../src/modules/auth/mfa-verification';
import { responseCookie } from './http-helpers';

describe.runIf(process.env.RUN_SUPABASE_MFA_TESTS === 'true')('Supabase admin MFA', () => {
  const schoolId = randomUUID();
  const otherSchoolId = randomUUID();
  const password = randomUUID();
  const anonymousHashes: string[] = [];
  const extraSchools: string[] = [];
  const clock = new ClockService();
  let pool: Pool;
  let app: INestApplication | undefined;
  let db: DbService;
  let passwordHash: string;

  beforeAll(async () => {
    const config = databasePoolConfig('migration');
    if (
      !/(^|\.)supabase\.(com|co)$/.test(new URL(z.string().parse(config.connectionString)).hostname)
    )
      throw new Error('MFA verification requires Supabase');
    pool = new Pool(config);
    await pool.query(
      "INSERT INTO schools (id, name, slug) VALUES ($1, 'MFA verification', $2), ($3, 'Other MFA verification', $4)",
      [schoolId, `mfa-${schoolId}`, otherSchoolId, `mfa-${otherSchoolId}`],
    );
    passwordHash = await hashPassword(password);
    await startApp();
  });

  async function startApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockService)
      .useValue(clock)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    db = app.get(DbService);
  }

  beforeEach(() => clock.setMockTime(Math.ceil(Date.now() / 30000) * 30000));
  afterAll(async () => {
    clock.reset();
    await app?.close();
    if (pool) {
      await pool.query('DELETE FROM auth_sessions WHERE token_hash = ANY($1::text[])', [
        anonymousHashes,
      ]);
      await pool.query('DELETE FROM schools WHERE id = ANY($1::uuid[])', [
        [schoolId, otherSchoolId, ...extraSchools],
      ]);
      await pool.end();
    }
  });

  async function account(enrolled = true) {
    const userId = randomUUID();
    const version = randomUUID();
    const loginId = `MFA-${userId}`;
    const secret = newMfaSecret();
    const context = {
      schoolId,
      userId,
      operator: 'synthetic-verification-operator',
      reason: 'Synthetic MFA acceptance verification',
    };
    await pool.query(
      `INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, status, mfa_secret_enc, mfa_secret_version, mfa_enrolled_at)
       VALUES ($1, $2, $3, 'Synthetic MFA admin', 'school_admin', $4, $5, $6, $7, $8)`,
      [
        userId,
        schoolId,
        loginId,
        passwordHash,
        enrolled ? 'active' : 'inactive',
        enrolled ? encryptMfaSecret(secret, { schoolId, userId, version }) : null,
        version,
        enrolled ? new Date(clock.now().getTime() - 60000) : null,
      ],
    );
    return { userId, version, loginId, secret, context };
  }

  async function login(loginId: string) {
    if (!app) throw new Error('Application not initialized');
    const agent = request.agent(app.getHttpServer());
    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    anonymousHashes.push(
      hashSha256(responseCookie(bootstrap, 'nexora_session').slice('nexora_session='.length)),
    );
    const csrf = z.object({ csrfToken: z.string() }).parse(bootstrap.body).csrfToken;
    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', csrf)
      .send({ loginId, password });
    return { agent, response };
  }

  async function challenge(loginId: string) {
    const { agent, response } = await login(loginId);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('mfa_required');
    const csrf = z.object({ csrfToken: z.string() }).parse(response.body).csrfToken;
    const cookie = responseCookie(response, 'nexora_session');
    return { agent, csrf, cookie, tokenHash: hashSha256(cookie.slice('nexora_session='.length)) };
  }

  function code(secret: string) {
    return totpCode(secret, Math.floor(clock.now().getTime() / 30000));
  }
  function verify(ch: Awaited<ReturnType<typeof challenge>>, value: string) {
    return ch.agent
      .post('/api/v1/auth/mfa/verify')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', ch.csrf)
      .send({ code: value });
  }

  it('blocks unverified administrators from login', async () => {
    const admin = await account(false);
    expect((await login(admin.loginId)).response.status).toBe(401);
  });

  it('requires MFA, rotates the cookie atomically and restores the administrator session', async () => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    await ch.agent.get('/api/v1/auth/me').expect(401);
    const result = await verify(ch, code(admin.secret));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'authenticated' });
    expect(responseCookie(result, 'nexora_session')).not.toBe(ch.cookie);
    const me = await ch.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ id: admin.userId, role: 'school_admin' });
    expect(JSON.stringify(me.body)).not.toContain(admin.secret);
    const consumed = await pool.query('SELECT step FROM mfa_consumed_steps WHERE user_id = $1', [
      admin.userId,
    ]);
    expect(consumed.rows).toHaveLength(1);
    expect(
      (
        await pool.query('SELECT revoked_at FROM auth_sessions WHERE token_hash = $1', [
          ch.tokenHash,
        ])
      ).rows[0]?.revoked_at,
    ).not.toBeNull();
  });

  it.each([299999, 300000])(
    'checks the five-minute boundary at %i milliseconds',
    async (elapsed) => {
      const admin = await account();
      const ch = await challenge(admin.loginId);
      clock.advanceByMs(elapsed);
      expect((await verify(ch, code(admin.secret))).status).toBe(
        elapsed < MFA_WINDOW_MS ? 200 : 401,
      );
    },
  );

  it.each([-1, 1])('allows adjacent step %i', async (offset) => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    const value = totpCode(admin.secret, Math.floor(clock.now().getTime() / 30000) + offset);
    expect((await verify(ch, value)).status).toBe(200);
  });

  it.each([-2, 2])('rejects step %i outside the allowed window', async (offset) => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    const value = totpCode(admin.secret, Math.floor(clock.now().getTime() / 30000) + offset);
    expect((await verify(ch, value)).status).toBe(422);
    await ch.agent.get('/api/v1/auth/me').expect(401);
  });

  it('rejects successful-step reuse through another challenge', async () => {
    const admin = await account();
    const first = await challenge(admin.loginId);
    const second = await challenge(admin.loginId);
    const value = code(admin.secret);
    expect((await verify(first, value)).status).toBe(200);
    expect((await verify(second, value)).status).toBe(422);
  });

  it('serializes simultaneous verification of the same challenge', async () => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    const results = await Promise.all([
      verify(ch, code(admin.secret)),
      verify(ch, code(admin.secret)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    expect(
      (
        await pool.query(
          'SELECT id FROM auth_sessions WHERE user_id = $1 AND mfa_verified_at IS NOT NULL',
          [admin.userId],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it('serializes the same code across independent challenges', async () => {
    const admin = await account();
    const first = await challenge(admin.loginId);
    const second = await challenge(admin.loginId);
    const results = await Promise.all([
      verify(first, code(admin.secret)),
      verify(second, code(admin.secret)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 422]);
  });

  it('persists account-level rate limiting across challenges and application restart', async () => {
    const admin = await account();
    let ch = await challenge(admin.loginId);
    let wrong = '000000';
    while (matchingTotpStep(admin.secret, wrong, clock.now()) !== undefined)
      wrong = (Number(wrong) + 1).toString().padStart(6, '0');
    for (let index = 0; index < 5; index++) expect((await verify(ch, wrong)).status).toBe(422);
    await app?.close();
    await startApp();
    ch = await challenge(admin.loginId);
    const limited = await verify(ch, code(admin.secret));
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    clock.advanceByMs(MFA_WINDOW_MS);
    const fresh = await challenge(admin.loginId);
    expect((await verify(fresh, code(admin.secret))).status).toBe(200);
  }, 60000);

  it('rolls back consumption, revocation and privilege escalation together on failure', async () => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    const failing = new (class extends DbService {
      override withAuthTransaction<T>(
        context: { tokenHash?: string; loginId?: string },
        fn: (client: PoolClient) => Promise<T>,
      ): Promise<T> {
        return db.withAuthTransaction(context, async (client) => {
          await fn(client);
          throw new Error('Synthetic rollback');
        });
      }
    })();
    await expect(
      verifyAdminMfa(failing, ch.tokenHash, { code: code(admin.secret) }, () => clock.now()),
    ).rejects.toThrow('Synthetic rollback');
    expect(
      (await pool.query('SELECT step FROM mfa_consumed_steps WHERE user_id = $1', [admin.userId]))
        .rows,
    ).toEqual([]);
    expect(
      (
        await pool.query('SELECT revoked_at FROM auth_sessions WHERE token_hash = $1', [
          ch.tokenHash,
        ])
      ).rows[0]?.revoked_at,
    ).toBeNull();
    expect((await verify(ch, code(admin.secret))).status).toBe(200);
  });

  it('fails closed for corrupt encrypted material without fallback or secret disclosure', async () => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    await pool.query(
      "UPDATE users SET mfa_secret_enc = 'v1.invalid.invalid.invalid' WHERE id = $1",
      [admin.userId],
    );
    const result = await verify(ch, code(admin.secret));
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain(admin.secret);
    expect(JSON.stringify(result.body)).not.toContain('v1.invalid');
  });

  it('enrolls privately, activates only after proof and consumes the enrollment code', async () => {
    const admin = await account(false);
    const enrollment = await beginMfaEnrollment(pool, admin.context, false, () => clock.now());
    expect((await login(admin.loginId)).response.status).toBe(401);
    expect(await confirmMfaEnrollment(pool, admin.context, 'bad', () => clock.now())).toBe(false);
    const used = code(enrollment.secret);
    expect(await confirmMfaEnrollment(pool, admin.context, used, () => clock.now())).toBe(true);
    const ch = await challenge(admin.loginId);
    expect((await verify(ch, used)).status).toBe(422);
    clock.advanceByMs(30000);
    expect((await verify(ch, code(enrollment.secret))).status).toBe(200);
    const audits = await pool.query(
      'SELECT action, operator_identity, reason FROM audit_events WHERE resource_id = $1 AND operator_identity IS NOT NULL ORDER BY server_at',
      [admin.userId],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      'admin_mfa_enrollment_started',
      'admin_mfa_enrollment_confirmed',
    ]);
    for (const audit of audits.rows)
      expect(audit).toMatchObject({
        operator_identity: admin.context.operator,
        reason: admin.context.reason,
      });
  });

  it('recovers by revoking sessions and requiring a fresh verified secret', async () => {
    const admin = await account();
    const ch = await challenge(admin.loginId);
    expect((await verify(ch, code(admin.secret))).status).toBe(200);
    const pending = await challenge(admin.loginId);
    const recovery = await beginMfaEnrollment(pool, admin.context, true, () => clock.now());
    expect(recovery.secret).not.toBe(admin.secret);
    await ch.agent.get('/api/v1/auth/me').expect(401);
    expect((await verify(pending, code(admin.secret))).status).toBe(401);
    expect((await login(admin.loginId)).response.status).toBe(401);
    expect(
      await confirmMfaEnrollment(pool, admin.context, code(recovery.secret), () => clock.now()),
    ).toBe(true);
    clock.advanceByMs(30000);
    const fresh = await challenge(admin.loginId);
    expect((await verify(fresh, code(admin.secret))).status).toBe(422);
    expect((await verify(fresh, code(recovery.secret))).status).toBe(200);
    expect(
      (
        await pool.query(
          "SELECT id FROM audit_events WHERE resource_id = $1 AND action = 'admin_mfa_recovery_started'",
          [admin.userId],
        )
      ).rows,
    ).toHaveLength(1);
  }, 60000);

  it('rejects foreign-school and unprivileged operator provisioning', async () => {
    const admin = await account(false);
    await expect(
      beginMfaEnrollment(pool, { ...admin.context, schoolId: otherSchoolId }, false, () =>
        clock.now(),
      ),
    ).rejects.toThrow('not found');
    const runtime = new Pool(databasePoolConfig('runtime'));
    try {
      await expect(
        beginMfaEnrollment(runtime, admin.context, false, () => clock.now()),
      ).rejects.toThrow('Protected migration credentials');
    } finally {
      await runtime.end();
    }
  });

  it('creates the first school/admin atomically with generated credentials and no activation bypass', async () => {
    const id = randomUUID();
    const created = await bootstrapMfaAdministrator(pool, {
      schoolName: 'Synthetic bootstrap school',
      slug: `mfa-bootstrap-${id}`,
      loginId: `MFA-BOOTSTRAP-${id}`,
      displayName: 'Synthetic first admin',
      operator: 'synthetic-bootstrap-operator',
      reason: 'Synthetic bootstrap verification',
    });
    extraSchools.push(created.schoolId);
    const users = await pool.query<{
      password_hash: string;
      status: string;
      mfa_enrolled_at: Date | null;
    }>('SELECT password_hash, status, mfa_enrolled_at FROM users WHERE id = $1', [created.userId]);
    const user = users.rows[0];
    if (!user) throw new Error('Bootstrap user missing');
    expect(user.status).toBe('inactive');
    expect(user.mfa_enrolled_at).toBeNull();
    expect(await verifyPassword(user.password_hash, created.password)).toBe(true);
    const audit = await pool.query(
      'SELECT operator_identity FROM audit_events WHERE resource_id = $1',
      [created.userId],
    );
    expect(audit.rows[0]?.operator_identity).toBe('synthetic-bootstrap-operator');
    await expect(
      bootstrapMfaAdministrator(pool, {
        schoolName: 'Duplicate school',
        slug: `mfa-bootstrap-conflict-${id}`,
        loginId: `MFA-BOOTSTRAP-${id}`,
        displayName: 'Synthetic duplicate',
        operator: 'synthetic-bootstrap-operator',
        reason: 'Synthetic duplicate verification',
      }),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (await pool.query('SELECT id FROM schools WHERE slug = $1', [`mfa-bootstrap-conflict-${id}`]))
        .rows,
    ).toEqual([]);
  });

  it('expires operator enrollment and locks repeated incorrect confirmation attempts', async () => {
    const expired = await account(false);
    const material = await beginMfaEnrollment(pool, expired.context, false, () => clock.now());
    clock.advanceByMs(MFA_WINDOW_MS);
    await expect(
      confirmMfaEnrollment(pool, expired.context, code(material.secret), () => clock.now()),
    ).rejects.toThrow('expired or locked');
    const locked = await account(false);
    const fresh = await beginMfaEnrollment(pool, locked.context, false, () => clock.now());
    for (let index = 0; index < 5; index++)
      expect(await confirmMfaEnrollment(pool, locked.context, 'invalid', () => clock.now())).toBe(
        false,
      );
    await expect(
      confirmMfaEnrollment(pool, locked.context, code(fresh.secret), () => clock.now()),
    ).rejects.toThrow('expired or locked');
    expect(
      (await pool.query('SELECT status FROM users WHERE id = $1', [locked.userId])).rows[0]?.status,
    ).toBe('inactive');
  });
});
