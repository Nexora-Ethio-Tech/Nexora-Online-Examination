import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { databasePoolConfig } from '../src/common/db/database-config';
import { allocateStudentNumbers, studentLoginId } from '../src/modules/directory/student-numbering';

describe.runIf(process.env.NEXORA_LOCAL_INTEGRATION === 'true')(
  'migrations 024 and 025 on isolated PostgreSQL',
  () => {
    let admin: Pool;
    let runtime: Pool;
    const school = randomUUID(),
      foreign = randomUUID();
    beforeAll(async () => {
      for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
        const url = new URL(process.env[key] ?? '');
        if (
          url.hostname !== '127.0.0.1' ||
          url.port !== '55432' ||
          url.pathname !== '/nexora_be02a_test'
        )
          throw new Error('Dedicated local disposable database required');
      }
      admin = new Pool(databasePoolConfig('migration'));
      runtime = new Pool(databasePoolConfig('runtime'));
      await admin.query(
        "INSERT INTO schools(id,name,slug) VALUES($1::uuid,'Local schema test',$1::text),($2::uuid,'Foreign schema test',$2::text)",
        [school, foreign],
      );
    });
    beforeEach(async () => {
      await admin.query('DELETE FROM school_student_counters WHERE school_id=ANY($1::uuid[])', [
        [school, foreign],
      ]);
    });
    afterAll(async () => {
      if (admin) {
        await admin.query('DELETE FROM school_student_counters WHERE school_id=ANY($1::uuid[])', [
          [school, foreign],
        ]);
        await admin.query('DELETE FROM schools WHERE id=ANY($1::uuid[])', [[school, foreign]]);
        await admin.end();
      }
      await runtime?.end();
    });
    async function transaction<T>(work: (c: PoolClient) => Promise<T>, rollback = false) {
      const c = await runtime.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('app.current_school_id',$1,true)", [school]);
        const result = await work(c);
        await c.query(rollback ? 'ROLLBACK' : 'COMMIT');
        return result;
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      } finally {
        c.release();
      }
    }
    it('has the migration ledger, archive column and forced row security', async () => {
      expect(
        (
          await admin.query(
            "SELECT version FROM schema_migrations WHERE version='025_grade_directory.sql'",
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await admin.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='classes' AND column_name IN ('grade','section')",
          )
        ).rowCount,
      ).toBe(2);
      expect(
        (
          await admin.query(
            "SELECT version FROM schema_migrations WHERE version='024_portal_management.sql'",
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await admin.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='exams' AND column_name='archived_at'",
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await admin.query(
            "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='school_student_counters'::regclass",
          )
        ).rows[0],
      ).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });
    it('continues after both legacy and year-suffixed student IDs without renaming them', async () => {
      await transaction(async (c) => {
        await c.query(
          "INSERT INTO users(id,school_id,login_id,display_name,role,password_hash) VALUES($1,$3,$4,'Legacy','student','unused'),($2,$3,$5,'New','student','unused')",
          [randomUUID(), randomUUID(), school, `${school}-STU-0010`, `${school}-STU-0021-2026`],
        );
        expect(await allocateStudentNumbers(c, school, 1)).toBe(22);
        expect(
          (
            await c.query('SELECT login_id FROM users WHERE school_id=$1 ORDER BY login_id', [
              school,
            ])
          ).rows.map((r) => r.login_id),
        ).toEqual([`${school}-STU-0010`, `${school}-STU-0021-2026`]);
      }, true);
    });
    it('allocates disjoint ranges under concurrent requests', async () => {
      const starts = await Promise.all([
        transaction((c) => allocateStudentNumbers(c, school, 2)),
        transaction((c) => allocateStudentNumbers(c, school, 2)),
      ]);
      expect(starts.sort((a, b) => a - b)).toEqual([1, 3]);
      expect(await transaction((c) => allocateStudentNumbers(c, school, 1))).toBe(5);
    });
    it('rolls back failed allocation and continues past four digits', async () => {
      await transaction((c) => allocateStudentNumbers(c, school, 2), true);
      expect(await transaction((c) => allocateStudentNumbers(c, school, 1))).toBe(1);
      await admin.query('UPDATE school_student_counters SET last_number=9999 WHERE school_id=$1', [
        school,
      ]);
      expect(
        studentLoginId('local', await transaction((c) => allocateStudentNumbers(c, school, 1))),
      ).toMatch(/^LOCAL-STU-10000-\d{4}$/);
    });
    it('denies foreign-school counter reads and writes through the restricted role', async () => {
      await admin.query('INSERT INTO school_student_counters(school_id,last_number) VALUES($1,9)', [
        foreign,
      ]);
      expect(
        await transaction(
          async (c) =>
            (await c.query('SELECT * FROM school_student_counters WHERE school_id=$1', [foreign]))
              .rowCount,
        ),
      ).toBe(0);
      await expect(
        transaction((c) =>
          c.query('INSERT INTO school_student_counters(school_id,last_number) VALUES($1,1)', [
            foreign,
          ]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  },
);
