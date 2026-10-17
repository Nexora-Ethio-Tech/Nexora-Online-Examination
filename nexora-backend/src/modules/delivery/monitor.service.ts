import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { identity, readinessInput } from './operational.service';
import { parsePreparationInput as parse, resourceIdSchema as uuid } from './preparation-schemas';

const querySchema = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    cursor: z.string().min(1).max(2000).optional(),
  })
  .strict();
const reportSchema = readinessInput
  .extend({ acknowledgementId: uuid, receivedAt: z.string().datetime() })
  .strict();
const cursorSchema = z
  .object({ scope: z.string(), id: uuid, time: z.string().datetime().optional() })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;
type Sitting = {
  id: string;
  exam_id: string;
  title: string;
  class_name: string;
  subject_name: string;
  preparation_visible_at: Date;
  starts_at: Date;
  ends_at: Date;
  schedule_revision: number;
};
type Roster = {
  student_id: string;
  login_id: string;
  display_name: string;
  deadline_at: Date;
  attempt_id: string | null;
  state:
    | 'preparing'
    | 'active'
    | 'awaiting_upload'
    | 'recovery_pending'
    | 'submitted'
    | 'invalidated'
    | null;
  device_generation: number | null;
  exam_version: number | null;
  schedule_revision: number | null;
  last_contact_at: Date | null;
  last_server_save_at: Date | null;
  answered: number;
  accepted_at: Date | null;
  recovery_id: string | null;
  current_readiness: unknown;
  package_id: string | null;
  sha256_hex: string | null;
  user_status: string;
  admission_status: string;
};
const sittingSelect = `SELECT s.*,e.title,c.name class_name,sub.name subject_name FROM exam_sessions s JOIN exams e ON e.id=s.exam_id AND e.school_id=s.school_id JOIN classes c ON c.id=e.class_id AND c.school_id=e.school_id JOIN subjects sub ON sub.id=e.subject_id AND sub.school_id=e.school_id`;
const iso = (value: Date | null) => value?.toISOString() ?? null;

