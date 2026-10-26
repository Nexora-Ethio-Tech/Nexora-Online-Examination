import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { PlatformDb, platformKey } from './platform-db';
import { actionSchema, loginSchema, inspectSchema, cursorSchema } from './platform-schemas';
import { DomainException } from '../common/errors/domain.exception';
import { allowedOrigins } from '../common/security/origins';
import {
  generateOpaqueToken,
  hashPassword,
  hashSha256,
  verifyPassword,
} from '../common/crypto/password';
import { decryptMfaSecret, matchingTotpStep } from '../common/crypto/mfa';

type Owner = {
  id: string;
  display_name: string;
  password_hash: string;
  mfa_secret_enc: string;
  mfa_version: string;
  last_step: string;
  active: boolean;
  enrolled_at: Date | null;
};
type Session = {
  id: string;
  owner_id: string | null;
  csrf_token: string;
  authenticated_at: Date | null;
};
const cookie = () =>
  process.env.NODE_ENV === 'production' ? '__Host-nexora_platform' : 'nexora_platform';
const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
});
export function sessionToken(req: Request) {
  const token: unknown = req.cookies?.[cookie()];
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function assertPlatformCsrf(req: Request, csrf: string) {
  const origin = req.headers.origin;
  if (
    typeof origin !== 'string' ||
    !allowedOrigins().has(origin) ||
    req.headers['x-csrf-token'] !== csrf
  )
    throw DomainException.csrfInvalid();
}
@Injectable()
export class PlatformService {
  constructor(private readonly db: PlatformDb) {}
  private async limit(scope: string, count = 5, seconds = 300) {
    const result = await this.db.query<{ retry: number }>(
      'SELECT public.nexora_take_request_limit($1,$2,$3) retry',
      [hashSha256(`platform:${scope}`), count, seconds],
    );
    if (result.rows[0].retry > 0)
      throw new DomainException(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', [], {
        retryAfterSeconds: result.rows[0].retry,
      });
  }
  private async session(c: PoolClient, req: Request) {
    const token = sessionToken(req);
    if (!token) throw DomainException.authRequired();
    const row = (
      await c.query<Session>(
        `SELECT id,owner_id,csrf_token,authenticated_at FROM platform.sessions
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,
        [hashSha256(token)],
      )
    ).rows[0];
    if (!row) throw DomainException.authRequired();
    if (!['GET', 'HEAD'].includes(req.method)) assertPlatformCsrf(req, row.csrf_token);
    return row;
  }
  private async owner(c: PoolClient, req: Request) {
    const session = await this.session(c, req);
    if (!session.owner_id || !session.authenticated_at) throw DomainException.authRequired();
    const owner = (
      await c.query<Owner>('SELECT * FROM platform.accounts WHERE id=$1 FOR UPDATE', [
        session.owner_id,
      ])
    ).rows[0];
    if (!owner?.active || !owner.enrolled_at || session.authenticated_at < owner.enrolled_at)
      throw DomainException.authRequired();
    return { owner, session };
  }
  private audit(
    c: PoolClient,
    ownerId: string | null,
    schoolId: string | null,
    action: string,
    reason: string,
    details: unknown = {},
  ) {
    return c.query(
      'INSERT INTO platform.audit(owner_id,school_id,action,reason,details) VALUES($1,$2,$3,$4,$5)',
      [ownerId, schoolId, action, reason, details],
    );
  }
  private async verifyCode(c: PoolClient, owner: Owner, code: string) {
    const now = (await c.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now;
    const secret = decryptMfaSecret(
      owner.mfa_secret_enc,
      { schoolId: 'platform', userId: owner.id, version: owner.mfa_version },
      platformKey(),
    );
    const step = matchingTotpStep(secret, code, now);
    if (step === undefined || step <= Number(owner.last_step))
      throw DomainException.forbidden('Incorrect, expired or already used authenticator code');
    await c.query('UPDATE platform.accounts SET last_step=$2 WHERE id=$1', [owner.id, step]);
  }
  async csrf(req: Request, res: Response) {
    await this.limit(`bootstrap:${req.ip ?? 'unknown'}`, 30, 60);
    const token = sessionToken(req);
    if (token) {
      const existing = (
        await this.db.query<{ csrf_token: string }>(
          'SELECT csrf_token FROM platform.sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()',
          [hashSha256(token)],
        )
      ).rows[0];
      if (existing) return { csrfToken: existing.csrf_token };
    }
    const raw = generateOpaqueToken(),
      csrf = generateOpaqueToken();
    await this.db.query(
      "INSERT INTO platform.sessions(id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '10 minutes')",
      [randomUUID(), hashSha256(raw), csrf],
    );
    res.cookie(cookie(), raw, { ...options(), maxAge: 600_000 });
    return { csrfToken: csrf };
  }
  async login(req: Request, res: Response, input: unknown) {
    const body = loginSchema.parse(input);
    await this.limit(`login-ip:${req.ip ?? 'unknown'}`, 20);
    await this.limit(`login:${body.loginId}`);
    const result = await this.db
      .transaction(async (c) => {
        const old = await this.session(c, req);
        const owner = (
          await c.query<Owner>('SELECT * FROM platform.accounts WHERE login_id=$1 FOR UPDATE', [
            body.loginId,
          ])
        ).rows[0];
        if (
          !owner?.active ||
          !owner.enrolled_at ||
          !(await verifyPassword(owner.password_hash, body.password))
        )
          throw DomainException.authRequired('Invalid owner credentials');
        await this.verifyCode(c, owner, body.code);
        const raw = generateOpaqueToken(),
          csrf = generateOpaqueToken();
        await c.query('UPDATE platform.sessions SET revoked_at=clock_timestamp() WHERE id=$1', [
          old.id,
        ]);
        await c.query(
          "INSERT INTO platform.sessions(id,token_hash,csrf_token,owner_id,authenticated_at,expires_at) VALUES($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '30 minutes')",
          [randomUUID(), hashSha256(raw), csrf, owner.id],
        );
        await this.audit(c, owner.id, null, 'owner_login', 'Password and MFA verified');
        return { raw, csrfToken: csrf, displayName: owner.display_name };
      })
      .catch(async (failure) => {
        const error =
          failure instanceof Error && failure.message.includes('STALE_ADMIN_PROFILE')
            ? DomainException.conflict(
                'REVISION_CONFLICT',
                'Reload administrator information before editing.',
              )
            : failure;
        if (error instanceof DomainException)
          await this.db.query(
            "INSERT INTO platform.audit(action,reason,details) VALUES('owner_login_failed','Owner authentication rejected',$1)",
            [{ loginId: body.loginId, code: error.code }],
          );
        throw error;
      });
    res.cookie(cookie(), result.raw, { ...options(), maxAge: 1_800_000 });
    return { csrfToken: result.csrfToken, displayName: result.displayName };
  }
  async me(req: Request) {
    return this.db.transaction(async (c) => {
      const { owner } = await this.owner(c, req);
      return { displayName: owner.display_name };
    });
  }
  async logout(req: Request, res: Response) {
    await this.db.transaction(async (c) => {
      const { owner, session } = await this.owner(c, req);
      await c.query('UPDATE platform.sessions SET revoked_at=clock_timestamp() WHERE id=$1', [
        session.id,
      ]);
      await this.audit(c, owner.id, null, 'owner_logout', 'Signed out');
    });
    res.clearCookie(cookie(), options());
    return { ok: true };
  }
  async schools(req: Request, after?: string) {
    const cursor = after ? z.string().uuid().parse(after) : null;
    return this.db.transaction(async (c) => {
      const { owner } = await this.owner(c, req);
      const rows = await c.query(
        `SELECT s.id,s.name,s.slug, lpad(s.account_number::text, greatest(3,length(s.account_number::text)), '0') AS "schoolCode",s.status,s.platform_revision AS revision,
        (SELECT count(*)::int FROM public.users u WHERE u.school_id=s.id AND u.role='student') AS students,
        (SELECT count(*)::int FROM public.users u WHERE u.school_id=s.id AND u.role='teacher') AS teachers,
        COALESCE(b.state,'legacy') AS subscription,b.expires_at AS "expiresAt",COALESCE(b.revision,0) AS "subscriptionRevision"
        FROM public.schools s LEFT JOIN platform.subscriptions b ON b.school_id=s.id
        WHERE ($1::uuid IS NULL OR s.id>$1) ORDER BY s.id LIMIT 51`,
        [cursor],
      );
      await this.audit(c, owner.id, null, 'school_directory_read', 'Viewed school directory');
      return {
        schools: rows.rows.slice(0, 50),
        nextCursor: rows.rows.length > 50 ? rows.rows[49].id : null,
      };
    });
  }
  async inspect(req: Request, id: string, input: unknown) {
    z.string().uuid().parse(id);
    const { reason } = inspectSchema.parse(input);
    return this.db.transaction(async (c) => {
      const { owner } = await this.owner(c, req);
      const rows = await c.query(
        `SELECT id,login_id AS "loginId",display_name AS "displayName",status,first_name AS "firstName",father_name AS "fatherName",grandfather_name AS "grandfatherName",phone_number AS "phoneNumber",recovery_email AS "recoveryEmail",revision,
        (mfa_enrolled_at IS NOT NULL) AS "mfaEnrolled" FROM public.users WHERE school_id=$1 AND role='school_admin' ORDER BY id`,
        [id],
      );
      await this.audit(c, owner.id, id, 'school_admin_directory_read', reason);
      return { admins: rows.rows };
    });
  }
  async health(req: Request) {
    return this.db.transaction(async (c) => {
      const { owner } = await this.owner(c, req);
      const rows =
        await c.query(`SELECT 'imports' AS queue,state AS status,count(*)::int AS count FROM public.import_jobs GROUP BY state
        UNION ALL SELECT 'ai',status,count(*)::int FROM public.ai_jobs GROUP BY status
        UNION ALL SELECT 'packages',status,count(*)::int FROM public.package_jobs GROUP BY status`);
      await this.audit(c, owner.id, null, 'health_read', 'Viewed queue snapshot');
      return { database: 'reachable', sampledAt: new Date().toISOString(), queues: rows.rows };
    });
  }
  async audits(req: Request, before?: string) {
    const cursor = cursorSchema.parse(before);
    return this.db.transaction(async (c) => {
      const { owner } = await this.owner(c, req);
      const rows = await c.query(
        `SELECT id::text,owner_id AS "ownerId",school_id AS "schoolId",action,reason,at,details
        FROM platform.audit WHERE ($1::bigint=0 OR id<$1::bigint) ORDER BY id DESC LIMIT 101`,
        [cursor],
      );
      await this.audit(c, owner.id, null, 'platform_audit_read', 'Viewed or exported audit page');
      return {
        events: rows.rows.slice(0, 100),
        nextCursor: rows.rows.length > 100 ? rows.rows[99].id : null,
      };
    });
  }
  async action(req: Request, input: unknown) {
    const body = actionSchema.parse(input);
    // Separate transaction: incorrect MFA cannot undo its rate-limit charge.
    const identity = await this.db.transaction((c) => this.owner(c, req));
    await this.limit(`action:${identity.owner.id}`, 5, 60);
    const { code, requestId, ...command } = body;
    const fingerprint = hashSha256(JSON.stringify(command));
    return this.db
      .transaction(async (c) => {
        const { owner } = await this.owner(c, req);
        const old = (
          await c.query<{ fingerprint: string; result: Record<string, unknown> }>(
            'SELECT fingerprint,result FROM platform.operations WHERE owner_id=$1 AND request_id=$2',
            [owner.id, requestId],
          )
        ).rows[0];
        if (old) {
          if (old.fingerprint !== fingerprint)
            throw DomainException.conflict(
              'IDEMPOTENCY_CONFLICT',
              'This request identifier was already used with different details',
            );
          return { ...old.result, credential: null, replayed: true };
        }
        await this.verifyCode(c, owner, code);
        let result: Record<string, unknown>;
        let credential: string | null = null;
        let enrollmentToken: string | null = null;
        let schoolId: string;
        if (body.action === 'provision') {
          schoolId = randomUUID();
          const adminId = randomUUID();
          credential = generateOpaqueToken(24);
          await c.query('SELECT platform.provision_school($1,$2,$3,$4,$5,$6,$7)', [
            schoolId,
            adminId,
            body.name,
            body.slug,
            body.loginId,
            [body.firstName, body.fatherName, body.grandfatherName].join(' '),
            await hashPassword(credential),
          ]);
          await c.query(
            "INSERT INTO platform.subscriptions(school_id,state,expires_at) VALUES($1,'trial',clock_timestamp()+interval '30 days')",
            [schoolId],
          );
          result = {
            schoolId,
            adminId,
            loginId: body.loginId,
            message:
              'School created. Admin is inactive until protected MFA enrollment is confirmed.',
          };
        } else {
          schoolId = body.schoolId;
          if (!(await c.query('SELECT id FROM public.schools WHERE id=$1', [schoolId])).rows.length)
            throw DomainException.notFound();
          if (body.action === 'status') {
            const row = (
              await c.query<{ revision: number | null }>(
                'SELECT platform.school_status($1,$2,$3) AS revision',
                [schoolId, body.status, body.expectedRevision],
              )
            ).rows[0];
            if (!row.revision)
              throw DomainException.conflict(
                'REVISION_CONFLICT',
                'Refresh the school before changing its status',
              );
            result = {
              schoolId,
              revision: row.revision,
              message:
                body.status === 'inactive'
                  ? 'School suspended and sessions revoked.'
                  : 'School reactivated. Users must sign in again.',
            };
          } else if (body.action === 'create_admin') {
            const adminId = randomUUID();
            credential = generateOpaqueToken(24);
            await c.query('SELECT platform.create_admin($1,$2,$3,$4,$5)', [
              schoolId,
              adminId,
              body.loginId,
              [body.firstName, body.fatherName, body.grandfatherName].join(' '),
              await hashPassword(credential),
            ]);
            result = {
              schoolId,
              adminId,
              loginId: body.loginId,
              message:
                'Administrator created inactive; complete protected MFA enrollment before sign-in.',
            };
          } else if (body.action === 'edit_admin') {
            await c.query('SELECT platform.update_admin_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
              schoolId,
              body.adminId,
              body.firstName,
              body.fatherName,
              body.grandfatherName,
              body.phoneNumber || null,
              body.recoveryEmail || null,
              body.expectedRevision,
            ]);
            result = {
              schoolId,
              adminId: body.adminId,
              message: 'Administrator information updated.',
            };
          } else if (body.action === 'reset_admin') {
            credential = generateOpaqueToken(24);
            const row = (
              await c.query<{ ok: boolean }>('SELECT platform.reset_admin($1,$2,$3,$4) AS ok', [
                schoolId,
                body.adminId,
                await hashPassword(credential),
                body.resetMfa,
              ])
            ).rows[0];
            if (!row.ok) throw DomainException.notFound();
            result = {
              schoolId,
              adminId: body.adminId,
              message: body.resetMfa
                ? 'Password reset; admin inactive pending protected MFA enrollment.'
                : 'Password reset and old sessions revoked. Existing MFA remains required.',
            };
          } else {
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
              `subscription:${schoolId}`,
            ]);
            const oldSub = (
              await c.query<{ revision: number }>(
                'SELECT revision FROM platform.subscriptions WHERE school_id=$1 FOR UPDATE',
                [schoolId],
              )
            ).rows[0];
            if ((oldSub?.revision ?? 0) !== body.expectedRevision)
              throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the subscription first');
            await c.query(
              `INSERT INTO platform.subscriptions(school_id,state,expires_at) VALUES($1,$2,$3)
            ON CONFLICT(school_id) DO UPDATE SET state=EXCLUDED.state,expires_at=EXCLUDED.expires_at,revision=platform.subscriptions.revision+1`,
              [schoolId, body.state, body.expiresAt],
            );
            result = {
              schoolId,
              message: 'Subscription updated. Existing exam delivery is unchanged.',
            };
          }
        }
        if (body.action === 'provision' || body.action === 'create_admin') {
          await c.query('SELECT platform.update_admin_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
            schoolId,
            result.adminId,
            body.firstName,
            body.fatherName,
            body.grandfatherName,
            body.phoneNumber || null,
            body.recoveryEmail || null,
            1,
          ]);
        }
        if (
          body.action === 'provision' ||
          body.action === 'create_admin' ||
          (body.action === 'reset_admin' && body.resetMfa)
        ) {
          enrollmentToken = generateOpaqueToken(32);
          await c.query(
            'UPDATE public.admin_enrollment_invites SET consumed_at=clock_timestamp() WHERE school_id=$1 AND user_id=$2 AND consumed_at IS NULL',
            [schoolId, result.adminId],
          );
          await c.query(
            "INSERT INTO public.admin_enrollment_invites(token_hash,school_id,user_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '30 minutes')",
            [hashSha256(enrollmentToken), schoolId, result.adminId],
          );
        }
        await this.audit(c, owner.id, schoolId, body.action, body.reason, {
          action: body.action,
          adminId: result.adminId,
        });
        await c.query(
          'INSERT INTO platform.operations(owner_id,request_id,fingerprint,result) VALUES($1,$2,$3,$4)',
          [owner.id, requestId, fingerprint, result],
        );
        return { ...result, credential, enrollmentToken, replayed: false };
      })
      .catch(async (error) => {
        if (error instanceof DomainException)
          await this.db.query(
            "INSERT INTO platform.audit(owner_id,action,reason,details) VALUES($1,'owner_action_failed',$2,$3)",
            [identity.owner.id, body.reason, { action: body.action, errorCode: error.code }],
          );
        throw error;
      });
  }
}
