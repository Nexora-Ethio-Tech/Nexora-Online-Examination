import { validateImages } from './image-validation';
import { structureSchema, structureProblems } from './content-schema';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { mutate } from '../../common/db/mutation';
import { DomainException } from '../../common/errors/domain.exception';
import { computeCanonicalDigest } from '../../common/crypto/canonical-digest';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { draftSchema, itemSchema, metadataSchema, revision, Item } from './schemas';
import { hasRetainedReferences } from '../directory/record-removal';
import { actionableReviewFlags } from './review-flags';

export type Exam = {
  id: string;
  title: string;
  instructions: string;
  assignment_id: string | null;
  language: string;
  duration_minutes: number;
  pass_percent: string | number;
  ordering: string;
  revision: number;
  state: string;
  import_id: string | null;
  return_comment: string | null;
  created_at: Date;
  concluded?: boolean;
  structure?: unknown;
};
export function teacherIdentity(req: Request) {
  if (!req.sessionUser || !req.school) throw DomainException.authRequired();
  if (req.sessionUser.role !== 'teacher') throw DomainException.forbidden();
  return { school: req.school, user: req.sessionUser };
}
const listInput = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    category: z.enum(['all', 'active', 'past']).default('all'),
    status: z.enum(['draft', 'returned', 'in_review', 'approved']).optional(),
    cursor: z.string().max(1200).optional(),
  })
  .strict();
const itemSelect = `SELECT item_id "itemId",external_id "externalId",type,stem,section_id "sectionId",passage_id "passageId",content,options,correct_key "correctOptionId",marks,primary_topic "primaryTopic",secondary_topics "secondaryTopics",explanation,key_consistent "keyConsistent",review_flags "reviewFlags",reviewed,review_note "reviewNote" FROM exam_items WHERE school_id=$1 AND exam_id=$2 AND exam_version_id IS NULL ORDER BY position,item_id`;

