import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { requestLimit } from '../../common/security/request-limit';
import { requireDeviceBinding } from '../../common/crypto/device-credential';
import { decryptMfaSecret, matchingTotpStep } from '../../common/crypto/mfa';
import { parsePreparationInput as parse, resourceIdSchema as uuid } from './preparation-schemas';
import { assertAssistanceMatches, assertAssistanceOpen } from './assistance-policy';

type Attempt = {
  id: string;
  session_id: string;
  student_id: string;
  device_id: string;
  device_generation: number;
  supervision_revision: number;
  state: string;
  suspended: boolean;
  assistance_paused: boolean;
  deadline_at: Date;
};
type Assistance = {
  id: string;
  attempt_id: string;
  student_id: string;
  device_generation: number;
  supervision_revision: number;
  state: 'pending' | 'approved' | 'rejected' | 'expired';
  expires_at: Date;
  requested_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  reason: string | null;
};
function identity(req: Request, student = false) {
  if (!req.school || !req.sessionUser) throw DomainException.authRequired();
  if (
    student
      ? req.sessionUser.role !== 'student'
      : !['teacher', 'school_admin', 'invigilator'].includes(req.sessionUser.role)
  )
    throw DomainException.forbidden();
  return { school: req.school.id, user: req.sessionUser };
}
function response(row: Assistance, now: Date, attempt?: Attempt) {
  const obsolete =
    attempt &&
    (row.device_generation !== attempt.device_generation ||
      row.supervision_revision !== attempt.supervision_revision ||
      !attempt.assistance_paused ||
      attempt.suspended ||
      attempt.state !== 'active' ||
      attempt.deadline_at <= now);
  return {
    id: row.id,
    attemptId: row.attempt_id,
    status: row.state === 'pending' && (row.expires_at <= now || obsolete) ? 'expired' : row.state,
    expiresAt: row.expires_at.toISOString(),
    reason: row.reason,
  };
}