@Injectable()
export class MonitorService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  private sign(value: string) {
    const key = process.env.MFA_ENCRYPTION_KEY;
    if (!key) throw new Error('MFA encryption key required');
    return createHmac('sha256', key).update(value).digest('base64url');
  }
  private encode(value: Cursor) {
    const text = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${text}.${this.sign(text)}`;
  }
  private decode(value: string | undefined, scope: string) {
    if (!value) return null;
    try {
      const [text, signature, ...extra] = value.split('.');
      const expected = Buffer.from(this.sign(text));
      const actual = Buffer.from(signature ?? '');
      if (extra.length || actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error();
      const parsed = cursorSchema.parse(JSON.parse(Buffer.from(text, 'base64url').toString()));
      if (parsed.scope !== scope) throw new Error();
      return parsed;
    } catch {
      throw DomainException.validationError('Invalid cursor for this resource');
    }
  }

  private async rows(client: PoolClient, school: string, sitting: Sitting) {
    return (
      await client.query<Roster>(
        `SELECT sr.student_id,u.login_id,u.display_name,u.status user_status,sr.admission_status,
    COALESCE(a.deadline_at,$3::timestamptz+sr.extra_time_minutes*interval '1 minute') deadline_at,
    a.id attempt_id,a.state,a.device_generation,a.exam_version,a.schedule_revision,a.last_contact_at,a.last_server_save_at,a.current_readiness,
    (SELECT count(*)::int FROM attempt_answers ans WHERE ans.school_id=sr.school_id AND ans.attempt_id=a.id AND ans.value IS NOT NULL) answered,
    sub.accepted_at,(SELECT r.id FROM recovery_uploads r WHERE r.school_id=sr.school_id AND r.attempt_id=a.id AND r.status='recovery_pending' ORDER BY r.received_at DESC,r.id LIMIT 1) recovery_id,
    p.id package_id,p.sha256_hex
   FROM session_roster sr JOIN users u ON u.id=sr.student_id AND u.school_id=sr.school_id
   LEFT JOIN attempts a ON a.session_id=sr.session_id AND a.student_id=sr.student_id AND a.school_id=sr.school_id
   LEFT JOIN submissions sub ON sub.attempt_id=a.id AND sub.school_id=sr.school_id
   JOIN exam_sessions es ON es.id=sr.session_id AND es.school_id=sr.school_id
   LEFT JOIN exam_packages p ON p.exam_version_id=es.exam_version_id AND p.school_id=sr.school_id
   WHERE sr.school_id=$1 AND sr.session_id=$2 ORDER BY sr.student_id`,
        [school, sitting.id, sitting.ends_at],
      )
    ).rows;
  }

  private row(row: Roster, now: Date) {
    if ((row.state === 'submitted') !== (row.accepted_at !== null))
      throw new Error('Attempt and committed receipt disagree');
    const status:
      'not_started' | 'preparing' | 'active' | 'submitted' | 'recovery_needed' | 'invalidated' =
      !row.attempt_id
        ? 'not_started'
        : row.state === 'submitted'
          ? 'submitted'
          : row.state === 'invalidated'
            ? 'invalidated'
            : row.state === 'awaiting_upload' ||
                row.state === 'recovery_pending' ||
                now >= row.deadline_at
              ? 'recovery_needed'
              : row.state === 'active'
                ? 'active'
                : 'preparing';
    const parsed = reportSchema.safeParse(row.current_readiness);
    const ready =
      parsed.success &&
      parsed.data.deviceGeneration === row.device_generation &&
      parsed.data.examVersion === row.exam_version &&
      parsed.data.scheduleRevision === row.schedule_revision &&
      parsed.data.packageId === row.package_id &&
      parsed.data.sha256 === row.sha256_hex
        ? parsed.data
        : null;
    return {
      studentId: row.student_id,
      loginId: row.login_id,
      studentName: row.display_name,
      deadlineAt: row.deadline_at.toISOString(),
      status,
      attempt: row.attempt_id
        ? {
            attemptId: row.attempt_id,
            readiness: ready,
            state: row.state,
            deviceGeneration: row.device_generation,
            lastContactAt: iso(row.last_contact_at),
            lastServerSaveAt: iso(row.last_server_save_at),
            serverAnsweredCount: row.answered,
            receiptAcceptedAt: iso(row.accepted_at),
            recoveryId: row.recovery_id,
          }
        : null,
    };
  }
  private summary(s: Sitting, rows: Roster[], now: Date) {
    const counts = {
      not_started: 0,
      preparing: 0,
      active: 0,
      submitted: 0,
      recovery_needed: 0,
      invalidated: 0,
    };
    let readyCount = 0;
    for (const row of rows) {
      const mapped = this.row(row, now);
      counts[mapped.status]++;
      if (mapped.status === 'preparing' && mapped.attempt?.readiness) readyCount++;
    }
    return {
      sessionId: s.id,
      examId: s.exam_id,
      title: s.title,
      className: s.class_name,
      subjectName: s.subject_name,
      preparationVisibleAt: s.preparation_visible_at.toISOString(),
      startsAt: s.starts_at.toISOString(),
      endsAt: s.ends_at.toISOString(),
      latestDeadlineAt: new Date(
        Math.max(s.ends_at.getTime(), ...rows.map((r) => r.deadline_at.getTime())),
      ).toISOString(),
      scheduleRevision: s.schedule_revision,
      rosterCount: rows.length,
      readyCount,
      counts,
    };
  }
  async list(req: Request, input: unknown) {
    const { school } = identity(req, 'school_admin'),
      q = parse(querySchema, input),
      limit = q.limit ?? 25,
      scope = `${school.id}:monitor:list`,
      cursor = this.decode(q.cursor, scope);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const now = this.clock.now();
        const sessions = (
          await c.query<Sitting>(
            `${sittingSelect} WHERE s.school_id=$1 ${cursor ? 'AND (s.starts_at<$3 OR (s.starts_at=$3 AND s.id>$4))' : ''} ORDER BY s.starts_at DESC,s.id LIMIT $2`,
            cursor ? [school.id, limit + 1, cursor.time, cursor.id] : [school.id, limit + 1],
          )
        ).rows;
        const items = [];
        for (const session of sessions.slice(0, limit))
          items.push(this.summary(session, await this.rows(c, school.id, session), now));
        const last = sessions[limit - 1];
        return {
          items,
          nextCursor:
            sessions.length > limit
              ? this.encode({ scope, id: last.id, time: last.starts_at.toISOString() })
              : null,
          serverNow: now.toISOString(),
        };
      },
      true,
    );
  }
  async detail(req: Request, id: string, input: unknown, attempt = false) {
    const { school } = identity(req, 'school_admin');
    parse(uuid, id);
    const q = parse(querySchema, input),
      limit = q.limit ?? 25,
      scope = `${school.id}:monitor:${attempt ? 'attempt' : 'sitting'}:${id}`,
      cursor = this.decode(q.cursor, scope);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const now = this.clock.now();
        const s = (
          await c.query<Sitting>(
            `${sittingSelect} WHERE s.school_id=$1 AND s.id=${attempt ? '(SELECT session_id FROM attempts WHERE school_id=$1 AND id=$2)' : '$2'}`,
            [school.id, id],
          )
        ).rows[0];
        if (!s) throw DomainException.notFound();
        const all = await this.rows(c, school.id, s),
          sitting = this.summary(s, all, now);
        if (!attempt) {
          const rows = all.filter((r) => !cursor || r.student_id > cursor.id);
          const selected = rows.slice(0, limit);
          return {
            sitting,
            rows: selected.map((r) => this.row(r, now)),
            nextCursor:
              rows.length > limit
                ? this.encode({ scope, id: selected[selected.length - 1].student_id })
                : null,
            serverNow: now.toISOString(),
          };
        }
        const row = all.find((r) => r.attempt_id === id);
        if (!row) throw DomainException.notFound();
        const history = (
          await c.query<{
            id: string;
            actor_name: string;
            actor_id: string;
            reason: string;
            transferred_at: Date;
            from_generation: number;
            to_generation: number;
          }>(
            `SELECT * FROM device_transfer_events WHERE school_id=$1 AND attempt_id=$2 ${cursor ? 'AND (transferred_at<$4 OR (transferred_at=$4 AND id>$5))' : ''} ORDER BY transferred_at DESC,id LIMIT $3`,
            cursor
              ? [school.id, id, limit + 1, cursor.time, cursor.id]
              : [school.id, id, limit + 1],
          )
        ).rows;
        const last = history[limit - 1];
        return {
          sitting,
          student: this.row(row, now),
          transferBlocker:
            row.user_status !== 'active' ||
            row.admission_status !== 'admitted' ||
            !['preparing', 'active'].includes(row.state ?? '')
              ? 'closed'
              : now >= row.deadline_at
                ? 'deadline_passed'
                : null,
          history: history.slice(0, limit).map((h) => ({
            transferId: h.id,
            actorName: h.actor_name,
            actorId: h.actor_id,
            reason: h.reason,
            transferredAt: h.transferred_at.toISOString(),
            fromGeneration: h.from_generation,
            toGeneration: h.to_generation,
          })),
          nextCursor:
            history.length > limit
              ? this.encode({ scope, id: last.id, time: last.transferred_at.toISOString() })
              : null,
          serverNow: now.toISOString(),
        };
      },
      true,
    );
  }
}
