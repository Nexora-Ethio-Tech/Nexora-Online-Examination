import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/common/db/db.service';
import { databasePoolConfig } from '../src/common/db/database-config';
import { encryptMfaSecret, newMfaSecret } from '../src/common/crypto/mfa';
import { hashPassword, hashSha256 } from '../src/common/crypto/password';
import { responseCookie } from './http-helpers';

// This suite creates its own two schools; legacy seed/reset suites remain blocked.
describe.runIf(process.env.RUN_SUPABASE_ISOLATION_TESTS === 'true')(
  'Supabase runtime isolation',
  () => {
    const schoolA = randomUUID();
    const schoolB = randomUUID();
    const studentA = randomUUID();
    const studentB = randomUUID();
    const deviceId = randomUUID();
    const loginA = `ISOLATION-${studentA}`;
    const loginB = `ISOLATION-${studentB}`;
    const password = randomUUID();
    const accounts: {
      id: string;
      schoolId: string;
      loginId: string;
      role: 'student' | 'teacher' | 'school_admin';
    }[] = [
      { id: studentB, schoolId: schoolB, loginId: loginB, role: 'student' },
      ...[schoolA, schoolB].flatMap((schoolId) => [
        {
          id: randomUUID(),
          schoolId,
          loginId: `ISOLATION-${randomUUID()}`,
          role: 'teacher' as const,
        },
        {
          id: randomUUID(),
          schoolId,
          loginId: `ISOLATION-${randomUUID()}`,
          role: 'school_admin' as const,
        },
      ]),
    ];
    const anonymousTokenHashes: string[] = [];
    let app: INestApplication | undefined;
    let db: DbService;
    let admin: Pool;
    let runtime: Pool;

    beforeAll(async () => {
      const config = databasePoolConfig('migration');
      const url = new URL(z.string().parse(config.connectionString));
      if (!/(^|\.)supabase\.(com|co)$/.test(url.hostname)) {
        throw new Error('Isolation verification must use Supabase');
      }
      admin = new Pool(config);
      runtime = new Pool({ ...databasePoolConfig('runtime'), max: 1 });
      const role = await runtime.query<{ role: string; bypass: boolean }>(
        'SELECT current_user AS role, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user',
      );
      expect(role.rows[0]).toEqual({ role: 'nexora_runtime', bypass: false });
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO schools (id, name, slug) VALUES ($1, 'Isolation test A', $3), ($2, 'Isolation test B', $4)`,
          [schoolA, schoolB, `isolation-${schoolA}`, `isolation-${schoolB}`],
        );
        await client.query(
          `INSERT INTO users (id, school_id, login_id, display_name, role, password_hash)
         VALUES ($1, $2, $3, 'Isolation student A', 'student', $7),
                ($4, $5, $6, 'Isolation student B', 'student', $7)`,
          [studentA, schoolA, loginA, studentB, schoolB, loginB, await hashPassword(password)],
        );
        const passwordHash = await hashPassword(password);
        for (const account of accounts.filter((account) => account.id !== studentB)) {
          await client.query(
            `INSERT INTO users (id, school_id, login_id, display_name, role, password_hash)
           VALUES ($1, $2, $3, 'Isolation staff', $4, $5)`,
            [account.id, account.schoolId, account.loginId, account.role, passwordHash],
          );
          if (account.role === 'school_admin') {
            const version = randomUUID();
            await client.query(
              'UPDATE users SET mfa_secret_enc = $1, mfa_secret_version = $2, mfa_enrolled_at = NOW() WHERE id = $3',
              [
                encryptMfaSecret(newMfaSecret(), {
                  schoolId: account.schoolId,
                  userId: account.id,
                  version,
                }),
                version,
                account.id,
              ],
            );
          }
        }
        await client.query(
          `INSERT INTO classes (school_id, name, code_or_year)
         VALUES ($1, 'Isolation class A', '2026'), ($2, 'Isolation class B', '2026')`,
          [schoolA, schoolB],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = module.createNestApplication();
      app.use(cookieParser());
      app.setGlobalPrefix('api/v1');
      await app.init();
      db = app.get(DbService);
    });

    async function signIn(loginId: string) {
      if (!app) throw new Error('Application not initialized');
      const agent = request.agent(app.getHttpServer());
      const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
      const anonymousCookie = responseCookie(bootstrap, 'nexora_session');
      anonymousTokenHashes.push(hashSha256(anonymousCookie.slice('nexora_session='.length)));
      const csrf = z.object({ csrfToken: z.string() }).parse(bootstrap.body).csrfToken;
      const login = await agent
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', csrf)
        .send({ loginId, password })
        .expect(200);
      return { agent, login };
    }

    it.each(accounts)(
      'restores $role scope in school $schoolId and blocks incomplete admin MFA',
      async (account) => {
        const { agent, login } = await signIn(account.loginId);
        if (account.role === 'school_admin') {
          expect(login.body).toMatchObject({ status: 'mfa_required' });
          await agent.get('/api/v1/auth/me').expect(401);
          await agent.get('/api/v1/me/exams').expect(401);
        } else {
          const me = await agent.get('/api/v1/auth/me').expect(200);
          expect(me.body).toMatchObject({
            user: { id: account.id, role: account.role },
            school: { id: account.schoolId },
          });
          if (account.role === 'teacher') await agent.get('/api/v1/me/exams').expect(403);
        }
      },
    );

    it('refuses to start with privileged migration credentials as the runtime connection', async () => {
      const previous = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
        await expect(new DbService().onModuleInit()).rejects.toThrow('restricted runtime role');
      } finally {
        process.env.DATABASE_URL = previous;
      }
    });

    afterAll(async () => {
      await app?.close();
      if (admin) {
        await admin.query('DELETE FROM auth_sessions WHERE token_hash = ANY($1::text[])', [
          anonymousTokenHashes,
        ]);
        await admin.query('DELETE FROM schools WHERE id = ANY($1::uuid[])', [[schoolA, schoolB]]);
        await admin.query('DELETE FROM browser_devices WHERE device_id = $1', [deviceId]);
        await admin.end();
      }
      await runtime?.end();
    });

    it('denies unscoped reads and ignores the legacy admin-bypass setting', async () => {
      const client = await runtime.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL app.is_migration_or_admin = 'true'");
        for (const table of ['schools', 'users', 'classes', 'auth_sessions']) {
          expect((await client.query(`SELECT id FROM public.${table}`)).rows).toEqual([]);
        }
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });

    it('isolates reads and writes even when the SQL omits a school filter', async () => {
      await db.withTenantTransaction(schoolA, async (client) => {
        expect((await client.query('SELECT school_id FROM classes')).rows).toEqual([
          { school_id: schoolA },
        ]);
        expect((await client.query('SELECT id FROM users WHERE id = $1', [studentB])).rows).toEqual(
          [],
        );
        expect(
          (
            await client.query('UPDATE users SET display_name = $1 WHERE id = $2', [
              'Forbidden',
              studentB,
            ])
          ).rowCount,
        ).toBe(0);
      });
      await expect(
        db.tenantQuery(
          schoolA,
          'INSERT INTO classes (school_id, name, code_or_year) VALUES ($1, $2, $3)',
          [schoolB, 'Forbidden', '2026'],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (await admin.query('SELECT display_name FROM users WHERE id = $1', [studentB])).rows[0]
          ?.display_name,
      ).toBe('Isolation student B');
    });

    it('scopes authentication lookup and clears lookup context after commit', async () => {
      const users = await db.authQuery({ loginId: loginA }, 'SELECT id FROM users');
      expect(users.rows).toEqual([{ id: studentA }]);
      expect((await db.authQuery({ loginId: loginA }, 'SELECT id FROM schools')).rows).toEqual([
        { id: schoolA },
      ]);
      expect((await db.query('SELECT id FROM users')).rows).toEqual([]);
    });

    it('clears tenant context after both commit and rollback on a reused connection', async () => {
      const client = await runtime.connect();
      try {
        for (const ending of ['COMMIT', 'ROLLBACK']) {
          await client.query('BEGIN');
          await client.query("SELECT set_config('app.current_school_id', $1, true)", [schoolA]);
          expect((await client.query('SELECT id FROM schools')).rows).toEqual([{ id: schoolA }]);
          await client.query(ending);
          expect((await client.query('SELECT id FROM schools')).rows).toEqual([]);
        }
      } finally {
        client.release();
      }
    });

    it('denies DDL, role escalation and migration-history writes', async () => {
      const client = await runtime.connect();
      try {
        for (const sql of [
          `CREATE TABLE public.isolation_forbidden_${studentA.replaceAll('-', '')} (id integer)`,
          'SET ROLE postgres',
          'ALTER ROLE nexora_runtime BYPASSRLS',
          'SELECT version FROM schema_migrations',
        ]) {
          await client.query('BEGIN');
          try {
            await expect(client.query(sql)).rejects.toMatchObject({ code: '42501' });
          } finally {
            await client.query('ROLLBACK');
          }
        }
      } finally {
        client.release();
      }
    });

    it('removes Data API access and enables RLS on bootstrap and global tables', async () => {
      const tables = await admin.query<{ tablename: string; rowsecurity: boolean }>(
        `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
       AND tablename IN ('schools', 'users', 'auth_sessions', 'browser_devices', 'schema_migrations')`,
      );
      expect(tables.rows).toHaveLength(5);
      for (const table of tables.rows) {
        expect(table.rowsecurity).toBe(true);
        const access = await admin.query<{ anon: boolean; authenticated: boolean }>(
          `SELECT has_table_privilege('anon', $1, 'SELECT') AS anon,
                has_table_privilege('authenticated', $1, 'SELECT') AS authenticated`,
          [`public.${table.tablename}`],
        );
        expect(access.rows[0]).toEqual({ anon: false, authenticated: false });
      }
    });

    it('supports cookie login, session restoration, enrollment and logout with the restricted role', async () => {
      const { agent } = await signIn(loginA);
      const me = await agent.get('/api/v1/auth/me').expect(200);
      const session = z
        .object({
          user: z.object({ id: z.string() }),
          school: z.object({ id: z.string() }),
          csrfToken: z.string(),
        })
        .parse(me.body);
      expect(session.user.id).toBe(studentA);
      expect(session.school.id).toBe(schoolA);
      const exams = await agent.get('/api/v1/me/exams').expect(200);
      expect(exams.body).toMatchObject({
        items: [],
        nextCursor: null,
        serverNow: expect.any(String),
      });
      await agent
        .post('/api/v1/auth/device')
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', session.csrfToken)
        .send({ deviceId })
        .expect(200);
      await agent
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', session.csrfToken)
        .send({})
        .expect(204);
      await agent.get('/api/v1/auth/me').expect(401);
    });
  },
);
