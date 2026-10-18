import { generateExam } from './exam-generator';
import { generationInputSchema, GenerationInput } from './generation-schemas';
import { generationEnabled, lockGenerationPolicy } from './generation.service';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { DbService } from '../../common/db/db.service';
import { computeCanonicalDigest } from '../../common/crypto/canonical-digest';
import { parseQuestionFile, ImportFormatError } from './import-parser';
import {
  aiConfiguration,
  AiProviderError,
  AiQuestionInput,
  suggestQuestion,
  AI_PROMPT_VERSION,
} from './ai-provider';
import { AuthoringService } from './authoring.service';

type ParseJob = {
  id: string;
  exam_id: string;
  source_bytes: Buffer;
  generation_request: GenerationInput | null;
  generation_attempts: number;
  generation_policy_revision: number;
  lease_token: string;
  owner_id: string;
  subject_name: string;
  class_name: string;
  language: 'en' | 'am';
};
type AiJob = {
  id: string;
  import_job_id: string;
  exam_id: string;
  item_id: string;
  item_hash: string;
  input_data: AiQuestionInput;
  attempts: number;
  lease_token: string;
};
@Injectable()
export class QuestionAiService {
  generate(
    context: { subject: string; grade: string; language: 'en' | 'am' },
    input: GenerationInput,
  ) {
    return generateExam(context, input);
  }
  suggest(input: AiQuestionInput) {
    return suggestQuestion(input);
  }
}

