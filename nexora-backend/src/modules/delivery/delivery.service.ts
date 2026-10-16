import { Injectable, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { hashSha256 } from '../../common/crypto/password';
import { computeFinalSnapshotDigest } from '../../common/crypto/canonical-digest';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  private calculatePhase(
    serverNow: Date,
    prepTime: Date,
    startTime: Date,
    deadlineTime: Date,
  ): 'scheduled' | 'preparing' | 'open' | 'ended' {
    if (serverNow < prepTime) return 'scheduled';
    if (serverNow < startTime) return 'preparing';
    if (serverNow < deadlineTime) return 'open';
    return 'ended';
  }

  async getMyExams(req: Request, query: { limit?: string; cursor?: string }) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const limit = Math.min(Math.max(parseInt(query.limit || '25', 10), 1), 100);
    const serverNow = this.clock.now();

    // Decode opaque cursor if present (cursor = base64(startsAt_sessionId))
    let cursorFilter = '';
    const params: any[] = [school.id, student.id];

    if (query.cursor) {
      try {
        const decoded = Buffer.from(query.cursor, 'base64').toString('utf8');
        const [cursorStartsAt, cursorSessionId] = decoded.split('|');
        if (cursorStartsAt && cursorSessionId) {
          params.push(new Date(cursorStartsAt), cursorSessionId);
          cursorFilter = `AND (es.starts_at, es.id) > ($${params.length - 1}, $${params.length})`;
        }
      } catch {
        throw DomainException.validationError('Malformed cursor');
      }
    }

    params.push(limit + 1);
    const limitIndex = params.length;

    const sql = `
      SELECT 
        es.id AS session_id,
        es.exam_id,
        es.preparation_visible_at,
        es.starts_at,
        es.ends_at,
        es.schedule_revision,
        e.title,
        e.duration_minutes,
        s.name AS subject_name,
        c.name AS class_name,
        sr.extra_time_minutes,
        a.id AS attempt_id,
        a.state AS attempt_state,
        a.deadline_at AS attempt_deadline_at
      FROM session_roster sr
      JOIN exam_sessions es ON es.id = sr.session_id AND es.school_id = sr.school_id
      JOIN exams e ON e.id = es.exam_id AND e.school_id = es.school_id
      JOIN subjects s ON s.id = e.subject_id AND s.school_id = e.school_id
      JOIN classes c ON c.id = e.class_id AND c.school_id = e.school_id
      LEFT JOIN attempts a ON a.session_id = es.id AND a.student_id = sr.student_id AND a.school_id = sr.school_id
      WHERE sr.school_id = $1 AND sr.student_id = $2 AND sr.admission_status = 'admitted'
        ${cursorFilter}
      ORDER BY es.starts_at ASC, es.id ASC
      LIMIT $${limitIndex};
    `;

    const res = await this.db.query(sql, params);
    const rows = res.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const items = pageRows.map((row) => {
      const extraTime = row.extra_time_minutes || 0;
      const endsAt = new Date(row.ends_at);
      const studentDeadline = new Date(endsAt.getTime() + extraTime * 60 * 1000);
      const prepTime = new Date(row.preparation_visible_at);
      const startTime = new Date(row.starts_at);

      const phase = this.calculatePhase(serverNow, prepTime, startTime, studentDeadline);

      return {
        sessionId: row.session_id,
        examId: row.exam_id,
        title: row.title,
        subjectName: row.subject_name,
        className: row.class_name,
        durationMinutes: row.duration_minutes,
        preparationVisibleAt: prepTime.toISOString(),
        startsAt: startTime.toISOString(),
        endsAt: endsAt.toISOString(),
        studentDeadline: studentDeadline.toISOString(),
        extraTimeMinutes: extraTime,
        phase,
        attemptState: row.attempt_state || null,
      };
    });

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = Buffer.from(`${last.starts_at}|${last.session_id}`).toString('base64');
    }

    return {
      items,
      nextCursor,
      serverNow: this.clock.isoString(),
    };
  }

  async getMyExamDetail(req: Request, sessionId: string) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const serverNow = this.clock.now();

    const sql = `
      SELECT 
        es.id AS session_id,
        es.exam_id,
        es.preparation_visible_at,
        es.starts_at,
        es.ends_at,
        es.schedule_revision,
        e.title,
        e.duration_minutes,
        s.name AS subject_name,
        c.name AS class_name,
        sr.extra_time_minutes,
        a.id AS attempt_id,
        a.state AS attempt_state,
        a.deadline_at AS attempt_deadline_at
      FROM session_roster sr
      JOIN exam_sessions es ON es.id = sr.session_id AND es.school_id = sr.school_id
      JOIN exams e ON e.id = es.exam_id AND e.school_id = es.school_id
      JOIN subjects s ON s.id = e.subject_id AND s.school_id = e.school_id
      JOIN classes c ON c.id = e.class_id AND c.school_id = e.school_id
      LEFT JOIN attempts a ON a.session_id = es.id AND a.student_id = sr.student_id AND a.school_id = sr.school_id
      WHERE sr.school_id = $1 AND sr.student_id = $2 AND sr.session_id = $3 AND sr.admission_status = 'admitted'
    `;

    const res = await this.db.query(sql, [school.id, student.id, sessionId]);
    if (res.rows.length === 0) {
      throw DomainException.notFound('Exam session not found or ineligible');
    }

    const row = res.rows[0];
    const extraTime = row.extra_time_minutes || 0;
    const endsAt = new Date(row.ends_at);
    const studentDeadline = new Date(endsAt.getTime() + extraTime * 60 * 1000);
    const prepTime = new Date(row.preparation_visible_at);
    const startTime = new Date(row.starts_at);
    const phase = this.calculatePhase(serverNow, prepTime, startTime, studentDeadline);

    return {
      exam: {
        sessionId: row.session_id,
        examId: row.exam_id,
        title: row.title,
        subjectName: row.subject_name,
        className: row.class_name,
        durationMinutes: row.duration_minutes,
        preparationVisibleAt: prepTime.toISOString(),
        startsAt: startTime.toISOString(),
        endsAt: endsAt.toISOString(),
        studentDeadline: studentDeadline.toISOString(),
        extraTimeMinutes: extraTime,
        phase,
        attemptState: row.attempt_state || null,
      },
      serverNow: this.clock.isoString(),
    };
  }

  async createOrGetAttempt(
    req: Request,
    sessionId: string,
    body: { deviceId: string },
  ) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const { deviceId } = body;
    if (!deviceId) {
      throw DomainException.validationError('deviceId is required');
    }

    // Verify caller device credential
    const deviceCred = req.cookies?.['nexora_device_cred'];
    if (!deviceCred) {
      throw DomainException.conflict('DEVICE_REPLACED', 'Missing device credential');
    }
    const credHash = hashSha256(deviceCred);

    const devRes = await this.db.query(
      `SELECT id FROM device_bindings
       WHERE school_id = $1 AND user_id = $2 AND device_id = $3 AND credential_hash = $4`,
      [school.id, student.id, deviceId, credHash],
    );
    if (devRes.rows.length === 0) {
      throw DomainException.conflict('DEVICE_REPLACED', 'Unknown or invalid device enrollment');
    }

    const serverNow = this.clock.now();

    // Run inside tenant transaction with row locking
    return this.db.withTenantTransaction(school.id, async (client) => {
      // Check session roster & session timing
      const sessRes = await client.query(
        `SELECT 
           es.id, es.exam_version_id, es.schedule_revision, es.preparation_visible_at, es.starts_at, es.ends_at,
           ev.version AS exam_version,
           sr.extra_time_minutes, sr.admission_status
         FROM exam_sessions es
         JOIN exam_versions ev ON ev.id = es.exam_version_id AND ev.school_id = es.school_id
         JOIN session_roster sr ON sr.session_id = es.id AND sr.school_id = es.school_id
         WHERE es.id = $1 AND es.school_id = $2 AND sr.student_id = $3
         FOR SHARE`,
        [sessionId, school.id, student.id],
      );

      if (sessRes.rows.length === 0 || sessRes.rows[0].admission_status !== 'admitted') {
        throw DomainException.notFound('Exam sitting not found or student not admitted');
      }

      const sess = sessRes.rows[0];
      const extraTime = sess.extra_time_minutes || 0;
      const prepTime = new Date(sess.preparation_visible_at);
      const startTime = new Date(sess.starts_at);
      const endsTime = new Date(sess.ends_at);
      const deadlineAt = new Date(endsTime.getTime() + extraTime * 60 * 1000);
      const finalAcceptUntil = new Date(deadlineAt.getTime() + 5 * 1000);

      // Check existing attempt
      const existingRes = await client.query(
        `SELECT * FROM attempts
         WHERE school_id = $1 AND session_id = $2 AND student_id = $3
         FOR UPDATE`,
        [school.id, sessionId, student.id],
      );

      if (existingRes.rows.length > 0) {
        const att = existingRes.rows[0];
        // Check device binding match
        if (att.device_id !== deviceId) {
          throw DomainException.conflict('DEVICE_REPLACED', 'Attempt is bound to a different device');
        }

        // Return existing attempt state
        const answersRes = await client.query(
          `SELECT item_id, value, client_seq FROM attempt_answers WHERE attempt_id = $1`,
          [att.id],
        );

        return {
          statusCode: HttpStatus.OK,
          data: {
            attemptId: att.id,
            sessionId: att.session_id,
            examVersion: att.exam_version,
            scheduleRevision: att.schedule_revision,
            deviceGeneration: att.device_generation,
            state: att.state,
            serverNow: this.clock.isoString(),
            startsAt: new Date(att.starts_at).toISOString(),
            deadlineAt: new Date(att.deadline_at).toISOString(),
            finalAcceptUntil: new Date(att.final_accept_until).toISOString(),
            lastServerSaveAt: att.last_server_save_at ? new Date(att.last_server_save_at).toISOString() : null,
            highestAcceptedSeq: att.highest_accepted_seq,
            answers: att.unlocked_at ? answersRes.rows.map(r => ({ itemId: r.item_id, value: r.value, clientSeq: r.client_seq })) : [],
            receipt: null,
            recovery: null,
          },
        };
      }

      // Timing check for new creation:
      if (serverNow < prepTime) {
        throw DomainException.conflict('NOT_PREPARING', 'Exam preparation has not opened yet', {
          serverNow: serverNow.toISOString(),
          retryAt: prepTime.toISOString(),
        });
      }

      if (serverNow >= deadlineAt) {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has already passed');
      }

      // First Creation: fetch items and generate questionOrder and optionOrders
      const itemsRes = await client.query(
        `SELECT item_id, type, options
         FROM exam_items
         WHERE school_id = $1 AND exam_version_id = $2
         ORDER BY position ASC`,
        [school.id, sess.exam_version_id],
      );

      const questionOrder = itemsRes.rows.map((r) => r.item_id);
      const optionOrders: Record<string, string[]> = {};

      for (const item of itemsRes.rows) {
        if (item.type === 'true_false') {
          optionOrders[item.item_id] = ['true', 'false'];
        } else {
          // Keep canonical option order from database
          const opts = item.options as Array<{ id: string; text: string }>;
          optionOrders[item.item_id] = opts.map((o) => o.id);
        }
      }

      const insertRes = await client.query(
        `INSERT INTO attempts (
           school_id, session_id, student_id, exam_version, schedule_revision,
           device_id, device_generation, state, starts_at, deadline_at, final_accept_until,
           question_order, option_orders
         ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'preparing', $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          school.id,
          sessionId,
          student.id,
          sess.exam_version,
          sess.schedule_revision,
          deviceId,
          startTime,
          deadlineAt,
          finalAcceptUntil,
          JSON.stringify(questionOrder),
          JSON.stringify(optionOrders),
        ],
      );

      const newAtt = insertRes.rows[0];

      return {
        statusCode: HttpStatus.CREATED,
        data: {
          attemptId: newAtt.id,
          sessionId: newAtt.session_id,
          examVersion: newAtt.exam_version,
          scheduleRevision: newAtt.schedule_revision,
          deviceGeneration: newAtt.device_generation,
          state: newAtt.state,
          serverNow: this.clock.isoString(),
          startsAt: startTime.toISOString(),
          deadlineAt: deadlineAt.toISOString(),
          finalAcceptUntil: finalAcceptUntil.toISOString(),
          lastServerSaveAt: null,
          highestAcceptedSeq: 0,
          answers: [],
          receipt: null,
          recovery: null,
        },
      };
    });
  }

  async getAttempt(req: Request, attemptId: string) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const res = await this.db.query(
      `SELECT a.*, s.id AS receipt_id, s.accepted_at, s.snapshot_digest, s.idempotency_key, s.final_seq
       FROM attempts a
       LEFT JOIN submissions s ON s.attempt_id = a.id AND s.school_id = a.school_id
       WHERE a.id = $1 AND a.school_id = $2 AND a.student_id = $3`,
      [attemptId, school.id, student.id],
    );

    if (res.rows.length === 0) {
      throw DomainException.notFound('Attempt not found');
    }

    const att = res.rows[0];

    const answersRes = await this.db.query(
      `SELECT item_id, value, client_seq FROM attempt_answers WHERE attempt_id = $1`,
      [att.id],
    );

    const recoveryRes = await this.db.query(
      `SELECT id, status, received_at
       FROM recovery_uploads
       WHERE attempt_id = $1 AND school_id = $2
       ORDER BY CASE WHEN status = 'recovery_pending' THEN 0 ELSE 1 END, received_at DESC
       LIMIT 1`,
      [att.id, school.id],
    );

    const receipt = att.receipt_id
      ? {
          status: 'submitted',
          receiptId: att.receipt_id,
          acceptedAt: new Date(att.accepted_at).toISOString(),
          snapshotDigest: att.snapshot_digest,
          idempotencyKey: att.idempotency_key,
          finalSeq: att.final_seq,
        }
      : null;

    const recovery = recoveryRes.rows.length > 0
      ? {
          recoveryId: recoveryRes.rows[0].id,
          status: recoveryRes.rows[0].status,
          receivedAt: new Date(recoveryRes.rows[0].received_at).toISOString(),
        }
      : null;

    return {
      attemptId: att.id,
      sessionId: att.session_id,
      examVersion: att.exam_version,
      scheduleRevision: att.schedule_revision,
      deviceGeneration: att.device_generation,
      state: att.state,
      serverNow: this.clock.isoString(),
      startsAt: new Date(att.starts_at).toISOString(),
      deadlineAt: new Date(att.deadline_at).toISOString(),
      finalAcceptUntil: new Date(att.final_accept_until).toISOString(),
      lastServerSaveAt: att.last_server_save_at ? new Date(att.last_server_save_at).toISOString() : null,
      highestAcceptedSeq: att.highest_accepted_seq,
      answers: att.unlocked_at ? answersRes.rows.map(r => ({ itemId: r.item_id, value: r.value, clientSeq: r.client_seq })) : [],
      receipt,
      recovery,
    };
  }

  async getPackage(req: Request, attemptId: string) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const serverNow = this.clock.now();

    const res = await this.db.query(
      `SELECT a.id, a.state, a.starts_at, a.deadline_at, a.schedule_revision,
              es.preparation_visible_at,
              ep.id AS package_id, ep.algorithm, ep.iv_base64url, ep.ciphertext_base64url, ep.sha256_hex,
              ev.version AS exam_version
       FROM attempts a
       JOIN exam_sessions es ON es.id = a.session_id AND es.school_id = a.school_id
       JOIN exam_versions ev ON ev.id = es.exam_version_id AND ev.school_id = a.school_id
       JOIN exam_packages ep ON ep.exam_version_id = ev.id AND ep.school_id = a.school_id
       WHERE a.id = $1 AND a.school_id = $2 AND a.student_id = $3`,
      [attemptId, school.id, student.id],
    );

    if (res.rows.length === 0) {
      throw DomainException.notFound('Attempt or question package not found');
    }

    const row = res.rows[0];
    const prepTime = new Date(row.preparation_visible_at);
    const deadlineTime = new Date(row.deadline_at);

    if (serverNow < prepTime) {
      throw DomainException.conflict('NOT_PREPARING', 'Exam package is not available before preparation', {
        serverNow: serverNow.toISOString(),
        retryAt: prepTime.toISOString(),
      });
    }

    if (serverNow >= deadlineTime) {
      throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has expired');
    }

    return {
      packageId: row.package_id,
      examVersion: row.exam_version,
      scheduleRevision: row.schedule_revision,
      algorithm: row.algorithm,
      iv: row.iv_base64url,
      ciphertext: row.ciphertext_base64url,
      sha256: row.sha256_hex,
    };
  }

  async unlockAttempt(
    req: Request,
    attemptId: string,
    body: {
      packageId: string;
      examVersion: number;
      scheduleRevision: number;
      deviceGeneration: number;
    },
  ) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const serverNow = this.clock.now();

    return this.db.withTenantTransaction(school.id, async (client) => {
      const res = await client.query(
        `SELECT a.*, ep.id AS pkg_id, ep.key_enc
         FROM attempts a
         JOIN exam_sessions es ON es.id = a.session_id AND es.school_id = a.school_id
         JOIN exam_packages ep ON ep.exam_version_id = es.exam_version_id AND ep.school_id = a.school_id
         WHERE a.id = $1 AND a.school_id = $2 AND a.student_id = $3
         FOR UPDATE`,
        [attemptId, school.id, student.id],
      );

      if (res.rows.length === 0) {
        throw DomainException.notFound('Attempt not found');
      }

      const att = res.rows[0];

      if (att.device_generation !== body.deviceGeneration) {
        throw DomainException.conflict('DEVICE_REPLACED', 'Device generation mismatch');
      }

      const startTime = new Date(att.starts_at);
      const deadlineTime = new Date(att.deadline_at);

      if (serverNow < startTime) {
        throw DomainException.conflict('NOT_STARTED', 'Exam has not started yet', {
          serverNow: serverNow.toISOString(),
          retryAt: startTime.toISOString(),
        });
      }

      if (serverNow >= deadlineTime) {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has passed');
      }

      // State transition: preparing -> active
      if (att.state === 'preparing') {
        await client.query(
          `UPDATE attempts SET state = 'active', unlocked_at = COALESCE(unlocked_at, $1) WHERE id = $2`,
          [serverNow, att.id],
        );
      }

      return {
        packageId: att.pkg_id,
        key: att.key_enc, // AES-256-GCM 32-byte key in base64url
        serverNow: serverNow.toISOString(),
        deadlineAt: deadlineTime.toISOString(),
        finalAcceptUntil: new Date(att.final_accept_until).toISOString(),
        deviceGeneration: att.device_generation,
        questionOrder: att.question_order,
        optionOrders: att.option_orders,
      };
    });
  }

  async saveAnswers(req: Request, attemptId: string, body: SaveAnswersDto) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const deviceId = (req as any).deviceId;

    // Validate body structure
    if (
      typeof body.examVersion !== 'number' ||
      typeof body.scheduleRevision !== 'number' ||
      typeof body.deviceGeneration !== 'number' ||
      !Array.isArray(body.answers)
    ) {
      throw DomainException.validation([{ path: 'body', message: 'Invalid payload structure' }]);
    }

    // Check duplicate item IDs and safe sequence in batch
    const seenItems = new Set<string>();
    for (const ans of body.answers) {
      if (!ans.itemId || typeof ans.itemId !== 'string') {
        throw DomainException.validation([{ path: 'answers', message: 'itemId must be a non-empty string' }]);
      }
      if (seenItems.has(ans.itemId)) {
        throw DomainException.validation([{ path: 'answers', message: `Duplicate itemId in batch: ${ans.itemId}` }]);
      }
      seenItems.add(ans.itemId);

      if (typeof ans.clientSeq !== 'number' || !Number.isSafeInteger(ans.clientSeq) || ans.clientSeq <= 0) {
        throw DomainException.validation([{ path: 'answers', message: `clientSeq must be a positive safe integer for item ${ans.itemId}` }]);
      }
    }

    const serverNow = this.clock.now();

    return this.db.withTenantTransaction(school.id, async (client) => {
      // Row lock the attempt
      const attRes = await client.query(
        `SELECT a.*, es.starts_at
         FROM attempts a
         JOIN exam_sessions es ON es.id = a.session_id AND es.school_id = a.school_id
         WHERE a.id = $1 AND a.school_id = $2
         FOR UPDATE`,
        [attemptId, school.id],
      );

      if (attRes.rows.length === 0 || attRes.rows[0].student_id !== student.id) {
        throw DomainException.notFound('Attempt not found');
      }

      const att = attRes.rows[0];

      // Verify active device binding
      if (att.device_id !== deviceId) {
        throw DomainException.conflict('DEVICE_REPLACED', 'Attempt is bound to a different device');
      }

      // Check finalized states
      if (att.state === 'submitted' || att.state === 'invalidated') {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }
      if (att.state === 'recovery_pending') {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Attempt has pending recovery');
      }
      if (!att.unlocked_at || att.state === 'preparing') {
        throw DomainException.conflict('NOT_STARTED', 'Attempt has not been unlocked');
      }

      // Check revisions & generation
      if (att.exam_version !== body.examVersion) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale exam version');
      }
      if (att.schedule_revision !== body.scheduleRevision) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale schedule revision');
      }
      if (att.device_generation !== body.deviceGeneration) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale device generation');
      }

      // Timing check: ordinary saves require validation time to be before deadline
      const deadlineAt = new Date(att.deadline_at);
      if (serverNow >= deadlineAt) {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has passed');
      }

      // Validate allowed items and valid options
      const allowedItems = new Set<string>(att.question_order as string[]);
      const optionOrders = (att.option_orders || {}) as Record<string, string[]>;

      for (const ans of body.answers) {
        if (!allowedItems.has(ans.itemId)) {
          throw DomainException.validation([{ path: 'answers', message: `Unknown itemId: ${ans.itemId}` }]);
        }
        if (ans.value !== null) {
          const validOptions = optionOrders[ans.itemId] || ['true', 'false'];
          if (!validOptions.includes(ans.value)) {
            throw DomainException.validation([{ path: 'answers', message: `Invalid option value for item ${ans.itemId}` }]);
          }
        }
      }

      // Query revision history for this attempt & device generation to detect replayed/conflicting sequences
      const revRes = await client.query(
        `SELECT item_id, client_seq, value FROM attempt_revision_history
         WHERE attempt_id = $1 AND device_generation = $2`,
        [att.id, att.device_generation],
      );
      const revHistory = new Map<string, string | null>();
      for (const r of revRes.rows) {
        revHistory.set(`${r.item_id}:${r.client_seq}`, r.value);
      }

      // Query current active answers for this attempt
      const currAnswersRes = await client.query(
        `SELECT item_id, client_seq, value FROM attempt_answers WHERE attempt_id = $1`,
        [att.id],
      );
      const currentAnswers = new Map<string, { clientSeq: number; value: string | null }>();
      for (const r of currAnswersRes.rows) {
        currentAnswers.set(r.item_id, { clientSeq: r.client_seq, value: r.value });
      }

      const acknowledged: Array<{ itemId: string; clientSeq: number }> = [];
      const superseded: Array<{ itemId: string; clientSeq: number; currentSeq: number }> = [];
      const toUpsert: Array<{ itemId: string; value: string | null; clientSeq: number }> = [];
      const toRecordRev: Array<{ itemId: string; value: string | null; clientSeq: number }> = [];

      for (const ans of body.answers) {
        const revKey = `${ans.itemId}:${ans.clientSeq}`;

        // 1. Conflict check on sequence reuse
        if (revHistory.has(revKey)) {
          const priorVal = revHistory.get(revKey);
          if (priorVal !== ans.value) {
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              `Sequence ${ans.clientSeq} reused for item ${ans.itemId} with conflicting value`,
            );
          }
        } else {
          toRecordRev.push(ans);
        }

        // 2. Check current state for supersession vs acknowledgement
        const curr = currentAnswers.get(ans.itemId);
        if (curr && curr.clientSeq > ans.clientSeq) {
          superseded.push({
            itemId: ans.itemId,
            clientSeq: ans.clientSeq,
            currentSeq: curr.clientSeq,
          });
        } else {
          acknowledged.push({
            itemId: ans.itemId,
            clientSeq: ans.clientSeq,
          });
          toUpsert.push(ans);
        }
      }

      // Batch UPSERT into attempt_answers
      for (const ans of toUpsert) {
        const payloadHash = hashSha256(ans.value || '');
        await client.query(
          `INSERT INTO attempt_answers (school_id, attempt_id, device_generation, item_id, value, client_seq, payload_hash, saved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (school_id, attempt_id, item_id) DO UPDATE SET
             device_generation = EXCLUDED.device_generation,
             value = EXCLUDED.value,
             client_seq = EXCLUDED.client_seq,
             payload_hash = EXCLUDED.payload_hash,
             saved_at = EXCLUDED.saved_at`,
          [school.id, att.id, att.device_generation, ans.itemId, ans.value, ans.clientSeq, payloadHash, serverNow],
        );
      }

      // Record in revision history
      for (const ans of toRecordRev) {
        const payloadHash = hashSha256(ans.value || '');
        await client.query(
          `INSERT INTO attempt_revision_history (school_id, attempt_id, device_generation, item_id, client_seq, value, payload_hash, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (school_id, attempt_id, device_generation, item_id, client_seq) DO NOTHING`,
          [school.id, att.id, att.device_generation, ans.itemId, ans.clientSeq, ans.value, payloadHash, serverNow],
        );
      }

      // Compute highestAcceptedSeq
      const maxAckSeq = acknowledged.length > 0 ? Math.max(...acknowledged.map((a) => a.clientSeq)) : att.highest_accepted_seq;
      const newHighest = Math.max(att.highest_accepted_seq, maxAckSeq);

      await client.query(
        `UPDATE attempts
         SET highest_accepted_seq = $1,
             last_server_save_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [newHighest, serverNow, att.id],
      );

      return {
        acknowledged,
        superseded,
        highestAcceptedSeq: newHighest,
        lastServerSaveAt: serverNow.toISOString(),
        serverNow: serverNow.toISOString(),
      };
    });
  }

  async submitAttempt(
    req: Request,
    attemptId: string,
    idempotencyKey: string | undefined,
    body: SubmitAttemptDto,
  ) {
    // 1. Capture receivedAt immediately after complete body arrives, before waiting on database lock
    const receivedAt = this.clock.now();

    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const deviceId = (req as any).deviceId;

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([{ path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' }]);
    }

    // 2. Validate body schema
    if (
      typeof body.examVersion !== 'number' ||
      typeof body.scheduleRevision !== 'number' ||
      typeof body.deviceGeneration !== 'number' ||
      typeof body.finalSeq !== 'number' ||
      !Number.isSafeInteger(body.finalSeq) ||
      body.finalSeq < 0 ||
      !Array.isArray(body.answers)
    ) {
      throw DomainException.validation([{ path: 'body', message: 'Invalid final submission payload' }]);
    }

    // 3. Fast check for existing committed submission (Replay / ALREADY_FINALIZED)
    const existingSubRes = await this.db.query(
      `SELECT s.*, a.student_id
       FROM submissions s
       JOIN attempts a ON a.id = s.attempt_id AND a.school_id = s.school_id
       WHERE s.school_id = $1 AND s.attempt_id = $2`,
      [school.id, attemptId],
    );

    if (existingSubRes.rows.length > 0) {
      const sub = existingSubRes.rows[0];
      if (sub.student_id !== student.id) {
        throw DomainException.notFound('Attempt not found');
      }

      // Check idempotency replay
      if (sub.idempotency_key === idempotencyKey) {
        const { snapshotDigest } = computeFinalSnapshotDigest({
          attemptId,
          examVersion: body.examVersion,
          scheduleRevision: body.scheduleRevision,
          deviceGeneration: body.deviceGeneration,
          finalSeq: body.finalSeq,
          answers: body.answers,
        });

        if (sub.snapshot_digest === snapshotDigest) {
          return {
            status: 'submitted',
            receiptId: sub.id,
            acceptedAt: new Date(sub.accepted_at).toISOString(),
            snapshotDigest: sub.snapshot_digest,
          };
        } else {
          throw DomainException.conflict('REVISION_CONFLICT', 'Idempotency-Key reused with different submission payload');
        }
      } else {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }
    }

    // 4. Run inside tenant transaction with row locking
    return this.db.withTenantTransaction(school.id, async (client) => {
      // Row lock attempt
      const attRes = await client.query(
        `SELECT a.*, es.starts_at, es.exam_version_id
         FROM attempts a
         JOIN exam_sessions es ON es.id = a.session_id AND es.school_id = a.school_id
         WHERE a.id = $1 AND a.school_id = $2
         FOR UPDATE`,
        [attemptId, school.id],
      );

      if (attRes.rows.length === 0 || attRes.rows[0].student_id !== student.id) {
        throw DomainException.notFound('Attempt not found');
      }

      const att = attRes.rows[0];

      // Device check
      if (att.device_id !== deviceId) {
        throw DomainException.conflict('DEVICE_REPLACED', 'Attempt is bound to a different device');
      }

      // Recheck inside lock if submission was committed concurrently
      const raceSubRes = await client.query(
        `SELECT * FROM submissions WHERE school_id = $1 AND attempt_id = $2`,
        [school.id, att.id],
      );
      if (raceSubRes.rows.length > 0) {
        const sub = raceSubRes.rows[0];
        if (sub.idempotency_key === idempotencyKey) {
          const { snapshotDigest } = computeFinalSnapshotDigest({
            attemptId,
            examVersion: body.examVersion,
            scheduleRevision: body.scheduleRevision,
            deviceGeneration: body.deviceGeneration,
            finalSeq: body.finalSeq,
            answers: body.answers,
          });
          if (sub.snapshot_digest === snapshotDigest) {
            return {
              status: 'submitted',
              receiptId: sub.id,
              acceptedAt: new Date(sub.accepted_at).toISOString(),
              snapshotDigest: sub.snapshot_digest,
            };
          }
          throw DomainException.conflict('REVISION_CONFLICT', 'Idempotency-Key reused with different submission payload');
        }
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }

      // Check attempt state
      if (att.state === 'submitted' || att.state === 'invalidated') {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }
      if (att.state === 'recovery_pending') {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Attempt has pending recovery');
      }
      if (!att.unlocked_at) {
        throw DomainException.conflict('NOT_STARTED', 'Attempt has not been unlocked');
      }

      // Timing checks using captured receivedAt
      const startsAt = new Date(att.starts_at);
      const finalAcceptUntil = new Date(att.final_accept_until);

      if (receivedAt < startsAt) {
        throw DomainException.conflict('NOT_STARTED', 'Exam has not started yet');
      }
      if (receivedAt > finalAcceptUntil) {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline plus grace period has passed. Submit via recovery.');
      }

      // Check version, schedule revision, device generation
      if (att.exam_version !== body.examVersion) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale exam version');
      }
      if (att.schedule_revision !== body.scheduleRevision) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale schedule revision');
      }
      if (att.device_generation !== body.deviceGeneration) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale device generation');
      }

      // finalSeq must be >= highestAcceptedSeq
      if (body.finalSeq < att.highest_accepted_seq) {
        throw DomainException.conflict('REVISION_CONFLICT', 'finalSeq is lower than highest accepted sequence');
      }

      // Validate answers membership: include every item exactly once
      const expectedItems = (att.question_order || []) as string[];
      const bodyItemMap = new Map<string, string | null>();

      for (const ans of body.answers) {
        if (!ans.itemId || typeof ans.itemId !== 'string') {
          throw DomainException.validation([{ path: 'answers', message: 'itemId must be a non-empty string' }]);
        }
        if (bodyItemMap.has(ans.itemId)) {
          throw DomainException.validation([{ path: 'answers', message: `Duplicate answer for item: ${ans.itemId}` }]);
        }
        bodyItemMap.set(ans.itemId, ans.value);
      }

      if (bodyItemMap.size !== expectedItems.length) {
        throw DomainException.validation([{ path: 'answers', message: `Final submission must include every item exactly once. Expected ${expectedItems.length}, got ${bodyItemMap.size}` }]);
      }

      for (const itemId of expectedItems) {
        if (!bodyItemMap.has(itemId)) {
          throw DomainException.validation([{ path: 'answers', message: `Missing answer for item: ${itemId}` }]);
        }
      }

      // Validate option values
      const optionOrders = (att.option_orders || {}) as Record<string, string[]>;
      for (const [itemId, val] of bodyItemMap.entries()) {
        if (val !== null) {
          const validOpts = optionOrders[itemId] || ['true', 'false'];
          if (!validOpts.includes(val)) {
            throw DomainException.validation([{ path: 'answers', message: `Invalid option value for item ${itemId}` }]);
          }
        }
      }

      // 5. Compute canonical snapshot digest
      const { snapshotDigest } = computeFinalSnapshotDigest({
        attemptId: att.id,
        examVersion: body.examVersion,
        scheduleRevision: body.scheduleRevision,
        deviceGeneration: body.deviceGeneration,
        finalSeq: body.finalSeq,
        answers: body.answers,
      });

      // 6. Grade the submission deterministically
      const itemsRes = await client.query(
        `SELECT item_id, type, marks, correct_key FROM exam_items WHERE exam_version_id = $1`,
        [att.exam_version_id],
      );

      let totalScore = 0;
      let totalMaxScore = 0;
      for (const item of itemsRes.rows) {
        totalMaxScore += item.marks;
        const studentAns = bodyItemMap.get(item.item_id);
        if (studentAns && studentAns === item.correct_key) {
          totalScore += item.marks;
        }
      }
      const percent = totalMaxScore > 0 ? Number(((totalScore / totalMaxScore) * 100).toFixed(2)) : 0;

      // 7. Commit in one transaction
      const receiptId = randomUUID();
      const acceptedAt = this.clock.now();

      // Insert submission
      await client.query(
        `INSERT INTO submissions (
           id, school_id, attempt_id, exam_version, schedule_revision,
           device_generation, final_seq, answers_snapshot, snapshot_digest,
           idempotency_key, received_at, accepted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          receiptId,
          school.id,
          att.id,
          body.examVersion,
          body.scheduleRevision,
          body.deviceGeneration,
          body.finalSeq,
          JSON.stringify(body.answers),
          snapshotDigest,
          idempotencyKey,
          receivedAt,
          acceptedAt,
        ],
      );

      // Update attempt to submitted
      await client.query(
        `UPDATE attempts
         SET state = 'submitted',
             highest_accepted_seq = GREATEST(highest_accepted_seq, $1),
             last_server_save_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [body.finalSeq, acceptedAt, att.id],
      );

      // Insert official result
      await client.query(
        `INSERT INTO official_results (
           school_id, attempt_id, revision, score, max_score, percent, status, source_submission_id, created_at
         ) VALUES ($1, $2, 1, $3, $4, $5, 'completed', $6, NOW())
         ON CONFLICT (school_id, attempt_id, revision) DO UPDATE
         SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, percent = EXCLUDED.percent`,
        [school.id, att.id, totalScore, totalMaxScore, percent, receiptId],
      );

      // Record idempotency key
      const responsePayload = {
        status: 'submitted',
        receiptId,
        acceptedAt: acceptedAt.toISOString(),
        snapshotDigest,
      };

      await client.query(
        `INSERT INTO idempotency_keys (
           school_id, actor_id, operation, idempotency_key, payload_digest, status_code, response_body, created_at
         ) VALUES ($1, $2, 'submit_attempt', $3, $4, 200, $5, NOW())
         ON CONFLICT (school_id, actor_id, operation, idempotency_key) DO NOTHING`,
        [school.id, student.id, idempotencyKey, snapshotDigest, JSON.stringify(responsePayload)],
      );

      return responsePayload;
    });
  }

  async getReceipt(req: Request, attemptId: string) {
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const res = await this.db.query(
      `SELECT a.id AS attempt_id, a.state,
              s.id AS receipt_id, s.accepted_at, s.snapshot_digest, s.idempotency_key, s.final_seq
       FROM attempts a
       LEFT JOIN submissions s ON s.attempt_id = a.id AND s.school_id = a.school_id
       WHERE a.id = $1 AND a.school_id = $2 AND a.student_id = $3`,
      [attemptId, school.id, student.id],
    );

    if (res.rows.length === 0) {
      throw DomainException.notFound('Attempt not found');
    }

    const att = res.rows[0];

    const recoveryRes = await this.db.query(
      `SELECT id, status, received_at
       FROM recovery_uploads
       WHERE attempt_id = $1 AND school_id = $2
       ORDER BY CASE WHEN status = 'recovery_pending' THEN 0 ELSE 1 END, received_at DESC
       LIMIT 1`,
      [att.attempt_id, school.id],
    );

    const recovery = recoveryRes.rows.length > 0
      ? {
          recoveryId: recoveryRes.rows[0].id,
          status: recoveryRes.rows[0].status,
          receivedAt: new Date(recoveryRes.rows[0].received_at).toISOString(),
        }
      : null;

    const receipt = att.receipt_id
      ? {
          status: 'submitted',
          receiptId: att.receipt_id,
          acceptedAt: new Date(att.accepted_at).toISOString(),
          snapshotDigest: att.snapshot_digest,
          idempotencyKey: att.idempotency_key,
          finalSeq: att.final_seq,
        }
      : null;

    return {
      attemptId: att.attempt_id,
      state: att.state,
      receipt,
      recovery,
    };
  }

  async uploadRecovery(
    req: Request,
    attemptId: string,
    idempotencyKey: string | undefined,
    body: UploadRecoveryDto,
  ) {
    const serverNow = this.clock.now();

    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([{ path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' }]);
    }

    // Validate body structure
    if (
      typeof body.examVersion !== 'number' ||
      typeof body.scheduleRevision !== 'number' ||
      typeof body.deviceGeneration !== 'number' ||
      typeof body.finalSeq !== 'number' ||
      !Number.isSafeInteger(body.finalSeq) ||
      body.finalSeq < 0 ||
      !Array.isArray(body.answers) ||
      typeof body.reason !== 'string' ||
      !body.reason.trim()
    ) {
      throw DomainException.validation([{ path: 'body', message: 'Invalid recovery upload payload' }]);
    }

    // Check existing recovery replay
    const existingRec = await this.db.query(
      `SELECT r.*, a.student_id
       FROM recovery_uploads r
       JOIN attempts a ON a.id = r.attempt_id AND a.school_id = r.school_id
       WHERE r.school_id = $1 AND r.attempt_id = $2 AND r.idempotency_key = $3`,
      [school.id, attemptId, idempotencyKey],
    );

    if (existingRec.rows.length > 0) {
      const rec = existingRec.rows[0];
      if (rec.student_id !== student.id) {
        throw DomainException.notFound('Attempt not found');
      }

      const { snapshotDigest } = computeFinalSnapshotDigest({
        attemptId,
        examVersion: body.examVersion,
        scheduleRevision: body.scheduleRevision,
        deviceGeneration: body.deviceGeneration,
        finalSeq: body.finalSeq,
        answers: body.answers,
      });

      if (rec.snapshot_digest === snapshotDigest) {
        return {
          statusCode: HttpStatus.OK,
          data: {
            status: rec.status,
            recoveryId: rec.id,
            receivedAt: new Date(rec.received_at).toISOString(),
          },
        };
      }
      throw DomainException.conflict('REVISION_CONFLICT', 'Idempotency-Key reused with different recovery payload');
    }

    return this.db.withTenantTransaction(school.id, async (client) => {
      // Row lock attempt
      const attRes = await client.query(
        `SELECT a.*, es.starts_at, es.exam_version_id
         FROM attempts a
         JOIN exam_sessions es ON es.id = a.session_id AND es.school_id = a.school_id
         WHERE a.id = $1 AND a.school_id = $2
         FOR UPDATE`,
        [attemptId, school.id],
      );

      if (attRes.rows.length === 0 || attRes.rows[0].student_id !== student.id) {
        throw DomainException.notFound('Attempt not found');
      }

      const att = attRes.rows[0];

      // Existing official submission returns ALREADY_FINALIZED for reconciliation
      if (att.state === 'submitted') {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized with an official submission');
      }
      if (att.state === 'invalidated') {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is invalidated');
      }

      // Timing rule: Recovery upload opens only when server now > finalAcceptUntil
      const finalAcceptUntil = new Date(att.final_accept_until);
      if (serverNow <= finalAcceptUntil) {
        const retryAt = new Date(finalAcceptUntil.getTime() + 1);
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'Recovery upload opens only after final submission deadline has passed. Retain disputed evidence and use normal submission on the active device.',
          {
            serverNow: serverNow.toISOString(),
            retryAt: retryAt.toISOString(),
          },
        );
      }

      // Validate device generation: permit an old known device generation as disputed evidence, but reject unknown/fabricated
      if (
        body.deviceGeneration > att.device_generation ||
        body.deviceGeneration < 1
      ) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Unknown or invalid device generation');
      }

      // Validate version and schedule revision
      if (att.exam_version !== body.examVersion) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale exam version');
      }
      if (att.schedule_revision !== body.scheduleRevision) {
        throw DomainException.conflict('REVISION_CONFLICT', 'Stale schedule revision');
      }

      // Validate answers membership: include every item exactly once
      const expectedItems = (att.question_order || []) as string[];
      const bodyItemMap = new Map<string, string | null>();

      for (const ans of body.answers) {
        if (!ans.itemId || typeof ans.itemId !== 'string') {
          throw DomainException.validation([{ path: 'answers', message: 'itemId must be a non-empty string' }]);
        }
        if (bodyItemMap.has(ans.itemId)) {
          throw DomainException.validation([{ path: 'answers', message: `Duplicate answer for item: ${ans.itemId}` }]);
        }
        bodyItemMap.set(ans.itemId, ans.value);
      }

      if (bodyItemMap.size !== expectedItems.length) {
        throw DomainException.validation([{ path: 'answers', message: `Recovery snapshot must include every item exactly once. Expected ${expectedItems.length}, got ${bodyItemMap.size}` }]);
      }

      for (const itemId of expectedItems) {
        if (!bodyItemMap.has(itemId)) {
          throw DomainException.validation([{ path: 'answers', message: `Missing answer for item: ${itemId}` }]);
        }
      }

      // Validate option values
      const optionOrders = (att.option_orders || {}) as Record<string, string[]>;
      for (const [itemId, val] of bodyItemMap.entries()) {
        if (val !== null) {
          const validOpts = optionOrders[itemId] || ['true', 'false'];
          if (!validOpts.includes(val)) {
            throw DomainException.validation([{ path: 'answers', message: `Invalid option value for item ${itemId}` }]);
          }
        }
      }

      // Compute canonical digest on frozen answers
      const { snapshotDigest } = computeFinalSnapshotDigest({
        attemptId: att.id,
        examVersion: body.examVersion,
        scheduleRevision: body.scheduleRevision,
        deviceGeneration: body.deviceGeneration,
        finalSeq: body.finalSeq,
        answers: body.answers,
      });

      const recoveryId = randomUUID();

      // Insert into recovery_uploads
      await client.query(
        `INSERT INTO recovery_uploads (
           id, school_id, attempt_id, exam_version, schedule_revision,
           device_generation, final_seq, answers_snapshot, snapshot_digest,
           reason, idempotency_key, status, received_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'recovery_pending', $12)`,
        [
          recoveryId,
          school.id,
          att.id,
          body.examVersion,
          body.scheduleRevision,
          body.deviceGeneration,
          body.finalSeq,
          JSON.stringify(body.answers),
          snapshotDigest,
          body.reason.trim(),
          idempotencyKey,
          serverNow,
        ],
      );

      // Move attempt to recovery_pending
      await client.query(
        `UPDATE attempts
         SET state = 'recovery_pending',
             updated_at = NOW()
         WHERE id = $1`,
        [att.id],
      );

      return {
        statusCode: HttpStatus.CREATED,
        data: {
          status: 'recovery_pending',
          recoveryId,
          receivedAt: serverNow.toISOString(),
        },
      };
    });
  }

  async decideRecovery(
    req: Request,
    recoveryId: string,
    idempotencyKey: string | undefined,
    body: DecideRecoveryDto,
  ) {
    const admin = req.sessionUser;
    const school = req.school;
    if (!admin || !school || admin.role !== 'school_admin') {
      throw DomainException.forbidden('School admin access required');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([{ path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' }]);
    }

    if (body.decision !== 'accept' && body.decision !== 'reject') {
      throw DomainException.validation([{ path: 'decision', message: 'decision must be "accept" or "reject"' }]);
    }

    if (!body.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
      throw DomainException.validation([{ path: 'reason', message: 'A non-empty audit reason is required' }]);
    }

    const serverNow = this.clock.now();

    return this.db.withTenantTransaction(school.id, async (client) => {
      // Check idempotency replay for this decision
      const idempRes = await client.query(
        `SELECT response_body, payload_digest FROM idempotency_keys
         WHERE school_id = $1 AND actor_id = $2 AND operation = 'recovery_decision' AND idempotency_key = $3`,
        [school.id, admin.id, idempotencyKey],
      );

      if (idempRes.rows.length > 0) {
        const stored = idempRes.rows[0];
        const currentPayloadDigest = hashSha256(`${recoveryId}:${body.decision}:${body.reason}`);
        if (stored.payload_digest === currentPayloadDigest) {
          return stored.response_body;
        }
        throw DomainException.conflict('REVISION_CONFLICT', 'Idempotency-Key reused with conflicting decision payload');
      }

      // Query recovery record with lock
      const recRes = await client.query(
        `SELECT r.*, a.exam_version_id, a.state AS attempt_state, a.student_id
         FROM recovery_uploads r
         JOIN attempts a ON a.id = r.attempt_id AND a.school_id = r.school_id
         WHERE r.id = $1 AND r.school_id = $2
         FOR UPDATE`,
        [recoveryId, school.id],
      );

      if (recRes.rows.length === 0) {
        throw DomainException.notFound('Recovery upload not found');
      }

      const rec = recRes.rows[0];

      if (rec.status !== 'recovery_pending') {
        throw DomainException.conflict('REVISION_CONFLICT', 'Recovery upload has already been decided');
      }

      // Lock the attempt row
      const attRes = await client.query(
        `SELECT * FROM attempts WHERE id = $1 AND school_id = $2 FOR UPDATE`,
        [rec.attempt_id, school.id],
      );
      const att = attRes.rows[0];

      if (body.decision === 'accept') {
        // Reject competing acceptance if attempt is already finalized
        const existingSub = await client.query(
          `SELECT id FROM submissions WHERE school_id = $1 AND attempt_id = $2`,
          [school.id, att.id],
        );
        if (existingSub.rows.length > 0) {
          throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt already has a committed submission');
        }

        // Grade the recovery snapshot answers
        const itemsRes = await client.query(
          `SELECT item_id, type, marks, correct_key FROM exam_items WHERE exam_version_id = $1`,
          [rec.exam_version_id],
        );

        const answersList = rec.answers_snapshot as Array<{ itemId: string; value: string | null }>;
        const ansMap = new Map<string, string | null>();
        for (const a of answersList) {
          ansMap.set(a.itemId, a.value);
        }

        let totalScore = 0;
        let totalMaxScore = 0;
        for (const item of itemsRes.rows) {
          totalMaxScore += item.marks;
          const studentAns = ansMap.get(item.item_id);
          if (studentAns && studentAns === item.correct_key) {
            totalScore += item.marks;
          }
        }
        const percent = totalMaxScore > 0 ? Number(((totalScore / totalMaxScore) * 100).toFixed(2)) : 0;

        const receiptId = randomUUID();

        // Commit official submission with recovery's idempotency key and original finalSeq/digest
        await client.query(
          `INSERT INTO submissions (
             id, school_id, attempt_id, exam_version, schedule_revision,
             device_generation, final_seq, answers_snapshot, snapshot_digest,
             idempotency_key, received_at, accepted_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            receiptId,
            school.id,
            att.id,
            rec.exam_version,
            rec.schedule_revision,
            rec.device_generation,
            rec.final_seq,
            JSON.stringify(rec.answers_snapshot),
            rec.snapshot_digest,
            rec.idempotency_key,
            rec.received_at,
            serverNow,
          ],
        );

        // Update attempt state to submitted
        await client.query(
          `UPDATE attempts
           SET state = 'submitted',
               highest_accepted_seq = GREATEST(highest_accepted_seq, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [rec.final_seq, att.id],
        );

        // Insert official result linked to recovery
        await client.query(
          `INSERT INTO official_results (
             school_id, attempt_id, revision, score, max_score, percent, status, source_submission_id, recovery_id, created_at
           ) VALUES ($1, $2, 1, $3, $4, $5, 'completed', $6, $7, NOW())
           ON CONFLICT (school_id, attempt_id, revision) DO UPDATE
           SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, percent = EXCLUDED.percent, recovery_id = EXCLUDED.recovery_id`,
          [school.id, att.id, totalScore, totalMaxScore, percent, receiptId, rec.id],
        );

        // Update this recovery upload
        await client.query(
          `UPDATE recovery_uploads
           SET status = 'accepted',
               decided_by = $1,
               decided_at = $2,
               decision_reason = $3
           WHERE id = $4`,
          [admin.id, serverNow, body.reason.trim(), rec.id],
        );

        // Settle any competing unresolved uploads for that attempt as rejected
        await client.query(
          `UPDATE recovery_uploads
           SET status = 'rejected',
               decided_by = $1,
               decided_at = $2,
               decision_reason = 'superseded-by-accepted-recovery'
           WHERE attempt_id = $3 AND id != $4 AND status = 'recovery_pending'`,
          [admin.id, serverNow, att.id, rec.id],
        );

        // Audit event
        await client.query(
          `INSERT INTO audit_events (school_id, actor_id, action, resource_id, reason, server_at)
           VALUES ($1, $2, 'recovery_accept', $3, $4, NOW())`,
          [school.id, admin.id, rec.id, body.reason.trim()],
        );

        const responsePayload = {
          recoveryId: rec.id,
          decision: 'accept',
          decidedAt: serverNow.toISOString(),
          resultRevision: 1,
        };

        const payloadDigest = hashSha256(`${recoveryId}:${body.decision}:${body.reason}`);
        await client.query(
          `INSERT INTO idempotency_keys (
             school_id, actor_id, operation, idempotency_key, payload_digest, status_code, response_body, created_at
           ) VALUES ($1, $2, 'recovery_decision', $3, $4, 200, $5, NOW())
           ON CONFLICT (school_id, actor_id, operation, idempotency_key) DO NOTHING`,
          [school.id, admin.id, idempotencyKey, payloadDigest, JSON.stringify(responsePayload)],
        );

        return responsePayload;
      } else {
        // Rejection path
        await client.query(
          `UPDATE recovery_uploads
           SET status = 'rejected',
               decided_by = $1,
               decided_at = $2,
               decision_reason = $3
           WHERE id = $4`,
          [admin.id, serverNow, body.reason.trim(), rec.id],
        );

        // Check if other pending uploads remain for this attempt
        const pendingCountRes = await client.query(
          `SELECT COUNT(*) FROM recovery_uploads WHERE attempt_id = $1 AND status = 'recovery_pending'`,
          [att.id],
        );
        const remainingPending = parseInt(pendingCountRes.rows[0].count, 10);

        if (remainingPending === 0) {
          // Return attempt to awaiting_upload
          await client.query(
            `UPDATE attempts SET state = 'awaiting_upload', updated_at = NOW() WHERE id = $1`,
            [att.id],
          );
        }

        // Audit event
        await client.query(
          `INSERT INTO audit_events (school_id, actor_id, action, resource_id, reason, server_at)
           VALUES ($1, $2, 'recovery_reject', $3, $4, NOW())`,
          [school.id, admin.id, rec.id, body.reason.trim()],
        );

        const responsePayload = {
          recoveryId: rec.id,
          decision: 'reject',
          decidedAt: serverNow.toISOString(),
          resultRevision: null,
        };

        const payloadDigest = hashSha256(`${recoveryId}:${body.decision}:${body.reason}`);
        await client.query(
          `INSERT INTO idempotency_keys (
             school_id, actor_id, operation, idempotency_key, payload_digest, status_code, response_body, created_at
           ) VALUES ($1, $2, 'recovery_decision', $3, $4, 200, $5, NOW())
           ON CONFLICT (school_id, actor_id, operation, idempotency_key) DO NOTHING`,
          [school.id, admin.id, idempotencyKey, payloadDigest, JSON.stringify(responsePayload)],
        );

        return responsePayload;
      }
    });
  }

  async transferDevice(
    req: Request,
    attemptId: string,
    idempotencyKey: string | undefined,
    body: TransferDeviceDto,
  ) {
    const admin = req.sessionUser;
    const school = req.school;
    if (!admin || !school || admin.role !== 'school_admin') {
      throw DomainException.forbidden('School admin access required');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([{ path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' }]);
    }

    if (!body.newDeviceId || typeof body.newDeviceId !== 'string') {
      throw DomainException.validation([{ path: 'newDeviceId', message: 'newDeviceId is required' }]);
    }

    if (!body.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
      throw DomainException.validation([{ path: 'reason', message: 'A non-empty transfer reason is required' }]);
    }

    const serverNow = this.clock.now();

    return this.db.withTenantTransaction(school.id, async (client) => {
      // Check idempotency replay
      const idempRes = await client.query(
        `SELECT response_body, payload_digest FROM idempotency_keys
         WHERE school_id = $1 AND actor_id = $2 AND operation = 'device_transfer' AND idempotency_key = $3`,
        [school.id, admin.id, idempotencyKey],
      );

      if (idempRes.rows.length > 0) {
        const stored = idempRes.rows[0];
        const currentPayloadDigest = hashSha256(`${attemptId}:${body.newDeviceId}:${body.reason}`);
        if (stored.payload_digest === currentPayloadDigest) {
          return stored.response_body;
        }
        throw DomainException.conflict('REVISION_CONFLICT', 'Idempotency-Key reused with different device transfer payload');
      }

      // Lock attempt row
      const attRes = await client.query(
        `SELECT * FROM attempts WHERE id = $1 AND school_id = $2 FOR UPDATE`,
        [attemptId, school.id],
      );

      if (attRes.rows.length === 0) {
        throw DomainException.notFound('Attempt not found');
      }

      const att = attRes.rows[0];

      // Reject closed or invalidated attempts
      if (att.state === 'submitted' || att.state === 'invalidated') {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }
      if (att.state === 'recovery_pending') {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Attempt has pending recovery');
      }

      // After deadline return RECOVERY_REQUIRED
      if (serverNow >= new Date(att.deadline_at)) {
        throw DomainException.conflict('RECOVERY_REQUIRED', 'Exam deadline has passed. Cannot transfer device.');
      }

      // Verify newDeviceId is already enrolled by that attempt's student in the same school
      const devRes = await client.query(
        `SELECT id FROM device_bindings
         WHERE school_id = $1 AND user_id = $2 AND device_id = $3`,
        [school.id, att.student_id, body.newDeviceId],
      );

      if (devRes.rows.length === 0) {
        throw DomainException.validation([{ path: 'newDeviceId', message: 'Target device is not enrolled for this student' }]);
      }

      // Increment device generation
      const newGeneration = att.device_generation + 1;

      // Update attempt: bind new device, set state to preparing until replacement browser unlocks
      await client.query(
        `UPDATE attempts
         SET device_id = $1,
             device_generation = $2,
             highest_accepted_seq = 0,
             state = 'preparing',
             unlocked_at = NULL,
             updated_at = NOW()
         WHERE id = $3`,
        [body.newDeviceId, newGeneration, att.id],
      );

      // Carry confirmed answers into new generation as clientSeq = 0
      await client.query(
        `UPDATE attempt_answers
         SET device_generation = $1,
             client_seq = 0,
             saved_at = NOW()
         WHERE attempt_id = $2 AND school_id = $3`,
        [newGeneration, att.id, school.id],
      );

      // Audit event
      await client.query(
        `INSERT INTO audit_events (school_id, actor_id, action, resource_id, reason, server_at)
         VALUES ($1, $2, 'device_transfer', $3, $4, NOW())`,
        [school.id, admin.id, att.id, body.reason.trim()],
      );

      const responsePayload = {
        attemptId: att.id,
        deviceGeneration: newGeneration,
        state: 'preparing',
      };

      const payloadDigest = hashSha256(`${attemptId}:${body.newDeviceId}:${body.reason}`);
      await client.query(
        `INSERT INTO idempotency_keys (
           school_id, actor_id, operation, idempotency_key, payload_digest, status_code, response_body, created_at
         ) VALUES ($1, $2, 'device_transfer', $3, $4, 200, $5, NOW())
         ON CONFLICT (school_id, actor_id, operation, idempotency_key) DO NOTHING`,
        [school.id, admin.id, idempotencyKey, payloadDigest, JSON.stringify(responsePayload)],
      );

      return responsePayload;
    });
  }
}

export interface SaveAnswersDto {
  examVersion: number;
  scheduleRevision: number;
  deviceGeneration: number;
  answers: Array<{
    itemId: string;
    value: string | null;
    clientSeq: number;
  }>;
}

export interface SubmitAttemptDto {
  examVersion: number;
  scheduleRevision: number;
  deviceGeneration: number;
  finalSeq: number;
  answers: Array<{
    itemId: string;
    value: string | null;
  }>;
}

export interface UploadRecoveryDto {
  examVersion: number;
  scheduleRevision: number;
  deviceGeneration: number;
  finalSeq: number;
  answers: Array<{
    itemId: string;
    value: string | null;
  }>;
  reason: string;
}

export interface DecideRecoveryDto {
  decision: 'accept' | 'reject';
  reason: string;
}

export interface TransferDeviceDto {
  newDeviceId: string;
  reason: string;
}
