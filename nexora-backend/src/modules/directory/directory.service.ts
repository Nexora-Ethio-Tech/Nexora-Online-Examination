import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { randomUUID, randomBytes } from 'crypto';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { DomainException } from '../../common/errors/domain.exception';
import { mutate } from '../../common/db/mutation';
import { hashPassword } from '../../common/crypto/password';
import { hasRetainedReferences } from './record-removal';
import { identity } from '../delivery/operational.service';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';

const name = z.string().trim().min(1).max(160),
  reason = z.string().trim().min(1).max(2000),
  revision = z.number().int().positive();
const edit = { revision, reason };
const classInput = z
  .object({
    name,
    academicYear: z.string().trim().min(1).max(30),
    grade: z.string().trim().min(1).max(40).optional(),
    section: z.string().trim().min(1).max(40).optional(),
    reason,
  })
  .strict();
const subjectInput = z
  .object({
    name,
    grade: z.string().trim().min(1).max(40).optional(),
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,30}$/),
    reason,
  })
  .strict();
const query = z
  .object({
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    cursor: z.string().min(1).max(1500).optional(),
    search: z.string().max(160).optional(),
    grade: z.string().max(40).optional(),
    teacherId: uuid.optional(),
    subjectId: uuid.optional(),
    classId: z.union([uuid, z.literal('unassigned')]).optional(),
  })
  .strict();
type Account = {
  id: string;
  display_name: string;
  login_id: string;
  role: 'student' | 'teacher' | 'invigilator';
  student_ref: string | null;
  class_id: string | null;
  status: 'active' | 'inactive';
  credentials_issued: boolean;
  revision: number;
};
const accountSelect = `SELECT u.id,u.display_name,u.login_id,u.role,u.student_ref,u.status,u.credentials_issued,u.revision,(SELECT e.class_id FROM enrollments e WHERE e.school_id=u.school_id AND e.student_id=u.id ORDER BY e.created_at DESC,e.id LIMIT 1) class_id FROM users u`;
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const account = (r: Account) => ({
  userId: r.id,
  displayName: r.display_name,
  loginId: r.login_id,
  role: r.role,
  studentRef: r.student_ref,
  classId: r.role === 'student' ? r.class_id : null,
  status: r.status,
  credentialState: r.credentials_issued ? 'issued' : 'unissued',
  revision: r.revision,
});

