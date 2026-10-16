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
import { computeFinalSnapshotDigest } from '../src/common/crypto/canonical-digest';
import { randomUUID } from 'crypto';

describe('BE-02B: Runner Saves, Atomic Submit & Durable Receipt E2E (Supabase Real DB)', () => {
  let app: INestApplication;
  let clock: ClockService;

  let sessionCookie: string;
  let csrfToken: string;
  let deviceCookie: string;
  const deviceId = 'test-runner-device-b-' + Date.now();

  let openSessionId: string;
  let attemptId: string;
  let questionOrder: string[];
  let optionOrders: Record<string, string[]>;
  let examVersion: number;
  let scheduleRevision: number;
  let deviceGeneration: number;

  const subIdempotencyKey = randomUUID();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    clock = app.get(ClockService);

    // Warm up database connection pool
    await request(app.getHttpServer()).get('/api/v1/ready');

    const db = app.get(DbService);
    await db.query(`
      SELECT set_config('app.is_migration_or_admin', 'true', false);
      DELETE FROM attempts 
      WHERE student_id IN (SELECT id FROM users WHERE login_id = 'HILL-STU02');
    `);
  }, 30000);

  afterAll(async () => {
    if (clock) clock.reset();
    await app.close();
  });

  it('1. Setup: Authenticate student HILL-STU02 and enroll device', async () => {
    // CSRF
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    expect(csrfRes.status).toBe(200);
    csrfToken = csrfRes.body.csrfToken;
    sessionCookie = (csrfRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        loginId: 'HILL-STU02',
        password: 'StudentPass123!',
      });
    expect(loginRes.status).toBe(200);
    sessionCookie = (loginRes.headers['set-cookie'] as string[])[0].split(';')[0];

    // Fresh CSRF
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie);
    expect(meRes.status).toBe(200);
    csrfToken = meRes.body.csrfToken;

    // Enroll device
    const devRes = await request(app.getHttpServer())
      .post('/api/v1/auth/device')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ deviceId });
    expect(devRes.status).toBe(200);

    const rawCookies = devRes.headers['set-cookie'];
    const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies as string];
    const credCookie = cookieList.find((c: string) => c.startsWith('nexora_device_cred='));
    expect(credCookie).toBeDefined();
    deviceCookie = credCookie!.split(';')[0];
  });

  it('2. Find open/preparing exam session and obtain unlocked active attempt', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/me/exams')
      .set('Cookie', [sessionCookie, deviceCookie]);
    expect(listRes.status).toBe(200);

    const sittings = listRes.body.items;
    expect(sittings.length).toBeGreaterThan(0);

    const targetExam = sittings[0];
    openSessionId = targetExam.sessionId;
    examVersion = targetExam.examVersion;
    scheduleRevision = targetExam.scheduleRevision;

    // Set mock time into preparation window (2 minutes after preparation opens)
    const prepStart = new Date(targetExam.preparationVisibleAt).getTime();
    clock.setMockTime(prepStart + 2 * 60 * 1000);

    // Create unique attempt
    const attRes = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${openSessionId}/attempts`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({ deviceId });

    expect([200, 201]).toContain(attRes.status);
    attemptId = attRes.body.attemptId;
    examVersion = attRes.body.examVersion;
    scheduleRevision = attRes.body.scheduleRevision;
    deviceGeneration = attRes.body.deviceGeneration;

    // Fast-forward mock clock to 2 minutes after common start
    const startsAt = new Date(targetExam.startsAt).getTime();
    clock.setMockTime(startsAt + 2 * 60 * 1000);

    // Get encrypted package
    const pkgRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/package`)
      .set('Cookie', [sessionCookie, deviceCookie]);
    expect(pkgRes.status).toBe(200);

    // Unlock attempt
    const unlockRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/unlock`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        packageId: pkgRes.body.packageId,
        examVersion,
        scheduleRevision,
        deviceGeneration,
      });

    expect(unlockRes.status).toBe(200);
    questionOrder = unlockRes.body.questionOrder;
    optionOrders = unlockRes.body.optionOrders || {};
    expect(questionOrder.length).toBe(10);
  });

  it('3. POST /api/v1/attempts/:attemptId/answers saves revision batch atomically', async () => {
    const q1 = questionOrder[0];
    const q2 = questionOrder[1];
    const valQ1 = optionOrders[q1][0]; // 'opt_a'
    const valQ2 = optionOrders[q2][0]; // 'opt_a'

    const saveRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        answers: [
          { itemId: q1, value: valQ1, clientSeq: 1 },
          { itemId: q2, value: valQ2, clientSeq: 2 },
        ],
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.acknowledged.length).toBe(2);
    expect(saveRes.body.superseded.length).toBe(0);
    expect(saveRes.body.highestAcceptedSeq).toBe(2);
    expect(saveRes.body.lastServerSaveAt).toBeDefined();
    expect(saveRes.body.serverNow).toBeDefined();
  });

  it('4. POST /api/v1/attempts/:attemptId/answers replays identical revisions safely', async () => {
    const q1 = questionOrder[0];
    const q2 = questionOrder[1];
    const valQ1 = optionOrders[q1][0];
    const valQ2 = optionOrders[q2][0];

    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        answers: [
          { itemId: q1, value: valQ1, clientSeq: 1 },
          { itemId: q2, value: valQ2, clientSeq: 2 },
        ],
      });

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.acknowledged.length).toBe(2);
    expect(replayRes.body.superseded.length).toBe(0);
  });

  it('5. POST /api/v1/attempts/:attemptId/answers detects 409 REVISION_CONFLICT on sequence reuse with differing value', async () => {
    const q2 = questionOrder[1];
    const conflictingVal = optionOrders[q2][1]; // 'opt_b' instead of 'opt_a'

    const conflictRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        answers: [
          { itemId: q2, value: conflictingVal, clientSeq: 2 }, // seq 2 was previously valQ2
        ],
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.code).toBe('REVISION_CONFLICT');
  });

  it('6. POST /api/v1/attempts/:attemptId/answers acknowledges older revision as superseded without overwriting', async () => {
    const q1 = questionOrder[0];
    const initialVal = optionOrders[q1][0];
    const newerVal = optionOrders[q1][2]; // 'opt_c'

    // First save newer revision at clientSeq 5
    const newerRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        answers: [{ itemId: q1, value: newerVal, clientSeq: 5 }],
      });
    expect(newerRes.status).toBe(200);
    expect(newerRes.body.highestAcceptedSeq).toBe(5);

    // Now send older revision seq 1 (value initialVal which was the original seq 1 value)
    const supersededRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        answers: [{ itemId: q1, value: initialVal, clientSeq: 1 }],
      });

    expect(supersededRes.status).toBe(200);
    expect(supersededRes.body.acknowledged.length).toBe(0);
    expect(supersededRes.body.superseded.length).toBe(1);
    expect(supersededRes.body.superseded[0]).toEqual({
      itemId: q1,
      clientSeq: 1,
      currentSeq: 5,
    });
  });

  it('7. POST /api/v1/attempts/:attemptId/submit rejects missing/duplicate items with 422 VALIDATION_ERROR', async () => {
    const q1 = questionOrder[0];

    // Incomplete submission: only 1 answer instead of 10
    const incompleteRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        finalSeq: 10,
        answers: [{ itemId: q1, value: 'b' }],
      });

    expect(incompleteRes.status).toBe(422);
    expect(incompleteRes.body.code).toBe('VALIDATION_ERROR');
  });

  it('8. POST /api/v1/attempts/:attemptId/submit rejects finalSeq lower than highestAcceptedSeq', async () => {
    const fullAnswers = questionOrder.map((itemId) => ({
      itemId,
      value: optionOrders[itemId] ? optionOrders[itemId][0] : 'true',
    }));

    // highestAcceptedSeq is 5, send finalSeq 3
    const conflictSeqRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        finalSeq: 3,
        answers: fullAnswers,
      });

    expect(conflictSeqRes.status).toBe(409);
    expect(conflictSeqRes.body.code).toBe('REVISION_CONFLICT');
  });

  it('9. POST /api/v1/attempts/:attemptId/submit commits final snapshot, computes exact digest, scores, and issues receipt', async () => {
    const fullAnswers = questionOrder.map((itemId) => ({
      itemId,
      value: optionOrders[itemId] ? optionOrders[itemId][0] : 'true',
    }));

    const finalSeq = 10;
    const { snapshotDigest: expectedDigest } = computeFinalSnapshotDigest({
      attemptId,
      examVersion,
      scheduleRevision,
      deviceGeneration,
      finalSeq,
      answers: fullAnswers,
    });

    const subRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', subIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        finalSeq,
        answers: fullAnswers,
      });

    expect(subRes.status).toBe(200);
    expect(subRes.body.status).toBe('submitted');
    expect(subRes.body.receiptId).toBeDefined();
    expect(subRes.body.acceptedAt).toBeDefined();
    expect(subRes.body.snapshotDigest).toBe(expectedDigest);

    // Verify idempotent replay with exact same key and body returns same receipt
    const replayRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', subIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        finalSeq,
        answers: fullAnswers,
      });

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.receiptId).toBe(subRes.body.receiptId);
    expect(replayRes.body.snapshotDigest).toBe(expectedDigest);

    // Replay with same key but differing payload returns 409 REVISION_CONFLICT
    const conflictingKeyRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', subIdempotencyKey)
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        finalSeq: 11,
        answers: fullAnswers,
      });

    expect(conflictingKeyRes.status).toBe(409);
    expect(conflictingKeyRes.body.code).toBe('REVISION_CONFLICT');
  });

  it('10. GET /api/v1/attempts/:attemptId/receipt returns durable receipt without requiring device credentials', async () => {
    // Only student session cookie, NO device cookie or x-device-id header
    const receiptRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/receipt`)
      .set('Cookie', sessionCookie);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.attemptId).toBe(attemptId);
    expect(receiptRes.body.state).toBe('submitted');
    expect(receiptRes.body.receipt).toBeDefined();
    expect(receiptRes.body.receipt.status).toBe('submitted');
    expect(receiptRes.body.receipt.idempotencyKey).toBe(subIdempotencyKey);
    expect(receiptRes.body.receipt.finalSeq).toBe(10);
    expect(receiptRes.body.recovery).toBeNull();
  });

  it('11. Submission after closure returns 409 ALREADY_FINALIZED', async () => {
    const fullAnswers = questionOrder.map((itemId) => ({
      itemId,
      value: optionOrders[itemId] ? optionOrders[itemId][0] : 'true',
    }));

    const alreadyRes = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        examVersion,
        scheduleRevision,
        deviceGeneration,
        finalSeq: 20,
        answers: fullAnswers,
      });

    expect(alreadyRes.status).toBe(409);
    expect(alreadyRes.body.code).toBe('ALREADY_FINALIZED');
  });
});
