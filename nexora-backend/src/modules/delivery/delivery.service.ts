import { z } from 'zod';
import {
  parsePreparationInput as parse,
  resourceIdSchema,
  idempotencyKeySchema,
} from './preparation-schemas';
import { captureResultSnapshot } from '../../common/db/result-snapshot';
import { Injectable, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { hashSha256 } from '../../common/crypto/password';
import { computeFinalSnapshotDigest } from '../../common/crypto/canonical-digest';

const deliveryVersion = z.number().int().positive().safe();
const deliveryId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const finalBody = z
  .object({
    examVersion: deliveryVersion,
    scheduleRevision: deliveryVersion,
    deviceGeneration: deliveryVersion,
    finalSeq: z.number().int().nonnegative().safe(),
    answers: z
      .array(z.object({ itemId: deliveryId, value: deliveryId.nullable() }).strict())
      .max(200),
  })
  .strict();

@Injectable()
export class DeliveryService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  async saveAnswers(req: Request, attemptId: string, body: SaveAnswersDto) {
    parse(resourceIdSchema, attemptId);
    body = parse(
      finalBody.omit({ finalSeq: true }).extend({
        answers: z
          .array(
            z
              .object({
                itemId: deliveryId,
                value: deliveryId.nullable(),
                clientSeq: deliveryVersion,
              })
              .strict(),
          )
          .max(200),
      }),
      body,
    );
    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const deviceId = req.deviceId;

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
        throw DomainException.validation([
          { path: 'answers', message: 'itemId must be a non-empty string' },
        ]);
      }
      if (seenItems.has(ans.itemId)) {
        throw DomainException.validation([
          { path: 'answers', message: `Duplicate itemId in batch: ${ans.itemId}` },
        ]);
      }
      seenItems.add(ans.itemId);

      if (
        typeof ans.clientSeq !== 'number' ||
        !Number.isSafeInteger(ans.clientSeq) ||
        ans.clientSeq <= 0
      ) {
        throw DomainException.validation([
          {
            path: 'answers',
            message: `clientSeq must be a positive safe integer for item ${ans.itemId}`,
          },
        ]);
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
      if (att.assistance_paused)
        throw DomainException.conflict(
          'ASSISTANCE_PENDING',
          'Workstation assistance is awaiting approval',
        );
      if (att.suspended)
        throw DomainException.conflict(
          'ATTEMPT_SUSPENDED',
          'Administrator approval is required to resume. The deadline is unchanged.',
        );
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
          throw DomainException.validation([
            { path: 'answers', message: `Unknown itemId: ${ans.itemId}` },
          ]);
        }
        if (ans.value !== null) {
          const validOptions = optionOrders[ans.itemId] || ['true', 'false'];
          if (!validOptions.includes(ans.value)) {
            throw DomainException.validation([
              { path: 'answers', message: `Invalid option value for item ${ans.itemId}` },
            ]);
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
          [
            school.id,
            att.id,
            att.device_generation,
            ans.itemId,
            ans.value,
            ans.clientSeq,
            payloadHash,
            serverNow,
          ],
        );
      }

      // Record in revision history
      for (const ans of toRecordRev) {
        const payloadHash = hashSha256(ans.value || '');
        await client.query(
          `INSERT INTO attempt_revision_history (school_id, attempt_id, device_generation, item_id, client_seq, value, payload_hash, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (school_id, attempt_id, device_generation, item_id, client_seq) DO NOTHING`,
          [
            school.id,
            att.id,
            att.device_generation,
            ans.itemId,
            ans.clientSeq,
            ans.value,
            payloadHash,
            serverNow,
          ],
        );
      }

      // Compute highestAcceptedSeq
      const maxAckSeq =
        acknowledged.length > 0
          ? Math.max(...acknowledged.map((a) => a.clientSeq))
          : att.highest_accepted_seq;
      const newHighest = Math.max(att.highest_accepted_seq, maxAckSeq);

      await client.query(
        `UPDATE attempts
         SET highest_accepted_seq = $1,
             last_server_save_at = $2,
             last_contact_at = GREATEST(last_contact_at, $2),
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
    parse(resourceIdSchema, attemptId);
    parse(idempotencyKeySchema, idempotencyKey);
    body = parse(finalBody, body);
    // 1. Capture receivedAt immediately after complete body arrives, before waiting on database lock
    const receivedAt = this.clock.now();

    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    const deviceId = req.deviceId;

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([
        { path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' },
      ]);
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
      throw DomainException.validation([
        { path: 'body', message: 'Invalid final submission payload' },
      ]);
    }

    // 3. Fast check for existing committed submission (Replay / ALREADY_FINALIZED)
    const existingSubRes = await this.db.tenantQuery(
      school.id,
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
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Idempotency-Key reused with different submission payload',
          );
        }
      } else {
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }
    }

    // 4. Run inside tenant transaction with row locking
    return this.db.withTenantTransaction(school.id, async (client) => {
      const sittingLock = await client.query(
        'SELECT es.id FROM exam_sessions es JOIN attempts a ON a.school_id=es.school_id AND a.session_id=es.id WHERE a.school_id=$1 AND a.id=$2 AND a.student_id=$3 FOR UPDATE OF es',
        [school.id, attemptId, student.id],
      );
      if (!sittingLock.rowCount) throw DomainException.notFound('Attempt not found');

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
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Idempotency-Key reused with different submission payload',
          );
        }
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is already finalized');
      }

      // Check attempt state
      if (att.suspended)
        throw DomainException.conflict(
          'ATTEMPT_SUSPENDED',
          'Administrator approval is required to resume. The deadline is unchanged.',
        );
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
        throw DomainException.conflict(
          'RECOVERY_REQUIRED',
          'Exam deadline plus grace period has passed. Submit via recovery.',
        );
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
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'finalSeq is lower than highest accepted sequence',
        );
      }

      // Validate answers membership: include every item exactly once
      const expectedItems = (att.question_order || []) as string[];
      const bodyItemMap = new Map<string, string | null>();

      for (const ans of body.answers) {
        if (!ans.itemId || typeof ans.itemId !== 'string') {
          throw DomainException.validation([
            { path: 'answers', message: 'itemId must be a non-empty string' },
          ]);
        }
        if (bodyItemMap.has(ans.itemId)) {
          throw DomainException.validation([
            { path: 'answers', message: `Duplicate answer for item: ${ans.itemId}` },
          ]);
        }
        bodyItemMap.set(ans.itemId, ans.value);
      }

      if (bodyItemMap.size !== expectedItems.length) {
        throw DomainException.validation([
          {
            path: 'answers',
            message: `Final submission must include every item exactly once. Expected ${expectedItems.length}, got ${bodyItemMap.size}`,
          },
        ]);
      }

      for (const itemId of expectedItems) {
        if (!bodyItemMap.has(itemId)) {
          throw DomainException.validation([
            { path: 'answers', message: `Missing answer for item: ${itemId}` },
          ]);
        }
      }

      // Validate option values
      const optionOrders = (att.option_orders || {}) as Record<string, string[]>;
      for (const [itemId, val] of bodyItemMap.entries()) {
        if (val !== null) {
          const validOpts = optionOrders[itemId] || ['true', 'false'];
          if (!validOpts.includes(val)) {
            throw DomainException.validation([
              { path: 'answers', message: `Invalid option value for item ${itemId}` },
            ]);
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
      const percent =
        totalMaxScore > 0 ? Number(((totalScore / totalMaxScore) * 100).toFixed(2)) : 0;

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
             last_contact_at = GREATEST(last_contact_at, $2),
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

      await captureResultSnapshot(client, school.id, att.session_id);

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

    const res = await this.db.tenantQuery(
      school.id,
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

    const recoveryRes = await this.db.tenantQuery(
      school.id,
      `SELECT id, status, received_at
       FROM recovery_uploads
       WHERE attempt_id = $1 AND school_id = $2
       ORDER BY CASE WHEN status = 'recovery_pending' THEN 0 ELSE 1 END, received_at DESC
       LIMIT 1`,
      [att.attempt_id, school.id],
    );

    const recovery =
      recoveryRes.rows.length > 0
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
    parse(resourceIdSchema, attemptId);
    parse(idempotencyKeySchema, idempotencyKey);
    body = parse(finalBody.extend({ reason: z.string().trim().max(2000).default('') }), body);
    const serverNow = this.clock.now();

    const student = req.sessionUser;
    const school = req.school;
    if (!student || !school || student.role !== 'student') {
      throw DomainException.authRequired();
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([
        { path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' },
      ]);
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
      throw DomainException.validation([
        { path: 'body', message: 'Invalid recovery upload payload' },
      ]);
    }

    // Check existing recovery replay
    const existingRec = await this.db.tenantQuery(
      school.id,
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
      throw DomainException.conflict(
        'REVISION_CONFLICT',
        'Idempotency-Key reused with different recovery payload',
      );
    }

    return this.db.withTenantTransaction(school.id, async (client) => {
      const sittingLock = await client.query(
        'SELECT es.id FROM exam_sessions es JOIN attempts a ON a.school_id=es.school_id AND a.session_id=es.id WHERE a.school_id=$1 AND a.id=$2 AND a.student_id=$3 FOR UPDATE OF es',
        [school.id, attemptId, student.id],
      );
      if (!sittingLock.rowCount) throw DomainException.notFound('Attempt not found');

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
        throw DomainException.conflict(
          'ALREADY_FINALIZED',
          'Attempt is already finalized with an official submission',
        );
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
      if (body.deviceGeneration > att.device_generation || body.deviceGeneration < 1) {
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
          throw DomainException.validation([
            { path: 'answers', message: 'itemId must be a non-empty string' },
          ]);
        }
        if (bodyItemMap.has(ans.itemId)) {
          throw DomainException.validation([
            { path: 'answers', message: `Duplicate answer for item: ${ans.itemId}` },
          ]);
        }
        bodyItemMap.set(ans.itemId, ans.value);
      }

      if (bodyItemMap.size !== expectedItems.length) {
        throw DomainException.validation([
          {
            path: 'answers',
            message: `Recovery snapshot must include every item exactly once. Expected ${expectedItems.length}, got ${bodyItemMap.size}`,
          },
        ]);
      }

      for (const itemId of expectedItems) {
        if (!bodyItemMap.has(itemId)) {
          throw DomainException.validation([
            { path: 'answers', message: `Missing answer for item: ${itemId}` },
          ]);
        }
      }

      // Validate option values
      const optionOrders = (att.option_orders || {}) as Record<string, string[]>;
      for (const [itemId, val] of bodyItemMap.entries()) {
        if (val !== null) {
          const validOpts = optionOrders[itemId] || ['true', 'false'];
          if (!validOpts.includes(val)) {
            throw DomainException.validation([
              { path: 'answers', message: `Invalid option value for item ${itemId}` },
            ]);
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

      const timely = (
        await client.query(
          'SELECT item_id "itemId",value,client_seq "clientSeq" FROM attempt_answers WHERE school_id=$1 AND attempt_id=$2 ORDER BY item_id',
          [school.id, att.id],
        )
      ).rows;
      await client.query(
        'UPDATE recovery_uploads SET generation_at_upload=$1,timely_evidence=$2 WHERE school_id=$3 AND id=$4',
        [
          att.device_generation,
          JSON.stringify({
            savedAt: att.last_server_save_at
              ? new Date(att.last_server_save_at).toISOString()
              : null,
            highestAcceptedSeq: att.highest_accepted_seq,
            answers: timely,
          }),
          school.id,
          recoveryId,
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

      await captureResultSnapshot(client, school.id, att.session_id);
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
    parse(resourceIdSchema, recoveryId);
    parse(idempotencyKeySchema, idempotencyKey);
    body = parse(
      z
        .object({
          decision: z.enum(['accept', 'reject']),
          reason: z.string().trim().min(1).max(2000),
        })
        .strict(),
      body,
    );
    const admin = req.sessionUser;
    const school = req.school;
    if (!admin || !school || admin.role !== 'school_admin') {
      throw DomainException.forbidden('School admin access required');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw DomainException.validation([
        { path: 'Idempotency-Key', message: 'Missing required Idempotency-Key header' },
      ]);
    }

    if (body.decision !== 'accept' && body.decision !== 'reject') {
      throw DomainException.validation([
        { path: 'decision', message: 'decision must be "accept" or "reject"' },
      ]);
    }

    if (!body.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
      throw DomainException.validation([
        { path: 'reason', message: 'A non-empty audit reason is required' },
      ]);
    }

    const serverNow = this.clock.now();

    return this.db.withTenantTransaction(school.id, async (client) => {
      const sittingLock = await client.query(
        'SELECT es.id FROM exam_sessions es JOIN attempts a ON a.school_id=es.school_id AND a.session_id=es.id JOIN recovery_uploads r ON r.school_id=a.school_id AND r.attempt_id=a.id WHERE r.school_id=$1 AND r.id=$2 FOR UPDATE OF es',
        [school.id, recoveryId],
      );
      if (!sittingLock.rowCount) throw DomainException.notFound('Recovery upload not found');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${school.id}:${admin.id}:recovery_decision:${idempotencyKey}`,
      ]);

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
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'Idempotency-Key reused with conflicting decision payload',
        );
      }

      // Query recovery record with lock
      const recRes = await client.query(
        `SELECT r.*, es.exam_version_id, a.state AS attempt_state, a.student_id
         FROM recovery_uploads r
         JOIN attempts a ON a.id = r.attempt_id AND a.school_id = r.school_id
         JOIN exam_sessions es ON es.id = a.session_id AND es.school_id = a.school_id
         WHERE r.id = $1 AND r.school_id = $2
         FOR UPDATE`,
        [recoveryId, school.id],
      );

      if (recRes.rows.length === 0) {
        throw DomainException.notFound('Recovery upload not found');
      }

      const rec = recRes.rows[0];

      if (rec.status !== 'recovery_pending') {
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'Recovery upload has already been decided',
        );
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
        if (
          existingSub.rows.length > 0 ||
          att.state === 'invalidated' ||
          att.state === 'submitted'
        ) {
          throw DomainException.conflict(
            'ALREADY_FINALIZED',
            'Attempt already has a committed submission',
          );
        }

        // Grade the recovery snapshot answers
        const itemsRes = await client.query(
          `SELECT item_id, type, marks, correct_key, options FROM exam_items WHERE exam_version_id = $1 AND school_id = $2`,
          [rec.exam_version_id, school.id],
        );

        const answersList = rec.answers_snapshot as Array<{ itemId: string; value: string | null }>;
        const ansMap = new Map<string, string | null>();
        for (const a of answersList) {
          ansMap.set(a.itemId, a.value);
        }

        const digest = computeFinalSnapshotDigest({
          attemptId: att.id,
          examVersion: rec.exam_version,
          scheduleRevision: rec.schedule_revision,
          deviceGeneration: rec.device_generation,
          finalSeq: rec.final_seq,
          answers: answersList,
        }).snapshotDigest;
        const known =
          rec.exam_version === att.exam_version &&
          rec.schedule_revision === att.schedule_revision &&
          Number.isSafeInteger(rec.device_generation) &&
          rec.device_generation >= 1 &&
          rec.device_generation <= att.device_generation;
        if (
          digest !== rec.snapshot_digest ||
          !known ||
          answersList.length !== itemsRes.rows.length ||
          ansMap.size !== itemsRes.rows.length ||
          itemsRes.rows.some(
            (item) =>
              !ansMap.has(item.item_id) ||
              (ansMap.get(item.item_id) !== null &&
                !z
                  .array(z.object({ id: z.string() }))
                  .parse(item.options)
                  .some((o) => o.id === ansMap.get(item.item_id))),
          )
        )
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Recovery evidence does not match its approved version',
          );

        let totalScore = 0;
        let totalMaxScore = 0;
        for (const item of itemsRes.rows) {
          totalMaxScore += item.marks;
          const studentAns = ansMap.get(item.item_id);
          if (studentAns && studentAns === item.correct_key) {
            totalScore += item.marks;
          }
        }
        const percent =
          totalMaxScore > 0 ? Number(((totalScore / totalMaxScore) * 100).toFixed(2)) : 0;

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
               decision_reason = 'Superseded by accepted recovery ' || $4::text
           WHERE attempt_id = $3 AND id != $4 AND status = 'recovery_pending'`,
          [admin.id, serverNow, att.id, rec.id],
        );

        // Audit event
        await client.query(
          `INSERT INTO audit_events (school_id, actor_id, action, resource_id, reason, server_at)
           VALUES ($1, $2, 'recovery_accept', $3, $4, NOW())`,
          [school.id, admin.id, rec.id, body.reason.trim()],
        );

        const resultRevision = await captureResultSnapshot(client, school.id, att.session_id);
        await client.query(
          'UPDATE recovery_uploads SET decision_result_revision=$1 WHERE school_id=$2 AND id=$3',
          [resultRevision, school.id, rec.id],
        );
        const responsePayload = {
          recoveryId: rec.id,
          decision: 'accept',
          decidedAt: serverNow.toISOString(),
          resultRevision,
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

        if (remainingPending === 0 && att.state !== 'submitted' && att.state !== 'invalidated') {
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

        await captureResultSnapshot(client, school.id, att.session_id);
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
