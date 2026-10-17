import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { ClockService } from '../../common/clock/clock.service';
import { computeCanonicalDigest } from '../../common/crypto/canonical-digest';
import { requireDeviceBinding } from '../../common/crypto/device-credential';
import { DbService } from '../../common/db/db.service';
import { DomainException } from '../../common/errors/domain.exception';
import {
  deviceRequestSchema,
  idempotencyKeySchema,
  parsePreparationInput,
  resourceIdSchema,
  unlockRequestSchema,
  attemptResponseSchema,
} from './preparation-schemas';

type AttemptRecord = {
  suspended: boolean;
  id: string;
  session_id: string;
  student_id: string;
  exam_version: number;
  schedule_revision: number;
  device_id: string;
  device_generation: number;
  state:
    'preparing' | 'active' | 'awaiting_upload' | 'recovery_pending' | 'submitted' | 'invalidated';
  starts_at: Date;
  deadline_at: Date;
  final_accept_until: Date;
  last_server_save_at: Date | null;
  highest_accepted_seq: number;
  unlocked_at: Date | null;
  question_order: string[];
  option_orders: Record<string, string[]>;
};
type ExamRecord = {
  session_id: string;
  exam_id: string;
  preparation_visible_at: Date;
  starts_at: Date;
  ends_at: Date;
  schedule_revision: number;
  title: string;
  duration_minutes: number;
  subject_name: string;
  class_name: string;
  extra_time_minutes: number;
  attempt_id: string | null;
  attempt_state: AttemptRecord['state'] | null;
  attempt_deadline_at: Date | null;
};
const cursorSchema = z
  .object({
    schoolId: resourceIdSchema,
    studentId: resourceIdSchema,
    startsAt: z.string().datetime(),
    sessionId: resourceIdSchema,
  })
  .strict();
const listQuerySchema = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
const examSelect = `SELECT es.id AS session_id, es.exam_id, es.preparation_visible_at,
  es.starts_at, es.ends_at, es.schedule_revision, e.title, e.duration_minutes,
  s.name AS subject_name, c.name AS class_name, sr.extra_time_minutes,
  a.id AS attempt_id, a.state AS attempt_state, a.deadline_at AS attempt_deadline_at
  FROM session_roster sr
  JOIN exam_sessions es ON es.id = sr.session_id AND es.school_id = sr.school_id
  JOIN exams e ON e.id = es.exam_id AND e.school_id = es.school_id
  JOIN subjects s ON s.id = e.subject_id AND s.school_id = e.school_id
  JOIN classes c ON c.id = e.class_id AND c.school_id = e.school_id
  LEFT JOIN attempts a ON a.session_id = es.id AND a.student_id = sr.student_id AND a.school_id = sr.school_id
  WHERE sr.school_id = $1 AND sr.student_id = $2 AND sr.admission_status = 'admitted'`;

function studentIdentity(req: Request) {
  if (!req.sessionUser || !req.school) throw DomainException.authRequired();
  if (req.sessionUser.role !== 'student') throw DomainException.forbidden();
  return { student: req.sessionUser, school: req.school };
}

function examResponse(row: ExamRecord, now: Date) {
  const deadline =
    row.attempt_deadline_at ?? new Date(row.ends_at.getTime() + row.extra_time_minutes * 60000);
  const phase =
    now < row.preparation_visible_at
      ? 'scheduled'
      : now < row.starts_at
        ? 'preparing'
        : now < deadline
          ? 'open'
          : 'ended';
  return {
    examId: row.exam_id,
    sessionId: row.session_id,
    title: row.title,
    subjectName: row.subject_name,
    className: row.class_name,
    durationMinutes: row.duration_minutes,
    preparationVisibleAt: row.preparation_visible_at.toISOString(),
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    deadlineAt: deadline.toISOString(),
    scheduleRevision: row.schedule_revision,
    phase,
    attemptId: row.attempt_id,
    attemptState: row.attempt_state,
  };
}

