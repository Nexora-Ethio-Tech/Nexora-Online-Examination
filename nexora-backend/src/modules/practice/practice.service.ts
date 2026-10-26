import { requestLimit } from '../../common/security/request-limit';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { mutate } from '../../common/db/mutation';
import { practiceGate, practiceStats } from '../../common/db/practice-access';
import { DomainException } from '../../common/errors/domain.exception';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { practiceAccessSchema, practiceAttemptSchema } from './schemas';
const page = z
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
const versionSchema = z.object({
  id: uuid,
  examId: uuid,
  version: z.number().int().positive(),
  title: z.string(),
  instructions: z.string(),
});
type Version = z.infer<typeof versionSchema>;
const itemSchema = z.object({
  itemId: z.string(),
  type: z.enum(['mcq_single', 'true_false']),
  stem: z.string(),
  marks: z.number().int().positive(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  correctKey: z.string(),
  explanation: z.string().min(1),
});
function identity(req: Request, role: 'student' | 'school_admin') {
  if (!req.sessionUser || !req.school) throw DomainException.authRequired();
  if (req.sessionUser.role !== role) throw DomainException.forbidden();
  return { school: req.school.id, user: req.sessionUser };
}
@Injectable()
export class PracticeService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  async version(
    c: PoolClient,
    school: string,
    id: string,
    lock = false,
    number?: number,
  ): Promise<Version> {
    if (lock) {
      const found = await c.query('SELECT id FROM exams WHERE school_id=$1 AND id=$2 FOR UPDATE', [
        school,
        id,
      ]);
      if (!found.rowCount) throw DomainException.notFound();
    }
    const row = (
      await c.query(
        `SELECT v.id,e.id "examId",v.version,COALESCE(v.frozen_metadata->>'title',e.title) title,COALESCE(v.frozen_metadata->>'instructions',e.instructions) instructions FROM exams e JOIN exam_versions v ON v.school_id=e.school_id AND v.exam_id=e.id WHERE e.school_id=$1 AND e.id=$2 AND v.approved_at IS NOT NULL AND ($3::int IS NULL OR v.version=$3) ORDER BY v.version DESC LIMIT 1`,
        [school, id, number ?? null],
      )
    ).rows[0];
    if (!row) throw DomainException.notFound();
    return versionSchema.parse(row);
  }
  async eligible(c: PoolClient, school: string, student: string, v: Version) {
    if (
      !(
        await c.query(
          'SELECT 1 FROM session_roster r JOIN exam_sessions s ON s.school_id=r.school_id AND s.id=r.session_id WHERE r.school_id=$1 AND r.student_id=$2 AND s.exam_version_id=$3 LIMIT 1',
          [school, student, v.id],
        )
      ).rowCount
    )
      throw DomainException.notFound();
  }
  async gate(c: PoolClient, school: string, v: Version) {
    const gate = await practiceGate(c, school, v.id, this.clock.now(), true);
    if (!gate.available)
      throw DomainException.conflict('PRACTICE_NOT_RELEASED', gate.blockers.join(' '));
    return gate;
  }
  async accessDto(c: PoolClient, school: string, v: Version) {
    const gate = await practiceGate(c, school, v.id, this.clock.now(), true);
    const history = (
      await c.query<{
        enabled: boolean;
        release_at: Date | null;
        reason: string;
        actor_name: string;
        at: Date;
      }>(
        'SELECT enabled,release_at,reason,actor_name,at FROM practice_access_history WHERE school_id=$1 AND exam_version_id=$2 ORDER BY at,id',
        [school, v.id],
      )
    ).rows.map((r) => ({
      enabled: r.enabled,
      releaseAt: r.release_at?.toISOString() ?? null,
      reason: r.reason,
      actorName: r.actor_name,
      at: r.at.toISOString(),
    }));
    return practiceAccessSchema.parse({
      examId: v.examId,
      examVersion: v.version,
      title: v.title,
      ...gate,
      history,
      serverNow: this.clock.now().toISOString(),
    });
  }
  async access(req: Request, id: string) {
    const { school } = identity(req, 'school_admin');
    parse(uuid, id);
    return this.db.withTenantTransaction(school, async (c) =>
      this.accessDto(c, school, await this.version(c, school, id, true)),
    );
  }
  async settings(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(
      z
        .object({
          revision: z.number().int().positive(),
          examVersion: z.number().int().positive(),
          enabled: z.boolean(),
          releaseAt: z.string().datetime().nullable(),
          reason: z.string().trim().max(2000).default(''),
        })
        .strict()
        .refine((v) => !v.enabled || v.releaseAt !== null),
      input,
    );
    return this.db.withTenantTransaction(school, async (c) => {
      const v = await this.version(c, school, id, true);
      return mutate(c, school, user.id, `exam:${id}:practice-access`, key, body, async () => {
        const prior = await practiceGate(c, school, v.id, this.clock.now(), true);
        if (prior.revision !== body.revision || v.version !== body.examVersion)
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh the practice settings');
        await c.query(
          'INSERT INTO practice_access(school_id,exam_version_id,enabled,release_at,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(school_id,exam_version_id) DO UPDATE SET enabled=EXCLUDED.enabled,release_at=EXCLUDED.release_at,revision=EXCLUDED.revision',
          [school, v.id, body.enabled, body.releaseAt, body.revision + 1],
        );
        await c.query(
          'INSERT INTO practice_access_history(school_id,exam_version_id,actor_id,actor_name,enabled,release_at,reason,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            school,
            v.id,
            user.id,
            user.displayName,
            body.enabled,
            body.releaseAt,
            body.reason,
            this.clock.now(),
          ],
        );
        return this.accessDto(c, school, v);
      });
    });
  }
  async list(req: Request, input: unknown, admin = false) {
    const { school, user } = identity(req, admin ? 'school_admin' : 'student'),
      q = parse(page, input),
      limit = q.limit ?? 25,
      scope = `${school}:${user.id}:${admin}:practice`;
    let after: string | null = null;
    if (q.cursor) {
      try {
        const decoded = z
          .object({ scope: z.string(), id: uuid })
          .strict()
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (decoded.scope !== scope) throw new Error();
        after = decoded.id;
      } catch {
        throw DomainException.validationError('Invalid practice cursor');
      }
    }
    return this.db.withTenantTransaction(school, async (c) => {
      const rows = (
        await c.query<{ id: string }>(
          `SELECT e.id FROM exams e WHERE e.school_id=$1 AND ($3::uuid IS NULL OR e.id>$3) AND EXISTS(SELECT 1 FROM exam_versions v WHERE v.school_id=e.school_id AND v.exam_id=e.id AND v.approved_at IS NOT NULL AND ($4 OR EXISTS(SELECT 1 FROM exam_sessions s JOIN session_roster r ON r.school_id=s.school_id AND r.session_id=s.id WHERE s.school_id=v.school_id AND s.exam_version_id=v.id AND r.student_id=$2))) ORDER BY e.id LIMIT $5`,
          [school, user.id, after, admin, limit + 1],
        )
      ).rows;
      const items = [];
      for (const row of rows.slice(0, limit)) {
        const v = await this.version(c, school, row.id, true);
        if (admin) items.push(await this.accessDto(c, school, v));
        else {
          await this.eligible(c, school, user.id, v);
          const gate = await practiceGate(c, school, v.id, this.clock.now(), true),
            stats = await practiceStats(c, school, user.id, v.id);
          items.push({
            examId: v.examId,
            examVersion: v.version,
            title: v.title,
            available: gate.available,
            blockers: gate.blockers,
            releaseAt: gate.releaseAt,
            bestPercent: stats.bestPercent,
            completedCount: stats.completedCount,
            activeAttemptId: stats.activeAttemptId,
          });
        }
      }
      const last = rows.slice(0, limit).at(-1);
      return {
        items,
        nextCursor:
          rows.length > limit && last
            ? Buffer.from(JSON.stringify({ scope, id: last.id })).toString('base64url')
            : null,
        serverNow: this.clock.now().toISOString(),
      };
    });
  }
  async items(c: PoolClient, school: string, v: Version) {
    return z
      .array(itemSchema)
      .min(1)
      .parse(
        (
          await c.query(
            'SELECT item_id "itemId",type,stem,marks,options,correct_key "correctKey",explanation FROM exam_items WHERE school_id=$1 AND exam_version_id=$2 ORDER BY position,item_id',
            [school, v.id],
          )
        ).rows,
      );
  }
  async dto(c: PoolClient, school: string, student: string, v: Version, id: string) {
    const attempt = z
      .object({
        state: z.enum(['active', 'completed']),
        score: z.number(),
        completed_at: z.date().nullable(),
      })
      .parse(
        (
          await c.query(
            'SELECT state,score,completed_at FROM practice_attempts WHERE school_id=$1 AND id=$2 AND student_id=$3 AND valid',
            [school, id, student],
          )
        ).rows[0],
      );
    const answers = z
      .array(z.object({ item_id: z.string(), value: z.string() }))
      .parse(
        (
          await c.query(
            'SELECT item_id,value FROM practice_answers WHERE school_id=$1 AND practice_attempt_id=$2',
            [school, id],
          )
        ).rows,
      );
    const items = await this.items(c, school, v),
      maxScore = items.reduce((s, i) => s + i.marks, 0),
      stats = await practiceStats(c, school, student, v.id);
    return practiceAttemptSchema.parse({
      practiceAttemptId: id,
      examId: v.examId,
      examVersion: v.version,
      title: v.title,
      instructions: v.instructions,
      state: attempt.state,
      items: items.map((item) => {
        const { correctKey, explanation, ...publicItem } = item,
          answer = answers.find((a) => a.item_id === item.itemId);
        return {
          ...publicItem,
          feedback: answer
            ? {
                chosenOptionId: answer.value,
                correctOptionId: correctKey,
                correct: answer.value === correctKey,
                explanation,
                earnedMarks: answer.value === correctKey ? item.marks : 0,
              }
            : null,
        };
      }),
      score: attempt.state === 'completed' ? attempt.score : null,
      maxScore,
      percent: attempt.state === 'completed' ? (100 * attempt.score) / maxScore : null,
      completedAt: attempt.completed_at?.toISOString() ?? null,
      bestPercent: stats.bestPercent,
      serverNow: this.clock.now().toISOString(),
    });
  }
  async start(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'student');
    await requestLimit(this.db, `practice:${school}:${user.id}`, 120, 60);
    parse(uuid, id);
    const body = parse(z.object({ examVersion: z.number().int().positive() }).strict(), input);
    return this.db.withTenantTransaction(school, async (c) => {
      const v = await this.version(c, school, id, true, body.examVersion);
      await this.eligible(c, school, user.id, v);
      await this.gate(c, school, v);
      return mutate(c, school, user.id, `exam:${id}:practice-start`, key, body, async () => {
        const made = (
          await c.query<{ id: string }>(
            'INSERT INTO practice_attempts(school_id,student_id,exam_version_id,created_at) VALUES($1,$2,$3,$4) RETURNING id',
            [school, user.id, v.id, this.clock.now()],
          )
        ).rows[0];
        return this.dto(c, school, user.id, v, made.id);
      });
    });
  }
  async attempt(
    req: Request,
    id: string,
    operation: 'read' | 'answer' | 'complete' = 'read',
    input: unknown = {},
    key?: unknown,
  ) {
    const { school, user } = identity(req, 'student');
    if (operation !== 'read') await requestLimit(this.db, `practice:${school}:${user.id}`, 120, 60);
    parse(uuid, id);
    const body =
      operation === 'answer'
        ? parse(
            z
              .object({ itemId: z.string().min(1).max(128), value: z.string().min(1).max(128) })
              .strict(),
            input,
          )
        : parse(z.object({}).strict(), input);
    return this.db.withTenantTransaction(school, async (c) => {
      const target = (
        await c.query<{ exam_id: string; version: number }>(
          "SELECT v.exam_id,v.version FROM practice_attempts p JOIN exam_versions v ON v.school_id=p.school_id AND v.id=p.exam_version_id WHERE p.school_id=$1 AND p.id=$2 AND p.student_id=$3 AND p.valid AND p.state<>'abandoned'",
          [school, id, user.id],
        )
      ).rows[0];
      if (!target) throw DomainException.notFound();
      const v = await this.version(c, school, target.exam_id, true, target.version);
      await this.eligible(c, school, user.id, v);
      await this.gate(c, school, v);
      const locked = (
        await c.query<{ state: string }>(
          "SELECT state FROM practice_attempts WHERE school_id=$1 AND id=$2 AND valid AND state<>'abandoned' FOR UPDATE",
          [school, id],
        )
      ).rows[0];
      if (!locked) throw DomainException.notFound();
      if (operation === 'read') return this.dto(c, school, user.id, v, id);
      return mutate(c, school, user.id, `practice:${id}:${operation}`, key, body, async () => {
        const items = await this.items(c, school, v);
        if (operation === 'answer' && 'itemId' in body && 'value' in body) {
          const item = items.find((i) => i.itemId === body.itemId);
          if (!item || !item.options.some((o) => o.id === body.value))
            throw DomainException.validationError('Choose an option from this approved question');
          const existing = (
            await c.query<{ value: string }>(
              'SELECT value FROM practice_answers WHERE school_id=$1 AND practice_attempt_id=$2 AND item_id=$3',
              [school, id, item.itemId],
            )
          ).rows[0];
          if (existing && existing.value !== body.value)
            throw DomainException.conflict(
              'ALREADY_ANSWERED',
              'The first recorded answer cannot be changed',
            );
          if (!existing) {
            if (locked.state !== 'active')
              throw DomainException.conflict('ALREADY_FINALIZED', 'Practice attempt is completed');
            await c.query(
              'INSERT INTO practice_answers(school_id,practice_attempt_id,item_id,value,is_correct,explanation) VALUES($1,$2,$3,$4,$5,$6)',
              [
                school,
                id,
                item.itemId,
                body.value,
                body.value === item.correctKey,
                item.explanation,
              ],
            );
          }
        }
        if (operation === 'complete' && locked.state !== 'completed') {
          const answers = z
            .array(z.object({ item_id: z.string(), value: z.string() }))
            .parse(
              (
                await c.query(
                  'SELECT item_id,value FROM practice_answers WHERE school_id=$1 AND practice_attempt_id=$2',
                  [school, id],
                )
              ).rows,
            );
          if (items.some((i) => !answers.some((a) => a.item_id === i.itemId)))
            throw DomainException.conflict(
              'PRACTICE_INCOMPLETE',
              'Answer every question before completing practice',
            );
          const max = items.reduce((s, i) => s + i.marks, 0),
            score = items.reduce(
              (s, i) =>
                s +
                (answers.find((a) => a.item_id === i.itemId)?.value === i.correctKey ? i.marks : 0),
              0,
            );
          await c.query(
            "UPDATE practice_attempts SET state='completed',score=$3,max_score=$4,completed_at=$5 WHERE school_id=$1 AND id=$2",
            [school, id, score, max, this.clock.now()],
          );
          const stats = await practiceStats(c, school, user.id, v.id);
          await c.query(
            'INSERT INTO practice_summaries(school_id,student_id,exam_version_id,best_percent,best_attempt_id,completed_count) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,student_id,exam_version_id) DO UPDATE SET best_percent=EXCLUDED.best_percent,best_attempt_id=EXCLUDED.best_attempt_id,completed_count=EXCLUDED.completed_count,updated_at=now()',
            [school, user.id, v.id, stats.bestPercent, stats.bestAttemptId, stats.completedCount],
          );
        }
        return this.dto(c, school, user.id, v, id);
      });
    });
  }
}
