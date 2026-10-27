import { PackageWorkerService } from '../authoring/package-worker.service';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { mutate } from '../../common/db/mutation';
import { DomainException } from '../../common/errors/domain.exception';
import { identity } from '../delivery/operational.service';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { AuthoringService, Exam } from '../authoring/authoring.service';
import { itemSchema } from '../authoring/schemas';
import { adminDetailSchema, decisionSchema, sessionSchema } from './schemas';

export type AdminExam = Exam & {
  owner_id: string;
  class_id: string;
  subject_id: string;
  teacher_name: string;
  class_name: string;
  subject_name: string;
  grade: string | null;
  submitted_at: Date | null;
};
type Version = { id: string; version: number; frozen_metadata: unknown };
export type Session = {
  id: string;
  exam_id: string;
  exam_version_id: string;
  schedule_revision: number;
  preparation_visible_at: Date;
  starts_at: Date;
  ends_at: Date;
  planned_results_release_at: Date | null;
};
const page = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    cursor: z.string().max(1200).optional(),
    status: z.enum(['in_review', 'approved', 'returned']).optional(),
    classId: uuid.optional(),
    search: z.string().max(160).optional(),
    grade: z.string().max(40).optional(),
    teacher: z.string().max(160).optional(),
    subject: z.string().max(160).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();