@Injectable()
export class AuthoringService {
  constructor(private readonly db: DbService) {}
  async owned(c: PoolClient, school: string, teacher: string, id: string, lock = false) {
    const row = (
      await c.query<Exam>(
        `SELECT e.* FROM exams e JOIN teacher_assignments a ON a.school_id=e.school_id AND a.id=e.assignment_id AND a.teacher_id=e.owner_id AND a.class_id=e.class_id AND a.subject_id=e.subject_id JOIN classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id JOIN subjects s ON s.school_id=a.school_id AND s.id=a.subject_id WHERE e.school_id=$1 AND e.archived_at IS NULL AND e.owner_id=$2 AND e.id=$3 AND a.active AND cl.active AND s.active ${lock ? 'FOR UPDATE OF e FOR SHARE OF a,cl,s' : ''}`,
        [school, teacher, id],
      )
    ).rows[0];
    if (!row) throw DomainException.notFound();
    return row;
  }
  async items(c: PoolClient, school: string, id: string) {
    return z
      .array(itemSchema)
      .max(200)
      .parse((await c.query(itemSelect, [school, id])).rows)
      .map((item) => ({ ...item, reviewFlags: actionableReviewFlags(item.reviewFlags) }));
  }
  async draftData(c: PoolClient, school: string, e: Exam) {
    const items = await this.items(c, school, e.id);
    return {
      structure: structureSchema.parse(e.structure ?? { sections: [], passages: [] }),
      examId: e.id,
      createdAt: e.created_at?.toISOString(),
      concluded: e.concluded,
      title: e.title,
      instructions: e.instructions,
      assignmentId: e.assignment_id,
      language: e.language,
      durationMinutes: e.duration_minutes,
      passPercent: Number(e.pass_percent),
      ordering: e.ordering,
      revision: e.revision,
      status: e.state === 'pending_approval' ? 'in_review' : e.state,
      totalMarks: items.reduce((sum, i) => sum + i.marks, 0),
      itemCount: items.length,
      reviewedCount: items.filter((i) => i.reviewed).length,
      importId: e.import_id,
      returnComment: e.return_comment,
    };
  }
  async dto(c: PoolClient, school: string, e: Exam) {
    return draftSchema.parse(await this.draftData(c, school, e));
  }
  async mutable(c: PoolClient, school: string, e: Exam, expected: number) {
    if (e.revision !== expected || !['draft', 'returned'].includes(e.state))
      throw DomainException.conflict('REVISION_CONFLICT', 'Refresh this editable draft');
    const busy = await c.query(
      "SELECT id FROM import_jobs WHERE school_id=$1 AND exam_id=$2 AND state IN ('queued','parsing') LIMIT 1",
      [school, e.id],
    );
    if (busy.rowCount)
      throw DomainException.conflict('REVISION_CONFLICT', 'Wait for the active import');
  }
  async snapshot(
    c: PoolClient,
    school: string,
    actor: string,
    e: Exam,
    kind: string,
    items: Item[],
  ) {
    await c.query(
      'INSERT INTO authoring_snapshots(school_id,exam_id,revision,actor_id,kind,content) VALUES($1,$2,$3,$4,$5,$6)',
      [
        school,
        e.id,
        e.revision,
        actor,
        kind,
        JSON.stringify({ draft: await this.dto(c, school, e), items }),
      ],
    );
  }
  async assignments(req: Request, input: unknown) {
    const { school, user } = teacherIdentity(req),
      q = parse(listInput, input),
      limit = q.limit ?? 100;
    let after: string | null = null;
    if (q.cursor) {
      try {
        const value = z
          .object({ school: uuid, teacher: uuid, id: uuid })
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (value.school !== school.id || value.teacher !== user.id) throw new Error();
        after = value.id;
      } catch {
        throw DomainException.validationError('Invalid assignment cursor');
      }
    }
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const rows = (
          await c.query<{ assignmentId: string; subjectName: string; className: string }>(
            `SELECT a.id "assignmentId",s.name "subjectName",cl.name "className" FROM teacher_assignments a JOIN classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id JOIN subjects s ON s.school_id=a.school_id AND s.id=a.subject_id WHERE a.school_id=$1 AND a.teacher_id=$2 AND a.active AND cl.active AND s.active AND ($3::uuid IS NULL OR a.id>$3) ORDER BY a.id LIMIT $4`,
            [school.id, user.id, after, limit + 1],
          )
        ).rows;
        const items = rows.slice(0, limit);
        return {
          items,
          nextCursor:
            rows.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    school: school.id,
                    teacher: user.id,
                    id: items.at(-1)?.assignmentId,
                  }),
                ).toString('base64url')
              : null,
        };
      },
      true,
    );
  }
  async list(req: Request, input: unknown) {
    const { school, user } = teacherIdentity(req),
      q = parse(listInput, input),
      limit = q.limit ?? 25;
    const filterScope = JSON.stringify([q.category, q.status]);
    const concluded = `e.state='approved' AND EXISTS(SELECT 1 FROM exam_sessions es WHERE es.school_id=e.school_id AND es.exam_id=e.id) AND NOT EXISTS(SELECT 1 FROM exam_sessions es WHERE es.school_id=e.school_id AND es.exam_id=e.id AND es.ends_at+make_interval(mins=>COALESCE((SELECT max(extra_time_minutes) FROM session_roster sr WHERE sr.school_id=es.school_id AND sr.session_id=es.id),0))+interval '5 seconds' >= now())`;
    let after: { id: string; at: string } | null = null;
    if (q.cursor) {
      try {
        const value = z
          .object({
            school: uuid,
            teacher: uuid,
            filterScope: z.string(),
            id: uuid,
            at: z.string().datetime(),
          })
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (
          value.school !== school.id ||
          value.teacher !== user.id ||
          value.filterScope !== filterScope
        )
          throw new Error();
        after = value;
      } catch {
        throw DomainException.validationError('Invalid exam cursor');
      }
    }
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const rows = (
          await c.query<Exam>(
            `SELECT e.*, (${concluded}) concluded FROM exams e JOIN teacher_assignments a ON a.school_id=e.school_id AND a.id=e.assignment_id AND a.teacher_id=e.owner_id JOIN classes cl ON cl.school_id=a.school_id AND cl.id=a.class_id JOIN subjects s ON s.school_id=a.school_id AND s.id=a.subject_id WHERE e.school_id=$1 AND e.archived_at IS NULL AND e.owner_id=$2 AND a.active AND cl.active AND s.active AND ($6='all' OR ($6='past')=(${concluded})) AND ($7::text IS NULL OR e.state=$7) AND ($3::uuid IS NULL OR (e.created_at,e.id)<($4::timestamptz,$3::uuid)) ORDER BY e.created_at DESC,e.id DESC LIMIT $5`,
            [
              school.id,
              user.id,
              after?.id ?? null,
              after?.at ?? null,
              limit + 1,
              q.category,
              q.status === 'in_review' ? 'pending_approval' : (q.status ?? null),
            ],
          )
        ).rows;
        const selected = rows.slice(0, limit);
        const items = [];
        for (const e of selected) items.push(await this.dto(c, school.id, e));
        const last = selected.at(-1);
        return {
          items,
          nextCursor:
            rows.length > limit && last
              ? Buffer.from(
                  JSON.stringify({
                    school: school.id,
                    teacher: user.id,
                    filterScope,
                    id: last.id,
                    at: last.created_at.toISOString(),
                  }),
                ).toString('base64url')
              : null,
        };
      },
      true,
    );
  }
  async read(req: Request, id: string, onlyItems = false) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const e = await this.owned(c, school.id, user.id, id);
        return onlyItems
          ? { revision: e.revision, items: await this.items(c, school.id, id) }
          : this.dto(c, school.id, e);
      },
      true,
    );
  }
  async save(
    req: Request,
    id: string | undefined,
    input: unknown,
    key: unknown,
    onCreate?: () => void,
  ) {
    const { school, user } = teacherIdentity(req);
    if (id) parse(uuid, id);
    const body = id
      ? parse(metadataSchema.extend({ revision }).strict(), input)
      : parse(metadataSchema.strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = id ? await this.owned(c, school.id, user.id, id, true) : undefined;
      const assignment = (
        await c.query<{ class_id: string; subject_id: string }>(
          `SELECT a.class_id,a.subject_id FROM teacher_assignments a JOIN classes cl ON cl.id=a.class_id AND cl.school_id=a.school_id JOIN subjects s ON s.id=a.subject_id AND s.school_id=a.school_id WHERE a.school_id=$1 AND a.teacher_id=$2 AND a.id=$3 AND a.active AND cl.active AND s.active FOR SHARE OF a,cl,s`,
          [school.id, user.id, body.assignmentId],
        )
      ).rows[0];
      if (!assignment) throw DomainException.notFound('Teaching assignment not found');
      return mutate(c, school.id, user.id, `exam:${id ?? 'new'}:save`, key, body, async () => {
        if (e && 'revision' in body) {
          await this.mutable(c, school.id, e, parse(revision, body.revision));
          if (
            (await this.items(c, school.id, e.id)).length &&
            (e.assignment_id !== body.assignmentId || e.language !== body.language)
          )
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              'Assignment and language cannot change after import',
            );
        }
        const params = [
          body.title,
          body.instructions,
          body.assignmentId,
          body.language,
          body.durationMinutes,
          body.passPercent,
          body.ordering,
          assignment.class_id,
          assignment.subject_id,
          school.id,
          user.id,
        ];
        const saved = id
          ? (
              await c.query<Exam>(
                'UPDATE exams SET title=$1,instructions=$2,assignment_id=$3,language=$4,duration_minutes=$5,pass_percent=$6,ordering=$7,class_id=$8,subject_id=$9,revision=revision+1,updated_at=now() WHERE school_id=$10 AND owner_id=$11 AND id=$12 RETURNING *',
                [...params, id],
              )
            ).rows[0]
          : (
              await c.query<Exam>(
                'INSERT INTO exams(title,instructions,assignment_id,language,duration_minutes,pass_percent,ordering,class_id,subject_id,school_id,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
                params,
              )
            ).rows[0];
        if (!id) onCreate?.();
        return this.dto(c, school.id, saved);
      });
    });
  }
  async saveOutline(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    const body = parse(
      z
        .object({ revision, structure: structureSchema, items: z.array(itemSchema).max(200) })
        .strict(),
      input,
    );
    try {
      validateImages(body.structure, body.items);
    } catch {
      throw DomainException.validationError(
        'An image is damaged or unsupported. Upload it again using Add image.',
      );
    }
    const problems = structureProblems(body.structure, body.items);
    if (problems.length) throw DomainException.validationError(problems.join(' '));
    if (Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024)
      throw DomainException.validationError('The paper and images must fit within 4 MB.');
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.owned(c, school.id, user.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:outline`, key, body, async () => {
        await this.mutable(c, school.id, e, body.revision);
        const pending = await c.query(
          "SELECT id FROM import_jobs WHERE school_id=$1 AND exam_id=$2 AND state IN ('queued','parsing','ai_queued','ai_running') LIMIT 1",
          [school.id, id],
        );
        if (pending.rowCount)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Wait for processing or cancel the import before restructuring.',
          );
        const oldItems = await this.items(c, school.id, id);
        const oldStructure = structureSchema.parse(e.structure ?? { sections: [], passages: [] });
        await this.snapshot(c, school.id, user.id, e, 'before_outline_edit', oldItems);
        const kept = body.items.map((i) => i.itemId);
        await c.query(
          'DELETE FROM exam_items WHERE school_id=$1 AND exam_id=$2 AND exam_version_id IS NULL AND NOT (item_id=ANY($3::text[]))',
          [school.id, id, kept],
        );
        for (const [position, item] of body.items.entries()) {
          const old = oldItems.find((i) => i.itemId === item.itemId);
          const context = (v: typeof item, st: typeof body.structure) => ({
            section: st.sections.find((s) => s.id === v.sectionId),
            passage: st.passages.find((p) => p.id === v.passageId),
          });
          const changed =
            !old ||
            JSON.stringify({ ...old, reviewed: undefined, reviewNote: undefined }) !==
              JSON.stringify({ ...item, reviewed: undefined, reviewNote: undefined }) ||
            JSON.stringify(context(old, oldStructure)) !==
              JSON.stringify(context(item, body.structure));
          if (
            old &&
            (JSON.stringify(old.reviewFlags) !== JSON.stringify(item.reviewFlags) ||
              old.keyConsistent !== item.keyConsistent)
          )
            throw DomainException.validationError('AI review evidence cannot be changed.');
          if (!old && (item.keyConsistent !== null || item.reviewFlags.length))
            throw DomainException.validationError('New questions cannot claim AI review evidence.');
          if (old) {
            await c.query(
              'UPDATE exam_items SET position=$1,section_id=$2,passage_id=$3,content=$4,reviewed=CASE WHEN $5 THEN false ELSE reviewed END,reviewed_by=CASE WHEN $5 THEN NULL ELSE reviewed_by END,reviewed_at=CASE WHEN $5 THEN NULL ELSE reviewed_at END WHERE school_id=$6 AND exam_id=$7 AND exam_version_id IS NULL AND item_id=$8',
              [
                position,
                item.sectionId ?? null,
                item.passageId ?? null,
                JSON.stringify(item.content ?? []),
                changed,
                school.id,
                id,
                item.itemId,
              ],
            );
            // Existing text/answers are edited using the established question review form.
            if (
              old.stem !== item.stem ||
              old.type !== item.type ||
              JSON.stringify(old.options) !== JSON.stringify(item.options) ||
              old.correctOptionId !== item.correctOptionId ||
              old.externalId !== item.externalId ||
              old.marks !== item.marks
            )
              throw DomainException.validationError(
                'Edit existing question text and answers in question review.',
              );
          } else {
            await c.query(
              `INSERT INTO exam_items(school_id,exam_id,item_id,external_id,position,type,stem,options,correct_key,marks,primary_topic,secondary_topics,explanation,key_consistent,review_flags,reviewed,review_note,section_id,passage_id,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,'[]',false,'',$14,$15,$16)`,
              [
                school.id,
                id,
                item.itemId,
                item.externalId,
                position,
                item.type,
                item.stem,
                JSON.stringify(item.options),
                item.correctOptionId,
                item.marks,
                item.primaryTopic,
                JSON.stringify(item.secondaryTopics),
                item.explanation,
                item.sectionId ?? null,
                item.passageId ?? null,
                JSON.stringify(item.content ?? []),
              ],
            );
          }
        }
        const updated = (
          await c.query<Exam>(
            'UPDATE exams SET structure=$1,revision=revision+1,updated_at=now() WHERE school_id=$2 AND id=$3 RETURNING *',
            [JSON.stringify(body.structure), school.id, id],
          )
        ).rows[0];
        return this.dto(c, school.id, updated);
      });
    });
  }
  async saveItem(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    const body = parse(z.object({ revision, item: itemSchema }).strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.owned(c, school.id, user.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:item`, key, body, async () => {
        await this.mutable(c, school.id, e, body.revision);
        const items = await this.items(c, school.id, id),
          old = items.find((i) => i.itemId === body.item.itemId),
          item = body.item;
        if (!old) throw DomainException.notFound();
        if (
          JSON.stringify(old.content ?? []) !== JSON.stringify(item.content ?? []) ||
          (old.sectionId ?? null) !== (item.sectionId ?? null) ||
          (old.passageId ?? null) !== (item.passageId ?? null) ||
          old.externalId !== item.externalId ||
          old.type !== item.type ||
          JSON.stringify(old.options.map((o) => o.id)) !==
            JSON.stringify(item.options.map((o) => o.id)) ||
          old.keyConsistent !== item.keyConsistent ||
          JSON.stringify(old.reviewFlags) !== JSON.stringify(item.reviewFlags)
        )
          throw DomainException.validationError(
            'Item identity and AI review evidence cannot be changed',
          );
        await this.snapshot(c, school.id, user.id, e, 'before_item_edit', items);
        const changed =
          computeCanonicalDigest({
            stem: old.stem,
            options: old.options,
            key: old.correctOptionId,
            primaryTopic: old.primaryTopic,
            secondaryTopics: old.secondaryTopics,
            explanation: old.explanation,
          }) !==
          computeCanonicalDigest({
            stem: item.stem,
            options: item.options,
            key: item.correctOptionId,
            primaryTopic: item.primaryTopic,
            secondaryTopics: item.secondaryTopics,
            explanation: item.explanation,
          });
        await c.query(
          `UPDATE exam_items SET stem=$1,options=$2,correct_key=$3,marks=$4,primary_topic=$5,secondary_topics=$6,explanation=$7,reviewed=$8,review_note=$9,reviewed_by=CASE WHEN $8 THEN $10::uuid ELSE NULL END,reviewed_at=CASE WHEN $8 THEN now() ELSE NULL END,ai_input_hash=CASE WHEN $11 THEN NULL ELSE ai_input_hash END WHERE school_id=$12 AND exam_id=$13 AND item_id=$14 AND exam_version_id IS NULL`,
          [
            item.stem,
            JSON.stringify(item.options),
            item.correctOptionId,
            item.marks,
            item.primaryTopic,
            JSON.stringify(item.secondaryTopics),
            item.explanation,
            item.reviewed,
            item.reviewNote,
            user.id,
            changed,
            school.id,
            id,
            item.itemId,
          ],
        );
        const updated = (
          await c.query<Exam>(
            'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *',
            [school.id, id],
          )
        ).rows[0];
        return this.dto(c, school.id, updated);
      });
    });
  }
  async reviewAll(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    const body = parse(z.object({ revision, confirmed: z.literal(true) }).strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.owned(c, school.id, user.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:review-all`, key, body, async () => {
        await this.mutable(c, school.id, e, body.revision);
        const items = await this.items(c, school.id, id);
        const eligible = items.filter(
          (item) =>
            !item.reviewed &&
            item.keyConsistent !== false &&
            item.reviewFlags.length === 0 &&
            itemSchema.safeParse({ ...item, reviewed: true }).success,
        );
        if (!eligible.length)
          throw DomainException.validationError(
            'No complete questions are eligible. Resolve missing topics, explanations and flagged content first.',
          );
        await this.snapshot(c, school.id, user.id, e, 'before_bulk_review', items);
        await c.query(
          `UPDATE exam_items SET reviewed=true,reviewed_by=$1,reviewed_at=now()
           WHERE school_id=$2 AND exam_id=$3 AND exam_version_id IS NULL AND item_id=ANY($4::text[])`,
          [user.id, school.id, id, eligible.map((i) => i.itemId)],
        );
        await c.query(
          "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1,$2,'exam:review-all',$3,$4)",
          [
            school.id,
            user.id,
            id,
            `Teacher confirmed ${eligible.length} questions at revision ${e.revision}`,
          ],
        );
        const updated = (
          await c.query<Exam>(
            'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *',
            [school.id, id],
          )
        ).rows[0];
        return this.dto(c, school.id, updated);
      });
    });
  }
  async removeDraft(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    const body = parse(
      z
        .object({ revision, reason: z.string().trim().min(1).max(500), confirmed: z.literal(true) })
        .strict(),
      input,
    );
    return this.db.withTenantTransaction(school.id, async (c) => {
      return mutate(c, school.id, user.id, `exam:${id}:remove`, key, body, async () => {
        const e = await this.owned(c, school.id, user.id, id, true);
        if (e.revision !== body.revision || !['draft', 'returned'].includes(e.state))
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Only an editable draft can be removed',
          );
        if (
          (
            await c.query(
              'SELECT id FROM exam_versions WHERE school_id=$1 AND exam_id=$2 LIMIT 1',
              [school.id, id],
            )
          ).rowCount
        )
          throw DomainException.conflict('REVISION_CONFLICT', 'Approved versions must be retained');
        const retained = await hasRetainedReferences(c, 'exams', school.id, id);
        if (retained) {
          await c.query(
            "UPDATE import_jobs SET state='cancelled',status='failed',lease_token=NULL,lease_until=NULL,source_bytes=NULL,generation_request=NULL WHERE school_id=$1 AND exam_id=$2",
            [school.id, id],
          );
          await c.query(
            "UPDATE ai_jobs SET status='failed',error_message='DRAFT_REMOVED',lease_token=NULL,lease_until=NULL WHERE school_id=$1 AND import_job_id IN (SELECT id FROM import_jobs WHERE school_id=$1 AND exam_id=$2) AND status IN ('pending','processing')",
            [school.id, id],
          );
          await c.query(
            'UPDATE exams SET archived_at=now(),import_id=NULL,revision=revision+1 WHERE school_id=$1 AND id=$2',
            [school.id, id],
          );
        } else await c.query('DELETE FROM exams WHERE school_id=$1 AND id=$2', [school.id, id]);
        await c.query(
          "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1,$2,'exam:remove',$3,$4)",
          [school.id, user.id, id, body.reason],
        );
        return { id, outcome: retained ? 'archived' : 'deleted' };
      });
    });
  }
  async submit(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    const body = parse(z.object({ revision }).strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const e = await this.owned(c, school.id, user.id, id, true);
      return mutate(c, school.id, user.id, `exam:${id}:submit`, key, body, async () => {
        await this.mutable(c, school.id, e, body.revision);
        const items = await this.items(c, school.id, id);
        if (!items.length || items.some((i) => !i.reviewed))
          throw DomainException.conflict(
            'AI_REVIEW_REQUIRED',
            'Review every question before submission',
          );
        await this.snapshot(c, school.id, user.id, e, 'submitted', items);
        const updated = (
          await c.query<Exam>(
            "UPDATE exams SET state='pending_approval',status='in_review',revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *",
            [school.id, id],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1,$2,'exam:submit',$3,$4)",
          [school.id, user.id, id, `Reviewed revision ${e.revision}`],
        );
        return this.dto(c, school.id, updated);
      });
    });
  }
}
