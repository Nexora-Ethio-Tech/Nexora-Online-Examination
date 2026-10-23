import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { createHash, randomUUID } from 'crypto';
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
import { parseRosterCsv } from './roster-csv';
import { allocateStudentNumbers, studentLoginId } from './student-numbering';

const previewSchema = z.object({
  importId: uuid,
  revision: z.number().int().positive(),
  classId: uuid,
  className: z.string(),
  expiresAt: z.string(),
  rows: z.array(
    z.object({
      row: z.number().int(),
      studentRef: z.string(),
      displayName: z.string(),
      errors: z.array(z.object({ field: z.string(), message: z.string() })),
    }),
  ),
  canCommit: z.boolean(),
  totalRows: z.number().int(),
});

@Injectable()
export class RosterService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}
  async preview(
    req: Request,
    input: unknown,
    file: { buffer: Buffer; originalname: string } | undefined,
    key: unknown,
  ) {
    const { school, user } = identity(req, 'school_admin');
    const { classId } = parse(z.object({ classId: uuid }).strict(), input);
    if (!file || file.buffer.length > 2097152)
      throw DomainException.validationError('Upload a CSV file no larger than 2 MiB');
    let csv: string[][];
    try {
      csv = parseRosterCsv(new TextDecoder('utf-8', { fatal: true }).decode(file.buffer));
    } catch {
      throw DomainException.validationError('Upload valid UTF-8 CSV with correctly quoted fields');
    }
    if (csv[0]?.join(',') !== 'studentRef,displayName' || csv[0].length !== 2)
      throw DomainException.validationError('Headers must be studentRef,displayName');
    if (csv.length < 2 || csv.length > 2001)
      throw DomainException.validationError('Upload between 1 and 2000 students');
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    return this.db.withTenantTransaction(school.id, async (c) =>
      mutate(
        c,
        school.id,
        user.id,
        'roster:preview',
        key,
        { classId, hash, filename: file.originalname },
        async () => {
          const cls = (
            await c.query<{ name: string; revision: number }>(
              'SELECT name,revision FROM classes WHERE school_id=$1 AND id=$2 AND active FOR SHARE',
              [school.id, classId],
            )
          ).rows[0];
          if (!cls) throw DomainException.notFound();
          const existing = new Set(
            (
              await c.query<{ student_ref: string }>(
                'SELECT lower(student_ref) student_ref FROM users WHERE school_id=$1 AND student_ref IS NOT NULL',
                [school.id],
              )
            ).rows.map((r) => r.student_ref),
          );
          const counts = new Map<string, number>();
          for (const row of csv.slice(1)) {
            const ref = (row[0] ?? '').trim().toLowerCase();
            counts.set(ref, (counts.get(ref) ?? 0) + 1);
          }
          const rows = csv.slice(1).map((cells, index) => {
            const studentRef = (cells[0] ?? '').trim(),
              displayName = (cells[1] ?? '').trim();
            const errors: { field: string; message: string }[] = [];
            if (cells.length !== 2)
              errors.push({ field: 'row', message: 'Each row must contain exactly two columns' });
            if (!studentRef || studentRef.length > 128)
              errors.push({
                field: 'studentRef',
                message: 'Use a student reference of 1–128 characters',
              });
            if (!displayName || displayName.length > 160)
              errors.push({
                field: 'displayName',
                message: 'Use a display name of 1–160 characters',
              });
            if (
              (counts.get(studentRef.toLowerCase()) ?? 0) > 1 ||
              existing.has(studentRef.toLowerCase())
            )
              errors.push({
                field: 'studentRef',
                message: 'Student reference already exists or repeats in this file',
              });
            return { row: index + 2, studentRef, displayName, errors };
          });
          const preview = {
            importId: randomUUID(),
            revision: 1,
            classId,
            className: cls.name,
            expiresAt: new Date(this.clock.now().getTime() + 1800000).toISOString(),
            rows,
            canCommit: rows.every((r) => r.errors.length === 0),
            totalRows: rows.length,
          };
          await c.query(
            'INSERT INTO directory_imports(id,school_id,actor_id,class_id,class_revision,expires_at,preview) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              preview.importId,
              school.id,
              user.id,
              classId,
              cls.revision,
              preview.expiresAt,
              JSON.stringify(preview),
            ],
          );
          return preview;
        },
      ),
    );
  }
  async commit(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    parse(uuid, id);
    const body = parse(
      z
        .object({
          revision: z.number().int().positive(),
          reason: z.string().trim().min(1).max(2000),
        })
        .strict(),
      input,
    );
    return this.db.withTenantTransaction(school.id, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${school.id}:directory`,
      ]);
      const row = (
        await c.query<{
          preview: unknown;
          class_id: string;
          class_revision: number;
          revision: number;
          expires_at: Date;
          committed_result: unknown;
        }>(
          'SELECT * FROM directory_imports WHERE school_id=$1 AND id=$2 AND actor_id=$3 FOR UPDATE',
          [school.id, id, user.id],
        )
      ).rows[0];
      if (!row) throw DomainException.notFound();
      return mutate(c, school.id, user.id, `roster:${id}:commit`, key, body, async () => {
        const preview = previewSchema.parse(row.preview);
        if (
          row.committed_result ||
          row.revision !== body.revision ||
          row.expires_at <= this.clock.now() ||
          !preview.canCommit
        )
          throw DomainException.conflict('REVISION_CONFLICT', 'Create a new valid roster preview');
        const cls = (
          await c.query<{ revision: number; code_or_year: string }>(
            'SELECT revision,code_or_year FROM classes WHERE school_id=$1 AND id=$2 AND active FOR SHARE',
            [school.id, row.class_id],
          )
        ).rows[0];
        if (!cls || cls.revision !== row.class_revision)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Class changed; preview the roster again',
          );
        const refs = preview.rows.map((r) => r.studentRef.toLowerCase());
        if (
          (
            await c.query(
              'SELECT id FROM users WHERE school_id=$1 AND lower(student_ref)=ANY($2::text[]) LIMIT 1',
              [school.id, refs],
            )
          ).rowCount
        )
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'A student reference was added since preview',
          );
        const schoolNumber = (
          await c.query<{ account_number: number }>(
            'SELECT account_number FROM schools WHERE id=$1',
            [school.id],
          )
        ).rows[0].account_number;
        const userIds: string[] = [];
        let studentNumber = await allocateStudentNumbers(c, school.id, preview.rows.length);
        for (const student of preview.rows) {
          const userId = randomUUID();
          userIds.push(userId);
          await c.query(
            "INSERT INTO users(id,school_id,display_name,student_ref,login_id,role,password_hash,credentials_issued) VALUES($1,$2,$3,$4,$5,'student',NULL,false)",
            [
              userId,
              school.id,
              student.displayName,
              student.studentRef,
              studentLoginId(schoolNumber, studentNumber++, this.clock.now()),
            ],
          );
          await c.query(
            'INSERT INTO enrollments(school_id,student_id,class_id,academic_year) VALUES($1,$2,$3,$4)',
            [school.id, userId, row.class_id, cls.code_or_year],
          );
        }
        const result = { importId: id, createdCount: userIds.length, userIds };
        await c.query(
          'UPDATE directory_imports SET committed_result=$1,revision=revision+1 WHERE school_id=$2 AND id=$3',
          [JSON.stringify(result), school.id, id],
        );
        await c.query(
          'INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,server_at,target_label,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            school.id,
            user.id,
            'directory:roster:commit',
            id,
            body.reason,
            this.clock.now(),
            `${preview.className}: ${userIds.length} students`,
            user.displayName,
          ],
        );
        return result;
      });
    });
  }
}
