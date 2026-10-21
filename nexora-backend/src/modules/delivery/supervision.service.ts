import type { RequestSchool, RequestUser } from '../../common/guards/session-auth.guard';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { parsePreparationInput, resourceIdSchema } from './preparation-schemas';
const eventSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['hidden', 'returned', 'pagehide', 'fullscreen_exit', 'focus_lost']),
    observedAt: z.string().datetime(),
    deviceGeneration: z.number().int().positive(),
  })
  .strict();
const commandSchema = z
  .object({
    action: z.enum(['suspend', 'resume']),
    reason: z.string().trim().min(1).max(500),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
type ScopedRequest = Request & { school: RequestSchool; sessionUser: RequestUser };
type Attempt = {
  id: string;
  student_id: string;
  suspended: boolean;
  assistance_paused: boolean;
  supervision_revision: number;
  deadline_at: Date;
  state: string;
  device_generation: number;
};
type EventRow = {
  id: string;
  actor_id: string;
  payload: Record<string, unknown>;
  received_at: Date;
};
@Injectable()
export class SupervisionService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  private async owned(client: PoolClient, req: ScopedRequest, id: string) {
    const result = await client.query<Attempt>(
      'SELECT * FROM attempts WHERE school_id=$1 AND id=$2 FOR UPDATE',
      [req.school.id, id],
    );
    const row = result.rows[0];
    if (!row || (req.sessionUser.role === 'student' && row.student_id !== req.sessionUser.id))
      throw DomainException.notFound();
    return row;
  }
  private identity(req: Request, id: string): asserts req is ScopedRequest {
    if (!req.school || !req.sessionUser) throw DomainException.authRequired();
    if (!['student', 'school_admin'].includes(req.sessionUser.role))
      throw DomainException.forbidden();
    parsePreparationInput(resourceIdSchema, id);
  }
  private async response(client: PoolClient, req: ScopedRequest, a: Attempt) {
    const rows = await client.query<EventRow>(
      `SELECT * FROM attempt_supervision_events
      WHERE school_id=$1 AND attempt_id=$2 ORDER BY received_at DESC, id DESC LIMIT 100`,
      [req.school.id, a.id],
    );
    return {
      attemptId: a.id,
      suspended: a.suspended,
      assistancePaused: a.assistance_paused,
      revision: a.supervision_revision,
      deadlineAt: a.deadline_at.toISOString(),
      serverNow: this.clock.now().toISOString(),
      events: rows.rows
        .filter((r) => r.payload.kind)
        .map((r) => ({ ...r.payload, receivedAt: r.received_at.toISOString() })),
      history: rows.rows
        .filter((r) => r.payload.action)
        .map((r) => ({
          action: r.payload.action,
          reason: r.payload.reason,
          actorId: r.actor_id,
          at: r.received_at.toISOString(),
          revision: r.payload.revision,
        })),
    };
  }
  async read(req: Request, id: string) {
    this.identity(req, id);
    return this.db.withTenantTransaction(req.school.id, async (client) =>
      this.response(client, req, await this.owned(client, req, id)),
    );
  }
  async report(req: Request, id: string, input: unknown) {
    this.identity(req, id);
    if (req.sessionUser.role !== 'student') throw DomainException.forbidden();
    const body = parsePreparationInput(
      z.object({ events: z.array(eventSchema).min(1).max(50) }).strict(),
      input,
    );
    return this.db.withTenantTransaction(req.school.id, async (client) => {
      const a = await this.owned(client, req, id);
      // Telemetry remains acceptable after finalization and device transfer: it never changes marks.
      const count = await client.query<{ count: string }>(
        `SELECT count(*) FROM attempt_supervision_events
        WHERE school_id=$1 AND attempt_id=$2 AND payload ? 'kind'`,
        [req.school.id, id],
      );
      let remaining = Math.max(0, 2000 - Number(count.rows[0].count));
      const acceptedIds: string[] = [];
      for (const event of body.events) {
        if (event.deviceGeneration > a.device_generation)
          throw DomainException.validationError('Unknown device generation');
        const old = await client.query<EventRow>(
          'SELECT * FROM attempt_supervision_events WHERE school_id=$1 AND attempt_id=$2 AND id=$3',
          [req.school.id, id, event.id],
        );
        if (old.rows.length) {
          if (
            JSON.stringify(old.rows[0].payload, Object.keys(old.rows[0].payload).sort()) !==
            JSON.stringify(event, Object.keys(event).sort())
          )
            throw DomainException.conflict('REVISION_CONFLICT', 'Event ID was reused');
        } else if (remaining > 0) {
          await client.query(
            'INSERT INTO attempt_supervision_events(school_id,attempt_id,id,actor_id,payload,received_at) VALUES($1,$2,$3,$4,$5,$6)',
            [req.school.id, id, event.id, req.sessionUser.id, event, this.clock.now()],
          );
          remaining--;
        } else continue;
        acceptedIds.push(event.id);
      }
      return { acceptedIds };
    });
  }
  async decide(req: Request, id: string, input: unknown, key: string | undefined) {
    this.identity(req, id);
    if (req.sessionUser.role !== 'school_admin') throw DomainException.forbidden();
    const command = parsePreparationInput(commandSchema, input);
    const eventId = parsePreparationInput(resourceIdSchema, key);
    return this.db.withTenantTransaction(req.school.id, async (client) => {
      const a = await this.owned(client, req, id);
      const old = await client.query<EventRow>(
        'SELECT * FROM attempt_supervision_events WHERE school_id=$1 AND attempt_id=$2 AND id=$3',
        [req.school.id, id, eventId],
      );
      if (old.rows.length) {
        const p = old.rows[0];
        if (
          p.actor_id !== req.sessionUser.id ||
          p.payload.action !== command.action ||
          p.payload.reason !== command.reason ||
          p.payload.expectedRevision !== command.expectedRevision
        )
          throw DomainException.conflict('REVISION_CONFLICT', 'Request key was reused');
        return this.response(client, req, a);
      }
      if (a.supervision_revision !== command.expectedRevision)
        throw DomainException.conflict('REVISION_CONFLICT', 'Refresh supervision before deciding');
      if (!['preparing', 'active'].includes(a.state) || this.clock.now() >= a.deadline_at)
        throw DomainException.conflict(
          'ALREADY_FINALIZED',
          'This attempt is closed; use recovery review for retained evidence',
        );
      a.suspended = command.action === 'suspend';
      a.supervision_revision++;
      await client.query(
        'UPDATE attempts SET suspended=$1, supervision_revision=$2 WHERE school_id=$3 AND id=$4',
        [a.suspended, a.supervision_revision, req.school.id, id],
      );
      await client.query(
        'INSERT INTO attempt_supervision_events(school_id,attempt_id,id,actor_id,payload,received_at) VALUES($1,$2,$3,$4,$5,$6)',
        [
          req.school.id,
          id,
          eventId,
          req.sessionUser.id,
          { ...command, revision: a.supervision_revision },
          this.clock.now(),
        ],
      );
      return this.response(client, req, a);
    });
  }
}
