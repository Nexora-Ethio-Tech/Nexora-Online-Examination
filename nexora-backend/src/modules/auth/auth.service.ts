import { Injectable, OnModuleInit } from '@nestjs/common';
import { Response, Request } from 'express';
import { mfaEncryptionKey, MFA_WINDOW_MS } from '../../common/crypto/mfa';
import { verifyAdminMfa } from './mfa-verification';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { generateOpaqueToken, hashSha256, verifyPassword } from '../../common/crypto/password';
import { DomainException } from '../../common/errors/domain.exception';
import {
  deviceCookieName,
  deviceCredential,
  DEVICE_TTL_MS,
} from '../../common/crypto/device-credential';
import { deviceRequestSchema, parsePreparationInput } from '../delivery/preparation-schemas';

const SESSION_COOKIE_NAME = 'nexora_session';

// Challenge expiry is independent of the authenticated session lifetime.
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MFA_CHALLENGE_TTL_MS = MFA_WINDOW_MS;
const ANON_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  onModuleInit() {
    mfaEncryptionKey();
  }

  private setCookie(res: Response, name: string, value: string, maxAgeMs: number) {
    res.cookie(name, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  private clearCookie(res: Response, name: string) {
    res.clearCookie(name, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  async getCsrf(req: Request, res: Response) {
    const existingCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (existingCookie) {
      const tokenHash = hashSha256(existingCookie);
      const resDb = await this.db.authQuery(
        { tokenHash },
        `SELECT id, csrf_token, expires_at, revoked_at FROM auth_sessions WHERE token_hash = $1`,
        [tokenHash],
      );

      if (
        resDb.rows.length > 0 &&
        !resDb.rows[0].revoked_at &&
        new Date(resDb.rows[0].expires_at) > this.clock.now()
      ) {
        return {
          csrfToken: resDb.rows[0].csrf_token,
          serverNow: this.clock.isoString(),
        };
      }
    }

    // Create a new anonymous session for CSRF bootstrap
    const token = generateOpaqueToken(32);
    const tokenHash = hashSha256(token);
    const csrfToken = generateOpaqueToken(24);
    const expiresAt = new Date(this.clock.now().getTime() + ANON_SESSION_TTL_MS);

    await this.db.authQuery(
      { tokenHash },
      `INSERT INTO auth_sessions (token_hash, csrf_token, is_mfa_challenge, expires_at)
       VALUES ($1, $2, FALSE, $3)`,
      [tokenHash, csrfToken, expiresAt],
    );

    this.setCookie(res, SESSION_COOKIE_NAME, token, ANON_SESSION_TTL_MS);

    return {
      csrfToken,
      serverNow: this.clock.isoString(),
    };
  }

  async login(req: Request, res: Response, body: { loginId: string; password?: string }) {
    if (!body.loginId || !body.password) {
      throw DomainException.authRequired('Invalid login credentials');
    }

    const userRes = await this.db.authQuery(
      { loginId: body.loginId.trim() },
      `SELECT u.id, u.school_id, u.login_id, u.display_name, u.role, u.password_hash, u.mfa_secret_enc, u.mfa_enrolled_at, u.status
       FROM users u JOIN schools sch ON sch.id = u.school_id
       WHERE u.login_id = $1 AND sch.status = 'active'`,
      [body.loginId.trim()],
    );

    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'active') {
      throw DomainException.authRequired('Invalid login credentials');
    }

    const user = userRes.rows[0];
    const passwordValid = await verifyPassword(user.password_hash, body.password);
    if (!passwordValid) {
      throw DomainException.authRequired('Invalid login credentials');
    }

    // Revoke old session cookie if present
    const oldCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (oldCookie) {
      const oldHash = hashSha256(oldCookie);
      await this.db.authQuery(
        { tokenHash: oldHash },
        `UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1`,
        [oldHash],
      );
    }

    // Create fresh session
    const newToken = generateOpaqueToken(32);
    const tokenHash = hashSha256(newToken);
    const newCsrf = generateOpaqueToken(24);

    if (user.role === 'school_admin') {
      // MFA challenge session
      const expiresAt = new Date(this.clock.now().getTime() + MFA_CHALLENGE_TTL_MS);
      await this.db.withTenantTransaction(user.school_id, async (client) => {
        const eligible = await client.query(
          `SELECT u.id FROM users u JOIN schools sch ON sch.id = u.school_id
           WHERE u.id = $1 AND u.school_id = $2 AND u.status = 'active' AND sch.status = 'active'
             AND u.role = 'school_admin' AND u.password_hash = $3
             AND u.mfa_enrolled_at IS NOT NULL AND u.mfa_secret_enc LIKE 'v1.%'
           FOR UPDATE OF u FOR SHARE OF sch`,
          [user.id, user.school_id, user.password_hash],
        );
        if (!eligible.rows[0])
          throw DomainException.authRequired('Administrator enrollment required');
        await client.query(
          `INSERT INTO auth_sessions (school_id, user_id, token_hash, csrf_token, is_mfa_challenge, expires_at)
           VALUES ($1, $2, $3, $4, TRUE, $5)`,
          [user.school_id, user.id, tokenHash, newCsrf, expiresAt],
        );
      });

      this.setCookie(res, SESSION_COOKIE_NAME, newToken, MFA_CHALLENGE_TTL_MS);

      return {
        status: 'mfa_required',
        csrfToken: newCsrf,
      };
    }

    // Student or Teacher session
    const expiresAt = new Date(this.clock.now().getTime() + AUTH_SESSION_TTL_MS);
    await this.db.tenantQuery(
      user.school_id,
      `INSERT INTO auth_sessions (
         school_id, user_id, token_hash, csrf_token, is_mfa_challenge, expires_at
       ) VALUES ($1, $2, $3, $4, FALSE, $5)`,
      [user.school_id, user.id, tokenHash, newCsrf, expiresAt],
    );

    this.setCookie(res, SESSION_COOKIE_NAME, newToken, AUTH_SESSION_TTL_MS);

    return {
      status: 'authenticated',
    };
  }

  async verifyMfa(req: Request, res: Response, body: unknown) {
    const cookie: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof cookie !== 'string' || !cookie)
      throw DomainException.authRequired('No active session');
    const result = await verifyAdminMfa(this.db, hashSha256(cookie), body, () => this.clock.now());
    if ('error' in result) {
      if (result.retryAfter) res.setHeader('Retry-After', result.retryAfter.toString());
      throw result.error;
    }
    this.setCookie(res, SESSION_COOKIE_NAME, result.token, AUTH_SESSION_TTL_MS);
    return { status: 'authenticated' };
  }

  async getMe(req: Request) {
    if (!req.sessionUser || !req.school) {
      throw DomainException.authRequired();
    }

    return {
      user: req.sessionUser,
      school: req.school,
      csrfToken: req.csrfToken,
      serverNow: this.clock.isoString(),
    };
  }

  async logout(req: Request, res: Response) {
    const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionCookie) {
      const tokenHash = hashSha256(sessionCookie);
      await this.db.authQuery(
        { tokenHash },
        `UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1`,
        [tokenHash],
      );
    }

    this.clearCookie(res, SESSION_COOKIE_NAME);
  }

  async registerDevice(req: Request, res: Response, body: unknown) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school) throw DomainException.authRequired();
    if (student.role !== 'student') throw DomainException.forbidden();
    const { deviceId } = parsePreparationInput(deviceRequestSchema, body);
    const credential = deviceCredential(req);

    const issued = await this.db.withTenantTransaction(school.id, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `browser-device:${deviceId}`,
      ]);
      let now = this.clock.now();
      const membership = await client.query(
        `SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id
         WHERE u.id = $1 AND u.school_id = $2 AND u.role = 'student'
           AND u.status = 'active' AND s.status = 'active'
         FOR SHARE OF u, s`,
        [student.id, school.id],
      );
      if (membership.rows.length === 0) throw DomainException.authRequired();
      const existing = await client.query<{
        credential_hash: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        'SELECT credential_hash, expires_at, revoked_at FROM browser_devices WHERE device_id = $1 FOR UPDATE',
        [deviceId],
      );
      now = this.clock.now();
      const browser = existing.rows[0];
      let token: string | undefined;
      let credentialHash: string;
      if (browser) {
        if (
          !credential ||
          hashSha256(credential) !== browser.credential_hash ||
          browser.revoked_at ||
          browser.expires_at <= now
        ) {
          throw DomainException.conflict(
            'DEVICE_REPLACED',
            'Use a new browser ID and request school assistance for an existing attempt',
          );
        }
        credentialHash = browser.credential_hash;
      } else {
        token = generateOpaqueToken(32);
        credentialHash = hashSha256(token);
        await client.query(
          `INSERT INTO browser_devices (device_id, credential_hash, expires_at, created_at)
           VALUES ($1, $2, $3, $4)`,
          [deviceId, credentialHash, new Date(now.getTime() + DEVICE_TTL_MS), now],
        );
      }
      await client.query(
        `INSERT INTO device_bindings (school_id, user_id, device_id, credential_hash, last_seen_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (school_id, user_id, device_id)
         DO NOTHING`,
        [school.id, student.id, deviceId, credentialHash, now],
      );
      return token;
    });
    if (issued) this.setCookie(res, deviceCookieName(), issued, DEVICE_TTL_MS);
    return { deviceId };
  }
}
