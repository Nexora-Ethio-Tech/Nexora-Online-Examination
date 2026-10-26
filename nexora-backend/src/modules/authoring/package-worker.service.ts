import { validateImages } from './image-validation';
import { blocksSchema, structureSchema, structureProblems } from './content-schema';
import { wrapPackageKey } from '../../common/crypto/package-key';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { DbService } from '../../common/db/db.service';
import { encryptExamPackage } from '../../common/crypto/package-cipher';

const publicItem = z
  .object({
    content: blocksSchema.optional(),
    sectionId: z.string().nullable().optional(),
    passageId: z.string().nullable().optional(),
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    type: z.enum(['mcq_single', 'true_false']),
    stem: z.string().min(1),
    options: z
      .array(
        z
          .object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), text: z.string().min(1) })
          .strict(),
      )
      .min(2)
      .max(4),
    marks: z.number().int().positive(),
  })
  .strict();
const paper = z
  .object({
    structure: structureSchema.optional(),
    examVersion: z.number().int().positive(),
    title: z.string().min(1),
    instructions: z.string(),
    items: z.array(publicItem).min(1).max(200),
  })
  .strict();
@Injectable()
export class PackageWorkerService {
  constructor(private readonly db: DbService) {}
  // Only bounded database/crypto work belongs here: no provider calls or background promises.
  // The caller owns the approval/retry transaction; a savepoint preserves approval on failure.
  async prepareNow(c: PoolClient, school: string, version: string) {
    const row = (
      await c.query<{ id: string; exam_version_id: string }>(
        "SELECT id,exam_version_id FROM package_jobs WHERE school_id=$1 AND exam_version_id=$2 AND (status='pending' OR (status='processing' AND lease_until<now())) FOR UPDATE",
        [school, version],
      )
    ).rows[0];
    if (!row) return false;
    const job = { ...row, token: randomUUID() };
    await c.query(
      "UPDATE package_jobs SET status='processing',lease_token=$1,lease_until=now()+interval '2 minutes' WHERE school_id=$2 AND id=$3",
      [job.token, school, job.id],
    );
    await c.query('SAVEPOINT immediate_student_package');
    try {
      await this.build(c, school, job);
      await c.query('RELEASE SAVEPOINT immediate_student_package');
    } catch {
      await c.query('ROLLBACK TO SAVEPOINT immediate_student_package');
      await c.query(
        "UPDATE package_jobs SET status='failed',lease_token=NULL,lease_until=NULL,error_message='Approved package generation failed; retry after checking approved content and server key configuration' WHERE school_id=$1 AND id=$2 AND lease_token=$3",
        [school, job.id, job.token],
      );
      await c.query('RELEASE SAVEPOINT immediate_student_package');
    }
    return true;
  }
  private async build(
    c: PoolClient,
    school: string,
    job: { id: string; exam_version_id: string; token: string },
  ) {
    const lease = (
      await c.query(
        "SELECT id FROM package_jobs WHERE school_id=$1 AND id=$2 AND lease_token=$3 AND status='processing' AND lease_until>now() FOR UPDATE",
        [school, job.id, job.token],
      )
    ).rows[0];
    if (!lease) return;
    const version = (
      await c.query<{ version: number; title: string; instructions: string; structure?: unknown }>(
        "SELECT v.version,COALESCE(v.frozen_metadata->>'title',e.title) title,COALESCE(v.frozen_metadata->>'instructions',e.instructions) instructions,v.frozen_metadata->'structure' structure FROM exam_versions v JOIN exams e ON e.school_id=v.school_id AND e.id=v.exam_id WHERE v.school_id=$1 AND v.id=$2 AND v.approved_at IS NOT NULL",
        [school, job.exam_version_id],
      )
    ).rows[0];
    if (!version) throw new Error('Approved version unavailable');
    const items = (
      await c.query(
        'SELECT item_id "itemId",type,stem,section_id "sectionId",passage_id "passageId",content,options,marks FROM exam_items WHERE school_id=$1 AND exam_version_id=$2 ORDER BY position,item_id',
        [school, job.exam_version_id],
      )
    ).rows;
    const structure = structureSchema.parse(version.structure ?? { sections: [], passages: [] });
    const validatedItems = z.array(publicItem).parse(items);
    if (structureProblems(structure, validatedItems).length)
      throw new Error('Invalid section or passage references');
    validateImages(structure, validatedItems);
    const encrypted = encryptExamPackage(
      paper.parse({
        ...(structure.sections.length ? { structure } : {}),
        examVersion: version.version,
        title: version.title,
        instructions: version.instructions,
        items,
      }),
    );
    await c.query(
      'INSERT INTO exam_packages(school_id,exam_version_id,iv_base64url,ciphertext_base64url,sha256_hex,key_enc) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,exam_version_id) DO NOTHING',
      [
        school,
        job.exam_version_id,
        encrypted.iv,
        encrypted.ciphertext,
        encrypted.sha256,
        wrapPackageKey(encrypted.keyBase64url, school, job.exam_version_id),
      ],
    );
    await c.query(
      "UPDATE package_jobs SET status='ready',lease_token=NULL,lease_until=NULL,error_message=NULL WHERE school_id=$1 AND id=$2",
      [school, job.id],
    );
  }
  async run(school: string) {
    const job = await this.db.withTenantTransaction(school, async (c) => {
      const row = (
        await c.query<{ id: string; exam_version_id: string }>(
          "SELECT id,exam_version_id FROM package_jobs WHERE school_id=$1 AND (status='pending' OR (status='processing' AND lease_until<now())) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [school],
        )
      ).rows[0];
      if (!row) return null;
      const token = randomUUID();
      await c.query(
        "UPDATE package_jobs SET status='processing',lease_token=$1,lease_until=now()+interval '2 minutes' WHERE school_id=$2 AND id=$3",
        [token, school, row.id],
      );
      return { ...row, token };
    });
    if (!job) return false;
    try {
      await this.db.withTenantTransaction(school, async (c) => {
        await this.build(c, school, job);
      });
    } catch {
      await this.db.withTenantTransaction(school, async (c) => {
        await c.query(
          "UPDATE package_jobs SET status='failed',lease_token=NULL,lease_until=NULL,error_message='Approved package generation failed; retry after checking the approved content' WHERE school_id=$1 AND id=$2 AND lease_token=$3",
          [school, job.id, job.token],
        );
      });
    }
    return true;
  }
}