@Injectable()
export class AdministrationService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
    private readonly authoring: AuthoringService,
    private readonly packages: PackageWorkerService,
  ) {}
  async exam(c: PoolClient, school: string, id: string, lock = false) {
    const e = (
      await c.query<AdminExam>(
        `SELECT e.*,u.display_name teacher_name,cl.name class_name,cl.grade,(SELECT max(server_at) FROM audit_events a WHERE a.school_id=e.school_id AND a.resource_id=e.id::text AND a.action='exam:submit') submitted_at,s.name subject_name FROM exams e JOIN users u ON u.school_id=e.school_id AND u.id=e.owner_id JOIN classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id JOIN subjects s ON s.school_id=e.school_id AND s.id=e.subject_id WHERE e.school_id=$1 AND e.id=$2 AND e.state<>'draft' AND e.archived_at IS NULL ${lock ? 'FOR UPDATE OF e' : ''}`,
        [school, id],
      )
    ).rows[0];
    if (!e) throw DomainException.notFound();
    if (lock && !e.assignment_id)
      throw DomainException.conflict(
        'LEGACY_EXAM_REPAIR_REQUIRED',
        'This legacy paper has no teacher assignment. Recreate and review it under a valid teacher assignment before approval or scheduling.',
      );
    return e;
  }
  async version(c: PoolClient, school: string, id: string) {
    return (
      (
        await c.query<Version>(
          'SELECT id,version,frozen_metadata FROM exam_versions WHERE school_id=$1 AND exam_id=$2 AND approved_at IS NOT NULL ORDER BY version DESC LIMIT 1',
          [school, id],
        )
      ).rows[0] ?? null
    );
  }
  async session(c: PoolClient, school: string, id: string, lock = false) {
    const s = (
      await c.query<Session>(
        `SELECT * FROM exam_sessions WHERE school_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
        [school, id],
      )
    ).rows[0];
    if (!s) throw DomainException.notFound();
    return s;
  }
  async sessionDto(c: PoolClient, school: string, s: Session) {
    const facts = (
      await c.query<{
        version: number;
        count: string;
        extra: number;
        issued: boolean;
        blocked: boolean;
        package_ready: boolean;
      }>(
        `SELECT v.version,(SELECT count(*) FROM session_roster r WHERE r.school_id=$1 AND r.session_id=$2) count,COALESCE((SELECT max(r.extra_time_minutes) FROM session_roster r WHERE r.school_id=$1 AND r.session_id=$2),0) extra,EXISTS(SELECT 1 FROM attempts a WHERE a.school_id=$1 AND a.session_id=$2) issued,EXISTS(SELECT 1 FROM practice_access p WHERE p.school_id=$1 AND p.exam_version_id=$3 AND (p.enabled OR p.released_at IS NOT NULL)) blocked,EXISTS(SELECT 1 FROM exam_packages p WHERE p.school_id=$1 AND p.exam_version_id=$3) package_ready FROM exam_versions v WHERE v.school_id=$1 AND v.id=$3`,
        [school, s.id, s.exam_version_id],
      )
    ).rows[0];
    return sessionSchema.parse({
      sessionId: s.id,
      examId: s.exam_id,
      approvedVersion: facts.version,
      scheduleRevision: s.schedule_revision,
      preparationVisibleAt: s.preparation_visible_at.toISOString(),
      startsAt: s.starts_at.toISOString(),
      endsAt: s.ends_at.toISOString(),
      latestDeadlineAt: new Date(s.ends_at.getTime() + facts.extra * 60000).toISOString(),
      resultsReleaseAt: (s.planned_results_release_at ?? s.ends_at).toISOString(),
      rosterCount: Number(facts.count),
      canReschedule:
        this.clock.now() < s.preparation_visible_at &&
        !facts.issued &&
        !facts.blocked &&
        facts.package_ready,
    });
  }
  async summary(c: PoolClient, school: string, e: AdminExam) {
    const v = await this.version(c, school, e.id);
    let packageState = 'not_requested',
      packageError: string | null = null;
    if (v) {
      const info = (
        await c.query<{ ready: boolean; status: string | null; error_message: string | null }>(
          'SELECT EXISTS(SELECT 1 FROM exam_packages WHERE school_id=$1 AND exam_version_id=$2) ready,j.status,j.error_message FROM (SELECT 1) x LEFT JOIN package_jobs j ON j.school_id=$1 AND j.exam_version_id=$2',
          [school, v.id],
        )
      ).rows[0];
      packageState = info.ready ? 'ready' : info.status === 'failed' ? 'failed' : 'pending';
      packageError = info.error_message;
    }
    return {
      exam: await this.authoring.draftData(c, school, e),
      teacherName: e.teacher_name,
      grade: e.grade ?? null,
      submittedAt: e.submitted_at?.toISOString() ?? null,
      className: e.class_name,
      subjectName: e.subject_name,
      approvedVersion: v?.version ?? null,
      packageState,
      packageError,
    };
  }
  async detail(c: PoolClient, school: string, e: AdminExam) {
    if (!e.assignment_id)
      throw DomainException.conflict(
        'LEGACY_EXAM_REPAIR_REQUIRED',
        'This legacy paper has no teacher assignment. Recreate and review it under a valid teacher assignment before approval or scheduling.',
      );
    const summary = await this.summary(c, school, e);
    const v = await this.version(c, school, e.id);
    const items =
      e.state === 'approved' && v
        ? z
            .array(itemSchema)
            .parse(
              (
                await c.query(
                  `SELECT item_id "itemId",external_id "externalId",type,stem,section_id "sectionId",passage_id "passageId",content,options,correct_key "correctOptionId",marks,primary_topic "primaryTopic",secondary_topics "secondaryTopics",explanation,key_consistent "keyConsistent",review_flags "reviewFlags",reviewed,review_note "reviewNote" FROM exam_items WHERE school_id=$1 AND exam_version_id=$2 ORDER BY position,item_id`,
                  [school, v.id],
                )
              ).rows,
            )
        : await this.authoring.items(c, school, e.id);
    const sessions = [];
    for (const s of (
      await c.query<Session>(
        'SELECT * FROM exam_sessions WHERE school_id=$1 AND exam_id=$2 ORDER BY starts_at,id',
        [school, e.id],
      )
    ).rows)
      sessions.push(await this.sessionDto(c, school, s));
    const history = (
      await c.query<{
        action: string;
        actorName: string;
        at: Date;
        comment: string;
        revision: number;
      }>(
        `SELECT action,actor_name "actorName",at,comment,revision FROM exam_history WHERE school_id=$1 AND exam_id=$2 UNION ALL SELECT 'submitted',u.display_name,a.created_at,'Submitted reviewed paper',a.revision FROM authoring_snapshots a JOIN users u ON u.school_id=a.school_id AND u.id=a.actor_id WHERE a.school_id=$1 AND a.exam_id=$2 AND a.kind='submitted' ORDER BY at,revision`,
        [school, e.id],
      )
    ).rows.map((h) => ({ ...h, at: h.at.toISOString() }));
    return adminDetailSchema.parse({
      ...summary,
      items,
      sessions,
      history,
      serverNow: this.clock.now().toISOString(),
    });
  }
  async read(req: Request, id: string) {
    const { school } = identity(req, 'school_admin');
    parse(uuid, id);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => this.detail(c, school.id, await this.exam(c, school.id, id)),
      true,
    );
  }
  async list(req: Request, input: unknown) {
    const { school } = identity(req, 'school_admin'),
      q = parse(page, input),
      limit = q.limit ?? 25;
    const filterScope = JSON.stringify([
      q.search,
      q.grade,
      q.teacher,
      q.subject,
      q.from,
      q.to,
      q.status,
      q.classId,
    ]);
    const sort =
      q.status === 'in_review'
        ? "COALESCE(submission.submitted_at,'9999-01-01'::timestamptz)"
        : 'e.created_at';
    const direction = q.status === 'in_review' ? 'ASC' : 'DESC';
    const operator = q.status === 'in_review' ? '>' : '<';
    let after: { id: string; at: string } | null = null;
    if (q.cursor) {
      try {
        const value = z
          .object({ school: uuid, id: uuid, at: z.string().datetime(), filterScope: z.string() })
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (value.school !== school.id || value.filterScope !== filterScope) throw new Error();
        after = value;
      } catch {
        throw DomainException.validationError('Invalid exam cursor');
      }
    }
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const rows = (
          await c.query<{ id: string; created_at: Date; sort_at: Date }>(
            `SELECT e.id,e.created_at,${sort} sort_at FROM exams e JOIN classes cl ON cl.id=e.class_id AND cl.school_id=e.school_id JOIN users u ON u.id=e.owner_id AND u.school_id=e.school_id JOIN subjects s ON s.id=e.subject_id AND s.school_id=e.school_id LEFT JOIN LATERAL (SELECT max(server_at) submitted_at FROM audit_events a WHERE a.school_id=e.school_id AND a.resource_id=e.id::text AND a.action='exam:submit') submission ON true WHERE e.school_id=$1 AND e.state<>'draft' AND e.archived_at IS NULL AND ($11::text IS NULL OR e.state=$11) AND ($12::uuid IS NULL OR e.class_id=$12) AND ($2::uuid IS NULL OR (${sort},e.id)${operator}($3::timestamptz,$2::uuid)) AND ($5::text IS NULL OR COALESCE(cl.grade,'unclassified')=$5) AND u.display_name ILIKE '%'||$6||'%' AND s.name ILIKE '%'||$7||'%' AND (e.title ILIKE '%'||$8||'%' OR cl.name ILIKE '%'||$8||'%' OR u.display_name ILIKE '%'||$8||'%' OR s.name ILIKE '%'||$8||'%' OR s.code ILIKE '%'||$8||'%') AND ($9::timestamptz IS NULL OR submission.submitted_at >= $9) AND ($10::timestamptz IS NULL OR submission.submitted_at <= $10) ORDER BY ${sort} ${direction},e.id ${direction} LIMIT $4`,
            [
              school.id,
              after?.id ?? null,
              after?.at ?? null,
              limit + 1,
              q.grade ?? null,
              (q.teacher ?? '').replace(/[\\%_]/g, '\\$&'),
              (q.subject ?? '').replace(/[\\%_]/g, '\\$&'),
              (q.search ?? '').replace(/[\\%_]/g, '\\$&'),
              q.from ?? null,
              q.to ?? null,
              q.status === 'in_review' ? 'pending_approval' : (q.status ?? null),
              q.classId ?? null,
            ],
          )
        ).rows;
        const items = [];
        for (const row of rows.slice(0, limit)) {
          const { packageError, ...summary } = await this.summary(
            c,
            school.id,
            await this.exam(c, school.id, row.id),
          );
          void packageError;
          items.push(summary);
        }
        const last = rows.slice(0, limit).at(-1);
        return {
          items,
          nextCursor:
            rows.length > limit && last
              ? Buffer.from(
                  JSON.stringify({
                    school: school.id,
                    filterScope,
                    id: last.id,
                    at: last.sort_at.toISOString(),
                  }),
                ).toString('base64url')
              : null,
          serverNow: this.clock.now().toISOString(),
        };
      },
      true,
    );
  }
  async history(
    c: PoolClient,
    req: Request,
    e: AdminExam,
    action: string,
    comment: string,
    details: unknown = {},
    sessionId: string | null = null,
  ) {
    const { school, user } = identity(req, 'school_admin');
    await c.query(
      'INSERT INTO exam_history(school_id,exam_id,session_id,actor_id,actor_name,action,comment,revision,at,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        school.id,
        e.id,
        sessionId,
        user.id,
        user.displayName,
        action,
        comment,
        e.revision,
        this.clock.now(),
        JSON.stringify(details),
      ],
    );
  }
  async decide(
    req: Request,
    id: string,
    decision: 'approve' | 'return',
    input: unknown,
    key: unknown,
  ) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(decisionSchema.strict(), input);
    if (decision === 'return' && !body.comment.trim())
      throw DomainException.validationError(
        'Enter the corrections required before returning a paper',
      );
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.exam(c, school.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:${decision}`, key, body, async () => {
        if (e.revision !== body.revision || e.state !== 'pending_approval')
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the submitted paper');
        if (decision === 'approve') {
          await this.authoring.owned(c, school.id, e.owner_id, id, true);
          const items = await this.authoring.items(c, school.id, id);
          if (!items.length || items.some((i) => !i.reviewed))
            throw DomainException.conflict('AI_REVIEW_REQUIRED', 'Every question must be reviewed');
          const next = (await this.version(c, school.id, id))?.version ?? 0;
          const version = (
            await c.query<{ id: string }>(
              'INSERT INTO exam_versions(school_id,exam_id,version,approved_by,approved_at,frozen_metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
              [
                school.id,
                id,
                next + 1,
                user.id,
                this.clock.now(),
                JSON.stringify(await this.authoring.dto(c, school.id, e)),
              ],
            )
          ).rows[0];
          await c.query(
            'INSERT INTO exam_items(school_id,exam_version_id,item_id,position,type,stem,options,correct_key,marks,primary_topic_id,secondary_topics,explanation,external_id,primary_topic,key_consistent,review_flags,reviewed,review_note,reviewed_by,reviewed_at,section_id,passage_id,content) SELECT school_id,$1,item_id,position,type,stem,options,correct_key,marks,primary_topic_id,secondary_topics,explanation,external_id,primary_topic,key_consistent,review_flags,reviewed,review_note,reviewed_by,reviewed_at,section_id,passage_id,content FROM exam_items WHERE school_id=$2 AND exam_id=$3 AND exam_version_id IS NULL',
            [version.id, school.id, id],
          );
          await c.query('INSERT INTO package_jobs(school_id,exam_version_id) VALUES($1,$2)', [
            school.id,
            version.id,
          ]);
          await this.packages.prepareNow(c, school.id, version.id);
        }
        await c.query(
          'UPDATE exams SET state=$1,status=$2,return_comment=$3,revision=revision+1,updated_at=now() WHERE school_id=$4 AND id=$5',
          [
            decision === 'approve' ? 'approved' : 'returned',
            decision === 'approve' ? 'approved' : 'returned',
            decision === 'return' ? body.comment : null,
            school.id,
            id,
          ],
        );
        const updated = await this.exam(c, school.id, id);
        await this.history(
          c,
          req,
          updated,
          decision === 'approve' ? 'approved' : 'returned',
          body.comment,
        );
        return this.detail(c, school.id, updated);
      });
    });
  }
  async retryPackage(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(z.object({ revision: z.number().int().positive() }).strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.exam(c, school.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:package-retry`, key, body, async () => {
        const v = await this.version(c, school.id, id);
        if (e.state !== 'approved' || e.revision !== body.revision || !v)
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the approved paper');
        // Repair a missing queue row only for an existing, authorized immutable approval.
        await c.query(
          'INSERT INTO package_jobs(school_id,exam_version_id) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM exam_packages WHERE school_id=$1 AND exam_version_id=$2) ON CONFLICT(school_id,exam_version_id) DO NOTHING',
          [school.id, v.id],
        );
        const reset = await c.query(
          "UPDATE package_jobs SET status='pending',error_message=NULL,lease_token=NULL,lease_until=NULL WHERE school_id=$1 AND exam_version_id=$2 AND (status IN ('failed','pending') OR (status='processing' AND lease_until<now())) AND NOT EXISTS(SELECT 1 FROM exam_packages WHERE school_id=$1 AND exam_version_id=$2) RETURNING id",
          [school.id, v.id],
        );
        if (!reset.rowCount)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Package is already ready or another request is preparing it; refresh the paper',
          );
        await this.packages.prepareNow(c, school.id, v.id);
        await c.query('UPDATE exams SET revision=revision+1 WHERE school_id=$1 AND id=$2', [
          school.id,
          id,
        ]);
        return this.detail(c, school.id, await this.exam(c, school.id, id));
      });
    });
  }
}
