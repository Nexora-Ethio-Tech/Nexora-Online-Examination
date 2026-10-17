import { practiceGate, practiceStats } from '../../common/db/practice-access';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { mutate } from '../../common/db/mutation';
import {
  currentResultSource,
  resultSourceSchema,
  ResultSource,
} from '../../common/db/result-snapshot';
import { DomainException } from '../../common/errors/domain.exception';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { renderReport } from './render-report';
import { publicationSchema, publishSchema, reportSchema, Publication } from './schemas';

const pagination = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    cursor: z.string().max(1600).optional(),
  })
  .strict();
function identity(req: Request, student = false) {
  if (!req.sessionUser || !req.school) throw DomainException.authRequired();
  if (
    student
      ? req.sessionUser.role !== 'student'
      : !['teacher', 'school_admin'].includes(req.sessionUser.role)
  )
    throw DomainException.forbidden();
  return { school: req.school, user: req.sessionUser };
}
function cursor(input: string | undefined, scope: string) {
  if (!input) return null;
  try {
    const value = z
      .object({
        scope: z.string(),
        id: uuid,
        revision: z.number().int().positive().optional(),
        at: z.string().datetime().optional(),
      })
      .strict()
      .parse(JSON.parse(Buffer.from(input, 'base64url').toString()));
    if (value.scope !== scope) throw new Error();
    return value;
  } catch {
    throw DomainException.validationError('Invalid results cursor');
  }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
@Injectable()
export class ResultsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  async authorized(c: PoolClient, req: Request, id: string) {
    const { school, user } = identity(req);
    const found = await c.query(
      `SELECT s.id FROM exam_sessions s JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id WHERE s.school_id=$1 AND s.id=$2 AND ($3='school_admin' OR EXISTS(SELECT 1 FROM teacher_assignments a JOIN classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id JOIN subjects sub ON sub.school_id=a.school_id AND sub.id=a.subject_id WHERE a.school_id=e.school_id AND a.teacher_id=$4 AND a.class_id=e.class_id AND a.subject_id=e.subject_id AND a.active AND cl.active AND sub.active))`,
      [school.id, id, user.role, user.id],
    );
    if (!found.rowCount) throw DomainException.notFound();
  }
  async latestPublication(c: PoolClient, school: string, id: string): Promise<Publication | null> {
    const row = (
      await c.query<{
        revision: number;
        results_approved_at: Date;
        actor_name: string | null;
        display_name: string;
        results_release_at: Date;
        reason: string | null;
        excluded_attempt_ids: unknown;
      }>(
        'SELECT p.*,u.display_name FROM result_publications p JOIN users u ON u.id=p.approved_by AND u.school_id=p.school_id WHERE p.school_id=$1 AND p.session_id=$2 ORDER BY revision DESC LIMIT 1',
        [school, id],
      )
    ).rows[0];
    if (!row) return null;
    return publicationSchema.parse({
      revision: row.revision,
      approvedAt: row.results_approved_at.toISOString(),
      approvedBy: row.actor_name ?? row.display_name,
      releaseAt: row.results_release_at.toISOString(),
      reason: row.reason ?? 'Historical publication',
      exclusions: row.excluded_attempt_ids,
    });
  }
  async source(
    c: PoolClient,
    school: string,
    id: string,
    revision?: number,
  ): Promise<ResultSource> {
    const current = (
      await c.query<{ results_revision: number }>(
        'SELECT results_revision FROM exam_sessions WHERE school_id=$1 AND id=$2',
        [school, id],
      )
    ).rows[0];
    if (!current) throw DomainException.notFound();
    const requested = revision ?? current.results_revision;
    const row = (
      await c.query<{ source: unknown }>(
        'SELECT source FROM result_snapshots WHERE school_id=$1 AND session_id=$2 AND revision=$3',
        [school, id, requested],
      )
    ).rows[0];
    if (!row) {
      if (requested === current.results_revision) return currentResultSource(c, school, id);
      throw DomainException.notFound('Results revision not found');
    }
    return resultSourceSchema.parse(row.source);
  }
  async report(c: PoolClient, school: string, id: string, revision?: number) {
    if (revision !== undefined) {
      const saved = (
        await c.query<{ report_snapshot: unknown }>(
          'SELECT report_snapshot FROM result_publications WHERE school_id=$1 AND session_id=$2 AND revision=$3',
          [school, id, revision],
        )
      ).rows[0];
      if (saved?.report_snapshot)
        return {
          ...reportSchema.parse(saved.report_snapshot),
          serverNow: this.clock.now().toISOString(),
        };
    }
    const source = await this.source(c, school, id, revision);
    const publication = await this.latestPublication(c, school, id);
    return renderReport(
      source,
      publication,
      this.clock.now().toISOString(),
      publication?.revision === source.session.revision ? publication.exclusions : [],
    );
  }
  async sessions(req: Request, input: unknown) {
    const { school, user } = identity(req),
      q = parse(pagination, input),
      limit = q.limit ?? 25,
      scope = `${school.id}:${user.id}:result-sessions`,
      after = cursor(q.cursor, scope);
    if (after && !after.at) throw DomainException.validationError('Invalid session cursor');
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const rows = (
          await c.query<{ id: string; ends_at: Date }>(
            `SELECT s.id,s.ends_at FROM exam_sessions s JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id WHERE s.school_id=$1 AND ($2='school_admin' OR EXISTS(SELECT 1 FROM teacher_assignments a JOIN classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id JOIN subjects su ON su.school_id=a.school_id AND su.id=a.subject_id WHERE a.school_id=e.school_id AND a.teacher_id=$3 AND a.class_id=e.class_id AND a.subject_id=e.subject_id AND a.active AND cl.active AND su.active)) AND ($4::uuid IS NULL OR (s.ends_at,s.id)>($5::timestamptz,$4::uuid)) ORDER BY s.ends_at,s.id LIMIT $6`,
            [school.id, user.role, user.id, after?.id ?? null, after?.at ?? null, limit + 1],
          )
        ).rows;
        const items = [];
        for (const row of rows.slice(0, limit)) {
          await this.authorized(c, req, row.id);
          items.push((await this.report(c, school.id, row.id)).summary);
        }
        const last = rows.slice(0, limit).at(-1);
        return {
          items,
          nextCursor:
            rows.length > limit && last
              ? encode({ scope, id: last.id, at: last.ends_at.toISOString() })
              : null,
          serverNow: this.clock.now().toISOString(),
        };
      },
      true,
    );
  }
  async rows(req: Request, id: string, input: unknown) {
    const { school, user } = identity(req);
    parse(uuid, id);
    const q = parse(pagination, input),
      limit = q.limit ?? 25,
      scope = `${school.id}:${user.id}:${id}:rows`,
      after = cursor(q.cursor, scope);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        await this.authorized(c, req, id);
        const report = await this.report(c, school.id, id);
        if (after && after.revision !== report.summary.revision)
          throw DomainException.conflict('REVISION_CONFLICT', 'Results changed; restart the list');
        let offset = 0;
        if (after) {
          offset = report.rows.findIndex((r) => r.studentId === after.id) + 1;
          if (!offset)
            throw DomainException.validationError('Cursor student is not in the snapshot');
        }
        const rows = report.rows.slice(offset, offset + limit),
          last = rows.at(-1);
        return {
          summary: report.summary,
          rows,
          nextCursor:
            offset + limit < report.rows.length && last
              ? encode({ scope, id: last.studentId, revision: report.summary.revision })
              : null,
          serverNow: report.serverNow,
        };
      },
      true,
    );
  }
  async exportReport(req: Request, id: string, revision: number, analytics = false) {
    const { school } = identity(req);
    parse(uuid, id);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        await this.authorized(c, req, id);
        const report = await this.report(c, school.id, id, revision);
        return analytics ? report.analytics : report;
      },
      true,
    );
  }
  async publish(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req);
    if (user.role !== 'school_admin') throw DomainException.forbidden();
    parse(uuid, id);
    const body = parse(publishSchema.strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      await this.authorized(c, req, id);
      await c.query('SELECT id FROM exam_sessions WHERE school_id=$1 AND id=$2 FOR UPDATE', [
        school.id,
        id,
      ]);
      return mutate(c, school.id, user.id, `session:${id}:publish`, key, body, async () => {
        const source = await this.source(c, school.id, id);
        if (source.session.revision !== body.revision)
          throw DomainException.conflict('REVISION_CONFLICT', 'Results revision changed');
        if (
          (
            await c.query(
              'SELECT id FROM result_publications WHERE school_id=$1 AND session_id=$2 AND revision=$3',
              [school.id, id, body.revision],
            )
          ).rowCount
        )
          throw DomainException.conflict('REVISION_CONFLICT', 'This revision is already approved');
        const now = this.clock.now(),
          after = new Date(source.session.publishableAfter);
        if (now <= after || new Date(body.releaseAt) < after)
          throw DomainException.conflict(
            'RESULTS_NOT_RELEASED',
            'Wait until every final acceptance window has closed',
          );
        const candidate = renderReport(source, null, now.toISOString());
        const pending = candidate.rows.filter(
          (r) => r.status === 'awaiting_upload' || r.status === 'recovery_pending',
        );
        const unique = new Set(body.exclusions.map((e) => e.attemptId));
        if (
          unique.size !== body.exclusions.length ||
          body.exclusions.some((e) => !pending.some((r) => r.attemptId === e.attemptId))
        )
          throw DomainException.validationError('Exclude only distinct unresolved attempts');
        if (pending.some((r) => !r.attemptId || !unique.has(r.attemptId)))
          throw DomainException.conflict(
            'RECOVERY_REQUIRED',
            'Resolve or explicitly exclude every pending attempt',
          );
        const publication: Publication = {
          revision: body.revision,
          approvedAt: now.toISOString(),
          approvedBy: user.displayName,
          releaseAt: body.releaseAt,
          reason: body.reason,
          exclusions: body.exclusions,
        };
        const report = renderReport(source, publication, now.toISOString(), body.exclusions);
        await c.query(
          'INSERT INTO result_publications(school_id,session_id,revision,results_approved_at,results_release_at,excluded_attempt_ids,approved_by,reason,actor_name,report_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            school.id,
            id,
            body.revision,
            now,
            body.releaseAt,
            JSON.stringify(body.exclusions),
            user.id,
            body.reason,
            user.displayName,
            JSON.stringify(report),
          ],
        );
        await c.query(
          "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,server_at) VALUES($1,$2,'results:publish',$3,$4,$5)",
          [school.id, user.id, id, body.reason, now],
        );
        return report.summary;
      });
    });
  }
  async mine(req: Request, input: unknown) {
    const { school, user } = identity(req, true),
      q = parse(pagination, input),
      limit = q.limit ?? 25,
      scope = `${school.id}:${user.id}:my-results`,
      after = cursor(q.cursor, scope);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const sessions = (
          await c.query<{
            id: string;
            exam_id: string;
            exam_version_id: string;
            version: number;
            title: string;
            className: string;
            planned: Date;
          }>(
            `SELECT s.id,s.exam_id,s.exam_version_id,v.version,e.title,cl.name "className",COALESCE(s.planned_results_release_at,s.ends_at) planned FROM session_roster r JOIN exam_sessions s ON s.school_id=r.school_id AND s.id=r.session_id JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id JOIN exam_versions v ON v.school_id=s.school_id AND v.id=s.exam_version_id JOIN classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id WHERE r.school_id=$1 AND r.student_id=$2 AND ($3::uuid IS NULL OR s.id>$3) ORDER BY s.id LIMIT $4`,
            [school.id, user.id, after?.id ?? null, limit + 1],
          )
        ).rows;
        const items = [];
        for (const s of sessions.slice(0, limit)) {
          const latest = await this.latestPublication(c, school.id, s.id);
          const released = (
            await c.query<{ report_snapshot: unknown; revision: number }>(
              'SELECT report_snapshot,revision FROM result_publications WHERE school_id=$1 AND session_id=$2 AND results_release_at<=$3 AND report_snapshot IS NOT NULL ORDER BY revision DESC LIMIT 1',
              [school.id, s.id, this.clock.now()],
            )
          ).rows[0];
          let result = null;
          if (released) {
            const row = reportSchema
              .parse(released.report_snapshot)
              .rows.find((r) => r.studentId === user.id);
            if (!row) throw new Error('Published roster is inconsistent');
            const { studentId, studentName, loginId, attemptId, ...own } = row;
            void studentId;
            void studentName;
            void loginId;
            void attemptId;
            result = own;
          }
          const gate = await practiceGate(c, school.id, s.exam_version_id, this.clock.now()),
            stats = await practiceStats(c, school.id, user.id, s.exam_version_id);
          items.push({
            sessionId: s.id,
            title: s.title,
            className: s.className,
            plannedReleaseAt: latest?.releaseAt ?? s.planned.toISOString(),
            publicationRevision: released?.revision ?? null,
            result,
            bestPracticePercent: stats.bestPercent,
            practice: {
              examId: s.exam_id,
              examVersion: s.version,
              available: gate.available,
              blockedReason: gate.available ? null : gate.blockers.join(' '),
            },
          });
        }
        const last = sessions.slice(0, limit).at(-1);
        return {
          items,
          nextCursor: sessions.length > limit && last ? encode({ scope, id: last.id }) : null,
          serverNow: this.clock.now().toISOString(),
        };
      },
      true,
    );
  }
  async csv(req: Request, sessionId?: string, revision?: number) {
    const { school, user } = identity(req);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const ids = sessionId
          ? [sessionId]
          : (
              await c.query<{ id: string }>(
                `SELECT s.id FROM exam_sessions s JOIN exams e ON e.school_id=s.school_id AND e.id=s.exam_id WHERE s.school_id=$1 AND ($2='school_admin' OR EXISTS(SELECT 1 FROM teacher_assignments a JOIN classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id JOIN subjects su ON su.school_id=a.school_id AND su.id=a.subject_id WHERE a.school_id=e.school_id AND a.teacher_id=$3 AND a.class_id=e.class_id AND a.subject_id=e.subject_id AND a.active AND cl.active AND su.active)) ORDER BY s.ends_at,s.id`,
                [school.id, user.role, user.id],
              )
            ).rows.map((r) => r.id);
        const rows: unknown[][] = [
          [
            'Exam',
            'Class',
            'Session',
            'Revision',
            'Publication',
            'User ID',
            'Student',
            'Status',
            'Mark',
            'Maximum',
            'Percent',
            'Rank',
            'Exclusion reason',
          ],
        ];
        for (const id of ids) {
          await this.authorized(c, req, id);
          const report = await this.report(c, school.id, id, revision);
          for (const r of report.rows)
            rows.push([
              report.summary.title,
              report.summary.className,
              id,
              report.summary.revision,
              report.summary.publication?.revision === report.summary.revision
                ? 'Approved'
                : 'Candidate',
              r.loginId,
              r.studentName,
              r.status,
              r.score,
              r.maxScore,
              r.percent,
              r.rank,
              r.exclusionReason,
            ]);
        }
        const cell = (value: unknown) => {
          let s = value === null || value === undefined ? '' : String(value);
          if (
            typeof value === 'string' &&
            /^[=+\-@]/.test(
              [...s]
                .filter((char) => char.charCodeAt(0) > 31)
                .join('')
                .trimStart(),
            )
          )
            s = "'" + s;
          return '"' + s.replace(/"/g, '""') + '"';
        };
        return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
      },
      true,
    );
  }
}