@Injectable()
export class AssistanceService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  private async staff(c: PoolClient, school: string, userId: string) {
    const row = (
      await c.query<{
        role: string;
        mfa_secret_enc: string | null;
        mfa_secret_version: string | null;
        mfa_enrolled_at: Date | null;
      }>(
        `SELECT role,mfa_secret_enc,mfa_secret_version,mfa_enrolled_at FROM users
       WHERE school_id=$1 AND id=$2 AND status='active' AND role IN ('teacher','school_admin','invigilator')
       FOR UPDATE`,
        [school, userId],
      )
    ).rows[0];
    if (!row) throw DomainException.forbidden();
    return row;
  }

  private async assigned(
    c: PoolClient,
    school: string,
    session: string,
    staffId: string,
    role: string,
  ) {
    if (role === 'school_admin') return;
    const row = await c.query(
      `SELECT 1 FROM sitting_staff_assignments WHERE school_id=$1 AND session_id=$2
       AND staff_id=$3 AND active FOR SHARE`,
      [school, session, staffId],
    );
    if (!row.rows.length) throw DomainException.forbidden('You are not assigned to this sitting');
  }

  private async attempt(c: PoolClient, school: string, id: string) {
    const row = (
      await c.query<Attempt>('SELECT * FROM attempts WHERE school_id=$1 AND id=$2 FOR UPDATE', [
        school,
        id,
      ])
    ).rows[0];
    if (!row) throw DomainException.notFound();
    return row;
  }

  async sessions(req: Request) {
    const { school, user } = identity(req);
    return this.db.withTenantTransaction(school, async (c) => {
      const staff = await this.staff(c, school, user.id);
      const rows = await c.query<{ id: string; title: string; startsAt: Date }>(
        `SELECT s.id,e.title,s.starts_at AS "startsAt" FROM exam_sessions s
         JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id
         WHERE s.school_id=$1 AND ($2='school_admin' OR EXISTS(
           SELECT 1 FROM sitting_staff_assignments a WHERE a.school_id=s.school_id
           AND a.session_id=s.id AND a.staff_id=$3 AND a.active))
         ORDER BY s.starts_at DESC LIMIT 100`,
        [school, staff.role, user.id],
      );
      return {
        sessions: rows.rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString() })),
      };
    });
  }

  async assignments(req: Request, sessionId: string, input?: unknown) {
    const { school, user } = identity(req);
    if (user.role !== 'school_admin') throw DomainException.forbidden();
    parse(uuid, sessionId);
    const command =
      input === undefined
        ? undefined
        : parse(
            z
              .object({
                staffId: uuid,
                active: z.boolean(),
                expectedRevision: z.number().int().nonnegative(),
                reason: z.string().trim().min(1).max(500),
              })
              .strict(),
            input,
          );
    return this.db.withTenantTransaction(school, async (c) => {
      const acting = await this.staff(c, school, user.id);
      if (acting.role !== 'school_admin') throw DomainException.forbidden();
      if (
        !(
          await c.query('SELECT id FROM exam_sessions WHERE school_id=$1 AND id=$2', [
            school,
            sessionId,
          ])
        ).rows.length
      )
        throw DomainException.notFound();
      if (command) {
        // Serialize absent-row insertion and concurrent assignment edits.
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `assistance:${school}:${sessionId}:${command.staffId}`,
        ]);
        await this.staff(c, school, command.staffId);
        const existing = (
          await c.query<{ revision: number }>(
            'SELECT revision FROM sitting_staff_assignments WHERE school_id=$1 AND session_id=$2 AND staff_id=$3 FOR UPDATE',
            [school, sessionId, command.staffId],
          )
        ).rows[0];
        if ((existing?.revision ?? 0) !== command.expectedRevision)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Refresh staff assignments before changing them',
          );
        await c.query(
          `INSERT INTO sitting_staff_assignments(school_id,session_id,staff_id,active,revision) VALUES($1,$2,$3,$4,1)
           ON CONFLICT(school_id,session_id,staff_id) DO UPDATE
           SET active=EXCLUDED.active,revision=sitting_staff_assignments.revision+1`,
          [school, sessionId, command.staffId, command.active],
        );
        await c.query(
          'INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1,$2,$3,$4,$5)',
          [
            school,
            user.id,
            command.active ? 'sitting_staff_assigned' : 'sitting_staff_revoked',
            sessionId,
            `${command.staffId}: ${command.reason}`,
          ],
        );
      }
      const rows = await c.query(
        `SELECT u.id,u.display_name AS "displayName",u.role,(u.mfa_enrolled_at IS NOT NULL) AS "mfaEnrolled",
         COALESCE(a.active,false) AS active,COALESCE(a.revision,0) AS revision
         FROM users u LEFT JOIN sitting_staff_assignments a
         ON a.school_id=u.school_id AND a.staff_id=u.id AND a.session_id=$2
         WHERE u.school_id=$1 AND u.status='active' AND u.role IN ('teacher','school_admin','invigilator')
         ORDER BY u.display_name,u.id`,
        [school, sessionId],
      );
      return { staff: rows.rows };
    });
  }

  async student(req: Request, attemptId: string, input?: unknown) {
    const { school, user } = identity(req, true);
    parse(uuid, attemptId);
    const command =
      input === undefined
        ? undefined
        : parse(
            z
              .object({
                requestId: uuid,
                deviceGeneration: z.number().int().positive(),
              })
              .strict(),
            input,
          );
    if (command) await requestLimit(this.db, `assistance:${school}:${user.id}`, 10, 300);
    return this.db.withTenantTransaction(school, async (c) => {
      const a = await this.attempt(c, school, attemptId);
      if (a.student_id !== user.id) throw DomainException.notFound();
      await requireDeviceBinding(c, req, school, user.id, a.device_id, () => this.clock.now());
      const now = this.clock.now();
      if (command) {
        const old = (
          await c.query<Assistance>(
            'SELECT * FROM exam_assistance_requests WHERE school_id=$1 AND id=$2',
            [school, command.requestId],
          )
        ).rows[0];
        if (old) {
          if (
            old.attempt_id !== a.id ||
            old.student_id !== user.id ||
            old.device_generation !== command.deviceGeneration
          )
            throw DomainException.conflict('REVISION_CONFLICT', 'Request identifier was reused');
          return { paused: a.assistance_paused, request: response(old, now, a) };
        }
        assertAssistanceOpen(a, now);
        if (command.deviceGeneration !== a.device_generation)
          throw DomainException.conflict('DEVICE_REPLACED', 'Revalidate this workstation first');
        await c.query(
          `UPDATE exam_assistance_requests SET state='expired' WHERE school_id=$1 AND attempt_id=$2
           AND state='pending' AND (expires_at<=$3 OR device_generation<>$4 OR supervision_revision<>$5)`,
          [school, a.id, now, a.device_generation, a.supervision_revision],
        );
        const pending = (
          await c.query<Assistance>(
            "SELECT * FROM exam_assistance_requests WHERE school_id=$1 AND attempt_id=$2 AND state='pending'",
            [school, a.id],
          )
        ).rows[0];
        if (pending) return { paused: a.assistance_paused, request: response(pending, now) };
        const expires = new Date(Math.min(now.getTime() + 5 * 60_000, a.deadline_at.getTime()));
        const created = (
          await c.query<Assistance>(
            `INSERT INTO exam_assistance_requests(id,school_id,attempt_id,student_id,device_generation,
           supervision_revision,state,requested_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8) RETURNING *`,
            [
              command.requestId,
              school,
              a.id,
              user.id,
              a.device_generation,
              a.supervision_revision + 1,
              now,
              expires,
            ],
          )
        ).rows[0];
        await c.query(
          'UPDATE attempts SET assistance_paused=true,supervision_revision=supervision_revision+1 WHERE school_id=$1 AND id=$2',
          [school, a.id],
        );
        return { paused: true, request: response(created, now) };
      }
      const latest = (
        await c.query<Assistance>(
          'SELECT * FROM exam_assistance_requests WHERE school_id=$1 AND attempt_id=$2 ORDER BY requested_at DESC,id DESC LIMIT 1',
          [school, a.id],
        )
      ).rows[0];
      return { paused: a.assistance_paused, request: latest ? response(latest, now, a) : null };
    });
  }

  async inbox(req: Request, sessionId: string) {
    const { school, user } = identity(req);
    parse(uuid, sessionId);
    return this.db.withTenantTransaction(school, async (c) => {
      const staff = await this.staff(c, school, user.id);
      await this.assigned(c, school, sessionId, user.id, staff.role);
      const rows = await c.query<
        Assistance & { displayName: string; loginId: string; deviceGeneration: number }
      >(
        `SELECT r.*,u.display_name AS "displayName",u.login_id AS "loginId",r.device_generation AS "deviceGeneration"
         FROM exam_assistance_requests r JOIN attempts a ON a.school_id=r.school_id AND a.id=r.attempt_id
         JOIN users u ON u.school_id=r.school_id AND u.id=r.student_id
         WHERE r.school_id=$1 AND a.session_id=$2 AND r.state='pending' AND r.expires_at>$3
         AND r.device_generation=a.device_generation AND r.supervision_revision=a.supervision_revision
         AND a.assistance_paused AND NOT a.suspended AND a.state='active' AND a.deadline_at>$3
         ORDER BY r.requested_at LIMIT 200`,
        [school, sessionId, this.clock.now()],
      );
      return {
        requests: rows.rows.map((r) => ({
          ...response(r, this.clock.now()),
          displayName: r.displayName,
          loginId: r.loginId,
          deviceGeneration: r.deviceGeneration,
        })),
      };
    });
  }

  async decide(req: Request, id: string, input: unknown) {
    const { school, user } = identity(req);
    parse(uuid, id);
    const command = parse(
      z
        .object({
          action: z.enum(['approve', 'reject']),
          reason: z.string().trim().min(1).max(500),
          code: z.string().regex(/^\d{6}$/),
        })
        .strict(),
      input,
    );
    // Charged outside the transaction so failed codes cannot roll back the attempt limit.
    await requestLimit(this.db, `assistance-decision:${school}:${user.id}`, 5, 60);
    return this.db.withTenantTransaction(school, async (c) => {
      const staff = await this.staff(c, school, user.id);
      const found = (
        await c.query<Assistance>(
          'SELECT * FROM exam_assistance_requests WHERE school_id=$1 AND id=$2',
          [school, id],
        )
      ).rows[0];
      if (!found) throw DomainException.notFound();
      const lookup = (
        await c.query<{ session_id: string }>(
          'SELECT session_id FROM attempts WHERE school_id=$1 AND id=$2',
          [school, found.attempt_id],
        )
      ).rows[0];
      if (!lookup) throw DomainException.notFound();
      await this.assigned(c, school, lookup.session_id, user.id, staff.role);
      const a = await this.attempt(c, school, found.attempt_id);
      const row = (
        await c.query<Assistance>(
          'SELECT * FROM exam_assistance_requests WHERE school_id=$1 AND id=$2 FOR UPDATE',
          [school, id],
        )
      ).rows[0];
      const now = this.clock.now();
      const desired = command.action === 'approve' ? 'approved' : 'rejected';
      if (row.state !== 'pending') {
        if (row.state === desired && row.decided_by === user.id && row.reason === command.reason)
          return response(row, now);
        throw DomainException.conflict('REVISION_CONFLICT', 'Request already decided');
      }
      assertAssistanceOpen(a, now);
      assertAssistanceMatches(a, row, now);
      if (!staff.mfa_enrolled_at || !staff.mfa_secret_enc || !staff.mfa_secret_version)
        throw DomainException.forbidden(
          'Complete authenticator setup on your staff page before approving assistance',
        );
      const secret = decryptMfaSecret(staff.mfa_secret_enc, {
        schoolId: school,
        userId: user.id,
        version: staff.mfa_secret_version,
      });
      const step = matchingTotpStep(secret, command.code, now);
      if (step === undefined)
        throw DomainException.forbidden('Incorrect or expired authenticator code');
      const consumed = await c.query(
        `INSERT INTO mfa_consumed_steps(school_id,user_id,secret_version,step,consumed_at)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING step`,
        [school, user.id, staff.mfa_secret_version, step, now],
      );
      if (!consumed.rows.length)
        throw DomainException.conflict('REVISION_CONFLICT', 'Use a fresh authenticator code');
      if (command.action === 'approve')
        await c.query(
          'UPDATE attempts SET assistance_paused=false,supervision_revision=supervision_revision+1 WHERE school_id=$1 AND id=$2',
          [school, a.id],
        );
      const result = (
        await c.query<Assistance>(
          `UPDATE exam_assistance_requests SET state=$3,decided_by=$4,decided_at=$5,reason=$6
         WHERE school_id=$1 AND id=$2 RETURNING *`,
          [school, id, desired, user.id, now, command.reason],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1,$2,$3,$4,$5)',
        [school, user.id, `assistance_${desired}`, id, command.reason],
      );
      return response(result, now);
    });
  }
}
