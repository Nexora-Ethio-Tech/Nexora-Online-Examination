import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { generateOpaqueToken, hashPassword } from '../../common/crypto/password';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  matchingTotpStep,
  MFA_MAX_FAILURES,
  MFA_WINDOW_MS,
  newMfaSecret,
} from '../../common/crypto/mfa';

const operatorSchema = z
  .object({
    schoolId: z.string().uuid(),
    userId: z.string().uuid(),
    operator: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type MfaOperatorContext = z.infer<typeof operatorSchema>;

const bootstrapSchema = z
  .object({
    schoolName: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    loginId: z.string().trim().min(1).max(100),
    displayName: z.string().trim().min(1).max(200),
    operator: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export async function bootstrapMfaAdministrator(
  pool: Pool,
  input: z.infer<typeof bootstrapSchema>,
) {
  const context = bootstrapSchema.parse(input);
  const schoolId = randomUUID();
  const userId = randomUUID();
  const password = generateOpaqueToken(24);
  const passwordHash = await hashPassword(password);
  return transaction(pool, async (client) => {
    await client.query('INSERT INTO schools (id, name, slug) VALUES ($1, $2, $3)', [
      schoolId,
      context.schoolName,
      context.slug,
    ]);
    await client.query(
      `INSERT INTO users (id, school_id, login_id, display_name, role, password_hash, status)
       VALUES ($1, $2, $3, $4, 'school_admin', $5, 'inactive')`,
      [userId, schoolId, context.loginId, context.displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO audit_events (school_id, action, resource_id, reason, operator_identity)
       VALUES ($1, 'school_first_admin_created', $2, $3, $4)`,
      [schoolId, userId, context.reason, context.operator],
    );
    return { schoolId, userId, password };
  });
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roles = await client.query<{ allowed: boolean }>(
      'SELECT rolsuper OR rolbypassrls AS allowed FROM pg_roles WHERE rolname = current_user',
    );
    if (!roles.rows[0]?.allowed) throw new Error('Protected migration credentials are required');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function beginMfaEnrollment(
  pool: Pool,
  input: MfaOperatorContext,
  recovery: boolean,
  now: () => Date,
) {
  const context = operatorSchema.parse(input);
  return transaction(pool, async (client) => {
    const users = await client.query<{ login_id: string; mfa_enrolled_at: Date | null }>(
      `SELECT login_id, mfa_enrolled_at FROM users WHERE id = $1 AND school_id = $2 AND role IN ('school_admin','teacher') FOR UPDATE`,
      [context.userId, context.schoolId],
    );
    const user = users.rows[0];
    if (!user) throw new Error('Staff account not found in this school');
    if (user.mfa_enrolled_at && !recovery)
      throw new Error('Already enrolled; verified recovery is required');
    const time = now();
    const secret = newMfaSecret();
    const version = randomUUID();
    const encrypted = encryptMfaSecret(secret, { ...context, version });
    await client.query(
      `UPDATE users SET status = 'inactive', mfa_secret_enc = NULL, mfa_enrolled_at = NULL,
       mfa_pending_secret_enc = $1, mfa_pending_expires_at = $2, mfa_secret_version = $3,
       mfa_failed_attempts = 0, mfa_window_started_at = NULL WHERE id = $4 AND school_id = $5`,
      [
        encrypted,
        new Date(time.getTime() + MFA_WINDOW_MS),
        version,
        context.userId,
        context.schoolId,
      ],
    );
    await client.query(
      'UPDATE auth_sessions SET revoked_at = $1 WHERE user_id = $2 AND school_id = $3 AND revoked_at IS NULL',
      [time, context.userId, context.schoolId],
    );
    await client.query(
      `INSERT INTO audit_events (school_id, action, resource_id, reason, operator_identity)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        context.schoolId,
        recovery ? 'admin_mfa_recovery_started' : 'admin_mfa_enrollment_started',
        context.userId,
        context.reason,
        context.operator,
      ],
    );
    const uri = `otpauth://totp/${encodeURIComponent(`Nexora:${user.login_id}`)}?secret=${secret}&issuer=Nexora&algorithm=SHA1&digits=6&period=30`;
    return { secret, uri };
  });
}

export async function confirmMfaEnrollment(
  pool: Pool,
  input: MfaOperatorContext,
  code: string,
  now: () => Date,
): Promise<boolean> {
  const context = operatorSchema.parse(input);
  return transaction(pool, async (client) => {
    const users = await client.query<{
      mfa_pending_secret_enc: string | null;
      mfa_pending_expires_at: Date | null;
      mfa_secret_version: string;
      mfa_failed_attempts: number;
    }>(
      `SELECT mfa_pending_secret_enc, mfa_pending_expires_at, mfa_secret_version, mfa_failed_attempts
        FROM users WHERE id = $1 AND school_id = $2 AND role IN ('school_admin','teacher') FOR UPDATE`,
      [context.userId, context.schoolId],
    );
    const user = users.rows[0];
    const time = now();
    if (
      !user?.mfa_pending_secret_enc ||
      !user.mfa_pending_expires_at ||
      user.mfa_pending_expires_at <= time ||
      user.mfa_failed_attempts >= MFA_MAX_FAILURES
    ) {
      throw new Error('Enrollment absent, expired or locked; restart protected enrollment');
    }
    const schools = await client.query<{ status: string }>(
      'SELECT status FROM schools WHERE id = $1 FOR SHARE',
      [context.schoolId],
    );
    if (schools.rows[0]?.status !== 'active') throw new Error('School is inactive');
    const secret = decryptMfaSecret(user.mfa_pending_secret_enc, {
      ...context,
      version: user.mfa_secret_version,
    });
    const step = matchingTotpStep(secret, code, time);
    if (step === undefined) {
      await client.query(
        'UPDATE users SET mfa_failed_attempts = mfa_failed_attempts + 1 WHERE id = $1 AND school_id = $2',
        [context.userId, context.schoolId],
      );
      return false;
    }
    await client.query(
      'INSERT INTO mfa_consumed_steps (school_id, user_id, secret_version, step, consumed_at) VALUES ($1, $2, $3, $4, $5)',
      [context.schoolId, context.userId, user.mfa_secret_version, step, time],
    );
    await client.query(
      `UPDATE users SET status = 'active', mfa_secret_enc = mfa_pending_secret_enc,
       mfa_pending_secret_enc = NULL, mfa_pending_expires_at = NULL, mfa_enrolled_at = $1,
       mfa_failed_attempts = 0, mfa_window_started_at = NULL WHERE id = $2 AND school_id = $3`,
      [time, context.userId, context.schoolId],
    );
    await client.query(
      `INSERT INTO audit_events (school_id, action, resource_id, reason, operator_identity)
       VALUES ($1, 'admin_mfa_enrollment_confirmed', $2, $3, $4)`,
      [context.schoolId, context.userId, context.reason, context.operator],
    );
    return true;
  });
}