@Injectable()
export class PreparationService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  async getMyExams(req: Request, input: unknown) {
    const { student, school } = studentIdentity(req);
    const query = parsePreparationInput(listQuerySchema, input);
    const limit = query.limit ?? 25;
    const params: unknown[] = [school.id, student.id];
    let filter = '';
    if (query.cursor) {
      let decoded: unknown;
      try {
        const bytes = Buffer.from(query.cursor, 'base64url');
        if (bytes.toString('base64url') !== query.cursor) throw new Error('Malformed cursor');
        decoded = JSON.parse(bytes.toString('utf8'));
      } catch {
        throw DomainException.validationError('Malformed cursor');
      }
      const cursor = parsePreparationInput(cursorSchema, decoded);
      if (cursor.schoolId !== school.id || cursor.studentId !== student.id) {
        throw DomainException.validationError('Cursor does not belong to this list');
      }
      params.push(cursor.startsAt, cursor.sessionId);
      filter = 'AND (es.starts_at, es.id) > ($3, $4)';
    }
    params.push(limit + 1);
    return this.db.withTenantTransaction(school.id, async (client) => {
      const now = this.clock.now();
      const result = await client.query<ExamRecord>(
        `${examSelect} ${filter} ORDER BY es.starts_at ASC, es.id ASC LIMIT $${params.length}`,
        params,
      );
      const rows = result.rows.slice(0, limit);
      const last = rows.at(-1);
      const nextCursor =
        result.rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({
                schoolId: school.id,
                studentId: student.id,
                startsAt: last.starts_at.toISOString(),
                sessionId: last.session_id,
              }),
            ).toString('base64url')
          : null;
      return {
        items: rows.map((row) => examResponse(row, now)),
        nextCursor,
        serverNow: now.toISOString(),
      };
    });
  }

  async getMyExamDetail(req: Request, id: string) {
    const { student, school } = studentIdentity(req);
    const sessionId = parsePreparationInput(resourceIdSchema, id);
    return this.db.withTenantTransaction(school.id, async (client) => {
      const now = this.clock.now();
      const result = await client.query<ExamRecord>(`${examSelect} AND es.id = $3`, [
        school.id,
        student.id,
        sessionId,
      ]);
      const row = result.rows[0];
      if (!row) throw DomainException.notFound('Exam session not found or ineligible');
      return { exam: examResponse(row, now), serverNow: now.toISOString() };
    });
  }

  private async attemptResponse(client: PoolClient, att: AttemptRecord, now: Date) {
    const answers = att.unlocked_at
      ? await client.query<{ item_id: string; value: string | null; client_seq: number }>(
          'SELECT item_id, value, client_seq FROM attempt_answers WHERE attempt_id = $1 ORDER BY item_id',
          [att.id],
        )
      : { rows: [] };
    const submissions = await client.query<{
      id: string;
      accepted_at: Date;
      snapshot_digest: string;
      idempotency_key: string;
      final_seq: number;
    }>(
      'SELECT id, accepted_at, snapshot_digest, idempotency_key, final_seq FROM submissions WHERE attempt_id = $1',
      [att.id],
    );
    const recoveries = await client.query<{
      id: string;
      status: 'recovery_pending' | 'accepted' | 'rejected';
      received_at: Date;
    }>(
      `SELECT id, status, received_at FROM recovery_uploads WHERE attempt_id = $1
        ORDER BY CASE WHEN status = 'recovery_pending' THEN 0 ELSE 1 END, received_at DESC, id DESC LIMIT 1`,
      [att.id],
    );
    const receipt = submissions.rows[0];
    const recovery = recoveries.rows[0];
    return {
      attemptId: att.id,
      sessionId: att.session_id,
      examVersion: att.exam_version,
      scheduleRevision: att.schedule_revision,
      deviceGeneration: att.device_generation,
      state: att.state,
      serverNow: now.toISOString(),
      startsAt: att.starts_at.toISOString(),
      deadlineAt: att.deadline_at.toISOString(),
      finalAcceptUntil: att.final_accept_until.toISOString(),
      lastServerSaveAt: att.last_server_save_at?.toISOString() ?? null,
      highestAcceptedSeq: att.highest_accepted_seq,
      answers: answers.rows.map((row) => ({
        itemId: row.item_id,
        value: row.value,
        clientSeq: row.client_seq,
      })),
      receipt: receipt
        ? {
            status: 'submitted',
            receiptId: receipt.id,
            acceptedAt: receipt.accepted_at.toISOString(),
            snapshotDigest: receipt.snapshot_digest,
            idempotencyKey: receipt.idempotency_key,
            finalSeq: receipt.final_seq,
          }
        : null,
      recovery: recovery
        ? {
            recoveryId: recovery.id,
            status: recovery.status,
            receivedAt: recovery.received_at.toISOString(),
          }
        : null,
    };
  }

  private async ownedAttempt(
    client: PoolClient,
    attemptId: string,
    studentId: string,
    schoolId: string,
  ) {
    const result = await client.query<AttemptRecord>(
      `SELECT a.* FROM attempts a
       JOIN session_roster sr ON sr.school_id = a.school_id AND sr.session_id = a.session_id AND sr.student_id = a.student_id
       WHERE a.id = $1 AND a.student_id = $2 AND a.school_id = $3
         AND sr.admission_status = 'admitted' FOR UPDATE OF a`,
      [attemptId, studentId, schoolId],
    );
    const att = result.rows[0];
    if (!att) throw DomainException.notFound('Attempt not found');
    return att;
  }

  async createOrGetAttempt(req: Request, id: string, key: unknown, input: unknown) {
    const { student, school } = studentIdentity(req);
    const sessionId = parsePreparationInput(resourceIdSchema, id);
    const idempotencyKey = parsePreparationInput(idempotencyKeySchema, key);
    const body = parsePreparationInput(deviceRequestSchema, input);
    const payloadDigest = computeCanonicalDigest({ sessionId, deviceId: body.deviceId });
    return this.db.withTenantTransaction(school.id, async (client) => {
      const session = await client.query<{
        exam_version_id: string;
        exam_version: number;
        schedule_revision: number;
        preparation_visible_at: Date;
        starts_at: Date;
        ends_at: Date;
        extra_time_minutes: number;
      }>(
        `SELECT es.exam_version_id, ev.version AS exam_version, es.schedule_revision,
          es.preparation_visible_at, es.starts_at, es.ends_at, sr.extra_time_minutes
          FROM exam_sessions es
          JOIN exam_versions ev ON ev.id = es.exam_version_id AND ev.school_id = es.school_id
          JOIN session_roster sr ON sr.session_id = es.id AND sr.school_id = es.school_id
          WHERE es.id = $1 AND es.school_id = $2 AND sr.student_id = $3
            AND sr.admission_status = 'admitted' AND ev.approved_at IS NOT NULL
          FOR SHARE OF es, sr, ev`,
        [sessionId, school.id, student.id],
      );
      const sitting = session.rows[0];
      if (!sitting)
        throw DomainException.notFound('Exam sitting not found or student not admitted');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `create-attempt-key:${school.id}:${student.id}:${idempotencyKey}`,
      ]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `create-attempt:${school.id}:${sessionId}:${student.id}`,
      ]);
      await requireDeviceBinding(client, req, school.id, student.id, body.deviceId, () =>
        this.clock.now(),
      );
      const now = this.clock.now();
      const replay = await client.query<{ payload_digest: string; response_body: unknown }>(
        `SELECT payload_digest, response_body FROM idempotency_keys WHERE school_id = $1 AND actor_id = $2
         AND operation = 'create_attempt' AND idempotency_key = $3`,
        [school.id, student.id, idempotencyKey],
      );
      if (replay.rows[0] && replay.rows[0].payload_digest !== payloadDigest) {
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'Idempotency-Key reused with a different attempt request',
        );
      }
      const existing = await client.query<AttemptRecord>(
        'SELECT * FROM attempts WHERE school_id = $1 AND session_id = $2 AND student_id = $3 FOR UPDATE',
        [school.id, sessionId, student.id],
      );
      let att = existing.rows[0];
      const statusCode = att ? 200 : 201;
      if (att && att.device_id !== body.deviceId) {
        throw DomainException.conflict(
          'DEVICE_REPLACED',
          'Attempt is bound to a different browser',
        );
      }
      if (replay.rows[0]) {
        if (!att)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Original attempt is no longer available',
          );
        return {
          statusCode: 200,
          data: parsePreparationInput(attemptResponseSchema, replay.rows[0].response_body),
        };
      }
      if (!att) {
        const deadline = new Date(sitting.ends_at.getTime() + sitting.extra_time_minutes * 60000);
        if (now < sitting.preparation_visible_at) {
          throw DomainException.conflict('NOT_PREPARING', 'Exam preparation has not opened', {
            serverNow: now.toISOString(),
            retryAt: sitting.preparation_visible_at.toISOString(),
          });
        }
        if (now >= deadline)
          throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has passed');
        const items = await client.query<{
          item_id: string;
          options: { id: string; text: string }[];
        }>(
          'SELECT item_id, options FROM exam_items WHERE school_id = $1 AND exam_version_id = $2 ORDER BY position',
          [school.id, sitting.exam_version_id],
        );
        const questionOrder = items.rows.map((item) => item.item_id);
        const optionOrders = Object.fromEntries(
          items.rows.map((item) => [item.item_id, item.options.map((option) => option.id)]),
        );
        const inserted = await client.query<AttemptRecord>(
          `INSERT INTO attempts (school_id, session_id, student_id, exam_version, schedule_revision,
           device_id, device_generation, state, starts_at, deadline_at, final_accept_until, question_order, option_orders)
           VALUES ($1, $2, $3, $4, $5, $6, 1, 'preparing', $7, $8, $9, $10, $11) RETURNING *`,
          [
            school.id,
            sessionId,
            student.id,
            sitting.exam_version,
            sitting.schedule_revision,
            body.deviceId,
            sitting.starts_at,
            deadline,
            new Date(deadline.getTime() + 5000),
            JSON.stringify(questionOrder),
            JSON.stringify(optionOrders),
          ],
        );
        att = inserted.rows[0];
        if (!att) throw new Error('Attempt creation did not return a record');
      }
      const data = await this.attemptResponse(client, att, now);
      if (!replay.rows[0]) {
        await client.query(
          `INSERT INTO idempotency_keys (school_id, actor_id, operation, idempotency_key, payload_digest, status_code, response_body)
           VALUES ($1, $2, 'create_attempt', $3, $4, $5, $6)`,
          [school.id, student.id, idempotencyKey, payloadDigest, statusCode, JSON.stringify(data)],
        );
      }
      return { statusCode, data };
    });
  }

  async getAttempt(req: Request, id: string) {
    const { student, school } = studentIdentity(req);
    const attemptId = parsePreparationInput(resourceIdSchema, id);
    return this.db.withTenantTransaction(school.id, async (client) => {
      const att = await this.ownedAttempt(client, attemptId, student.id, school.id);
      await requireDeviceBinding(client, req, school.id, student.id, att.device_id, () =>
        this.clock.now(),
      );
      const now = this.clock.now();
      return this.attemptResponse(client, att, now);
    });
  }

  private async paperPackage(client: PoolClient, att: AttemptRecord, schoolId: string) {
    const result = await client.query<{
      package_id: string;
      version: number;
      algorithm: string;
      iv_base64url: string;
      ciphertext_base64url: string;
      sha256_hex: string;
      key_enc: string;
      preparation_visible_at: Date;
    }>(
      `SELECT ep.id AS package_id, ev.version, ep.algorithm, ep.iv_base64url,
        ep.ciphertext_base64url, ep.sha256_hex, ep.key_enc, es.preparation_visible_at
        FROM exam_sessions es
        JOIN exam_versions ev ON ev.id = es.exam_version_id AND ev.school_id = es.school_id
        JOIN exam_packages ep ON ep.exam_version_id = ev.id AND ep.school_id = es.school_id
        WHERE es.id = $1 AND es.school_id = $2 AND ev.approved_at IS NOT NULL`,
      [att.session_id, schoolId],
    );
    const paper = result.rows[0];
    if (!paper) throw DomainException.notFound('Approved question package not found');
    if (paper.version !== att.exam_version)
      throw DomainException.conflict('REVISION_CONFLICT', 'Exam version changed');
    return paper;
  }

  async getPackage(req: Request, id: string) {
    const { student, school } = studentIdentity(req);
    const attemptId = parsePreparationInput(resourceIdSchema, id);
    return this.db.withTenantTransaction(school.id, async (client) => {
      const att = await this.ownedAttempt(client, attemptId, student.id, school.id);
      const paper = await this.paperPackage(client, att, school.id);
      await requireDeviceBinding(client, req, school.id, student.id, att.device_id, () =>
        this.clock.now(),
      );
      const now = this.clock.now();
      this.requireEditable(att);
      if (now < paper.preparation_visible_at) {
        throw DomainException.conflict('NOT_PREPARING', 'Exam preparation has not opened', {
          serverNow: now.toISOString(),
          retryAt: paper.preparation_visible_at.toISOString(),
        });
      }
      if (now >= att.deadline_at)
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has passed');
      return {
        packageId: paper.package_id,
        examVersion: att.exam_version,
        scheduleRevision: att.schedule_revision,
        algorithm: paper.algorithm,
        iv: paper.iv_base64url,
        ciphertext: paper.ciphertext_base64url,
        sha256: paper.sha256_hex,
      };
    });
  }

  private requireEditable(att: AttemptRecord) {
    if (att.suspended)
      throw DomainException.conflict(
        'ATTEMPT_SUSPENDED',
        'Administrator approval is required to resume. The deadline is unchanged.',
      );
    if (att.state === 'submitted' || att.state === 'invalidated') {
      throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
    }
    if (att.state === 'recovery_pending' || att.state === 'awaiting_upload') {
      throw DomainException.conflict('RECOVERY_REQUIRED', 'Attempt requires school recovery');
    }
  }

  async unlockAttempt(req: Request, id: string, input: unknown) {
    const { student, school } = studentIdentity(req);
    const attemptId = parsePreparationInput(resourceIdSchema, id);
    const body = parsePreparationInput(unlockRequestSchema, input);
    return this.db.withTenantTransaction(school.id, async (client) => {
      const att = await this.ownedAttempt(client, attemptId, student.id, school.id);
      const paper = await this.paperPackage(client, att, school.id);
      await requireDeviceBinding(client, req, school.id, student.id, att.device_id, () =>
        this.clock.now(),
      );
      const now = this.clock.now();
      if (att.device_generation !== body.deviceGeneration)
        throw DomainException.conflict('DEVICE_REPLACED', 'Device generation changed');
      if (
        paper.package_id !== body.packageId ||
        att.exam_version !== body.examVersion ||
        att.schedule_revision !== body.scheduleRevision
      ) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Package or version changed');
      }
      this.requireEditable(att);
      if (now < att.starts_at)
        throw DomainException.conflict('NOT_STARTED', 'Exam has not started', {
          serverNow: now.toISOString(),
          retryAt: att.starts_at.toISOString(),
        });
      if (now >= att.deadline_at)
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has passed');
      if (att.state === 'preparing') {
        await client.query(
          "UPDATE attempts SET state = 'active', unlocked_at = COALESCE(unlocked_at, $1) WHERE id = $2",
          [now, att.id],
        );
      }
      return {
        packageId: paper.package_id,
        key: paper.key_enc,
        serverNow: now.toISOString(),
        deadlineAt: att.deadline_at.toISOString(),
        finalAcceptUntil: att.final_accept_until.toISOString(),
        deviceGeneration: att.device_generation,
        questionOrder: att.question_order,
        optionOrders: att.option_orders,
      };
    });
  }
}
