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
import { databasePoolConfig } from '../src/common/db/database-config';
import { hashPassword, hashSha256 } from '../src/common/crypto/password';
import { configureCors } from '../src/common/security/origins';
import { responseCookie } from './http-helpers';

describe.runIf(process.env.RUN_SUPABASE_ORIGIN_TESTS === 'true')(
  'Supabase Origin/CSRF security',
  () => {
    const schoolId = randomUUID();
    const userId = randomUUID();
    const loginId = `ORIGIN-${userId}`;
    const password = randomUUID();
    const origin = 'http://localhost:5173';
    const anonymousHashes: string[] = [];
    let app: INestApplication | undefined;
    let pool: Pool;
    let cookie: string;
    let csrf: string;

    beforeAll(async () => {
      const config = databasePoolConfig('migration');
      if (
        !/(^|\.)supabase\.(com|co)$/.test(
          new URL(z.string().parse(config.connectionString)).hostname,
        )
      )
        throw new Error('Origin verification requires Supabase');
      pool = new Pool(config);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          "INSERT INTO schools (id, name, slug) VALUES ($1, 'Origin verification', $2)",
          [schoolId, `origin-${schoolId}`],
        );
        await client.query(
          "INSERT INTO users (id, school_id, login_id, display_name, role, password_hash) VALUES ($1, $2, $3, 'Synthetic origin student', 'student', $4)",
          [userId, schoolId, loginId, await hashPassword(password)],
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
      configureCors(app);
      app.setGlobalPrefix('api/v1');
      await app.init();
      const bootstrap = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
      cookie = responseCookie(bootstrap, 'nexora_session');
      anonymousHashes.push(hashSha256(cookie.slice('nexora_session='.length)));
      csrf = z.object({ csrfToken: z.string() }).parse(bootstrap.body).csrfToken;
    });

    afterAll(async () => {
      await app?.close();
      if (pool) {
        await pool.query('DELETE FROM auth_sessions WHERE token_hash = ANY($1::text[])', [
          anonymousHashes,
        ]);
        await pool.query('DELETE FROM schools WHERE id = $1', [schoolId]);
        await pool.end();
      }
    });

    function server() {
      if (!app) throw new Error('Application not initialized');
      return app.getHttpServer();
    }

    it.each([
      'http://localhost:5173.evil.test',
      'http://localhost:51730',
      'http://localhost:5173/path',
      'http://localhost:5173@evil.test',
      'https://localhost:5173',
      'null',
      'http://localhost:5173, https://evil.test',
    ])('rejects spoofed Origin %s even with a valid session and CSRF token', async (badOrigin) => {
      const result = await request(server())
        .post('/api/v1/auth/login')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrf)
        .set('Origin', badOrigin)
        .send({ loginId, password });
      expect(result.status).toBe(403);
      expect(result.body.code).toBe('CSRF_INVALID');
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
      expect(
        (await pool.query('SELECT id FROM auth_sessions WHERE user_id = $1', [userId])).rows,
      ).toEqual([]);
    });

    it('rejects a missing Origin even when an allowed Referer is supplied', async () => {
      for (const referer of [undefined, `${origin}/login`]) {
        const pending = request(server())
          .post('/api/v1/auth/login')
          .set('Cookie', cookie)
          .set('X-CSRF-Token', csrf);
        if (referer) pending.set('Referer', referer);
        const result = await pending.send({ loginId, password });
        expect(result.status).toBe(403);
        expect(result.body.code).toBe('CSRF_INVALID');
      }
    });

    it('requires the session-bound CSRF token even with an exact allowed Origin', async () => {
      for (const value of [undefined, 'unrelated-session-token']) {
        const pending = request(server())
          .post('/api/v1/auth/login')
          .set('Cookie', cookie)
          .set('Origin', origin);
        if (value) pending.set('X-CSRF-Token', value);
        const result = await pending.send({ loginId, password });
        expect(result.status).toBe(403);
        expect(result.body.code).toBe('CSRF_INVALID');
      }
    });

    it('permits credentialed preflight only for the exact allowed Origin', async () => {
      const allowed = await request(server())
        .options('/api/v1/auth/login')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token')
        .expect(204);
      expect(allowed.headers['access-control-allow-origin']).toBe(origin);
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      const denied = await request(server())
        .options('/api/v1/auth/login')
        .set('Origin', `${origin}.evil.test`)
        .set('Access-Control-Request-Method', 'POST')
        .expect(403);
      expect(denied.body.code).toBe('CSRF_INVALID');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('keeps readiness accessible without an Origin and does not grant wildcard CORS', async () => {
      const ready = await request(server()).get('/api/v1/ready').expect(200);
      expect(ready.body.database).toBe('connected');
      expect(ready.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects lookalike origins in the mutation guard independently of CORS middleware', async () => {
      const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const direct = module.createNestApplication();
      direct.use(cookieParser());
      direct.setGlobalPrefix('api/v1');
      try {
        await direct.init();
        for (const badOrigin of [`${origin}.evil.test`, `${origin}/path`, `${origin}0`]) {
          const result = await request(direct.getHttpServer())
            .post('/api/v1/auth/login')
            .set('Cookie', cookie)
            .set('X-CSRF-Token', csrf)
            .set('Origin', badOrigin)
            .send({ loginId, password });
          expect(result.status).toBe(403);
          expect(result.body.code).toBe('CSRF_INVALID');
        }
        expect(
          (await pool.query('SELECT id FROM auth_sessions WHERE user_id = $1', [userId])).rows,
        ).toEqual([]);
      } finally {
        await direct.close();
      }
    });

    it('supports login and logout with the exact Origin and rejects token reuse after rotation', async () => {
      const agent = request.agent(server());
      const signedIn = await agent
        .post('/api/v1/auth/login')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({ loginId, password })
        .expect(200);
      expect(signedIn.headers['access-control-allow-origin']).toBe(origin);
      expect(signedIn.headers['access-control-allow-credentials']).toBe('true');
      const me = await agent.get('/api/v1/auth/me').set('Origin', origin).expect(200);
      const current = z.object({ csrfToken: z.string() }).parse(me.body).csrfToken;
      expect(current).not.toBe(csrf);
      await agent
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({})
        .expect(403);
      await agent.get('/api/v1/auth/me').expect(200);
      await agent
        .post('/api/v1/auth/logout')
        .set('Origin', origin)
        .set('X-CSRF-Token', current)
        .send({})
        .expect(204);
      await agent.get('/api/v1/auth/me').expect(401);
    });
  },
);
