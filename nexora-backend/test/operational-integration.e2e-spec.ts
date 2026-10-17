import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock/clock.service';
import { databasePoolConfig } from '../src/common/db/database-config';
import { hashPassword, hashSha256 } from '../src/common/crypto/password';
import { encryptExamPackage } from '../src/common/crypto/package-cipher';
import { responseCookie } from './http-helpers';

// Opt-in, random fixture IDs only. No seed/reset or shared-account mutation.
describe.runIf(process.env.RUN_SUPABASE_OPERATIONAL_TESTS === 'true')(
  'real operational API integration',
  () => {
    const school = randomUUID(),
      otherSchool = randomUUID(),
      student = randomUUID(),
      admin = randomUUID(),
      foreign = randomUUID(),
      teacher = randomUUID(),
      classId = randomUUID(),
      subject = randomUUID(),
      exam = randomUUID(),
      version = randomUUID(),
      session = randomUUID(),
      packageId = randomUUID();
    const clock = new ClockService();
    const now = new Date();
    const start = new Date(now.getTime() + 600000),
      end = new Date(start.getTime() + 3600000);
    const csrf = randomUUID(),
      studentToken = randomUUID(),
      adminToken = randomUUID(),
      foreignToken = randomUUID();
    const studentCookie = `nexora_session=${studentToken}`,
      adminCookie = `nexora_session=${adminToken}`,
      foreignCookie = `nexora_session=${foreignToken}`;
    const browserIds: string[] = [];
    let browser = '',
      replacement = '',
      attemptId = '',
      checksum = '';
    let app: INestApplication | undefined;
    let pool: Pool | undefined;
    let report: unknown;
    const reportKey = randomUUID(),
      transferKey = randomUUID();
    const read = (path: string, cookie = adminCookie) => {
      if (!app) throw new Error('App not started');
      return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', [cookie, browser]);
    };
    const post = (
      path: string,
      body: object,
      cookie = studentCookie,
      device = browser,
      key = randomUUID(),
    ) => {
      if (!app) throw new Error('App not started');
      return request(app.getHttpServer())
        .post(`/api/v1${path}`)
        .set('Cookie', [cookie, device])
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', csrf)
        .set('Idempotency-Key', key)
        .send(body);
    };
    beforeAll(async () => {
      pool = new Pool(databasePoolConfig('migration'));
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          "INSERT INTO schools(id,name,slug) VALUES($1::uuid,'Operational integration',$1::text),($2::uuid,'Foreign integration',$2::text)",
          [school, otherSchool],
        );
        const password = await hashPassword(randomUUID());
        for (const [id, tenant, role] of [
          [student, school, 'student'],
          [admin, school, 'school_admin'],
          [foreign, otherSchool, 'school_admin'],
          [teacher, school, 'teacher'],
        ])
          await c.query(
            'INSERT INTO users(id,school_id,login_id,display_name,role,password_hash,mfa_enrolled_at) VALUES($1::uuid,$2,$1::text,$3,$3,$4,$5)',
            [id, tenant, role, password, now],
          );
        for (const [id, tenant, token] of [
          [student, school, studentToken],
          [admin, school, adminToken],
          [foreign, otherSchool, foreignToken],
        ])
          await c.query(
            'INSERT INTO auth_sessions(school_id,user_id,token_hash,csrf_token,is_mfa_challenge,mfa_verified_at,expires_at) VALUES($1,$2,$3,$4,false,$5,$6)',
            [tenant, id, hashSha256(token), csrf, now, new Date(now.getTime() + 86400000)],
          );
        await c.query(
          "INSERT INTO classes(id,school_id,name,code_or_year) VALUES($1,$2,'Class','2026')",
          [classId, school],
        );
        await c.query("INSERT INTO subjects(id,school_id,name,code) VALUES($1,$2,'Math','MATH')", [
          subject,
          school,
        ]);
        await c.query(
          "INSERT INTO exams(id,school_id,owner_id,title,subject_id,class_id,state) VALUES($1,$2,$3,'Synthetic exam',$4,$5,'approved')",
          [exam, school, teacher, subject, classId],
        );
        await c.query(
          'INSERT INTO exam_versions(id,school_id,exam_id,version,approved_at) VALUES($1,$2,$3,1,$4)',
          [version, school, exam, now],
        );
        const options = [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ];
        await c.query(
          "INSERT INTO exam_items(school_id,exam_version_id,item_id,position,type,stem,options,correct_key,marks) VALUES($1,$2,'q1',1,'true_false','1 < 2',$3,'true',2)",
          [school, version, JSON.stringify(options)],
        );
        const encrypted = encryptExamPackage({
          examVersion: 1,
          title: 'Synthetic exam',
          instructions: 'Choose one.',
          items: [{ itemId: 'q1', type: 'true_false', stem: '1 < 2', options, marks: 2 }],
        });
        checksum = encrypted.sha256;
        await c.query(
          'INSERT INTO exam_packages(id,school_id,exam_version_id,iv_base64url,ciphertext_base64url,sha256_hex,key_enc) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            packageId,
            school,
            version,
            encrypted.iv,
            encrypted.ciphertext,
            checksum,
            encrypted.keyBase64url,
          ],
        );
        await c.query(
          'INSERT INTO exam_sessions(id,school_id,exam_id,exam_version_id,preparation_visible_at,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [session, school, exam, version, now, start, end],
        );
        await c.query(
          'INSERT INTO session_roster(school_id,session_id,student_id) VALUES($1,$2,$3)',
          [school, session, student],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      clock.setMockTime(now);
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ClockService)
        .useValue(clock)
        .compile();
      app = module.createNestApplication();
      app.use(cookieParser());
      app.setGlobalPrefix('api/v1');
      app.useLogger(false);
      await app.init();
      const device = randomUUID();
      browserIds.push(device);
      const enrollment = await post('/auth/device', { deviceId: device }, studentCookie, '').expect(
        200,
      );
      browser = responseCookie(enrollment, 'nexora_device_cred');
      const attempt = await post(`/sessions/${session}/attempts`, { deviceId: device }).expect(201);
      attemptId = attempt.body.attemptId;
    }, 60000);
    afterAll(async () => {
      if (app) await app.close();
      if (pool) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          for (const table of [
            'directory_imports',
            'device_transfer_events',
            'attempt_supervision_events',
          ])
            await c.query(`DELETE FROM ${table} WHERE school_id=ANY($1::uuid[])`, [
              [school, otherSchool],
            ]);
          await c.query('DELETE FROM schools WHERE id=ANY($1::uuid[])', [[school, otherSchool]]);
          await c.query('DELETE FROM browser_devices WHERE device_id=ANY($1::text[])', [
            browserIds,
          ]);
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
          await pool.end();
        }
      }
    }, 60000);
    const readiness = () => ({
      packageId,
      sha256: checksum,
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      shellBuild: 'integration-build',
    });
    it('imports a roster atomically and returns passwords only once', async () => {
      if (!app || !pool) throw new Error('Not started');
      await read('/students', studentCookie).expect(403);
      const server = app.getHttpServer();
      const upload = () =>
        request(server)
          .post('/api/v1/students/import')
          .set('Cookie', adminCookie)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', csrf)
          .set('Idempotency-Key', uploadKey)
          .field('classId', classId)
          .attach(
            'file',
            Buffer.from('studentRef,displayName\nSYN-1,Synthetic Learner\n'),
            'roster.csv',
          );
      const uploadKey = randomUUID();
      const preview = await upload();
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.canCommit).toBe(true);
      expect((await upload().expect(200)).body).toEqual(preview.body);
      const commitKey = randomUUID();
      const path = `/students/import/${preview.body.importId}/commit`;
      const body = { revision: 1, reason: 'Scoped integration verification' };
      await post(path, body, foreignCookie).expect(404);
      const committed = await post(path, body, adminCookie, browser, commitKey).expect(200);
      expect(committed.body.createdCount).toBe(1);
      expect((await post(path, body, adminCookie, browser, commitKey).expect(200)).body).toEqual(
        committed.body,
      );
      const id = committed.body.userIds[0];
      const target = {
        targets: [{ userId: id, revision: 1 }],
        reason: 'Scoped credential verification',
      };
      const issueKey = randomUUID();
      const first = await post(
        '/students/generate-credentials',
        target,
        adminCookie,
        browser,
        issueKey,
      ).expect(200);
      expect(first.body.credentials).toHaveLength(1);
      const second = await post(
        '/students/generate-credentials',
        target,
        adminCookie,
        browser,
        issueKey,
      ).expect(200);
      expect(second.body.credentials).toBeNull();
      expect(second.body.issueId).toBe(first.body.issueId);
      const stored = await pool.query(
        'SELECT password_hash,credentials_issued FROM users WHERE school_id=$1 AND id=$2',
        [school, id],
      );
      expect(stored.rows[0].password_hash).toMatch(/^\$argon2id\$/);
      expect(stored.rows[0].credentials_issued).toBe(true);
      const replay = await pool.query(
        'SELECT response_body FROM idempotency_keys WHERE school_id=$1 AND idempotency_key=$2',
        [school, issueKey],
      );
      expect(JSON.stringify(replay.rows)).not.toContain(first.body.credentials[0].password);
      const frozen = await pool.query(
        'SELECT student_id FROM session_roster WHERE school_id=$1 AND session_id=$2',
        [school, session],
      );
      expect(frozen.rows.map((r) => r.student_id)).toEqual([student]);
    }, 60000);
    it('denies student monitor access, foreign tenant reads and malformed cursors', async () => {
      await read('/admin/monitor/sessions', studentCookie).expect(403);
      await read(`/admin/monitor/sessions/${session}`, foreignCookie).expect(404);
      await read('/admin/monitor/sessions?limit=0').expect(422);
      await read('/admin/monitor/sessions?cursor=invalid').expect(422);
    });
    it('records real readiness once and keeps monitor reads read-only', async () => {
      const r = await post(
        `/attempts/${attemptId}/readiness`,
        readiness(),
        studentCookie,
        browser,
        reportKey,
      ).expect(200);
      report = r.body;
      const replay = await post(
        `/attempts/${attemptId}/readiness`,
        readiness(),
        studentCookie,
        browser,
        reportKey,
      ).expect(200);
      expect(replay.body).toEqual(report);
      const detail = await read(`/admin/monitor/sessions/${session}`).expect(200);
      expect(detail.body.sitting).toMatchObject({
        rosterCount: 1,
        readyCount: 1,
        counts: { preparing: 1 },
      });
      expect(detail.body.rows[0].attempt.readiness).toEqual(r.body.readiness);
      const again = await read(`/admin/monitor/sessions/${session}`).expect(200);
      expect(again.body.rows).toEqual(detail.body.rows);
      await post(
        `/attempts/${attemptId}/readiness`,
        { ...readiness(), shellBuild: 'different' },
        studentCookie,
        browser,
        reportKey,
      ).expect(409);
    }, 60000);
    it('validates package identity and device generation', async () => {
      const r = await post(`/attempts/${attemptId}/readiness`, {
        ...readiness(),
        sha256: '0'.repeat(64),
      }).expect(409);
      expect(r.body.code).toBe('READINESS_MISMATCH');
      await post(`/attempts/${attemptId}/readiness`, readiness(), adminCookie).expect(403);
    });
    it('serializes duplicate transfers, returns audit fields, preserves deadline and invalidates readiness', async () => {
      const device = randomUUID();
      browserIds.push(device);
      const enrolled = await post('/auth/device', { deviceId: device }, studentCookie, '').expect(
        200,
      );
      replacement = responseCookie(enrolled, 'nexora_device_cred');
      const body = {
        newDeviceId: device,
        expectedDeviceGeneration: 1,
        reason: 'Integration replacement',
      };
      const results = await Promise.all([
        post(`/attempts/${attemptId}/device-transfer`, body, adminCookie, '', transferKey),
        post(`/attempts/${attemptId}/device-transfer`, body, adminCookie, '', transferKey),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results[0].body).toEqual(results[1].body);
      expect(results[0].body).toMatchObject({
        attemptId,
        deviceGeneration: 2,
        state: 'preparing',
        deadlineAt: end.toISOString(),
        transferId: expect.any(String),
        transferredAt: now.toISOString(),
      });
      await post(`/attempts/${attemptId}/device-transfer`, body, adminCookie, '').expect(409);
      await post(
        `/attempts/${attemptId}/readiness`,
        readiness(),
        studentCookie,
        browser,
        reportKey,
      ).expect(409);
      const detail = await read(`/admin/monitor/attempts/${attemptId}`).expect(200);
      expect(detail.body.history).toHaveLength(1);
      expect(detail.body.student.attempt.readiness).toBeNull();
      expect(detail.body.sitting.readyCount).toBe(0);
    });
    it('allows replacement readiness then original replay after unlock; new report is denied', async () => {
      browser = replacement;
      const body = { ...readiness(), deviceGeneration: 2 },
        key = randomUUID();
      const r = await post(
        `/attempts/${attemptId}/readiness`,
        body,
        studentCookie,
        browser,
        key,
      ).expect(200);
      clock.setMockTime(start);
      await post(`/attempts/${attemptId}/unlock`, {
        packageId,
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 2,
      }).expect(200);
      const replay = await post(
        `/attempts/${attemptId}/readiness`,
        body,
        studentCookie,
        browser,
        key,
      ).expect(200);
      expect(replay.body).toEqual(r.body);
      const fresh = await post(`/attempts/${attemptId}/readiness`, body).expect(409);
      expect(fresh.body.code).toBe('STATE_CHANGED');
      const monitor = await read(`/admin/monitor/sessions/${session}`).expect(200);
      expect(monitor.body.sitting).toMatchObject({ readyCount: 0, counts: { active: 1 } });
    });
  },
);
