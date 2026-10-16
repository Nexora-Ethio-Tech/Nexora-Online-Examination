import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock/clock.service';
import { DbService } from '../src/common/db/db.service';
import { decryptExamPackage } from '../src/common/crypto/package-cipher';
import { randomUUID } from 'crypto';
import { authenticator } from 'otplib';

describe('BE-02C: Late Recovery, Audited Admin Decision & Device Transfer E2E (Supabase Real DB)', () => {
  let app: INestApplication;
  let clock: ClockService;

  // Student 1 (HILL-STU01) credentials and device
  let stuSessionCookie: string;
  let stuCsrfToken: string;
  let stuDeviceCookie: string;
  const initialDeviceId = 'test-c-device-primary-' + Date.now();
  const replacementDeviceId = 'test-c-device-replacement-' + Date.now();

  // Admin (HILL-ADM01) credentials
  let adminSessionCookie: string;
  let adminCsrfToken: string;

  // Exam session and attempt IDs
  let targetSessionId: string;
  let attemptId: string;
  let examVersion: number;
  let scheduleRevision: number;
  let finalAcceptUntil: Date;
  let deadlineAt: Date;
  let questionOrder: string[];
  let optionOrders: Record<string, string[]>;
  let recoveryUploadId: string;

  const recoveryIdempotencyKey = randomUUID();
  const decisionIdempotencyKey = randomUUID();
  const transferIdempotencyKey = randomUUID();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    clock = app.get(ClockService);

    // Warm up remote database connection pool
    await request(app.getHttpServer()).get('/api/v1/ready');

    // Clean up any old attempts for HILL-STU01 to ensure a clean state
    const db = app.get(DbService);
    await db.query(`
      SELECT set_config('app.is_migration_or_admin', 'true', false);
      DELETE FROM attempts 
      WHERE student_id IN (SELECT id FROM users WHERE login_id = 'HILL-STU01');
    `);
  }, 35000);

  afterAll(async () => {
    if (clock) clock.reset();
    await app.close();
  });

  it('1. Setup: Authenticate student HILL-STU01 and enroll primary + backup devices', async () => {
    // 1. Initial CSRF
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    expect(csrfRes.status).toBe(200);
    stuCsrfToken = csrfRes.body.csrfToken;
    stuSessionCookie = (csrfRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // 2. Student Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .send({
        loginId: 'HILL-STU01',
        password: 'StudentPass123!',
      });
    expect(loginRes.status).toBe(200);
    stuSessionCookie = (loginRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // Fresh CSRF
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', stuSessionCookie);
    expect(meRes.status).toBe(200);
    stuCsrfToken = meRes.body.csrfToken;

    // 3. Enroll primary device
    const devRes1 = await request(app.getHttpServer())
      .post('/api/v1/auth/device')
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .send({ deviceId: initialDeviceId });
    expect(devRes1.status).toBe(200);

    const rawCookies1 = devRes1.headers['set-cookie'];
    const cookieList1 = Array.isArray(rawCookies1) ? rawCookies1 : [rawCookies1 as string];
    const credCookie = cookieList1.find((c: string) => c.startsWith('nexora_device_cred='));
    expect(credCookie).toBeDefined();
    stuDeviceCookie = credCookie!.split(';')[0];

    // 4. Also enroll replacement device binding for the student ahead of time
    const devRes2 = await request(app.getHttpServer())
      .post('/api/v1/auth/device')
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .send({ deviceId: replacementDeviceId });
    expect(devRes2.status).toBe(200);
  });

  it('2. Setup: Authenticate school admin HILL-ADM01 with RFC 6238 TOTP MFA verification', async () => {
    // 1. Initial CSRF
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    expect(csrfRes.status).toBe(200);
    const adminInitCsrf = csrfRes.body.csrfToken;
    let adminInitCookie = (csrfRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // 2. Admin password login -> triggers MFA challenge
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', adminInitCookie)
      .set('x-csrf-token', adminInitCsrf)
      .send({
        loginId: 'HILL-ADM01',
        password: 'AdminPass123!',
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('mfa_required');
    expect(loginRes.body.csrfToken).toBeDefined();

    const mfaCsrf = loginRes.body.csrfToken;
    const challengeCookie = (loginRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // 3. Generate valid RFC 6238 TOTP code using seeded secret 'JBSWY3DPEHPK3PXP'
    const totpCode = authenticator.generate('JBSWY3DPEHPK3PXP');

    // 4. Verify MFA
    const mfaRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .set('Cookie', challengeCookie)
      .set('x-csrf-token', mfaCsrf)
      .send({ code: totpCode });
    expect(mfaRes.status).toBe(200);
    expect(mfaRes.body.status).toBe('authenticated');

    adminSessionCookie = (mfaRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // 5. Fetch admin identity and fresh CSRF
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', adminSessionCookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.role).toBe('school_admin');
    adminCsrfToken = meRes.body.csrfToken;
  });

  it('3. Obtain active unlocked attempt for HILL-STU01 during preparation/open window', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/me/exams')
      .set('Cookie', [stuSessionCookie, stuDeviceCookie]);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.length).toBeGreaterThan(0);

    const exam = listRes.body.items[0];
    targetSessionId = exam.sessionId;
    examVersion = exam.examVersion;
    scheduleRevision = exam.scheduleRevision;

    // Fast-forward into preparation window
    const prepStart = new Date(exam.preparationVisibleAt).getTime();
    clock.setMockTime(prepStart + 60 * 1000);

    // Create attempt
    const attRes = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${targetSessionId}/attempts`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({ deviceId: initialDeviceId });
    expect(attRes.status).toBe(201);
    attemptId = attRes.body.attemptId;
    questionOrder = attRes.body.questionOrder;
    optionOrders = attRes.body.optionOrders;
    finalAcceptUntil = new Date(attRes.body.finalAcceptUntil);
    deadlineAt = new Date(attRes.body.deadlineAt);

    // Download encrypted package
    const pkgRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/package`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie]);
    expect(pkgRes.status).toBe(200);

    // Fast forward to exam start
    const startsAt = new Date(exam.startsAt).getTime();
    clock.setMockTime(startsAt + 5000);

    // Unlock attempt
    const unlockRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/unlock`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({
        packageId: pkgRes.body.packageId,
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
      });
    expect(unlockRes.status).toBe(200);

    // Verify paper decryption
    const decryptedJson = decryptExamPackage(pkgRes.body.ciphertext, pkgRes.body.iv, unlockRes.body.key);
    const paper = JSON.parse(decryptedJson);
    expect(paper.items.length).toBe(10);

    // Save initial answers via runner auto-save
    const saveRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        answers: [
          { itemId: questionOrder[0], value: 'opt_b', clientSeq: 1 },
          { itemId: questionOrder[1], value: 'opt_a', clientSeq: 2 },
        ],
      });
    expect(saveRes.status).toBe(200);
  });

  it('4. POST /api/v1/attempts/:attemptId/recovery BEFORE finalAcceptUntil returns 409 REVISION_CONFLICT with retryAt', async () => {
    // Current time is well before finalAcceptUntil
    const recoveryAnswers = questionOrder.map((id, idx) => ({
      itemId: id,
      value: idx === 0 ? 'opt_b' : idx === 1 ? 'opt_a' : null,
    }));

    const earlyRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/recovery`)
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', recoveryIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        finalSeq: 2,
        answers: recoveryAnswers,
        reason: 'Network outage during exam',
      });

    expect(earlyRes.status).toBe(409);
    expect(earlyRes.body.code).toBe('REVISION_CONFLICT');
    expect(earlyRes.body.message).toContain('Recovery upload opens only after final submission deadline has passed');
    expect(earlyRes.body.context).toBeDefined();
    expect(earlyRes.body.context.retryAt).toBeDefined();
    expect(new Date(earlyRes.body.context.retryAt).getTime()).toBeGreaterThan(finalAcceptUntil.getTime());
  });

  it('5. POST /api/v1/attempts/:attemptId/submit AFTER finalAcceptUntil returns 409 RECOVERY_REQUIRED without creating receipt', async () => {
    // Fast-forward mock clock past finalAcceptUntil (e.g., 10 seconds past deadline)
    clock.setMockTime(finalAcceptUntil.getTime() + 10 * 1000);

    const answers = questionOrder.map((id, idx) => ({
      itemId: id,
      value: idx === 0 ? 'opt_b' : idx === 1 ? 'opt_a' : null,
    }));

    const lateSubRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        finalSeq: 2,
        answers,
      });

    expect(lateSubRes.status).toBe(409);
    expect(lateSubRes.body.code).toBe('RECOVERY_REQUIRED');

    // Confirm receipt was not created
    const receiptRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/receipt`)
      .set('Cookie', stuSessionCookie);
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.receipt).toBeNull();
  });

  it('6. POST /api/v1/attempts/:attemptId/recovery AFTER finalAcceptUntil records immutable upload and enters recovery_pending', async () => {
    const answers = questionOrder.map((id, idx) => ({
      itemId: id,
      value: idx === 0 ? 'opt_b' : idx === 1 ? 'opt_a' : null,
    }));

    const recRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/recovery`)
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', recoveryIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        finalSeq: 2,
        answers,
        reason: 'Device battery died right as submission window closed',
      });

    expect(recRes.status).toBe(201);
    expect(recRes.body.status).toBe('recovery_pending');
    expect(recRes.body.recoveryId).toBeDefined();
    expect(recRes.body.receivedAt).toBeDefined();

    recoveryUploadId = recRes.body.recoveryId;

    // Verify GET /receipt reflects recovery_pending
    const receiptRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/receipt`)
      .set('Cookie', stuSessionCookie);
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.state).toBe('recovery_pending');
    expect(receiptRes.body.recovery).toBeDefined();
    expect(receiptRes.body.recovery.recoveryId).toBe(recoveryUploadId);
    expect(receiptRes.body.recovery.status).toBe('recovery_pending');
  });

  it('7. Operations during recovery_pending reject saves and submissions with 409 RECOVERY_REQUIRED', async () => {
    // 1. Regular save rejected
    const saveRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        answers: [{ itemId: questionOrder[0], value: 'opt_b', clientSeq: 3 }],
      });
    expect(saveRes.status).toBe(409);
    expect(saveRes.body.code).toBe('RECOVERY_REQUIRED');

    // 2. Regular submit rejected
    const subRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', randomUUID())
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        finalSeq: 3,
        answers: questionOrder.map((id) => ({ itemId: id, value: null })),
      });
    expect(subRes.status).toBe(409);
    expect(subRes.body.code).toBe('RECOVERY_REQUIRED');
  });

  it('8. Recovery upload idempotency: Replaying same key returns 200 OK; changing payload conflicts', async () => {
    const answers = questionOrder.map((id, idx) => ({
      itemId: id,
      value: idx === 0 ? 'opt_b' : idx === 1 ? 'opt_a' : null,
    }));

    // Replay identical recovery upload
    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/recovery`)
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', recoveryIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        finalSeq: 2,
        answers,
        reason: 'Device battery died right as submission window closed',
      });
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.recoveryId).toBe(recoveryUploadId);
    expect(replayRes.body.status).toBe('recovery_pending');

    // Replay with different payload and same key -> 409 REVISION_CONFLICT
    const conflictingAnswers = questionOrder.map((id) => ({ itemId: id, value: null }));
    const conflictRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/recovery`)
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', recoveryIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration: 1,
        finalSeq: 2,
        answers: conflictingAnswers,
        reason: 'Conflicting payload',
      });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.code).toBe('REVISION_CONFLICT');
  });

  it('9. Unauthorized or student user cannot decide recovery (403 Forbidden)', async () => {
    const unauthorizedRes = await request(app.getHttpServer())
      .post(`/api/v1/recovery/${recoveryUploadId}/decision`)
      .set('Cookie', stuSessionCookie)
      .set('x-csrf-token', stuCsrfToken)
      .set('idempotency-key', decisionIdempotencyKey)
      .send({
        decision: 'accept',
        reason: 'Student attempting self-approval',
      });
    expect(unauthorizedRes.status).toBe(403);
  });

  it('10. School Admin POST /api/v1/recovery/:recoveryId/decision accepts upload, grades snapshot, and issues official receipt', async () => {
    const decisionRes = await request(app.getHttpServer())
      .post(`/api/v1/recovery/${recoveryUploadId}/decision`)
      .set('Cookie', adminSessionCookie)
      .set('x-csrf-token', adminCsrfToken)
      .set('idempotency-key', decisionIdempotencyKey)
      .send({
        decision: 'accept',
        reason: 'Verified power outage in Lab 2. Battery logs confirm sudden shutdown.',
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.recoveryId).toBe(recoveryUploadId);
    expect(decisionRes.body.decision).toBe('accept');
    expect(decisionRes.body.decidedAt).toBeDefined();
    expect(decisionRes.body.resultRevision).toBe(1);

    // Verify attempt is now finalized as submitted and receipt is created
    const receiptRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/receipt`)
      .set('Cookie', stuSessionCookie);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.state).toBe('submitted');
    expect(receiptRes.body.receipt).toBeDefined();
    expect(receiptRes.body.receipt.status).toBe('submitted');
    expect(receiptRes.body.receipt.idempotencyKey).toBe(recoveryIdempotencyKey);
    expect(receiptRes.body.receipt.snapshotDigest).toBeDefined();

    // Verify recovery object shows accepted
    expect(receiptRes.body.recovery).toBeDefined();
    expect(receiptRes.body.recovery.recoveryId).toBe(recoveryUploadId);
    expect(receiptRes.body.recovery.status).toBe('accepted');
  });

  it('11. Device Transfer Workflow: Admin transfers active attempt to replacement device before deadline', async () => {
    // 1. Create a fresh attempt for HILL-STU01 on another session or with clock set before deadline
    // Clean up attempts for a fresh sitting
    const db = app.get(DbService);
    await db.query(`
      SELECT set_config('app.is_migration_or_admin', 'true', false);
      DELETE FROM attempts 
      WHERE student_id IN (SELECT id FROM users WHERE login_id = 'HILL-STU01');
    `);

    // Reset clock to exam start + 10 minutes (well before deadline)
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/me/exams')
      .set('Cookie', [stuSessionCookie, stuDeviceCookie]);
    const exam = listRes.body.items[0];
    const startsAt = new Date(exam.startsAt).getTime();
    clock.setMockTime(startsAt + 10 * 60 * 1000);

    // Create fresh attempt on primary device
    const newAttRes = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${exam.sessionId}/attempts`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({ deviceId: initialDeviceId });
    expect(newAttRes.status).toBe(201);
    const transferAttemptId = newAttRes.body.attemptId;

    // Download package
    const pkgRes2 = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${transferAttemptId}/package`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie]);
    expect(pkgRes2.status).toBe(200);

    // Unlock attempt to transition to active
    const unlockRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${transferAttemptId}/unlock`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({
        packageId: pkgRes2.body.packageId,
        examVersion: exam.examVersion,
        scheduleRevision: exam.scheduleRevision,
        deviceGeneration: 1,
      });
    expect(unlockRes.status).toBe(200);

    // Save initial answers from primary device
    const saveRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${transferAttemptId}/answers`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({
        examVersion: exam.examVersion,
        scheduleRevision: exam.scheduleRevision,
        deviceGeneration: 1,
        answers: [
          { itemId: newAttRes.body.questionOrder[0], value: 'opt_a', clientSeq: 1 },
        ],
      });
    expect(saveRes.status).toBe(200);

    // 2. Admin performs device transfer to replacementDeviceId
    const transferRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${transferAttemptId}/device-transfer`)
      .set('Cookie', adminSessionCookie)
      .set('x-csrf-token', adminCsrfToken)
      .set('idempotency-key', transferIdempotencyKey)
      .send({
        newDeviceId: replacementDeviceId,
        reason: 'Student device screen cracked. Transferred to spare machine in room 104.',
      });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.attemptId).toBe(transferAttemptId);
    expect(transferRes.body.deviceGeneration).toBe(2);
    expect(transferRes.body.state).toBe('preparing');

    // 3. Confirm old device is now rejected on save (generation mismatch)
    const oldDeviceSaveRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${transferAttemptId}/answers`)
      .set('Cookie', [stuSessionCookie, stuDeviceCookie])
      .set('x-csrf-token', stuCsrfToken)
      .send({
        examVersion: exam.examVersion,
        scheduleRevision: exam.scheduleRevision,
        deviceGeneration: 1,
        answers: [
          { itemId: newAttRes.body.questionOrder[1], value: 'opt_c', clientSeq: 2 },
        ],
      });
    expect(oldDeviceSaveRes.status).toBe(409);
    expect(oldDeviceSaveRes.body.code).toBe('DEVICE_REPLACED');

    // 4. Verify previous server-confirmed answer was carried into generation 2 with clientSeq = 0
    const checkAnswersRes = await db.query(
      `SELECT item_id, answer_value, device_generation, client_seq 
       FROM attempt_answers 
       WHERE attempt_id = $1`,
      [transferAttemptId],
    );
    expect(checkAnswersRes.rows.length).toBeGreaterThan(0);
    expect(checkAnswersRes.rows[0].device_generation).toBe(2);
    expect(checkAnswersRes.rows[0].client_seq).toBe(0);
  });
});