@Injectable()
export class ImportWorkerService {
  constructor(
    private readonly db: DbService,
    private readonly authoring: AuthoringService,
    private readonly ai: QuestionAiService,
  ) {}
  async run(school: string) {
    z.string().uuid().parse(school);
    const parsed = await this.parseOne(school);
    const jobs: AiJob[] = [];
    for (let i = 0; i < 2; i++) {
      const job = await this.claimAi(school);
      if (job) jobs.push(job);
    }
    await Promise.all(jobs.map((job) => this.runAi(school, job)));
    await this.finish(school);
    return { parsed, aiProcessed: jobs.length };
  }
  private async parseOne(school: string) {
    const job = await this.db.withTenantTransaction(school, async (c) => {
      const row = (
        await c.query<ParseJob>(
          `SELECT j.id,j.exam_id,j.source_bytes,j.generation_request,j.generation_attempts,j.generation_policy_revision,e.owner_id,e.language,s.name subject_name,cl.name class_name FROM import_jobs j JOIN exams e ON e.school_id=j.school_id AND e.id=j.exam_id JOIN subjects s ON s.school_id=e.school_id AND s.id=e.subject_id JOIN classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id WHERE j.school_id=$1 AND j.id=e.import_id AND (j.state='queued' OR (j.state='parsing' AND j.lease_until<now())) AND e.state IN ('draft','returned') ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
          [school],
        )
      ).rows[0];
      if (!row) return null;
      if (row.generation_request) {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${school}:ai-worker`,
        ]);
        const active = (
          await c.query<{ count: string }>(
            "SELECT ((SELECT count(*) FROM ai_jobs WHERE school_id=$1 AND status='processing' AND lease_until>now()) + (SELECT count(*) FROM import_jobs WHERE school_id=$1 AND generation_request IS NOT NULL AND state='parsing' AND lease_until>now()))::text count",
            [school],
          )
        ).rows[0];
        if (Number(active.count) >= 2) return null;
        await lockGenerationPolicy(c, school);
        if (
          !(await generationEnabled(c, school, row.generation_policy_revision)) ||
          row.generation_attempts >= 3
        ) {
          await c.query(
            "UPDATE import_jobs SET state='failed',status='failed',failure='AI generation disabled or retry limit reached',lease_token=NULL,lease_until=NULL WHERE school_id=$1 AND id=$2",
            [school, row.id],
          );
          return null;
        }
        let config: ReturnType<typeof aiConfiguration>;
        try {
          config = aiConfiguration({
            ...process.env,
            OPENAI_MAX_COMPLETION_TOKENS: process.env.AI_EXAM_MAX_COMPLETION_TOKENS ?? '16000',
          });
        } catch {
          await c.query(
            "UPDATE import_jobs SET state='failed',status='failed',failure='AI generation is not configured' WHERE school_id=$1 AND id=$2",
            [school, row.id],
          );
          return null;
        }
        const reserve =
          config.maxCompletionTokens +
          Math.ceil(JSON.stringify(row.generation_request).length / 2) +
          2000;
        const budget = Number(process.env.AI_IMPORT_TOKEN_BUDGET ?? '1000000');
        if (
          !Number.isSafeInteger(budget) ||
          budget < 1 ||
          !(
            await c.query(
              'UPDATE import_jobs SET ai_reserved_tokens=ai_reserved_tokens+$1,generation_attempts=generation_attempts+1 WHERE school_id=$2 AND id=$3 AND ai_reserved_tokens+$1<=$4 RETURNING id',
              [reserve, school, row.id, budget],
            )
          ).rowCount
        ) {
          await c.query(
            "UPDATE import_jobs SET state='failed',status='failed',failure='AI generation budget exceeded' WHERE school_id=$1 AND id=$2",
            [school, row.id],
          );
          return null;
        }
      }
      const token = randomUUID();
      await c.query(
        "UPDATE import_jobs SET state='parsing',status='processing',lease_token=$1,lease_until=now()+interval '2 minutes' WHERE school_id=$2 AND id=$3",
        [token, school, row.id],
      );
      return { ...row, lease_token: token };
    });
    if (!job) return false;
    try {
      const generated = job.generation_request
        ? await this.ai.generate(
            { subject: job.subject_name, grade: job.class_name, language: job.language },
            generationInputSchema.parse(job.generation_request),
          )
        : null;
      const items = generated?.items ?? (await parseQuestionFile(job.source_bytes));
      await this.db.withTenantTransaction(school, async (c) => {
        const exam = await this.authoring.owned(c, school, job.owner_id, job.exam_id, true);
        const lease = (
          await c.query(
            "SELECT id FROM import_jobs WHERE school_id=$1 AND id=$2 AND lease_token=$3 AND state='parsing' AND lease_until>now() FOR UPDATE",
            [school, job.id, job.lease_token],
          )
        ).rows[0];
        if (generated) {
          await lockGenerationPolicy(c, school);
          if (!(await generationEnabled(c, school, job.generation_policy_revision)))
            throw new AiProviderError('AI_GENERATION_DISABLED');
        }
        if (!lease || exam.import_id !== job.id || !['draft', 'returned'].includes(exam.state))
          return;
        await this.authoring.snapshot(
          c,
          school,
          job.owner_id,
          exam,
          'before_import_replace',
          await this.authoring.items(c, school, job.exam_id),
        );
        await c.query(
          'DELETE FROM exam_items WHERE school_id=$1 AND exam_id=$2 AND exam_version_id IS NULL',
          [school, job.exam_id],
        );
        const topicNames = (
          await c.query<{ normalized_name: string }>(
            'SELECT normalized_name FROM topics WHERE school_id=$1 AND subject_id=(SELECT subject_id FROM exams WHERE school_id=$1 AND id=$2) ORDER BY normalized_name LIMIT 200',
            [school, job.exam_id],
          )
        ).rows.map((r) => r.normalized_name);
        for (const [index, item] of items.entries()) {
          const input: AiQuestionInput = {
            subject: job.subject_name,
            grade: job.class_name,
            language: job.language,
            topicNames,
            question: {
              type: item.type,
              stem: item.stem,
              options: item.options,
              correctOptionId: item.correctOptionId,
            },
          };
          const hash = computeCanonicalDigest({ input, prompt: AI_PROMPT_VERSION });
          await c.query(
            'INSERT INTO exam_items(school_id,exam_id,item_id,external_id,position,type,stem,options,correct_key,marks,ai_input_hash,primary_topic,explanation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
            [
              school,
              job.exam_id,
              item.itemId,
              item.externalId,
              index + 1,
              item.type,
              item.stem,
              JSON.stringify(item.options),
              item.correctOptionId,
              item.marks,
              generated ? null : hash,
              generated ? item.primaryTopic : '',
              generated ? item.explanation : '',
            ],
          );
          if (!generated)
            await c.query(
              'INSERT INTO ai_jobs(school_id,import_job_id,item_id,item_hash,input_data,prompt_version,taxonomy_revision) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [
                school,
                job.id,
                item.itemId,
                hash,
                JSON.stringify(input),
                AI_PROMPT_VERSION,
                computeCanonicalDigest(topicNames),
              ],
            );
        }
        if (generated) {
          await c.query(
            "UPDATE import_jobs SET state='ready',status='completed',parsed_count=$1,completed_count=$1,lease_token=NULL,lease_until=NULL,failure=NULL,generation_model=$2,generation_input_tokens=$3,generation_output_tokens=$4,generation_prompt_version=$7,generation_output=$8 WHERE school_id=$5 AND id=$6",
            [
              items.length,
              generated.model,
              generated.usage.inputTokens,
              generated.usage.outputTokens,
              school,
              job.id,
              generated.promptVersion,
              JSON.stringify(generated.items),
            ],
          );
        } else
          await c.query(
            "UPDATE import_jobs SET state='ai_queued',parsed_count=$1,completed_count=0,lease_token=NULL,lease_until=NULL,failure=NULL,diagnostics='[]' WHERE school_id=$2 AND id=$3",
            [items.length, school, job.id],
          );
        await c.query(
          'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2',
          [school, job.exam_id],
        );
      });
    } catch (error) {
      const diagnostics =
        error instanceof ImportFormatError
          ? error.diagnostics
          : [
              {
                row: 1,
                field: 'file',
                message: 'Import could not be completed; check the assignment and retry',
              },
            ];
      await this.db.withTenantTransaction(school, async (c) => {
        await c.query(
          "UPDATE import_jobs SET state='failed',status='failed',failure=$1,diagnostics=$2,lease_token=NULL,lease_until=NULL WHERE school_id=$3 AND id=$4 AND lease_token=$5",
          [
            job.generation_request
              ? `AI generation failed${error instanceof AiProviderError ? ': ' + error.code : ''}. Existing questions were preserved. You can retry with a new generation request.`
              : 'The file could not be imported',
            JSON.stringify(diagnostics),
            school,
            job.id,
            job.lease_token,
          ],
        );
      });
    }
    return true;
  }
  private async claimAi(school: string) {
    return this.db.withTenantTransaction(school, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${school}:ai-worker`,
      ]);
      const running = Number(
        (
          await c.query<{ count: string }>(
            "SELECT ((SELECT count(*) FROM ai_jobs WHERE school_id=$1 AND status='processing' AND lease_until>now()) + (SELECT count(*) FROM import_jobs WHERE school_id=$1 AND generation_request IS NOT NULL AND state='parsing' AND lease_until>now()))::text count",
            [school],
          )
        ).rows[0].count,
      );
      if (running >= 2) return null;
      const row = (
        await c.query<AiJob>(
          `SELECT a.*,j.exam_id FROM ai_jobs a JOIN import_jobs j ON j.id=a.import_job_id AND j.school_id=a.school_id JOIN exams e ON e.school_id=j.school_id AND e.id=j.exam_id WHERE a.school_id=$1 AND e.import_id=j.id AND e.state IN ('draft','returned') AND j.state IN ('ai_queued','ai_running') AND ((a.status='pending' AND (a.retry_at IS NULL OR a.retry_at<=now())) OR (a.status='processing' AND a.lease_until<now())) ORDER BY a.created_at,a.id LIMIT 1 FOR UPDATE OF a,j SKIP LOCKED`,
          [school],
        )
      ).rows[0];
      if (!row) return null;
      let config: ReturnType<typeof aiConfiguration>;
      try {
        config = aiConfiguration();
      } catch {
        await c.query(
          "UPDATE ai_jobs SET status='failed',error_message='AI_NOT_CONFIGURED' WHERE school_id=$1 AND import_job_id=$2 AND status='pending'",
          [school, row.import_job_id],
        );
        return null;
      }
      const reserve =
        config.maxCompletionTokens + Math.ceil(JSON.stringify(row.input_data).length / 2) + 1000;
      const budget = Number(process.env.AI_IMPORT_TOKEN_BUDGET ?? '1000000');
      if (
        !Number.isSafeInteger(budget) ||
        budget < 1 ||
        row.attempts >= 3 ||
        (
          await c.query(
            'UPDATE import_jobs SET ai_reserved_tokens=ai_reserved_tokens+$1 WHERE school_id=$2 AND id=$3 AND ai_reserved_tokens+$1<=$4 RETURNING id',
            [reserve, school, row.import_job_id, budget],
          )
        ).rowCount !== 1
      ) {
        await c.query(
          "UPDATE ai_jobs SET status='failed',error_message='AI_BUDGET_OR_RETRY_LIMIT' WHERE school_id=$1 AND id=$2",
          [school, row.id],
        );
        return null;
      }
      const token = randomUUID();
      await c.query(
        "UPDATE ai_jobs SET status='processing',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '90 seconds',provider_model=$2,reserved_tokens=reserved_tokens+$3 WHERE school_id=$4 AND id=$5",
        [token, config.model, reserve, school, row.id],
      );
      await c.query("UPDATE import_jobs SET state='ai_running' WHERE school_id=$1 AND id=$2", [
        school,
        row.import_job_id,
      ]);
      return { ...row, lease_token: token, attempts: row.attempts + 1 };
    });
  }
  private async runAi(school: string, job: AiJob) {
    try {
      const result = await this.ai.suggest(job.input_data);
      await this.db.withTenantTransaction(school, async (c) => {
        const exam = (
          await c.query<{ import_id: string; state: string }>(
            'SELECT import_id,state FROM exams WHERE school_id=$1 AND id=$2 FOR UPDATE',
            [school, job.exam_id],
          )
        ).rows[0];
        const lease = (
          await c.query(
            "SELECT id FROM ai_jobs WHERE school_id=$1 AND id=$2 AND lease_token=$3 AND status='processing' AND lease_until>now() FOR UPDATE",
            [school, job.id, job.lease_token],
          )
        ).rows[0];
        if (!lease) return;
        if (
          !exam ||
          exam.import_id !== job.import_job_id ||
          !['draft', 'returned'].includes(exam.state)
        ) {
          await c.query(
            "UPDATE ai_jobs SET status='failed',error_message='AI_STALE_JOB',lease_token=NULL,lease_until=NULL WHERE school_id=$1 AND id=$2",
            [school, job.id],
          );
          return;
        }
        const s = result.suggestion;
        const applied = await c.query(
          'UPDATE exam_items SET primary_topic=$1,secondary_topics=$2,explanation=$3,key_consistent=$4,review_flags=$5 WHERE school_id=$6 AND exam_id=$7 AND item_id=$8 AND exam_version_id IS NULL AND NOT reviewed AND ai_input_hash=$9 RETURNING id',
          [
            s.primaryTopic,
            JSON.stringify(s.secondaryTopics),
            s.explanation,
            s.keyConsistent,
            JSON.stringify(s.reviewFlags),
            school,
            job.exam_id,
            job.item_id,
            job.item_hash,
          ],
        );
        await c.query(
          'UPDATE ai_jobs SET status=$1,output_data=$2,input_tokens=$3,output_tokens=$4,error_message=$5,lease_token=NULL,lease_until=NULL WHERE school_id=$6 AND id=$7',
          [
            applied.rowCount ? 'completed' : 'failed',
            JSON.stringify(result),
            result.usage.inputTokens,
            result.usage.outputTokens,
            applied.rowCount ? null : 'AI_STALE_INPUT',
            school,
            job.id,
          ],
        );
        if (applied.rowCount)
          await c.query(
            'UPDATE exams SET revision=revision+1,updated_at=now() WHERE school_id=$1 AND id=$2',
            [school, job.exam_id],
          );
      });
    } catch (error) {
      const failure = error instanceof AiProviderError ? error.code : 'AI_PROCESSING_FAILED',
        retry = error instanceof AiProviderError && error.retryable && job.attempts < 3;
      await this.db.withTenantTransaction(school, async (c) => {
        await c.query(
          "UPDATE ai_jobs SET status=$1,error_message=$2,retry_at=now()+interval '10 seconds',lease_token=NULL,lease_until=NULL WHERE school_id=$3 AND id=$4 AND lease_token=$5",
          [retry ? 'pending' : 'failed', failure, school, job.id, job.lease_token],
        );
      });
    }
  }
  private async finish(school: string) {
    await this.db.withTenantTransaction(school, async (c) => {
      const jobs = (
        await c.query<{ id: string; exam_id: string }>(
          "SELECT id,exam_id FROM import_jobs WHERE school_id=$1 AND state IN ('ai_queued','ai_running') ORDER BY id",
          [school],
        )
      ).rows;
      for (const job of jobs) {
        await c.query('SELECT id FROM exams WHERE school_id=$1 AND id=$2 FOR UPDATE', [
          school,
          job.exam_id,
        ]);
        await c.query('SELECT id FROM import_jobs WHERE school_id=$1 AND id=$2 FOR UPDATE', [
          school,
          job.id,
        ]);
        const counts = (
          await c.query<{ completed: string; failed: string; pending: string }>(
            "SELECT count(*) FILTER(WHERE status='completed') completed,count(*) FILTER(WHERE status='failed') failed,count(*) FILTER(WHERE status IN ('pending','processing')) pending FROM ai_jobs WHERE school_id=$1 AND import_job_id=$2",
            [school, job.id],
          )
        ).rows[0];
        const pending = Number(counts.pending) > 0,
          failed = Number(counts.failed) > 0;
        await c.query(
          'UPDATE import_jobs SET completed_count=$1,state=$2,status=$3,failure=$4 WHERE school_id=$5 AND id=$6',
          [
            Number(counts.completed),
            pending ? 'ai_running' : failed ? 'failed' : 'ready',
            pending ? 'processing' : failed ? 'failed' : 'completed',
            !pending && failed
              ? 'Some AI reviews failed. Complete questions manually or retry.'
              : null,
            school,
            job.id,
          ],
        );
      }
    });
  }
}
