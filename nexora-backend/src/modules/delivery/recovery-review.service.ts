import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { parsePreparationInput as parse, resourceIdSchema as id } from './preparation-schemas';
const fields = `r.id "recoveryId",r.attempt_id "attemptId",s.id "sessionId",COALESCE(v.frozen_metadata->>'title',e.title) title,cl.name "className",u.display_name "studentName",u.login_id "loginId",r.received_at "receivedAt",r.status`;
const joins = `FROM recovery_uploads r JOIN attempts a ON a.school_id=r.school_id AND a.id=r.attempt_id JOIN exam_sessions s ON s.school_id=a.school_id AND s.id=a.session_id JOIN exam_versions v ON v.school_id=s.school_id AND v.id=s.exam_version_id JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id JOIN classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id JOIN users u ON u.school_id=a.school_id AND u.id=a.student_id`;
const summary = z.object({
  recoveryId: id,
  attemptId: id,
  sessionId: id,
  title: z.string(),
  className: z.string(),
  studentName: z.string(),
  loginId: z.string(),
  receivedAt: z.date().transform((d) => d.toISOString()),
  status: z.enum(['recovery_pending', 'accepted', 'rejected']),
});
const evidence = z.object({
  savedAt: z.string().datetime().nullable(),
  highestAcceptedSeq: z.number().int().nonnegative(),
  answers: z.array(
    z.object({
      itemId: z.string(),
      value: z.string().nullable(),
      clientSeq: z.number().int().nonnegative(),
    }),
  ),
});
const record = z.object({
  reason: z.string(),
  deadline_at: z.date(),
  final_accept_until: z.date(),
  snapshot_digest: z.string(),
  exam_version: z.number(),
  schedule_revision: z.number(),
  device_generation: z.number(),
  final_seq: z.number(),
  answers_snapshot: z.array(z.object({ itemId: z.string(), value: z.string().nullable() })),
  generation_at_upload: z.number().nullable(),
  timely_evidence: evidence.nullable(),
  exam_version_id: id,
  instructions: z.string(),
  attempt_state: z.string(),
  has_receipt: z.boolean(),
  decided_at: z.date().nullable(),
  decision_reason: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decision_result_revision: z.number().nullable(),
});
function school(req: Request) {
  if (!req.sessionUser || !req.school) throw DomainException.authRequired();
  if (req.sessionUser.role !== 'school_admin') throw DomainException.forbidden();
  return req.school.id;
}
@Injectable()
export class RecoveryReviewService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  async list(req: Request, input: unknown) {
    const tenant = school(req),
      q = parse(
        z
          .object({
            status: z.enum(['pending', 'all']).default('pending'),
            limit: z
              .string()
              .regex(/^\d+$/)
              .transform(Number)
              .pipe(z.number().int().min(1).max(100))
              .optional(),
            cursor: z.string().max(1500).optional(),
          })
          .strict(),
        input,
      ),
      scope = `${tenant}:${q.status}`,
      limit = q.limit ?? 25;
    let after: { id: string; at: string } | undefined;
    if (q.cursor) {
      try {
        const v = z
          .object({ scope: z.string(), id, at: z.string().datetime() })
          .strict()
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (v.scope !== scope) throw new Error();
        after = v;
      } catch {
        throw DomainException.validationError('Invalid recovery cursor');
      }
    }
    return this.db.withTenantTransaction(
      tenant,
      async (c) => {
        const rows = z
          .array(summary)
          .parse(
            (
              await c.query(
                `SELECT ${fields} ${joins} WHERE r.school_id=$1 AND ($2='all' OR r.status='recovery_pending') AND ($3::uuid IS NULL OR (r.received_at,r.id)>($4::timestamptz,$3::uuid)) ORDER BY r.received_at,r.id LIMIT $5`,
                [tenant, q.status, after?.id ?? null, after?.at ?? null, limit + 1],
              )
            ).rows,
          );
        const items = rows.slice(0, limit),
          last = items.at(-1);
        return {
          items,
          nextCursor:
            rows.length > limit && last
              ? Buffer.from(
                  JSON.stringify({ scope, id: last.recoveryId, at: last.receivedAt }),
                ).toString('base64url')
              : null,
          serverNow: this.clock.now().toISOString(),
        };
      },
      true,
    );
  }
  async detail(req: Request, recoveryId: string) {
    const tenant = school(req);
    parse(id, recoveryId);
    return this.db.withTenantTransaction(
      tenant,
      async (c) => {
        const raw = (
          await c.query(
            `SELECT ${fields},r.*,a.deadline_at,a.final_accept_until,a.state attempt_state,s.exam_version_id,COALESCE(v.frozen_metadata->>'instructions',e.instructions) instructions,EXISTS(SELECT 1 FROM submissions x WHERE x.school_id=a.school_id AND x.attempt_id=a.id) has_receipt,(SELECT display_name FROM users d WHERE d.school_id=r.school_id AND d.id=r.decided_by) "decidedBy" ${joins} WHERE r.school_id=$1 AND r.id=$2`,
            [tenant, recoveryId],
          )
        ).rows[0];
        if (!raw) throw DomainException.notFound();
        const head = summary.parse(raw),
          r = record.parse(raw);
        if (r.generation_at_upload === null || r.timely_evidence === null)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'This historical upload predates immutable comparison capture; its original timely evidence needs operator review',
          );
        const items = z
          .array(
            z.object({
              itemId: z.string(),
              type: z.enum(['mcq_single', 'true_false']),
              stem: z.string(),
              marks: z.number(),
              options: z.array(z.object({ id: z.string(), text: z.string() })),
            }),
          )
          .parse(
            (
              await c.query(
                'SELECT item_id "itemId",type,stem,marks,options FROM exam_items WHERE school_id=$1 AND exam_version_id=$2 ORDER BY position,item_id',
                [tenant, r.exam_version_id],
              )
            ).rows,
          );
        const related = z
          .array(summary)
          .parse(
            (
              await c.query(
                `SELECT ${fields} ${joins} WHERE r.school_id=$1 AND r.attempt_id=$2 AND r.id<>$3 ORDER BY r.received_at,r.id`,
                [tenant, head.attemptId, recoveryId],
              )
            ).rows,
          );
        const blocker =
          head.status !== 'recovery_pending'
            ? 'This recovery has already been decided.'
            : r.has_receipt
              ? 'The attempt already has a committed submission.'
              : r.attempt_state === 'invalidated'
                ? 'The attempt is invalidated.'
                : null;
        return {
          ...head,
          serverNow: this.clock.now().toISOString(),
          reason: r.reason,
          deadlineAt: r.deadline_at.toISOString(),
          finalAcceptUntil: r.final_accept_until.toISOString(),
          snapshotDigest: r.snapshot_digest,
          snapshot: {
            examVersion: r.exam_version,
            scheduleRevision: r.schedule_revision,
            deviceGeneration: r.device_generation,
            finalSeq: r.final_seq,
            answers: r.answers_snapshot,
          },
          currentDeviceGeneration: r.generation_at_upload,
          latestTimelySave: r.timely_evidence,
          paper: {
            examVersion: r.exam_version,
            title: head.title,
            instructions: r.instructions,
            items,
          },
          relatedUploads: related,
          canAccept: blocker === null,
          acceptanceBlocker: blocker,
          decision:
            head.status === 'recovery_pending'
              ? null
              : {
                  decision: head.status === 'accepted' ? 'accept' : 'reject',
                  reason: r.decision_reason,
                  decidedAt: r.decided_at?.toISOString(),
                  decidedBy: r.decidedBy,
                  resultRevision: r.decision_result_revision,
                },
        };
      },
      true,
    );
  }
}
