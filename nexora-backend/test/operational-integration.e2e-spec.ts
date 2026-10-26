import { newMfaSecret, encryptMfaSecret, totpCode } from '../src/common/crypto/mfa';
import { unwrapPackageKey } from '../src/common/crypto/package-key';
import { chromium, expect as browserExpect } from '@playwright/test';
import { spawn } from 'child_process';
import { PackageWorkerService } from '../src/modules/authoring/package-worker.service';
import { WorkerSweepService } from '../src/modules/authoring/worker-sweep.service';
import { decryptExamPackage } from '../src/common/crypto/package-cipher';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { QuestionAiService } from '../src/modules/authoring/import-worker.service';
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
import { hashPassword, hashSha256, verifyPassword } from '../src/common/crypto/password';
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
      assignment = randomUUID(),
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
      teacherToken = randomUUID(),
      foreignToken = randomUUID();
    const studentCookie = `nexora_session=${studentToken}`,
      adminCookie = `nexora_session=${adminToken}`,
      teacherCookie = `nexora_session=${teacherToken}`,
      foreignCookie = `nexora_session=${foreignToken}`;
    const browserIds: string[] = [];
    const anonymousHashes: string[] = [];
    const loginPassword = randomUUID(),
      mfaSecret = newMfaSecret(),
      mfaVersion = randomUUID();
    let browser = '',
      replacement = '',
      attemptId = '',
      checksum = '';
    let app: INestApplication | undefined;
    let pool: Pool | undefined;
    let report: unknown;
    let reviewedExamId = '';
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
        const password = await hashPassword(loginPassword);
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
        await c.query(
          'UPDATE users SET mfa_secret_enc=$1,mfa_secret_version=$2 WHERE id=$3 AND school_id=$4',
          [
            encryptMfaSecret(mfaSecret, { schoolId: school, userId: admin, version: mfaVersion }),
            mfaVersion,
            admin,
            school,
          ],
        );
        for (const [id, tenant, token] of [
          [student, school, studentToken],
          [admin, school, adminToken],
          [teacher, school, teacherToken],
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
          'INSERT INTO teacher_assignments(id,school_id,teacher_id,class_id,subject_id) VALUES($1,$2,$3,$4,$5)',
          [assignment, school, teacher, classId, subject],
        );
        await c.query('INSERT INTO enrollments(school_id,student_id,class_id) VALUES($1,$2,$3)', [
          school,
          student,
          classId,
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
          "INSERT INTO exam_items(school_id,exam_version_id,item_id,position,type,stem,options,correct_key,marks,explanation) VALUES($1,$2,'q1',1,'true_false','1 < 2',$3,'true',2,'One is less than two.')",
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
        await c.query('UPDATE exam_sessions SET planned_results_release_at=$2 WHERE id=$1', [
          session,
          new Date(end.getTime() + 60000),
        ]);
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
        .overrideProvider(QuestionAiService)
        .useValue({
          suggest: async () => ({
            suggestion: {
              primaryTopic: 'Arithmetic',
              secondaryTopics: [],
              explanation: 'Synthetic provider response for integration testing.',
              keyConsistent: true,
              reviewFlags: [],
            },
            model: 'synthetic-test',
            promptVersion: 'objective-review-v1',
            usage: { inputTokens: 10, outputTokens: 10 },
          }),
        })
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
            'exam_assistance_requests',
            'sitting_staff_assignments',
            'admin_enrollment_invites',
            'directory_imports',
            'school_student_counters',
            'school_teacher_counters',
            'device_transfer_events',
            'attempt_supervision_events',
          ])
            await c.query(`DELETE FROM ${table} WHERE school_id=ANY($1::uuid[])`, [
              [school, otherSchool],
            ]);
          await c.query('DELETE FROM request_limits WHERE bucket=ANY($1::text[])', [
            [
              hashSha256(`login:${student}`),
              hashSha256(`login:${admin}`),
              hashSha256(`practice:${school}:${student}`),
            ],
          ]);
          await c.query('DELETE FROM auth_sessions WHERE token_hash=ANY($1::text[])', [
            anonymousHashes,
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
    it('enrolls an inactive administrator through a private single-use link and validates profile permissions', async () => {
      if (!pool || !app) throw new Error('Missing application');
      const adminId = randomUUID(),
        loginId = 'INVITE-' + adminId,
        password = randomUUID(),
        token = randomUUID() + randomUUID(),
        hash = hashSha256(token);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE nexora_platform');
        await c.query('SELECT platform.create_admin($1,$2,$3,$4,$5)', [
          school,
          adminId,
          loginId,
          'First Father Grandfather',
          await hashPassword(password),
        ]);
        await c.query('SELECT platform.update_admin_profile($1,$2,$3,$4,$5,$6,$7,$8)', [
          school,
          adminId,
          'First',
          'Father',
          'Grandfather',
          '+251911111111',
          'admin@example.test',
          1,
        ]);
        expect(
          (await c.query('SELECT account_number FROM schools WHERE id=$1', [school])).rows[0]
            .account_number,
        ).toBeTruthy();
        await c.query(
          "INSERT INTO public.admin_enrollment_invites(token_hash,school_id,user_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '30 minutes')",
          [hash, school, adminId],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      const bootstrap = await request(app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
      const cookie = responseCookie(bootstrap, 'nexora_session');
      anonymousHashes.push(hashSha256(cookie.split('=')[1]));
      const enrollmentServer = app.getHttpServer();
      const enroll = (action: string, body: object) =>
        request(enrollmentServer)
          .post('/api/v1/auth/admin-enrollment/' + action)
          .set('Cookie', cookie)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', bootstrap.body.csrfToken)
          .send(body);
      const credentials = { token, loginId, password };
      await enroll('begin', { ...credentials, password: 'wrong' }).expect(403);
      const setup = await enroll('begin', credentials).expect(200);
      expect(setup.body.otpauthUri).toContain('otpauth://totp/');
      await enroll('confirm', {
        ...credentials,
        code: totpCode(setup.body.secret, Math.floor(clock.now().getTime() / 30000)),
      }).expect(200);
      await enroll('begin', credentials).expect(403);
      const row = (
        await pool.query(
          'SELECT status,mfa_enrolled_at,first_name,phone_number,recovery_email FROM users WHERE id=$1',
          [adminId],
        )
      ).rows[0];
      expect(row).toMatchObject({
        status: 'active',
        first_name: 'First',
        phone_number: '+251911111111',
        recovery_email: 'admin@example.test',
      });
      expect(row.mfa_enrolled_at).toBeTruthy();
      expect(
        JSON.stringify(
          (
            await pool.query(
              'SELECT reason FROM audit_events WHERE school_id=$1 AND resource_id=$2',
              [school, adminId],
            )
          ).rows,
        ),
      ).not.toContain(setup.body.secret);
    });

    const readiness = () => ({
      packageId,
      sha256: checksum,
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      shellBuild: 'integration-build',
    });
    it('creates grade-specific directories, filters assignments and retains deleted classes', async () => {
      if (!pool) throw new Error('Not started');
      const cls = await post(
        '/classes',
        { name: 'Grade 9 A', grade: '9', section: 'A', academicYear: '2026', reason: 'Grade test' },
        adminCookie,
      ).expect(200);
      const subject9 = await post(
        '/subjects',
        { name: 'Physics', code: 'PHY', grade: '9', reason: 'Grade test' },
        adminCookie,
      ).expect(200);
      const subject10 = await post(
        '/subjects',
        { name: 'Physics', code: 'PHY', grade: '10', reason: 'Grade test' },
        adminCookie,
      ).expect(200);
      await post(
        '/teacher-assignments',
        {
          teacherId: teacher,
          classId: cls.body.classId,
          subjectId: subject10.body.subjectId,
          reason: 'Mismatch',
        },
        adminCookie,
      ).expect(422);
      const assignment9 = await post(
        '/teacher-assignments',
        {
          teacherId: teacher,
          classId: cls.body.classId,
          subjectId: subject9.body.subjectId,
          reason: 'Grade test',
        },
        adminCookie,
      ).expect(200);
      const found = await read(
        `/teacher-assignments?grade=9&teacherId=${teacher}&search=Physics`,
      ).expect(200);
      expect(found.body.items.map((a: { assignmentId: string }) => a.assignmentId)).toEqual([
        assignment9.body.assignmentId,
      ]);
      expect((await read('/teacher-assignments?grade=12').expect(200)).body.items).toHaveLength(0);
      const removed = await post(
        `/directory/classes/${cls.body.classId}/remove`,
        { revision: cls.body.revision, reason: 'Remove test class', confirmed: true },
        adminCookie,
      ).expect(200);
      expect(removed.body.outcome).toBe('archived');
      expect(
        (await read('/classes').expect(200)).body.items.some(
          (c: { classId: string }) => c.classId === cls.body.classId,
        ),
      ).toBe(false);
      expect(
        (await pool.query('SELECT active FROM classes WHERE id=$1', [cls.body.classId])).rows[0]
          .active,
      ).toBe(false);
    });
    it('authenticates passwords and requires real TOTP before admin access', async () => {
      if (!app) throw new Error('Not started');
      const server = app.getHttpServer();
      for (const actor of [student, admin]) {
        const bootstrap = await request(server).get('/api/v1/auth/csrf').expect(200),
          anonymous = responseCookie(bootstrap, 'nexora_session');
        anonymousHashes.push(hashSha256(anonymous.slice('nexora_session='.length)));
        const login = await request(server)
          .post('/api/v1/auth/login')
          .set('Cookie', anonymous)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', bootstrap.body.csrfToken)
          .send({ loginId: actor, password: loginPassword })
          .expect(200);
        let cookie = responseCookie(login, 'nexora_session');
        if (actor === admin) {
          expect(login.body.status).toBe('mfa_required');
          await read('/admin/recovery', cookie).expect(401);
          const challenge = await request(server)
            .get('/api/v1/auth/csrf')
            .set('Cookie', cookie)
            .expect(200);
          const verified = await request(server)
            .post('/api/v1/auth/mfa/verify')
            .set('Cookie', cookie)
            .set('Origin', 'http://localhost:5173')
            .set('X-CSRF-Token', challenge.body.csrfToken)
            .send({ code: totpCode(mfaSecret, Math.floor(clock.now().getTime() / 30000)) })
            .expect(200);
          cookie = responseCookie(verified, 'nexora_session');
          await read('/admin/recovery', cookie).expect(200);
        }
        const me = await read('/auth/me', cookie).expect(200);
        expect(me.body.user.id).toBe(actor);
        await request(server)
          .post('/api/v1/auth/logout')
          .set('Cookie', cookie)
          .set('Origin', 'https://foreign.invalid')
          .set('X-CSRF-Token', me.body.csrfToken)
          .send({})
          .expect(403);
        await request(server)
          .post('/api/v1/auth/logout')
          .set('Cookie', cookie)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', me.body.csrfToken)
          .send({})
          .expect(204);
        await read('/auth/me', cookie).expect(401);
      }
    }, 60000);
    it('enforces teacher draft revisions and freezes reviewed submission', async () => {
      if (!app || !pool) throw new Error('Not started');
      const server = app.getHttpServer();
      const patch = (path: string, body: object, key = randomUUID()) =>
        request(server)
          .patch(`/api/v1${path}`)
          .set('Cookie', teacherCookie)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', csrf)
          .set('Idempotency-Key', key)
          .send(body);
      const body = {
        title: 'Synthetic authoring',
        instructions: 'Choose one',
        assignmentId: assignment,
        language: 'en',
        durationMinutes: 30,
        passPercent: 62.5,
        ordering: 'fixed',
      };
      const key = randomUUID();
      await post('/exams', body, studentCookie).expect(403);
      const created = await post('/exams', body, teacherCookie, browser, key).expect(201);
      expect(created.body).toMatchObject({
        revision: 1,
        status: 'draft',
        passPercent: 62.5,
        itemCount: 0,
      });
      expect((await post('/exams', body, teacherCookie, browser, key).expect(200)).body).toEqual(
        created.body,
      );
      const id = created.body.examId;
      reviewedExamId = id;
      await post(`/exams/${id}/submit-for-approval`, { revision: 1 }, teacherCookie).expect(409);
      await patch(`/exams/${id}`, { ...body, revision: 2 }).expect(409);
      await pool.query(
        "INSERT INTO exam_items(school_id,exam_id,item_id,external_id,position,type,stem,options,correct_key,marks,primary_topic,explanation) VALUES($1,$2,'draft-q','EXT-1',1,'true_false','2 + 2 = 4',$3,'true',2,'Arithmetic','Two plus two is four')",
        [
          school,
          id,
          JSON.stringify([
            { id: 'true', text: 'True' },
            { id: 'false', text: 'False' },
          ]),
        ],
      );
      const list = await read(`/exams/${id}/items`, teacherCookie).expect(200);
      const item = { ...list.body.items[0], reviewed: true };
      const reviewed = await patch(`/exams/${id}/items`, { revision: 1, item }).expect(200);
      expect(reviewed.body).toMatchObject({ revision: 2, reviewedCount: 1, totalMarks: 2 });
      const submitKey = randomUUID();
      const submitted = await post(
        `/exams/${id}/submit-for-approval`,
        { revision: 2 },
        teacherCookie,
        browser,
        submitKey,
      ).expect(200);
      expect(submitted.body).toMatchObject({ revision: 3, status: 'in_review' });
      const filtered = await read('/admin/exams?search=Synthetic%20authoring').expect(200);
      expect(
        filtered.body.items.map((row: { exam: { examId: string } }) => row.exam.examId),
      ).toEqual([id]);
      expect(filtered.body.items[0].submittedAt).not.toBeNull();
      expect((await read('/admin/exams?grade=12').expect(200)).body.items).toHaveLength(0);
      expect(
        (
          await read(
            `/admin/exams?from=${encodeURIComponent(new Date(now.getTime() + 3600000).toISOString())}`,
          ).expect(200)
        ).body.items,
      ).toHaveLength(0);
      expect(
        (
          await post(
            `/exams/${id}/submit-for-approval`,
            { revision: 2 },
            teacherCookie,
            browser,
            submitKey,
          ).expect(200)
        ).body,
      ).toEqual(submitted.body);
      await patch(`/exams/${id}`, { ...body, revision: 3 }).expect(409);
      const evidence = await pool.query(
        'SELECT kind FROM authoring_snapshots WHERE school_id=$1 AND exam_id=$2',
        [school, id],
      );
      expect(evidence.rows.map((r) => r.kind).sort()).toEqual(['before_item_edit', 'submitted']);
    }, 90000);
    it('approves a frozen paper, builds a private package and schedules accommodated delivery', async () => {
      if (!app || !pool) throw new Error('Not started');
      const id = reviewedExamId,
        approveKey = randomUUID();
      await post(
        `/exams/${id}/approve`,
        { revision: 3, comment: 'Verified synthetic paper' },
        teacherCookie,
      ).expect(403);
      const approved = await post(
        `/exams/${id}/approve`,
        { revision: 3, comment: 'Verified synthetic paper' },
        adminCookie,
        browser,
        approveKey,
      ).expect(200);
      expect(approved.body).toMatchObject({
        approvedVersion: 1,
        packageState: 'ready',
        exam: { revision: 4, status: 'approved' },
      });
      expect(
        (
          await post(
            `/exams/${id}/approve`,
            { revision: 3, comment: 'Verified synthetic paper' },
            adminCookie,
            browser,
            approveKey,
          ).expect(200)
        ).body,
      ).toEqual(approved.body);
      expect(await app.get(PackageWorkerService).run(school)).toBe(false);
      expect((await read(`/admin/exams/${id}`).expect(200)).body.packageState).toBe('ready');
      const encrypted = (
        await pool.query(
          'SELECT p.* FROM exam_packages p JOIN exam_versions v ON v.id=p.exam_version_id AND v.school_id=p.school_id WHERE v.school_id=$1 AND v.exam_id=$2',
          [school, id],
        )
      ).rows[0];
      const paper = decryptExamPackage<{ items: Record<string, unknown>[] }>(
        encrypted.ciphertext_base64url,
        encrypted.iv_base64url,
        unwrapPackageKey(encrypted.key_enc, school, encrypted.exam_version_id),
      );
      expect(paper.items).toHaveLength(1);
      expect(paper.items[0]).not.toHaveProperty('correctOptionId');
      expect(paper.items[0]).not.toHaveProperty('explanation');
      expect(paper.items[0]).not.toHaveProperty('correct_key');
      const prep = new Date(now.getTime() + 120000),
        release = new Date(now.getTime() + 90 * 60000);
      const schedule = {
          revision: 4,
          approvedVersion: 1,
          preparationVisibleAt: prep.toISOString(),
          preparationMinutes: 25,
          resultsReleaseAt: release.toISOString(),
        },
        scheduleKey = randomUUID();
      const scheduled = await post(
        `/exams/${id}/sessions`,
        schedule,
        adminCookie,
        browser,
        scheduleKey,
      ).expect(201);
      expect(
        (
          await post(`/exams/${id}/sessions`, schedule, adminCookie, browser, scheduleKey).expect(
            200,
          )
        ).body,
      ).toEqual(scheduled.body);
      const sitting = scheduled.body.sessions[0];
      expect(Date.parse(sitting.startsAt) - Date.parse(sitting.preparationVisibleAt)).toBe(
        25 * 60000,
      );
      const server = app.getHttpServer();
      const rescheduled = await request(server)
        .patch('/api/v1/sessions/' + sitting.sessionId + '/schedule')
        .set('Cookie', adminCookie)
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', csrf)
        .set('Idempotency-Key', randomUUID())
        .send({
          scheduleRevision: 1,
          preparationVisibleAt: prep.toISOString(),
          resultsReleaseAt: release.toISOString(),
          reason: 'Preserve custom preparation duration',
        })
        .expect(200);
      expect(
        Date.parse(rescheduled.body.sessions[0].startsAt) -
          Date.parse(rescheduled.body.sessions[0].preparationVisibleAt),
      ).toBe(25 * 60000);
      const extra = {
          scheduleRevision: 2,
          studentId: student,
          extraMinutes: 5,
          reason: 'Synthetic extra-time check',
        },
        extraKey = randomUUID();
      const patchExtra = () =>
        request(server)
          .patch(`/api/v1/sessions/${sitting.sessionId}/accommodations`)
          .set('Cookie', adminCookie)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', csrf)
          .set('Idempotency-Key', extraKey)
          .send(extra);
      const accommodation = await patchExtra().expect(200);
      expect(Date.parse(accommodation.body.student.deadlineAt) - Date.parse(sitting.endsAt)).toBe(
        300000,
      );
      clock.setMockTime(prep);
      expect((await patchExtra().expect(200)).body).toEqual(accommodation.body);
      const locked = await request(server)
        .patch(`/api/v1/sessions/${sitting.sessionId}/accommodations`)
        .set('Cookie', adminCookie)
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', csrf)
        .set('Idempotency-Key', randomUUID())
        .send({ ...extra, scheduleRevision: 3, extraMinutes: 6 })
        .expect(409);
      expect(locked.body.code ?? locked.body.error?.code).toBe('ACCOMMODATIONS_LOCKED');
      const delivered = await post(
        `/sessions/${sitting.sessionId}/attempts`,
        { deviceId: browserIds[0] },
        studentCookie,
      ).expect(201);
      expect(delivered.body.deadlineAt).toBe(accommodation.body.student.deadlineAt);
      expect(delivered.body.scheduleRevision).toBe(3);
      clock.setMockTime(now);
    }, 120000);
    it('durably imports a real template and preserves questions on failed replacement', async () => {
      if (!app) throw new Error('Not started');
      const server = app.getHttpServer();
      const body = {
        title: 'Synthetic file import',
        instructions: 'Choose one',
        assignmentId: assignment,
        language: 'en',
        durationMinutes: 30,
        passPercent: 50,
        ordering: 'fixed',
      };
      const created = await post('/exams', body, teacherCookie).expect(201);
      const id = created.body.examId,
        uploadKey = randomUUID();
      const upload = (bytes: Buffer, revision: number, key: string) =>
        request(server)
          .post('/api/v1/imports')
          .set('Cookie', teacherCookie)
          .set('Origin', 'http://localhost:5173')
          .set('X-CSRF-Token', csrf)
          .set('Idempotency-Key', key)
          .field('examId', id)
          .field('revision', String(revision))
          .attach('file', bytes, 'questions.docx');
      const bytes = readFileSync(resolve('../public/templates/nexora-questions.docx'));
      const job = await upload(bytes, 1, uploadKey).expect(202);
      expect((await upload(bytes, 1, uploadKey).expect(202)).body).toEqual(job.body);
      await read(`/imports/${job.body.importId}`, studentCookie).expect(403);
      await post('/internal/import-worker', { schoolId: school }, adminCookie).expect(403);
      await app.get(WorkerSweepService).run({ schoolId: school });
      const ready = await read(`/imports/${job.body.importId}`, teacherCookie).expect(200);
      expect(ready.body).toMatchObject({ state: 'ready', parsedCount: 2, completedCount: 2 });
      const before = await read(`/exams/${id}/items`, teacherCookie).expect(200);
      expect(before.body.items.map((i: { correctOptionId: string }) => i.correctOptionId)).toEqual([
        'B',
        'true',
      ]);
      const failed = await upload(
        Buffer.from('not a zip'),
        before.body.revision,
        randomUUID(),
      ).expect(202);
      await app.get(WorkerSweepService).run({ schoolId: school });
      const failure = await read(`/imports/${failed.body.importId}`, teacherCookie).expect(200);
      expect(failure.body.state).toBe('failed');
      expect(failure.body.diagnostics.length).toBeGreaterThan(0);
      expect((await read(`/exams/${id}/items`, teacherCookie).expect(200)).body.items).toEqual(
        before.body.items,
      );
    }, 120000);
    it('issues sequential teacher IDs and eight-character credentials without replaying passwords', async () => {
      const key = randomUUID();
      const body = { displayName: 'Synthetic Teacher', reason: 'Credential format verification' };
      const first = await post('/teachers', body, adminCookie, browser, key).expect(200);
      const credential = first.body.credentials[0];
      expect(credential.loginId).toMatch(/^TCH\/[0-9]{3,}\/0001$/);
      expect(credential.password).toHaveLength(8);
      for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!#$%&*?]/])
        expect(credential.password).toMatch(pattern);
      expect(
        (await post('/teachers', body, adminCookie, browser, key).expect(200)).body.credentials,
      ).toBeNull();
      const second = await post(
        '/teachers',
        { ...body, displayName: 'Second Teacher' },
        adminCookie,
      ).expect(200);
      expect(second.body.credentials[0].loginId).toBe(credential.loginId.replace(/0001$/, '0002'));
    });
    it('imports a roster atomically and returns passwords only once', async () => {
      if (!app || !pool) throw new Error('Not started');
      await read('/classes', studentCookie).expect(403);
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
            Buffer.from(
              "Roll number,First name,Father's name,Grandfather's name\n,Synthetic,Learner,Test\n",
            ),
            'roster.csv',
          );
      const uploadKey = randomUUID();
      const preview = await upload();
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.canCommit).toBe(true);
      expect((await upload().expect(200)).body).toEqual(preview.body);
      const commitKey = randomUUID();
      const path = `/students/import/${preview.body.importId}/commit`;
      const body = {
        revision: 1,
        reason: 'Scoped integration verification',
        issueCredentials: true,
      };
      await post(path, body, foreignCookie).expect(404);
      const committed = await post(path, body, adminCookie, browser, commitKey).expect(200);
      expect(committed.body.createdCount).toBe(1);
      const first = { body: committed.body.loginDetails };
      const second = {
        body: (await post(path, body, adminCookie, browser, commitKey).expect(200)).body
          .loginDetails,
      };
      expect(second.body).toEqual({ ...first.body, credentials: null });
      const id = committed.body.userIds[0];
      const issueKey = commitKey;
      expect(first.body.credentials).toHaveLength(1);
      expect(first.body.credentials[0].loginId).toMatch(/^STU\/[0-9]{3,}\/[0-9]{4,}\/[0-9]{2}$/);
      expect(first.body.credentials[0].password).toHaveLength(8);
      for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!#$%&*?]/])
        expect(first.body.credentials[0].password).toMatch(pattern);
      expect(second.body.credentials).toBeNull();
      expect(second.body.issueId).toBe(first.body.issueId);
      const stored = await pool.query(
        'SELECT password_hash,credentials_issued FROM users WHERE school_id=$1 AND id=$2',
        [school, id],
      );
      expect(stored.rows[0].password_hash).toMatch(/^\$argon2id\$/);
      expect(
        await verifyPassword(stored.rows[0].password_hash, first.body.credentials[0].password),
      ).toBe(true);
      expect(stored.rows[0].credentials_issued).toBe(true);
      const replay = await pool.query(
        'SELECT response_body FROM idempotency_keys WHERE school_id=$1 AND idempotency_key=$2',
        [school, issueKey],
      );
      expect(JSON.stringify(replay.rows)).not.toContain(first.body.credentials[0].password);
      const retainedImport = await pool.query(
        'SELECT committed_result FROM directory_imports WHERE school_id=$1 AND id=$2',
        [school, preview.body.importId],
      );
      expect(retainedImport.rows[0].committed_result.loginDetails.credentials).toBeNull();
      expect(JSON.stringify(retainedImport.rows)).not.toContain(first.body.credentials[0].password);
      await post(
        path,
        { ...body, issueCredentials: false },
        adminCookie,
        browser,
        commitKey,
      ).expect(409);
      const frozen = await pool.query(
        'SELECT student_id FROM session_roster WHERE school_id=$1 AND session_id=$2',
        [school, session],
      );
      expect(frozen.rows.map((r) => r.student_id)).toEqual([student]);
    }, 60000);
    it('serves categorized portal lists through real SQL filters and title cursors', async () => {
      clock.setMockTime(now);
      if (!pool) throw new Error('Not started');
      const queueIds = [randomUUID(), randomUUID()];
      for (const [index, id] of queueIds.entries()) {
        await pool.query(
          "INSERT INTO exams(id,school_id,owner_id,title,subject_id,class_id,state,assignment_id,created_at) VALUES($1,$2,$3,'Queue verification',$4,$5,'pending_approval',$6,$7)",
          [
            id,
            school,
            teacher,
            subject,
            classId,
            assignment,
            new Date(now.getTime() - index * 60000),
          ],
        );
        await pool.query(
          "INSERT INTO audit_events(school_id,actor_id,action,resource_id,server_at) VALUES($1,$2,'exam:submit',$3,$4)",
          [school, teacher, id, new Date(now.getTime() + index * 1000)],
        );
      }
      const current = await read(
        '/me/exams?category=current&sort=title&limit=1',
        studentCookie,
      ).expect(200);
      expect(current.body.items.length).toBeGreaterThan(0);
      expect(
        current.body.items.every((row: { phase: string }) =>
          ['preparing', 'open'].includes(row.phase),
        ),
      ).toBe(true);
      if (current.body.nextCursor) {
        await read(
          `/me/exams?category=current&sort=title&limit=1&cursor=${encodeURIComponent(current.body.nextCursor)}`,
          studentCookie,
        ).expect(200);
        await read(
          `/me/exams?category=past&sort=title&cursor=${encodeURIComponent(current.body.nextCursor)}`,
          studentCookie,
        ).expect(422);
      }
      const teacherList = await read(
        '/exams?category=active&status=approved',
        teacherCookie,
      ).expect(200);
      expect(
        teacherList.body.items.some((row: { examId: string }) => row.examId === reviewedExamId),
      ).toBe(true);
      const pending = await read(
        '/admin/exams?status=in_review&search=Queue%20verification&limit=1',
      ).expect(200);
      expect(pending.body.items[0].exam.examId).toBe(queueIds[0]);
      expect(pending.body.nextCursor).toEqual(expect.any(String));
      const queueNext = await read(
        `/admin/exams?status=in_review&search=Queue%20verification&limit=1&cursor=${encodeURIComponent(pending.body.nextCursor)}`,
      ).expect(200);
      expect(queueNext.body.items[0].exam.examId).toBe(queueIds[1]);
      expect(
        pending.body.items.every(
          (row: { exam: { status: string } }) => row.exam.status === 'in_review',
        ),
      ).toBe(true);
      const approved = await read(`/admin/exams?status=approved&classId=${classId}`).expect(200);
      expect(
        approved.body.items.some((row: { exam: { examId: string } }) => row.exam.examId === exam),
      ).toBe(true);
    });
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
    it('requires fresh staff MFA for each interruption, persists the pause and reports outcomes across assigned exams', async () => {
      if (!pool) throw new Error('Missing database');
      const before = (await pool.query('SELECT deadline_at FROM attempts WHERE id=$1', [attemptId]))
        .rows[0];
      await post(
        `/assistance/sessions/${session}/staff`,
        {
          staffId: teacher,
          active: true,
          expectedRevision: 0,
          reason: 'Assigned for integration test',
        },
        adminCookie,
      ).expect(200);
      const first = randomUUID();
      const paused = await post(`/attempts/${attemptId}/assistance`, {
        requestId: first,
        deviceGeneration: 2,
        interruptionKind: 'fullscreen_exit',
      }).expect(200);
      expect(paused.body.paused).toBe(true);
      const duplicate = await post(`/attempts/${attemptId}/assistance`, {
        requestId: randomUUID(),
        deviceGeneration: 2,
        interruptionKind: 'window_blur',
      }).expect(200);
      expect(duplicate.body.request.id).toBe(first);
      expect(
        (await read('/assistance/requests', teacherCookie).expect(200)).body.requests.map(
          (r: { id: string }) => r.id,
        ),
      ).toContain(first);
      expect((await read('/assistance/requests', foreignCookie).expect(200)).body.requests).toEqual(
        [],
      );
      await post(`/attempts/${attemptId}/unlock`, {
        packageId,
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 2,
      }).expect(409);
      const code = totpCode(mfaSecret, Math.floor(clock.now().getTime() / 30000));
      const wrong = code === '000000' ? '111111' : '000000';
      await post(
        `/assistance/requests/${first}/decision`,
        { action: 'approve', reason: 'Verified student', code: wrong },
        adminCookie,
      ).expect(403);
      expect(
        (await read(`/attempts/${attemptId}/assistance`, studentCookie).expect(200)).body.paused,
      ).toBe(true);
      await post(
        `/assistance/requests/${first}/decision`,
        { action: 'approve', reason: 'Verified student', code },
        adminCookie,
      ).expect(200);
      const report = await read('/assistance/report', adminCookie).expect(200);
      expect(report.body.events.map((r: { outcome: string }) => r.outcome)).toEqual(
        expect.arrayContaining(['assistance_approved', 'assistance_mfa_failed']),
      );
      expect(report.body.events[0]).toMatchObject({
        studentId: student,
        staffId: admin,
        examId: exam,
        interruptionKind: 'fullscreen_exit',
      });
      expect(JSON.stringify(report.body)).not.toContain(code);
      await read('/assistance/report', teacherCookie).expect(403);
      const second = randomUUID();
      await post(`/attempts/${attemptId}/assistance`, {
        requestId: second,
        deviceGeneration: 2,
        interruptionKind: 'window_blur',
      }).expect(200);
      await post(
        `/assistance/requests/${second}/decision`,
        { action: 'approve', reason: 'Checked again', code },
        adminCookie,
      ).expect(409);
      clock.setMockTime(new Date(start.getTime() + 30000));
      await post(
        `/assistance/requests/${second}/decision`,
        {
          action: 'approve',
          reason: 'Checked again',
          code: totpCode(mfaSecret, Math.floor(clock.now().getTime() / 30000)),
        },
        adminCookie,
      ).expect(200);
      expect(
        (
          await pool.query('SELECT deadline_at,assistance_paused FROM attempts WHERE id=$1', [
            attemptId,
          ])
        ).rows[0],
      ).toEqual({ ...before, assistance_paused: false });
    });
    it('publishes immutable official results only after acceptance and release gates', async () => {
      await read(`/sessions/${session}/results`, studentCookie).expect(403);
      await read(`/sessions/${session}/results`, foreignCookie).expect(404);
      const before = await read(`/sessions/${session}/results`).expect(200);
      expect(before.body.rows[0]).toMatchObject({
        status: 'awaiting_upload',
        score: null,
        rank: null,
      });
      const receipt = await post(`/attempts/${attemptId}/submit`, {
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 2,
        finalSeq: 1,
        answers: [{ itemId: 'q1', value: 'true' }],
      }).expect(200);
      expect(receipt.body.status).toBe('submitted');
      expect(receipt.body).not.toHaveProperty('score');
      const current = await read(`/sessions/${session}/results`, teacherCookie).expect(200);
      expect(current.body.rows[0]).toMatchObject({
        status: 'finalized',
        score: 2,
        percent: 100,
        rank: 1,
        passed: true,
      });
      expect(current.body.summary.revision).toBeGreaterThan(before.body.summary.revision);
      const boundary = new Date(end.getTime() + 5000),
        release = new Date(end.getTime() + 60000);
      const body = {
        revision: current.body.summary.revision,
        releaseAt: release.toISOString(),
        reason: 'Verified synthetic results',
        exclusions: [],
      };
      clock.setMockTime(boundary);
      const atBoundary = await read('/me/results', studentCookie).expect(200);
      expect(
        atBoundary.body.items.find((i: { sessionId: string }) => i.sessionId === session),
      ).toMatchObject({ publicationRevision: null, result: null });
      clock.setMockTime(new Date(release.getTime() - 1));
      const hidden = await read('/me/results', studentCookie).expect(200);
      expect(
        hidden.body.items.find((i: { sessionId: string }) => i.sessionId === session),
      ).toMatchObject({ publicationRevision: null, result: null });
      clock.setMockTime(release);
      const released = await read('/me/results', studentCookie).expect(200);
      expect(
        released.body.items.find((i: { sessionId: string }) => i.sessionId === session),
      ).toMatchObject({
        publicationRevision: body.revision,
        result: { score: 2, percent: 100, rank: 1 },
      });
      const replay = await read('/me/results', studentCookie).expect(200);
      expect(replay.body.items).toEqual(released.body.items);
      if (!pool) throw new Error('Not started');
      expect(
        (
          await pool.query(
            'SELECT automatic FROM result_publications WHERE school_id=$1 AND session_id=$2 AND revision=$3',
            [school, session, body.revision],
          )
        ).rows,
      ).toEqual([{ automatic: true }]);
      const historical = await read(
        `/exports/report?sessionId=${session}&revision=${before.body.summary.revision}`,
      ).expect(200);
      expect(historical.body.rows[0].score).toBeNull();
      const report = await read(
        `/exports/report?sessionId=${session}&revision=${body.revision}`,
      ).expect(200);
      expect(report.body.analytics).toMatchObject({ includedCount: 1, statusCount: 0 });
      expect(JSON.stringify(report.body)).not.toContain('correctKey');
      const csv = await read(
        `/exports/results.csv?sessionId=${session}&revision=${body.revision}`,
      ).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('"finalized","2","2","100","1"');
      clock.setMockTime(now);
    }, 60000);
    it('retains recovery evidence and keeps an older publication unchanged after acceptance', async () => {
      if (!pool) throw new Error('Not started');
      const sitting = randomUUID();
      await pool.query(
        'INSERT INTO exam_sessions(id,school_id,exam_id,exam_version_id,preparation_visible_at,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [sitting, school, exam, version, now, start, end],
      );
      await pool.query(
        'INSERT INTO session_roster(school_id,session_id,student_id) VALUES($1,$2,$3)',
        [school, sitting, student],
      );
      const device = browserIds.at(-1);
      const made = await post(`/sessions/${sitting}/attempts`, { deviceId: device }).expect(201),
        id = made.body.attemptId;
      clock.setMockTime(start);
      await post(`/attempts/${id}/unlock`, {
        packageId,
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 1,
      }).expect(200);
      await post(`/attempts/${id}/answers`, {
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 1,
        answers: [{ itemId: 'q1', value: 'false', clientSeq: 1 }],
      }).expect(200);
      clock.setMockTime(new Date(end.getTime() + 5001));
      const final = {
          examVersion: 1,
          scheduleRevision: 1,
          deviceGeneration: 1,
          finalSeq: 2,
          answers: [{ itemId: 'q1', value: 'true' }],
          reason: 'Synthetic network interruption',
        },
        uploadKey = randomUUID();
      const uploaded = await post(
          `/attempts/${id}/recovery`,
          final,
          studentCookie,
          browser,
          uploadKey,
        ).expect(201),
        recovery = uploaded.body.recoveryId;
      const detail = await read(`/admin/recovery/${recovery}`).expect(200);
      expect(detail.body).toMatchObject({
        canAccept: true,
        currentDeviceGeneration: 1,
        latestTimelySave: { answers: [{ itemId: 'q1', value: 'false', clientSeq: 1 }] },
        snapshot: { answers: [{ itemId: 'q1', value: 'true' }] },
      });
      expect(JSON.stringify(detail.body.paper)).not.toContain('correct_key');
      await read(`/admin/recovery/${recovery}`, studentCookie).expect(403);
      await read(`/admin/recovery/${recovery}`, foreignCookie).expect(404);
      const candidate = await read(`/sessions/${sitting}/results`).expect(200),
        revision = candidate.body.summary.revision;
      const pending = await read('/me/results', studentCookie).expect(200);
      expect(
        pending.body.items.find((i: { sessionId: string }) => i.sessionId === sitting).result,
      ).toMatchObject({ status: 'recovery_pending', score: null });
      const decision = { decision: 'accept', reason: 'Verified synthetic timely work' },
        decisionKey = randomUUID();
      const accepted = await post(
        `/recovery/${recovery}/decision`,
        decision,
        adminCookie,
        browser,
        decisionKey,
      ).expect(200);
      expect(accepted.body.resultRevision).toBeGreaterThan(revision);
      const receipt = await read(`/attempts/${id}/receipt`, studentCookie).expect(200);
      expect(receipt.body.receipt).toMatchObject({
        idempotencyKey: uploadKey,
        finalSeq: 2,
        snapshotDigest: detail.body.snapshotDigest,
      });
      const old = await read(`/exports/report?sessionId=${sitting}&revision=${revision}`).expect(
        200,
      );
      expect(old.body.rows[0]).toMatchObject({ status: 'recovery_pending', score: null });
      const updated = await read(`/sessions/${sitting}/results`).expect(200);
      expect(updated.body.rows[0]).toMatchObject({ status: 'finalized', score: 2 });
      const own = await read('/me/results', studentCookie).expect(200);
      expect(
        own.body.items.find((i: { sessionId: string }) => i.sessionId === sitting).result,
      ).toMatchObject({ status: 'finalized', score: 2 });
      const retry = await post(
        `/recovery/${recovery}/decision`,
        decision,
        adminCookie,
        browser,
        decisionKey,
      ).expect(200);
      expect(retry.body).toEqual(accepted.body);
      const settled = await read(`/admin/recovery/${recovery}`).expect(200);
      expect(settled.body).toMatchObject({
        canAccept: false,
        status: 'accepted',
        decision: { resultRevision: accepted.body.resultRevision },
      });
      expect(settled.body.latestTimelySave).toEqual(detail.body.latestTimelySave);
      clock.setMockTime(now);
    }, 60000);
    it('gates practice feedback, preserves first answers and keeps official results separate', async () => {
      clock.setMockTime(new Date(end.getTime() + 60000));
      const before = await read(`/sessions/${session}/results`).expect(200);
      const config = await read(`/exams/${exam}/practice-access`).expect(200);
      expect(config.body.available).toBe(false);
      const body = {
        revision: config.body.revision,
        examVersion: 1,
        enabled: true,
        releaseAt: clock.now().toISOString(),
        reason: 'Synthetic practice release',
      };
      const enabled = await post(`/exams/${exam}/practice-access`, body, adminCookie).expect(200);
      expect(enabled.body).toMatchObject({
        available: true,
        contentReleasedAt: expect.any(String),
      });
      const startKey = randomUUID(),
        started = await post(
          `/exams/${exam}/practice-attempts`,
          { examVersion: 1 },
          studentCookie,
          browser,
          startKey,
        ).expect(200),
        id = started.body.practiceAttemptId;
      expect(started.body.items[0].feedback).toBeNull();
      expect(JSON.stringify(started.body)).not.toContain('correctKey');
      await post(`/practice-attempts/${id}/complete`, {}).expect(409);
      const answerKey = randomUUID();
      const wrong = await post(
        `/practice-attempts/${id}/answers`,
        { itemId: 'q1', value: 'false' },
        studentCookie,
        browser,
        answerKey,
      ).expect(200);
      expect(wrong.body.items[0].feedback).toMatchObject({
        correct: false,
        correctOptionId: 'true',
        earnedMarks: 0,
      });
      const changed = await post(`/practice-attempts/${id}/answers`, {
        itemId: 'q1',
        value: 'true',
      }).expect(409);
      expect(changed.body.code).toBe('ALREADY_ANSWERED');
      const completed = await post(`/practice-attempts/${id}/complete`, {}).expect(200);
      expect(completed.body).toMatchObject({
        state: 'completed',
        score: 0,
        percent: 0,
        bestPercent: 0,
      });
      const second = await post(`/exams/${exam}/practice-attempts`, { examVersion: 1 }).expect(200),
        id2 = second.body.practiceAttemptId;
      await post(`/practice-attempts/${id2}/answers`, { itemId: 'q1', value: 'true' }).expect(200);
      const best = await post(`/practice-attempts/${id2}/complete`, {}).expect(200);
      expect(best.body.bestPercent).toBe(100);
      await post(`/practice-attempts/${id}/complete`, {}).expect(200);
      const list = await read('/me/practice', studentCookie).expect(200);
      expect(list.body.items.find((i: { examId: string }) => i.examId === exam)).toMatchObject({
        completedCount: 2,
        bestPercent: 100,
      });
      await post(
        `/exams/${exam}/practice-access`,
        { ...body, revision: enabled.body.revision, enabled: false },
        adminCookie,
      ).expect(200);
      await read(`/practice-attempts/${id}`, studentCookie).expect(409);
      await post(
        `/practice-attempts/${id}/answers`,
        { itemId: 'q1', value: 'false' },
        studentCookie,
        browser,
        answerKey,
      ).expect(409);
      await post(
        `/exams/${exam}/practice-attempts`,
        { examVersion: 1 },
        studentCookie,
        browser,
        startKey,
      ).expect(409);
      const disabled = await read(`/exams/${exam}/practice-access`).expect(200);
      expect(disabled.body.contentReleasedAt).toBe(enabled.body.contentReleasedAt);
      const own = await read('/me/results', studentCookie).expect(200);
      expect(
        own.body.items.find((i: { sessionId: string }) => i.sessionId === session),
      ).toMatchObject({ bestPracticePercent: 100, practice: { available: false } });
      const after = await read(`/sessions/${session}/results`).expect(200);
      expect(after.body.summary).toEqual(before.body.summary);
      expect(after.body.rows).toEqual(before.body.rows);
      clock.setMockTime(now);
    }, 60000);
    it.runIf(process.env.RUN_REAL_BROWSER === 'true')(
      'renders the real frontend and completes practice through browser controls',
      async () => {
        if (!app) throw new Error('Not started');
        clock.setMockTime(new Date(end.getTime() + 60000));
        const candidate = await read(`/sessions/${session}/results`).expect(200);
        if (!candidate.body.summary.publication)
          await post(
            `/sessions/${session}/results-publication`,
            {
              revision: candidate.body.summary.revision,
              releaseAt: clock.now().toISOString(),
              reason: 'Browser-only synthetic release',
              exclusions: candidate.body.rows
                .filter(
                  (r: { status: string }) =>
                    r.status === 'awaiting_upload' || r.status === 'recovery_pending',
                )
                .map((r: { attemptId: string }) => ({
                  attemptId: r.attemptId,
                  reason: 'Synthetic unresolved attempt',
                })),
            },
            adminCookie,
          ).expect(200);
        const config = await read(`/exams/${exam}/practice-access`).expect(200);
        await post(
          `/exams/${exam}/practice-access`,
          {
            revision: config.body.revision,
            examVersion: 1,
            enabled: true,
            releaseAt: clock.now().toISOString(),
            reason: 'Browser acceptance',
          },
          adminCookie,
        ).expect(200);
        await app.listen(0, '127.0.0.1');
        const apiUrl = await app.getUrl();
        const vite = spawn(
          process.execPath,
          [
            resolve('../node_modules/vite/bin/vite.js'),
            '--host',
            '127.0.0.1',
            '--port',
            '5184',
            '--strictPort',
          ],
          {
            cwd: resolve('..'),
            env: {
              ...process.env,
              API_PROXY_TARGET: apiUrl,
              VITE_USE_MOCKS: 'false',
              VITE_API_BASE_URL: '/api/v1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
          },
        );
        let browserProcess;
        try {
          await new Promise<void>((resolveReady, reject) => {
            const timer = setTimeout(() => reject(new Error('Vite startup timed out')), 15000);
            vite.stdout?.on('data', (chunk: Buffer) => {
              if (chunk.toString().includes('http://127.0.0.1:5184')) {
                clearTimeout(timer);
                resolveReady();
              }
            });
            vite.once('error', (error) => {
              clearTimeout(timer);
              reject(error);
            });
            vite.once('exit', () => {
              clearTimeout(timer);
              reject(new Error('Vite exited before startup; port 5184 must be free'));
            });
          });
          const direct = await fetch(apiUrl + '/api/v1/auth/me', {
            headers: { Cookie: adminCookie },
          });
          const proxied = await fetch('http://127.0.0.1:5184/api/v1/auth/me', {
            headers: { Cookie: adminCookie },
          });
          if (direct.status !== 200 || proxied.status !== 200)
            throw new Error(
              JSON.stringify({
                directStatus: direct.status,
                proxyStatus: proxied.status,
                apiUrl,
                proxyError: proxied.status === 200 ? '' : await proxied.text(),
              }),
            );
          browserProcess = await chromium.launch();
          for (const [token, path, title, endpoint] of [
            [adminToken, '/admin/school', 'School setup', '/classes'],
            [teacherToken, '/teacher/results', 'Official results', '/results/sessions'],
            [studentToken, '/student/practice', 'Practice', '/me/practice'],
          ]) {
            const context = await browserProcess.newContext({
              viewport: { width: 1280, height: 900 },
            });
            await context.addCookies([
              {
                name: 'nexora_session',
                value: token,
                url: 'http://127.0.0.1:5184',
                httpOnly: true,
                sameSite: 'Lax',
              },
            ]);
            const page = await context.newPage();
            const failures: string[] = [];
            const responses: string[] = [];
            page.on('response', async (r) => {
              if (r.url().includes('/api/'))
                responses.push(
                  `${r.status()} ${r.url()} ${r.status() >= 400 ? await r.text() : ''}`,
                );
            });
            page.on('pageerror', (error) => failures.push(error.message));
            const response = page.waitForResponse(
              (r) => r.url().includes('/api/v1' + endpoint) && r.status() === 200,
              { timeout: 20000 },
            );
            await page.goto('http://127.0.0.1:5184' + path);
            try {
              await response;
            } catch {
              throw new Error(
                JSON.stringify({
                  path,
                  responses,
                  errors: failures,
                  url: page.url(),
                  visible: (await page.locator('body').innerText()).slice(0, 2000),
                }),
              );
            }
            await browserExpect(
              page.getByRole('heading', { name: title, exact: true, level: 1 }),
            ).toBeVisible();
            const guide = page.getByRole('button', { name: 'Close guide', exact: true });
            if (await guide.isVisible()) await guide.click();
            if (token === studentToken) {
              const card = page.locator('section').filter({
                has: page.getByRole('heading', { name: 'Synthetic exam', exact: true }),
              });
              await card.getByRole('button', { name: 'Start new practice' }).click();
              await browserExpect(
                page.getByRole('heading', { name: 'Practice attempt', exact: true }),
              ).toBeVisible();
              await page.getByRole('radio', { name: 'True', exact: true }).check();
              await page.getByRole('button', { name: 'Check answer', exact: true }).click();
              await browserExpect(
                page.getByRole('button', { name: 'Complete practice', exact: true }),
              ).toBeEnabled();
              await page.getByRole('button', { name: 'Complete practice', exact: true }).click();
              await browserExpect(
                page.getByRole('heading', { name: 'Practice completed', exact: true }),
              ).toBeVisible();
              await page.reload();
              await browserExpect(
                page.getByRole('heading', { name: 'Practice completed', exact: true }),
              ).toBeVisible();
            }
            expect(failures).toEqual([]);
            await context.close();
          }
        } finally {
          if (browserProcess) await browserProcess.close();
          vite.kill();
          clock.setMockTime(now);
        }
      },
      120000,
    );
  },
);