@Injectable()
export class DirectoryService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  private async lock(c: PoolClient, school: string) {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${school}:directory`]);
  }
  private async audit(
    c: PoolClient,
    req: Request,
    action: string,
    target: string,
    label: string,
    why: string,
  ) {
    const { user, school } = identity(req, 'school_admin');
    await c.query(
      'INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,server_at,target_label,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        school.id,
        user.id,
        `directory:${action}`,
        target,
        why,
        this.clock.now(),
        label,
        user.displayName,
      ],
    );
  }
  async list(
    req: Request,
    kind:
      | 'classes'
      | 'subjects'
      | 'students'
      | 'teachers'
      | 'invigilators'
      | 'teacher-assignments'
      | 'audit',
    input: unknown,
  ) {
    const { school } = identity(req, 'school_admin'),
      q = parse(query, input),
      limit = q.limit ?? 25;
    const scope = `${school.id}:${kind}:${q.search ?? ''}:${q.classId ?? ''}:${q.grade ?? ''}:${q.teacherId ?? ''}:${q.subjectId ?? ''}`;
    let after = '';
    if (q.cursor) {
      try {
        const parsed = z
          .object({ scope: z.string(), id: uuid })
          .strict()
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (parsed.scope !== scope) throw new Error();
        after = parsed.id;
      } catch {
        throw DomainException.validationError('Invalid list cursor');
      }
    }
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        let sql = '';
        const params: unknown[] = [school.id, after || null, limit + 1];
        if (kind === 'classes')
          sql = `SELECT id "classId",name,grade,section,code_or_year "academicYear",revision,active,(SELECT count(*)::int FROM users u WHERE u.school_id=classes.school_id AND u.role='student' AND (SELECT e.class_id FROM enrollments e WHERE e.school_id=u.school_id AND e.student_id=u.id ORDER BY e.created_at DESC,e.id LIMIT 1)=classes.id) "studentCount" FROM classes WHERE school_id=$1 AND active AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`;
        if (kind === 'subjects')
          sql = `SELECT id "subjectId",name,grade,code,revision,active FROM subjects WHERE school_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`;
        if (kind === 'students' || kind === 'teachers' || kind === 'invigilators') {
          params.push(
            kind === 'students' ? 'student' : kind === 'teachers' ? 'teacher' : 'invigilator',
            (q.search ?? '').replace(/[\\%_]/g, '\\$&'),
            q.classId ?? null,
          );
          sql = `${accountSelect} WHERE u.school_id=$1 AND ($2::uuid IS NULL OR u.id>$2) AND u.role=$4 AND (u.display_name ILIKE '%'||$5||'%' OR u.login_id ILIKE '%'||$5||'%' OR COALESCE(u.student_ref,'') ILIKE '%'||$5||'%') AND ($6::text IS NULL OR COALESCE((SELECT e.class_id::text FROM enrollments e WHERE e.school_id=u.school_id AND e.student_id=u.id ORDER BY e.created_at DESC,e.id LIMIT 1),'unassigned')=$6) ORDER BY u.id LIMIT $3`;
        }
        if (kind === 'teacher-assignments') {
          params.push(
            q.classId ?? null,
            q.subjectId ?? null,
            q.teacherId ?? null,
            q.grade ?? null,
            (q.search ?? '').replace(/[\\%_]/g, '\\$&'),
          );
          sql = `SELECT a.id "assignmentId",a.teacher_id "teacherId",a.class_id "classId",a.subject_id "subjectId",a.active,a.revision,u.display_name "teacherName",c.name "className",c.grade,s.name "subjectName" FROM teacher_assignments a JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id JOIN classes c ON c.school_id=a.school_id AND c.id=a.class_id JOIN subjects s ON s.school_id=a.school_id AND s.id=a.subject_id WHERE a.school_id=$1 AND ($2::uuid IS NULL OR a.id>$2) AND c.active AND s.active AND ($4::text IS NULL OR a.class_id::text=$4) AND ($5::uuid IS NULL OR a.subject_id=$5) AND ($6::uuid IS NULL OR a.teacher_id=$6) AND ($7::text IS NULL OR COALESCE(c.grade,'unclassified')=$7) AND (u.display_name ILIKE '%'||$8||'%' OR c.name ILIKE '%'||$8||'%' OR s.name ILIKE '%'||$8||'%') ORDER BY a.id LIMIT $3`;
        }
        if (kind === 'audit')
          sql = `SELECT id "auditId",action,resource_id target,COALESCE(target_label,resource_id) "targetLabel",COALESCE(actor_name,'Administrator') "actorName",reason,server_at at FROM audit_events WHERE school_id=$1 AND action LIKE 'directory:%' AND ($2::uuid IS NULL OR (server_at,id)<(SELECT server_at,id FROM audit_events WHERE id=$2 AND school_id=$1)) ORDER BY server_at DESC,id DESC LIMIT $3`;
        const rows = (await c.query(sql, params)).rows;
        const selected = rows.slice(0, limit);
        const items =
          kind === 'students' || kind === 'teachers' || kind === 'invigilators'
            ? selected.map((r) => account(r as Account))
            : selected.map((r) => (kind === 'audit' ? { ...r, at: r.at.toISOString() } : r));
        const last = selected.at(-1);
        const lastId =
          kind === 'teacher-assignments'
            ? last?.assignmentId
            : (last?.classId ?? last?.subjectId ?? last?.auditId ?? last?.id);
        return {
          items,
          nextCursor:
            rows.length > limit
              ? Buffer.from(JSON.stringify({ scope, id: lastId })).toString('base64url')
              : null,
          serverNow: this.clock.now().toISOString(),
        };
      },
      true,
    );
  }
  async saveEntity(
    req: Request,
    kind: 'classes' | 'subjects',
    id: string | undefined,
    input: unknown,
    key: unknown,
  ) {
    const { user, school } = identity(req, 'school_admin');
    if (id) parse(uuid, id);
    const body =
      kind === 'classes'
        ? id
          ? parse(classInput.extend({ revision, active: z.boolean() }).strict(), input)
          : parse(classInput, input)
        : id
          ? parse(subjectInput.extend({ revision, active: z.boolean() }).strict(), input)
          : parse(subjectInput, input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      await this.lock(c, school.id);
      return mutate(c, school.id, user.id, `${kind}:${id ?? 'new'}`, key, body, async () => {
        const current = id
          ? (
              await c.query(`SELECT * FROM ${kind} WHERE school_id=$1 AND id=$2 FOR UPDATE`, [
                school.id,
                id,
              ])
            ).rows[0]
          : null;
        if (id && !current) throw DomainException.notFound();
        if (current && (!('revision' in body) || current.revision !== body.revision))
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh before editing');
        if ('grade' in body && body.grade && current?.grade !== body.grade) {
          const used = id
            ? await c.query(
                `SELECT id FROM teacher_assignments WHERE school_id=$1 AND ${kind === 'classes' ? 'class_id' : 'subject_id'}=$2 AND active LIMIT 1`,
                [school.id, id],
              )
            : null;
          if (used?.rowCount)
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              'Remove active teaching assignments before changing the grade',
            );
        }
        const active = 'active' in body ? body.active : true;
        const all = (await c.query(`SELECT * FROM ${kind} WHERE school_id=$1`, [school.id])).rows;
        if (
          all.some(
            (r) =>
              r.id !== id &&
              (kind === 'classes'
                ? 'academicYear' in body &&
                  normalize(r.name) === normalize(body.name) &&
                  normalize(r.code_or_year) === normalize(body.academicYear)
                : 'code' in body &&
                  normalize(r.code) === normalize(body.code) &&
                  (r.grade ?? null) === (body.grade ?? current?.grade ?? null)),
          )
        )
          throw DomainException.conflict('REVISION_CONFLICT', 'Name or code already exists');
        const column = kind === 'classes' ? 'class_id' : 'subject_id';
        if (!active && id) {
          const dependent = await c.query(
            `SELECT id FROM teacher_assignments WHERE school_id=$1 AND ${column}=$2 AND active UNION ALL SELECT id FROM exams WHERE school_id=$1 AND ${column}=$2 ${kind === 'classes' ? "UNION ALL SELECT e.id FROM enrollments e JOIN users u ON u.id=e.student_id AND u.school_id=e.school_id WHERE e.school_id=$1 AND e.class_id=$2 AND u.status='active'" : ''} LIMIT 1`,
            [school.id, id],
          );
          if (dependent.rowCount)
            throw DomainException.conflict('REVISION_CONFLICT', 'This record is still in use');
        }
        const target = id ?? randomUUID(),
          value = 'academicYear' in body ? body.academicYear : 'code' in body ? body.code : '';
        const detail = kind === 'classes' ? 'code_or_year' : 'code';
        const result = id
          ? await c.query(
              `UPDATE ${kind} SET name=$1,${detail}=$2,active=$3,revision=revision+1 WHERE school_id=$4 AND id=$5 RETURNING *`,
              [body.name, value, active, school.id, target],
            )
          : await c.query(
              `INSERT INTO ${kind}(id,school_id,name,${detail}) VALUES($1,$2,$3,$4) RETURNING *`,
              [target, school.id, body.name, value],
            );
        const row = result.rows[0];
        if (body.grade !== undefined) {
          await c.query(`UPDATE ${kind} SET grade=$1 WHERE school_id=$2 AND id=$3`, [
            body.grade,
            school.id,
            target,
          ]);
          row.grade = body.grade;
        }
        if (kind === 'classes' && 'section' in body && body.section !== undefined) {
          await c.query('UPDATE classes SET section=$1 WHERE school_id=$2 AND id=$3', [
            body.section,
            school.id,
            target,
          ]);
          row.section = body.section;
        }
        await this.audit(
          c,
          req,
          `${kind}:${id ? 'edit' : 'create'}`,
          target,
          body.name,
          body.reason,
        );
        return kind === 'classes'
          ? {
              classId: target,
              name: row.name,
              grade: row.grade ?? null,
              section: row.section ?? null,
              academicYear: row.code_or_year,
              active: row.active,
              revision: row.revision,
            }
          : {
              subjectId: target,
              name: row.name,
              grade: row.grade ?? null,
              code: row.code,
              active: row.active,
              revision: row.revision,
            };
      });
    });
  }
  async remove(req: Request, kindInput: string, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    const kind = parse(
      z.enum([
        'classes',
        'subjects',
        'students',
        'teachers',
        'invigilators',
        'teacher-assignments',
      ]),
      kindInput,
    );
    parse(uuid, id);
    const body = parse(z.object({ revision, reason, confirmed: z.literal(true) }).strict(), input);
    const table =
      kind === 'students' || kind === 'teachers' || kind === 'invigilators'
        ? 'users'
        : kind === 'teacher-assignments'
          ? 'teacher_assignments'
          : kind;
    return this.db.withTenantTransaction(school.id, async (c) => {
      await this.lock(c, school.id);
      return mutate(
        c,
        school.id,
        user.id,
        `directory:${kind}:${id}:remove`,
        key,
        body,
        async () => {
          const role =
            kind === 'students' ? 'student' : kind === 'teachers' ? 'teacher' : 'invigilator';
          const row = (
            await c.query<{ revision: number; name?: string; login_id?: string }>(
              `SELECT * FROM ${table} WHERE school_id=$1 AND id=$2 ${table === 'users' ? 'AND role=$3' : ''} FOR UPDATE`,
              table === 'users' ? [school.id, id, role] : [school.id, id],
            )
          ).rows[0];
          if (!row) throw DomainException.notFound();
          if (row.revision !== body.revision)
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              'Refresh before removing this record',
            );
          // Exams identify assignments by teacher/class/subject, not an assignment FK.
          // Preserve the existing assignment-edit guard for this removal path too.
          if (table === 'teacher_assignments') {
            const used = await c.query(
              `SELECT e.id FROM exams e JOIN teacher_assignments a
               ON a.school_id=e.school_id AND a.teacher_id=e.owner_id
               AND a.class_id=e.class_id AND a.subject_id=e.subject_id
               WHERE a.school_id=$1 AND a.id=$2 LIMIT 1`,
              [school.id, id],
            );
            if (used.rowCount)
              throw DomainException.conflict(
                'REVISION_CONFLICT',
                'Existing exams use this assignment',
              );
          }
          const retained =
            table === 'classes' || (await hasRetainedReferences(c, table, school.id, id));
          if (retained) {
            await c.query(
              `UPDATE ${table} SET ${table === 'users' ? "status='inactive'" : 'active=false'},revision=revision+1 WHERE school_id=$1 AND id=$2`,
              [school.id, id],
            );
          } else {
            await c.query(`DELETE FROM ${table} WHERE school_id=$1 AND id=$2`, [school.id, id]);
          }
          if (table === 'users' && retained)
            await c.query(
              'UPDATE auth_sessions SET revoked_at=$1 WHERE school_id=$2 AND user_id=$3 AND revoked_at IS NULL',
              [this.clock.now(), school.id, id],
            );
          const outcome = retained ? 'archived' : 'deleted';
          await this.audit(
            c,
            req,
            `${kind}:${outcome}`,
            id,
            row.name ?? row.login_id ?? kind,
            body.reason,
          );
          return { id, outcome };
        },
      );
    });
  }
  async editAccount(
    req: Request,
    role: 'student' | 'teacher' | 'invigilator',
    id: string,
    input: unknown,
    key: unknown,
  ) {
    const { user, school } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(
      z
        .object({
          ...edit,
          displayName: name,
          loginId: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_-]{1,160}$/)
            .optional(),
          classId: uuid.nullable(),
          status: z.enum(['active', 'inactive']),
        })
        .strict(),
      input,
    );
    return this.db.withTenantTransaction(school.id, async (c) => {
      await this.lock(c, school.id);
      return mutate(c, school.id, user.id, `${role}:${id}:edit`, key, body, async () => {
        const current = (
          await c.query<Account>(
            `${accountSelect} WHERE u.school_id=$1 AND u.id=$2 AND u.role=$3 FOR UPDATE OF u`,
            [school.id, id, role],
          )
        ).rows[0];
        if (!current) throw DomainException.notFound();
        if (current.revision !== body.revision)
          throw DomainException.conflict('REVISION_CONFLICT', 'Refresh account');
        if (role !== 'student' && body.classId !== null)
          throw DomainException.validationError('Staff do not have a student class');
        if (role === 'student') {
          if (!body.classId) throw DomainException.validationError('Student class is required');
          const cls = (
            await c.query(
              'SELECT id,code_or_year FROM classes WHERE school_id=$1 AND id=$2 AND active FOR SHARE',
              [school.id, body.classId],
            )
          ).rows[0];
          if (!cls) throw DomainException.validationError('Choose an active class');
          await c.query('DELETE FROM enrollments WHERE school_id=$1 AND student_id=$2', [
            school.id,
            id,
          ]);
          await c.query(
            'INSERT INTO enrollments(school_id,student_id,class_id,academic_year) VALUES($1,$2,$3,$4)',
            [school.id, id, body.classId, cls.code_or_year],
          );
        }
        try {
          await c.query(
            'UPDATE users SET display_name=$1,status=$2,revision=revision+1,login_id=COALESCE($5,login_id) WHERE school_id=$3 AND id=$4',
            [body.displayName, body.status, school.id, id, body.loginId ?? null],
          );
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              'This user ID is unavailable. Choose another.',
            );
          throw error;
        }
        if (body.status === 'inactive' || (body.loginId && body.loginId !== current.login_id))
          await c.query(
            'UPDATE auth_sessions SET revoked_at=$1 WHERE school_id=$2 AND user_id=$3 AND revoked_at IS NULL',
            [this.clock.now(), school.id, id],
          );
        await this.audit(c, req, 'account:edit', id, current.login_id, body.reason);
        return account({
          ...current,
          display_name: body.displayName,
          login_id: body.loginId ?? current.login_id,
          status: body.status,
          class_id: body.classId,
          revision: current.revision + 1,
        });
      });
    });
  }
  async credentials(
    req: Request,
    role: 'student' | 'teacher' | 'invigilator',
    id: string | undefined,
    input: unknown,
    key: unknown,
    create = false,
  ) {
    const { user, school } = identity(req, 'school_admin');
    if (id) parse(uuid, id);
    const body = create
      ? parse(
          z
            .object({
              displayName: name,
              firstName: name.optional(),
              fatherName: name.optional(),
              grandfatherName: name.optional(),
              reason,
            })
            .strict()
            .superRefine((v, ctx) => {
              if (
                [v.firstName, v.fatherName, v.grandfatherName].some(Boolean) &&
                (![v.firstName, v.fatherName, v.grandfatherName].every(Boolean) ||
                  [v.firstName, v.fatherName, v.grandfatherName].join(' ') !== v.displayName)
              )
                ctx.addIssue({
                  code: 'custom',
                  message: 'Enter all three names matching the full name',
                });
            }),
          input,
        )
      : id
        ? parse(z.object(edit).strict(), input)
        : parse(
            z
              .object({
                targets: z
                  .array(z.object({ userId: uuid, revision }).strict())
                  .min(1)
                  .max(500),
                reason,
              })
              .strict(),
            input,
          );
    return this.db.withTenantTransaction(school.id, async (c) => {
      await this.lock(c, school.id);
      return mutate(
        c,
        school.id,
        user.id,
        create ? `${role}:create` : `${role}:${id ?? 'batch'}:credentials`,
        key,
        body,
        async () => {
          let targets: { userId: string; revision: number }[] = [];
          if (create && 'displayName' in body) {
            const newId = randomUUID();
            const slug = (
              await c.query<{ slug: string }>('SELECT slug FROM schools WHERE id=$1', [school.id])
            ).rows[0].slug;
            const login = `${slug
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 12)}-${role === 'invigilator' ? 'INV' : 'T'}-${newId}`;
            await c.query(
              'INSERT INTO users(id,school_id,login_id,display_name,role,password_hash,credentials_issued) VALUES($1,$2,$3,$4,$5,NULL,false)',
              [newId, school.id, login, body.displayName, role],
            );
            await c.query(
              'UPDATE users SET first_name=$1,father_name=$2,grandfather_name=$3 WHERE school_id=$4 AND id=$5',
              [
                body.firstName ?? null,
                body.fatherName ?? null,
                body.grandfatherName ?? null,
                school.id,
                newId,
              ],
            );
            targets = [{ userId: newId, revision: 1 }];
          } else if (id && 'revision' in body) targets = [{ userId: id, revision: body.revision }];
          else if ('targets' in body) targets = body.targets;
          if (new Set(targets.map((t) => t.userId)).size !== targets.length)
            throw DomainException.validationError('Duplicate account target');
          const accounts = [];
          for (const target of targets) {
            const row = (
              await c.query<Account>(
                `${accountSelect} WHERE u.school_id=$1 AND u.id=$2 AND u.role=$3 FOR UPDATE OF u`,
                [school.id, target.userId, role],
              )
            ).rows[0];
            if (!row) throw DomainException.notFound();
            if (
              row.revision !== target.revision ||
              row.status !== 'active' ||
              (!id && !create && row.credentials_issued)
            )
              throw DomainException.conflict(
                'REVISION_CONFLICT',
                'Refresh active unissued accounts before issuing credentials',
              );
            accounts.push(row);
          }
          const credentials = [];
          for (const row of accounts) {
            const password = randomBytes(24).toString('base64url');
            await c.query(
              'UPDATE users SET password_hash=$1,credentials_issued=true,revision=revision+1 WHERE school_id=$2 AND id=$3',
              [await hashPassword(password), school.id, row.id],
            );
            await c.query(
              'UPDATE auth_sessions SET revoked_at=$1 WHERE school_id=$2 AND user_id=$3 AND revoked_at IS NULL',
              [this.clock.now(), school.id, row.id],
            );
            credentials.push({
              userId: row.id,
              displayName: row.display_name,
              loginId: row.login_id,
              password,
            });
            await this.audit(c, req, 'credentials:issue', row.id, row.login_id, body.reason);
          }
          return {
            issueId: randomUUID(),
            issuedCount: credentials.length,
            issuedAt: this.clock.now().toISOString(),
            accounts: credentials.map(({ userId, displayName, loginId }) => ({
              userId,
              displayName,
              loginId,
            })),
            credentials,
          };
        },
        (result) => ({ ...result, credentials: null }),
      );
    });
  }
  async assignment(req: Request, id: string | undefined, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    if (id) parse(uuid, id);
    const body = id
      ? parse(z.object({ ...edit, active: z.boolean() }).strict(), input)
      : parse(
          z.object({ teacherId: uuid, classId: uuid, subjectId: uuid, reason }).strict(),
          input,
        );
    return this.db.withTenantTransaction(school.id, async (c) => {
      await this.lock(c, school.id);
      return mutate(c, school.id, user.id, `assignment:${id ?? 'new'}`, key, body, async () => {
        const target = id ?? randomUUID();
        if (id && 'active' in body) {
          const row = (
            await c.query(
              'SELECT * FROM teacher_assignments WHERE school_id=$1 AND id=$2 FOR UPDATE',
              [school.id, id],
            )
          ).rows[0];
          if (!row) throw DomainException.notFound();
          if (row.revision !== body.revision)
            throw DomainException.conflict('REVISION_CONFLICT', 'Refresh assignment');
          if (body.active) {
            const eligible = await c.query(
              `SELECT u.id FROM users u JOIN classes c ON c.school_id=u.school_id
               JOIN subjects s ON s.school_id=u.school_id
               WHERE u.school_id=$1 AND u.id=$2 AND c.id=$3 AND s.id=$4
               AND u.role='teacher' AND u.status='active' AND c.active AND s.active AND (c.grade IS NOT DISTINCT FROM s.grade)
               FOR SHARE OF u,c,s`,
              [school.id, row.teacher_id, row.class_id, row.subject_id],
            );
            if (!eligible.rowCount)
              throw DomainException.validationError('Teacher, class and subject must be active');
          }
          if (
            !body.active &&
            (
              await c.query(
                'SELECT id FROM exams WHERE school_id=$1 AND owner_id=$2 AND class_id=$3 AND subject_id=$4 LIMIT 1',
                [school.id, row.teacher_id, row.class_id, row.subject_id],
              )
            ).rowCount
          )
            throw DomainException.conflict(
              'REVISION_CONFLICT',
              'Existing exams use this assignment',
            );
          await c.query(
            'UPDATE teacher_assignments SET active=$1,revision=revision+1 WHERE school_id=$2 AND id=$3',
            [body.active, school.id, id],
          );
        } else if ('teacherId' in body) {
          const valid = (
            await c.query(
              `SELECT u.id FROM users u JOIN classes c ON c.school_id=u.school_id JOIN subjects s ON s.school_id=u.school_id WHERE u.school_id=$1 AND u.id=$2 AND c.id=$3 AND s.id=$4 AND u.role='teacher' AND u.status='active' AND c.active AND s.active AND (c.grade IS NOT DISTINCT FROM s.grade) FOR SHARE OF u,c,s`,
              [school.id, body.teacherId, body.classId, body.subjectId],
            )
          ).rows[0];
          if (!valid)
            throw DomainException.validationError('Choose active teacher, class and subject');
          if (
            (
              await c.query(
                'SELECT id FROM teacher_assignments WHERE school_id=$1 AND teacher_id=$2 AND class_id=$3 AND subject_id=$4',
                [school.id, body.teacherId, body.classId, body.subjectId],
              )
            ).rowCount
          )
            throw DomainException.conflict('REVISION_CONFLICT', 'Assignment already exists');
          await c.query(
            'INSERT INTO teacher_assignments(id,school_id,teacher_id,class_id,subject_id) VALUES($1,$2,$3,$4,$5)',
            [target, school.id, body.teacherId, body.classId, body.subjectId],
          );
        }
        const r = (
          await c.query(
            `SELECT a.*,u.display_name teacher_name,c.name class_name,c.grade,s.name subject_name FROM teacher_assignments a JOIN users u ON u.id=a.teacher_id AND u.school_id=a.school_id JOIN classes c ON c.id=a.class_id AND c.school_id=a.school_id JOIN subjects s ON s.id=a.subject_id AND s.school_id=a.school_id WHERE a.school_id=$1 AND a.id=$2`,
            [school.id, target],
          )
        ).rows[0];
        await this.audit(
          c,
          req,
          'assignment:save',
          target,
          `${r.teacher_name} / ${r.class_name} / ${r.subject_name}`,
          body.reason,
        );
        return {
          assignmentId: target,
          teacherId: r.teacher_id,
          classId: r.class_id,
          subjectId: r.subject_id,
          active: r.active,
          revision: r.revision,
          teacherName: r.teacher_name,
          className: r.class_name,
          grade: r.grade ?? null,
          subjectName: r.subject_name,
        };
      });
    });
  }
}
