import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID, createHash } from 'crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { mutate } from '../../common/db/mutation';
import { DomainException } from '../../common/errors/domain.exception';
import {
  parsePreparationInput as parse,
  resourceIdSchema as uuid,
} from '../delivery/preparation-schemas';
import { AuthoringService, teacherIdentity } from './authoring.service';
import { jobSchema, revision } from './schemas';

export const jobSelect = `SELECT id "importId",exam_id "examId",state,parsed_count "parsedCount",completed_count "completedCount",COALESCE(source_name,source_filename) "sourceName",source_hash "sourceSha256",failure,diagnostics FROM import_jobs WHERE school_id=$1 AND id=$2`;
@Injectable()
export class ImportService {
  constructor(
    private readonly db: DbService,
    private readonly authoring: AuthoringService,
  ) {}
  async job(c: PoolClient, school: string, id: string) {
    const row = (await c.query(jobSelect, [school, id])).rows[0];
    if (!row) throw DomainException.notFound();
    return jobSchema.parse(row);
  }
  async upload(
    req: Request,
    input: unknown,
    file: { buffer: Buffer; originalname: string } | undefined,
    key: unknown,
  ) {
    const { school, user } = teacherIdentity(req);
    const body = parse(
      z
        .object({
          examId: uuid,
          revision: z
            .string()
            .regex(/^[1-9]\d*$/)
            .transform(Number)
            .pipe(revision),
        })
        .strict(),
      input,
    );
    if (!file || file.buffer.length > 5 * 1024 * 1024)
      throw DomainException.validationError('Upload a DOCX or XLSX file no larger than 5 MiB');
    const filename = parse(z.string().min(1).max(255), file.originalname),
      hash = createHash('sha256').update(file.buffer).digest('hex');
    return this.db.withTenantTransaction(school.id, async (c) => {
      const exam = await this.authoring.owned(c, school.id, user.id, body.examId, true);
      return mutate(
        c,
        school.id,
        user.id,
        `exam:${body.examId}:import`,
        key,
        { ...body, filename, hash },
        async () => {
          await this.authoring.mutable(c, school.id, exam, body.revision);
          const id = randomUUID();
          await c.query(
            'INSERT INTO import_jobs(id,school_id,exam_id,source_filename,source_hash,source_name,source_sha256,source_bytes) VALUES($1,$2,$3,$4,$5,$4,$5,$6)',
            [id, school.id, body.examId, filename, hash, file.buffer],
          );
          await c.query(
            'UPDATE exams SET import_id=$1,revision=revision+1,updated_at=now() WHERE school_id=$2 AND id=$3',
            [id, school.id, body.examId],
          );
          return this.job(c, school.id, id);
        },
      );
    });
  }
  async read(req: Request, id: string) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    return this.db.withTenantTransaction(
      school.id,
      async (c) => {
        const job = await this.job(c, school.id, id);
        await this.authoring.owned(c, school.id, user.id, job.examId);
        return job;
      },
      true,
    );
  }
  async retry(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(uuid, id);
    const body = parse(z.object({ revision }).strict(), input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const job = await this.job(c, school.id, id);
      const exam = await this.authoring.owned(c, school.id, user.id, job.examId, true);
      return mutate(c, school.id, user.id, `import:${id}:retry`, key, body, async () => {
        await this.authoring.mutable(c, school.id, exam, body.revision);
        if (exam.import_id !== id || job.state !== 'failed' || !job.parsedCount)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'Only the latest parsed failed import can retry',
          );
        await c.query(
          "UPDATE ai_jobs SET status='pending',attempts=0,retry_at=NULL,lease_until=NULL,lease_token=NULL,error_message=NULL WHERE school_id=$1 AND import_job_id=$2 AND status='failed' AND EXISTS(SELECT 1 FROM exam_items i WHERE i.school_id=$1 AND i.exam_id=$3 AND i.exam_version_id IS NULL AND i.item_id=ai_jobs.item_id AND NOT i.reviewed AND i.ai_input_hash=ai_jobs.item_hash)",
          [school.id, id, job.examId],
        );
        await c.query(
          "UPDATE import_jobs SET state='ai_queued',status='pending',failure=NULL,lease_token=NULL,lease_until=NULL WHERE school_id=$1 AND id=$2",
          [school.id, id],
        );
        await c.query(
          'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2',
          [school.id, exam.id],
        );
        return this.job(c, school.id, id);
      });
    });
  }
}
