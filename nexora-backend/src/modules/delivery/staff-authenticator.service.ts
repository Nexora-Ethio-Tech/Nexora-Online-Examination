import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
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
import { parsePreparationInput as parse } from './preparation-schemas';

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
export class StaffAuthenticatorService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  async execute(req: Request, action: 'status' | 'begin' | 'confirm', input?: unknown) {
    if (!req.school || !req.sessionUser) throw DomainException.authRequired();
    const school = req.school.id,
      user = req.sessionUser;
    if (!['teacher', 'school_admin', 'invigilator'].includes(user.role))
      throw DomainException.forbidden();
    const body =
      action === 'begin'
        ? parse(z.object({ password: z.string().min(1).max(1024) }).strict(), input)
        : action === 'confirm'
          ? parse(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), input)
          : null;
    if (action !== 'status')
      await requestLimit(
        this.db,
        `staff-mfa:${school}:${user.id}:${action}`,
        action === 'begin' ? 3 : 5,
        300,
      );
    return this.db.withTenantTransaction(school, async (c) => {
      const row = (
        await c.query<Staff>(
          `SELECT login_id,role,password_hash,mfa_enrolled_at,mfa_secret_version,mfa_pending_secret_enc,mfa_pending_expires_at FROM users WHERE school_id=$1 AND id=$2 AND status='active' FOR UPDATE`,
          [school, user.id],
        )
      ).rows[0];
      if (!row || !['teacher', 'school_admin', 'invigilator'].includes(row.role))
        throw DomainException.forbidden();
      if (action === 'status')
        return {
          enrolled: !!row.mfa_enrolled_at,
          selfSetupAllowed: row.role !== 'school_admin' && !row.mfa_enrolled_at,
        };
      // Existing factors and administrator enrollment remain protected recovery operations.
      if (row.role === 'school_admin' || row.mfa_enrolled_at)
        throw DomainException.forbidden(
          'Use verified account recovery to replace an existing authenticator.',
        );
      const now = this.clock.now();
      if (action === 'begin' && body && 'password' in body) {
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
          `INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1::uuid,$2::uuid,'staff_mfa_setup_started',$2::text,'Staff verified password for first-time enrollment')`,
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
      if (!body || !('code' in body))
        throw DomainException.validationError('Confirmation code required.');
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
        `UPDATE users SET mfa_secret_enc=mfa_pending_secret_enc,mfa_enrolled_at=$3,mfa_pending_secret_enc=NULL,mfa_pending_expires_at=NULL WHERE school_id=$1 AND id=$2`,
        [school, user.id, now],
      );
      await c.query(
        `INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1::uuid,$2::uuid,'staff_mfa_setup_confirmed',$2::text,'Staff confirmed possession of authenticator')`,
        [school, user.id],
      );
      return { enrolled: true, selfSetupAllowed: false };
    });
  }
}
