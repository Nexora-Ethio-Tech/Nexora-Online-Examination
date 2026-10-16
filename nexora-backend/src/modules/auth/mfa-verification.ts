import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { DomainException } from '../../common/errors/domain.exception';
import { generateOpaqueToken, hashSha256 } from '../../common/crypto/password';
import {
  decryptMfaSecret,
  matchingTotpStep,
  MFA_MAX_FAILURES,
  MFA_WINDOW_MS,
} from '../../common/crypto/mfa';

type Outcome = { token: string } | { error: DomainException; retryAfter?: number };
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export async function verifyAdminMfa(
  db: DbService,
  tokenHash: string,
  body: unknown,
  now: () => Date,
): Promise<Outcome> {
  return db.withAuthTransaction({ tokenHash }, async (client): Promise<Outcome> => {
    const lookup = await client.query<{ user_id: string; school_id: string }>(
      'SELECT user_id, school_id FROM auth_sessions WHERE token_hash = $1 AND is_mfa_challenge = TRUE',
      [tokenHash],
    );
    const identity = lookup.rows[0];
    if (!identity?.user_id || !identity.school_id)
      return { error: DomainException.authRequired('Invalid MFA challenge') };
    await client.query("SELECT set_config('app.current_school_id', $1, true)", [
      identity.school_id,
    ]);
    // Enrollment/recovery takes this same user lock before revoking sessions.
    const users = await client.query<{
      status: string;
      role: string;
      mfa_secret_enc: string | null;
      mfa_secret_version: string;
      mfa_enrolled_at: Date | null;
      mfa_failed_attempts: number;
      mfa_window_started_at: Date | null;
    }>(
      'SELECT status, role, mfa_secret_enc, mfa_secret_version, mfa_enrolled_at, mfa_failed_attempts, mfa_window_started_at FROM users WHERE id = $1 AND school_id = $2 FOR UPDATE',
      [identity.user_id, identity.school_id],
    );
    const sessions = await client.query<{
      id: string;
      expires_at: Date;
      revoked_at: Date | null;
      is_mfa_challenge: boolean;
    }>(
      'SELECT id, expires_at, revoked_at, is_mfa_challenge FROM auth_sessions WHERE token_hash = $1 FOR UPDATE',
      [tokenHash],
    );
    const schools = await client.query<{ status: string }>(
      'SELECT status FROM schools WHERE id = $1 FOR SHARE',
      [identity.school_id],
    );
    const user = users.rows[0];
    const session = sessions.rows[0];
    const time = now();
    if (
      !user ||
      !session ||
      session.revoked_at ||
      !session.is_mfa_challenge ||
      session.expires_at <= time ||
      user.status !== 'active' ||
      user.role !== 'school_admin' ||
      !user.mfa_enrolled_at ||
      !user.mfa_secret_enc ||
      schools.rows[0]?.status !== 'active'
    ) {
      return { error: DomainException.authRequired('Invalid or expired MFA challenge') };
    }
    const windowStart = user.mfa_window_started_at;
    const inWindow = windowStart !== null && time.getTime() < windowStart.getTime() + MFA_WINDOW_MS;
    const failures = inWindow ? user.mfa_failed_attempts : 0;
    if (failures >= MFA_MAX_FAILURES && windowStart) {
      return {
        error: new DomainException(
          HttpStatus.TOO_MANY_REQUESTS,
          'RATE_LIMITED',
          'Too many MFA attempts. Try again later.',
        ),
        retryAfter: Math.max(
          1,
          Math.ceil((windowStart.getTime() + MFA_WINDOW_MS - time.getTime()) / 1000),
        ),
      };
    }
    const parsed = codeSchema.safeParse(body);
    let secret: string;
    try {
      secret = decryptMfaSecret(user.mfa_secret_enc, {
        schoolId: identity.school_id,
        userId: identity.user_id,
        version: user.mfa_secret_version,
      });
    } catch {
      return {
        error: new DomainException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'TEMPORARILY_UNAVAILABLE',
          'MFA verification is temporarily unavailable.',
        ),
      };
    }
    const step = parsed.success ? matchingTotpStep(secret, parsed.data.code, time) : undefined;
    const consumed =
      step === undefined
        ? { rowCount: 0 }
        : await client.query(
            `INSERT INTO mfa_consumed_steps (school_id, user_id, secret_version, step, consumed_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING step`,
            [identity.school_id, identity.user_id, user.mfa_secret_version, step, time],
          );
    if (!consumed.rowCount) {
      // Return errors after commit so failed attempts survive process restarts.
      await client.query(
        'UPDATE users SET mfa_failed_attempts = $1, mfa_window_started_at = $2 WHERE id = $3 AND school_id = $4',
        [failures + 1, inWindow ? windowStart : time, identity.user_id, identity.school_id],
      );
      return {
        error: DomainException.validationError('Invalid MFA verification code', [
          { path: 'code', message: 'Incorrect or previously used TOTP code.' },
        ]),
      };
    }
    await client.query('UPDATE auth_sessions SET revoked_at = $1 WHERE id = $2', [
      time,
      session.id,
    ]);
    await client.query(
      'UPDATE users SET mfa_failed_attempts = 0, mfa_window_started_at = NULL WHERE id = $1 AND school_id = $2',
      [identity.user_id, identity.school_id],
    );
    const token = generateOpaqueToken(32);
    await client.query(
      `INSERT INTO auth_sessions (school_id, user_id, token_hash, csrf_token, is_mfa_challenge, mfa_verified_at, expires_at)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [
        identity.school_id,
        identity.user_id,
        hashSha256(token),
        generateOpaqueToken(24),
        time,
        new Date(time.getTime() + 7 * 24 * 60 * 60 * 1000),
      ],
    );
    await client.query(
      "INSERT INTO audit_events (school_id, actor_id, action, resource_id) VALUES ($1, $2, 'admin_mfa_verified', $3)",
      [identity.school_id, identity.user_id, identity.user_id],
    );
    return { token };
  });
}
