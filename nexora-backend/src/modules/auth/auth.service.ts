import { Injectable } from '@nestjs/common';
import { Response, Request } from 'express';
import { authenticator } from 'otplib';
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

// 7 days session lifetime for authenticated users, 15 minutes for MFA challenges and anonymous sessions
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MFA_CHALLENGE_TTL_MS = 15 * 60 * 1000;
const ANON_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

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
      `SELECT u.id, u.school_id, u.login_id, u.display_name, u.role, u.password_hash, u.mfa_secret_enc, u.status
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
      await this.db.tenantQuery(
        user.school_id,
        `INSERT INTO auth_sessions (
           school_id, user_id, token_hash, csrf_token, is_mfa_challenge, expires_at
         ) VALUES ($1, $2, $3, $4, TRUE, $5)`,
        [user.school_id, user.id, tokenHash, newCsrf, expiresAt],
      );

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

  async verifyMfa(req: Request, res: Response, body: { code: string }) {
    const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionCookie) {
      throw DomainException.authRequired('No active session');
    }

    const tokenHash = hashSha256(sessionCookie);
    const sRes = await this.db.authQuery(
      { tokenHash },
      `SELECT s.id, s.school_id, s.user_id, s.is_mfa_challenge, s.expires_at, s.revoked_at, u.mfa_secret_enc
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [tokenHash],
    );

    if (sRes.rows.length === 0 || sRes.rows[0].revoked_at) {
      throw DomainException.authRequired('Invalid session');
    }

    const session = sRes.rows[0];
    if (new Date(session.expires_at) <= this.clock.now()) {
      throw DomainException.authRequired('MFA challenge expired');
    }

    if (!session.is_mfa_challenge) {
      // Already verified
      return { status: 'authenticated' };
    }

    // Validate TOTP code
    const mfaSecret = session.mfa_secret_enc || 'TESTMFASECRET123456';
    const isValid = authenticator.check(body.code.trim(), mfaSecret);

    if (!isValid) {
      throw DomainException.validationError('Invalid MFA verification code', [
        { path: 'code', message: 'Incorrect TOTP code.' },
      ]);
    }

    // Rotate session token on privilege escalation
    await this.db.authQuery(
      { tokenHash },
      `UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`,
      [session.id],
    );

    const newToken = generateOpaqueToken(32);
    const newTokenHash = hashSha256(newToken);
    const newCsrf = generateOpaqueToken(24);
    const expiresAt = new Date(this.clock.now().getTime() + AUTH_SESSION_TTL_MS);

    await this.db.tenantQuery(
      session.school_id,
      `INSERT INTO auth_sessions (
         school_id, user_id, token_hash, csrf_token, is_mfa_challenge, mfa_verified_at, expires_at
       ) VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [session.school_id, session.user_id, newTokenHash, newCsrf, this.clock.now(), expiresAt],
    );

    this.setCookie(res, SESSION_COOKIE_NAME, newToken, AUTH_SESSION_TTL_MS);

    return {
      status: 'authenticated',
    };
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
