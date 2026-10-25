import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { hashSha256 } from '../../common/crypto/password';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { requestLimit } from '../../common/security/request-limit';
import { verifyPassword } from '../../common/crypto/password';
import {
  newMfaSecret,
  encryptMfaSecret,
  decryptMfaSecret,
  matchingTotpStep,
  MFA_WINDOW_MS,
} from '../../common/crypto/mfa';
import { parsePreparationInput as parse } from '../delivery/preparation-schemas';

type Staff = {
  login_id: string;
  role: string;
  password_hash: string | null;
  mfa_enrolled_at: Date | null;
  mfa_secret_version: string;
  mfa_pending_secret_enc: string | null;
  mfa_pending_expires_at: Date | null;
};

@Injectable()
export class AdminEnrollmentService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  async execute(req: Request, action: 'begin' | 'confirm', input: unknown) {
    const body = parse(
      z
        .object({
          token: z.string().min(40).max(100),
          loginId: z.string().min(1).max(100),
          password: z.string().min(1).max(1024),
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .strict(),
      input,
    );
    const tokenHash = hashSha256(body.token);
    await requestLimit(this.db, 'admin-enrollment-ip:' + req.ip, 20, 300);
    await requestLimit(this.db, 'admin-enrollment:' + tokenHash, 5, 300);
    const target = (
      await this.db.query<{ school_id: string; user_id: string }>(
        'SELECT * FROM public.nexora_enrollment_target($1)',
        [tokenHash],
      )
    ).rows[0];
    if (!target)
      throw DomainException.forbidden(
        'Setup link is invalid or expired. Ask the platform owner for a new invitation.',
      );
    const school = target.school_id,
      user = { id: target.user_id };
    return this.db.withTenantTransaction(school, async (c) => {
      const invite = (
        await c.query(
          'SELECT token_hash FROM admin_enrollment_invites WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2 FOR UPDATE',
          [tokenHash, this.clock.now()],
        )
      ).rows[0];
      if (!invite) throw DomainException.forbidden('Setup link is invalid or expired.');
      const row = (
        await c.query<Staff>(
          `SELECT login_id,role,password_hash,mfa_enrolled_at,mfa_secret_version,mfa_pending_secret_enc,mfa_pending_expires_at FROM users WHERE school_id=$1 AND id=$2 AND status='inactive' AND role='school_admin' AND EXISTS(SELECT 1 FROM schools WHERE id=$1 AND status='active') FOR UPDATE`,
          [school, user.id],
        )
      ).rows[0];
      if (
        !row ||
        row.role !== 'school_admin' ||
        row.mfa_enrolled_at ||
        row.login_id !== body.loginId ||
        !row.password_hash ||
        !(await verifyPassword(row.password_hash, body.password))
      )
        throw DomainException.forbidden('Credentials could not be verified.');
      const now = this.clock.now();
      if (action === 'begin') {
        if (!row.password_hash || !(await verifyPassword(row.password_hash, body.password)))
          throw DomainException.forbidden('Password could not be verified.');
        const secret = newMfaSecret(),
          version = randomUUID();
        const expiresAt = new Date(now.getTime() + MFA_WINDOW_MS);
        await c.query(
          `UPDATE users SET mfa_secret_version=$3,mfa_pending_secret_enc=$4,mfa_pending_expires_at=$5 WHERE school_id=$1 AND id=$2`,
          [
            school,
            user.id,
            version,
            encryptMfaSecret(secret, { schoolId: school, userId: user.id, version }),
            expiresAt,
          ],
        );
        await c.query(
          `INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1::uuid,$2::uuid,'admin_mfa_setup_started',$2::text,'Staff verified password for first-time enrollment')`,
          [school, user.id],
        );
        return {
          secret,
          otpauthUri: `otpauth://totp/${encodeURIComponent(`Nexora:${row.login_id}`)}?secret=${secret}&issuer=Nexora&algorithm=SHA1&digits=6&period=30`,
          expiresAt: expiresAt.toISOString(),
        };
      }
      if (
        !row.mfa_pending_secret_enc ||
        !row.mfa_pending_expires_at ||
        row.mfa_pending_expires_at <= now
      )
        throw DomainException.validationError('Setup expired. Start authenticator setup again.');
      if (!body.code) throw DomainException.validationError('Confirmation code required.');
      const secret = decryptMfaSecret(row.mfa_pending_secret_enc, {
        schoolId: school,
        userId: user.id,
        version: row.mfa_secret_version,
      });
      const step = matchingTotpStep(secret, body.code, now);
      if (step === undefined)
        throw DomainException.forbidden('Incorrect or expired authenticator code.');
      const consumed = await c.query(
        `INSERT INTO mfa_consumed_steps(school_id,user_id,secret_version,step,consumed_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING step`,
        [school, user.id, row.mfa_secret_version, step, now],
      );
      if (!consumed.rowCount)
        throw DomainException.forbidden('Code already used. Wait for a fresh code.');
      await c.query(
        `UPDATE users SET status='active',mfa_secret_enc=mfa_pending_secret_enc,mfa_enrolled_at=$3,mfa_pending_secret_enc=NULL,mfa_pending_expires_at=NULL WHERE school_id=$1 AND id=$2`,
        [school, user.id, now],
      );
      await c.query(
        `INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1::uuid,$2::uuid,'admin_mfa_setup_confirmed',$2::text,'Staff confirmed possession of authenticator')`,
        [school, user.id],
      );
      await c.query('UPDATE admin_enrollment_invites SET consumed_at=$2 WHERE token_hash=$1', [
        tokenHash,
        now,
      ]);
      return { enrolled: true };
    });
  }
}
