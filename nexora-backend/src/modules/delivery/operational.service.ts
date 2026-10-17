import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { computeCanonicalDigest } from '../../common/crypto/canonical-digest';
import { requireDeviceBinding } from '../../common/crypto/device-credential';
import { parsePreparationInput as parse, resourceIdSchema as uuid } from './preparation-schemas';

const generation = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const transferInput = z
  .object({
    newDeviceId: uuid,
    expectedDeviceGeneration: generation,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const readinessInput = z
  .object({
    packageId: uuid,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    examVersion: generation,
    scheduleRevision: generation,
    deviceGeneration: generation,
    shellBuild: z.string().trim().min(1).max(200),
  })
  .strict();
type Attempt = {
  id: string;
  student_id: string;
  session_id: string;
  device_id: string;
  device_generation: number;
  state: string;
  deadline_at: Date;
  exam_version: number;
  schedule_revision: number;
};

export function identity(req: Request, role: 'student' | 'school_admin') {
  if (!req.sessionUser || !req.school) throw DomainException.authRequired();
  if (req.sessionUser.role !== role) throw DomainException.forbidden();
  return { user: req.sessionUser, school: req.school };
}

@Injectable()
export class OperationalService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  private async replay(
    client: PoolClient,
    school: string,
    actor: string,
    operation: string,
    key: string,
    digest: string,
    conflict: 'REVISION_CONFLICT' | 'IDEMPOTENCY_CONFLICT',
  ) {
    // Serialize even when the idempotency row does not yet exist.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${school}:${actor}:${operation}:${key}`,
    ]);
    const result = await client.query<{ payload_digest: string; response_body: unknown }>(
      'SELECT payload_digest,response_body FROM idempotency_keys WHERE school_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4',
      [school, actor, operation, key],
    );
    const stored = result.rows[0];
    if (stored && stored.payload_digest !== digest)
      throw DomainException.conflict(conflict, 'Idempotency key has a different payload');
    return stored;
  }

  private async remember(
    client: PoolClient,
    school: string,
    actor: string,
    operation: string,
    key: string,
    digest: string,
    response: unknown,
  ) {
    await client.query(
      'INSERT INTO idempotency_keys(school_id,actor_id,operation,idempotency_key,payload_digest,status_code,response_body) VALUES($1,$2,$3,$4,$5,200,$6)',
      [school, actor, operation, key, digest, JSON.stringify(response)],
    );
  }

  async transfer(req: Request, id: string, input: unknown, rawKey: unknown) {
    const { user, school } = identity(req, 'school_admin');
    const attemptId = parse(uuid, id),
      key = parse(uuid, rawKey),
      body = parse(transferInput, input);
    const digest = computeCanonicalDigest({ attemptId, ...body });
    return this.db.withTenantTransaction(school.id, async (client) => {
      const cached = await this.replay(
        client,
        school.id,
        user.id,
        'device_transfer_v10',
        key,
        digest,
        'REVISION_CONFLICT',
      );
      const result = await client.query<Attempt>(
        'SELECT * FROM attempts WHERE school_id=$1 AND id=$2 FOR UPDATE',
        [school.id, attemptId],
      );
      const att = result.rows[0];
      if (!att) throw DomainException.notFound();
      if (cached) return cached.response_body;
      if (
        att.device_generation !== body.expectedDeviceGeneration ||
        att.device_generation >= Number.MAX_SAFE_INTEGER ||
        att.device_id === body.newDeviceId
      )
        throw DomainException.conflict(
          'REVISION_CONFLICT',
          'Refresh the current device generation',
        );
      const receipt = await client.query(
        'SELECT id FROM submissions WHERE school_id=$1 AND attempt_id=$2',
        [school.id, id],
      );
      if (!['preparing', 'active'].includes(att.state) || receipt.rowCount)
        throw DomainException.conflict('ALREADY_FINALIZED', 'Attempt is not transferable');
      const enrollment = await client.query(
        `SELECT u.id FROM users u JOIN session_roster sr ON sr.school_id=u.school_id AND sr.student_id=u.id WHERE u.school_id=$1 AND u.id=$2 AND u.status='active' AND u.role='student' AND sr.session_id=$3 AND sr.admission_status='admitted' FOR SHARE OF u,sr`,
        [school.id, att.student_id, att.session_id],
      );
      if (!enrollment.rows.length)
        throw DomainException.conflict('REVISION_CONFLICT', 'Student is not eligible');
      const device = await client.query(
        `SELECT b.expires_at FROM device_bindings d JOIN browser_devices b ON b.device_id=d.device_id AND b.credential_hash=d.credential_hash WHERE d.school_id=$1 AND d.user_id=$2 AND d.device_id=$3 AND b.revoked_at IS NULL FOR SHARE OF d,b`,
        [school.id, att.student_id, body.newDeviceId],
      );
      const now = this.clock.now();
      if (now >= att.deadline_at)
        throw DomainException.conflict('RECOVERY_REQUIRED', 'The original deadline has passed');
      if (!device.rows[0] || new Date(device.rows[0].expires_at) <= now)
        throw DomainException.validationError(
          'Replacement browser must have a valid student registration',
        );
      const next = att.device_generation + 1,
        transferId = randomUUID();
      await client.query(
        `UPDATE attempts SET device_id=$1,device_generation=$2,highest_accepted_seq=0,state='preparing',unlocked_at=NULL,current_readiness=NULL,updated_at=$3 WHERE school_id=$4 AND id=$5`,
        [body.newDeviceId, next, now, school.id, id],
      );
      // Retain original save timestamps and old revision-history evidence.
      await client.query(
        'UPDATE attempt_answers SET device_generation=$1,client_seq=0 WHERE school_id=$2 AND attempt_id=$3',
        [next, school.id, id],
      );
      await client.query(
        `INSERT INTO device_transfer_events(id,school_id,attempt_id,actor_id,actor_name,reason,transferred_at,from_generation,to_generation,old_device_id,new_device_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          transferId,
          school.id,
          id,
          user.id,
          user.displayName,
          body.reason,
          now,
          att.device_generation,
          next,
          att.device_id,
          body.newDeviceId,
        ],
      );
      await client.query(
        `INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,server_at) VALUES($1,$2,'device_transfer',$3,$4,$5)`,
        [school.id, user.id, id, body.reason, now],
      );
      const response = {
        attemptId: id,
        deviceGeneration: next,
        state: 'preparing',
        deadlineAt: att.deadline_at.toISOString(),
        transferredAt: now.toISOString(),
        transferId,
      };
      await this.remember(client, school.id, user.id, 'device_transfer_v10', key, digest, response);
      return response;
    });
  }

  async readiness(req: Request, id: string, input: unknown, rawKey: unknown) {
    const { user, school } = identity(req, 'student');
    const attemptId = parse(uuid, id),
      key = parse(uuid, rawKey),
      body = parse(readinessInput, input);
    const digest = computeCanonicalDigest({ attemptId, ...body });
    return this.db.withTenantTransaction(school.id, async (client) => {
      const cached = await this.replay(
        client,
        school.id,
        user.id,
        'readiness',
        key,
        digest,
        'IDEMPOTENCY_CONFLICT',
      );
      const result = await client.query<Attempt>(
        'SELECT * FROM attempts WHERE school_id=$1 AND student_id=$2 AND id=$3 FOR UPDATE',
        [school.id, user.id, id],
      );
      const att = result.rows[0];
      if (!att) throw DomainException.notFound();
      await requireDeviceBinding(client, req, school.id, user.id, att.device_id, () =>
        this.clock.now(),
      );
      const packageResult = await client.query<{
        id: string;
        sha256_hex: string;
        version: number;
        schedule_revision: number;
      }>(
        `SELECT p.id,p.sha256_hex,v.version,s.schedule_revision FROM exam_sessions s JOIN exam_versions v ON v.id=s.exam_version_id AND v.school_id=s.school_id JOIN exam_packages p ON p.exam_version_id=v.id AND p.school_id=v.school_id JOIN session_roster sr ON sr.session_id=s.id AND sr.school_id=s.school_id WHERE s.school_id=$1 AND s.id=$2 AND sr.student_id=$3 AND sr.admission_status='admitted'`,
        [school.id, att.session_id, user.id],
      );
      const paper = packageResult.rows[0];
      if (
        !paper ||
        paper.id !== body.packageId ||
        paper.sha256_hex !== body.sha256 ||
        paper.version !== body.examVersion ||
        att.exam_version !== body.examVersion ||
        att.schedule_revision !== body.scheduleRevision ||
        paper.schedule_revision !== body.scheduleRevision ||
        att.device_generation !== body.deviceGeneration
      )
        throw DomainException.conflict('READINESS_MISMATCH', 'Preparation identity changed');
      if (cached) return cached.response_body;
      const now = this.clock.now();
      if (att.state !== 'preparing' || now >= att.deadline_at)
        throw DomainException.conflict(
          'STATE_CHANGED',
          'A new report requires a preparing attempt before its deadline',
        );
      const readiness = { ...body, acknowledgementId: randomUUID(), receivedAt: now.toISOString() };
      await client.query(
        'UPDATE attempts SET current_readiness=$1,last_contact_at=GREATEST(last_contact_at,$2) WHERE school_id=$3 AND id=$4',
        [JSON.stringify(readiness), now, school.id, id],
      );
      const response = { attemptId: id, readiness, serverNow: now.toISOString() };
      await this.remember(client, school.id, user.id, 'readiness', key, digest, response);
      return response;
    });
  }
}
