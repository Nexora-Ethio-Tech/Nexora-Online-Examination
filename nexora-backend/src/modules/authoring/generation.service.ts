import { HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DbService } from '../../common/db/db.service';
import { mutate } from '../../common/db/mutation';
import { computeCanonicalDigest } from '../../common/crypto/canonical-digest';
import { DomainException } from '../../common/errors/domain.exception';
import { identity } from '../delivery/operational.service';
import { parsePreparationInput as parse, resourceIdSchema } from '../delivery/preparation-schemas';
import { AuthoringService, teacherIdentity } from './authoring.service';
import { ImportService } from './import.service';
import { aiExamSettingsInputSchema, generationInputSchema } from './generation-schemas';
import { aiConfiguration } from './ai-provider';

// Settings writes, generation admission and worker commits share this lock.
export async function lockGenerationPolicy(c: PoolClient, school: string) {
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `${school}:exam-generation`,
  ]);
}
export async function generationEnabled(c: PoolClient, school: string, expectedRevision?: number) {
  const row = (
    await c.query<{ enabled: boolean; revision: number }>(
      'SELECT enabled,revision FROM school_ai_exam_settings WHERE school_id=$1',
      [school],
    )
  ).rows[0];
  return (
    row?.enabled === true && (expectedRevision === undefined || row.revision === expectedRevision)
  );
}
@Injectable()
export class GenerationService {
  constructor(
    private readonly db: DbService,
    private readonly authoring: AuthoringService,
    private readonly imports: ImportService,
  ) {}
  async settings(req: Request) {
    if (!req.sessionUser || !req.school) throw DomainException.authRequired();
    if (!['teacher', 'school_admin'].includes(req.sessionUser.role))
      throw DomainException.forbidden();
    const schoolId = req.school.id;
    return this.db.withTenantTransaction(
      schoolId,
      async (c) => {
        const row = (
          await c.query<{ enabled: boolean; revision: number }>(
            'SELECT enabled,revision FROM school_ai_exam_settings WHERE school_id=$1',
            [schoolId],
          )
        ).rows[0];
        return { aiExamGenerationEnabled: row?.enabled ?? false, revision: row?.revision ?? 1 };
      },
      true,
    );
  }
  async saveSettings(req: Request, input: unknown, key: unknown) {
    const { school, user } = identity(req, 'school_admin');
    const body = parse(aiExamSettingsInputSchema, input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      await lockGenerationPolicy(c, school.id);
      return mutate(c, school.id, user.id, 'school:ai-exam-settings', key, body, async () => {
        await c.query(
          'INSERT INTO school_ai_exam_settings(school_id) VALUES($1) ON CONFLICT DO NOTHING',
          [school.id],
        );
        const row = (
          await c.query<{ revision: number }>(
            'UPDATE school_ai_exam_settings SET enabled=$1,revision=revision+1 WHERE school_id=$2 AND revision=$3 RETURNING revision',
            [body.aiExamGenerationEnabled, school.id, body.revision],
          )
        ).rows[0];
        if (!row)
          throw DomainException.conflict(
            'REVISION_CONFLICT',
            'School settings changed; refresh before saving',
          );
        await c.query(
          'INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason,target_label,actor_name) VALUES($1,$2,$3,$1::text,$4,$5,$6)',
          [
            school.id,
            user.id,
            'directory:ai_exam_settings',
            body.reason,
            `AI exam generation ${body.aiExamGenerationEnabled ? 'enabled' : 'disabled'}`,
            user.displayName,
          ],
        );
        return { aiExamGenerationEnabled: body.aiExamGenerationEnabled, revision: row.revision };
      });
    });
  }
  async generate(req: Request, id: string, input: unknown, key: unknown) {
    const { school, user } = teacherIdentity(req);
    parse(resourceIdSchema, id);
    const body = parse(generationInputSchema, input);
    return this.db.withTenantTransaction(school.id, async (c) => {
      const exam = await this.authoring.owned(c, school.id, user.id, id, true);
      await lockGenerationPolicy(c, school.id);
      return mutate(c, school.id, user.id, `exam:${id}:generate`, key, body, async () => {
        if (!(await generationEnabled(c, school.id)))
          throw DomainException.forbidden('AI exam generation is disabled for this school');
        await this.authoring.mutable(c, school.id, exam, body.revision);
        if ((await this.authoring.items(c, school.id, id)).length && !body.replaceExisting)
          throw DomainException.validationError('Confirm replacing existing questions');
        try {
          aiConfiguration({
            ...process.env,
            OPENAI_MAX_COMPLETION_TOKENS: process.env.AI_EXAM_MAX_COMPLETION_TOKENS ?? '16000',
          });
        } catch {
          throw new DomainException(
            HttpStatus.SERVICE_UNAVAILABLE,
            'TEMPORARILY_UNAVAILABLE',
            'AI generation is not configured on the server',
          );
        }
        const policy = (
          await c.query<{ revision: number }>(
            'SELECT revision FROM school_ai_exam_settings WHERE school_id=$1',
            [school.id],
          )
        ).rows[0];
        const jobId = randomUUID(),
          digest = computeCanonicalDigest(body);
        await c.query(
          'INSERT INTO import_jobs(id,school_id,exam_id,source_filename,source_hash,source_name,source_sha256,generation_request,generation_policy_revision) VALUES($1,$2,$3,$4,$5,$4,$5,$6,$7)',
          [
            jobId,
            school.id,
            id,
            'AI-generated exam',
            digest,
            JSON.stringify(body),
            policy.revision,
          ],
        );
        await c.query(
          'UPDATE exams SET import_id=$1,revision=revision+1,updated_at=now() WHERE school_id=$2 AND id=$3',
          [jobId, school.id, id],
        );
        await c.query(
          "INSERT INTO audit_events(school_id,actor_id,action,resource_id,reason) VALUES($1,$2,'exam:generate',$3,$4)",
          [
            school.id,
            user.id,
            id,
            `AI draft request ${jobId}; ${body.mcqCount + body.trueFalseCount} questions`,
          ],
        );
        return this.imports.job(c, school.id, jobId);
      });
    });
  }
}
