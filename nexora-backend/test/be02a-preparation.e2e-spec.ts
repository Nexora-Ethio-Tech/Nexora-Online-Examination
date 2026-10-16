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
import { decryptExamPackage } from '../src/common/crypto/package-cipher';

describe('BE-02A: Student Exam Delivery E2E (Supabase Real DB)', () => {
  let app: INestApplication;
  let clock: ClockService;

  let sessionCookie: string;
  let csrfToken: string;
  let deviceCookie: string;
  const deviceId = 'test-browser-device-uuid-001';

  let preparingSessionId: string;
  let createdAttemptId: string;
  let encryptedPackage: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    clock = app.get(ClockService);
  });

  afterAll(async () => {
    if (clock) clock.reset();
    await app.close();
  });

  it('1. GET /api/v1/health & /ready should verify database connection', async () => {
    const healthRes = await request(app.getHttpServer()).get('/api/v1/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');

    const readyRes = await request(app.getHttpServer()).get('/api/v1/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.database).toBe('connected');
  });

  it('2. GET /api/v1/auth/csrf creates anonymous session and issues CSRF token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeDefined();

    csrfToken = res.body.csrfToken;
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    sessionCookie = cookies[0].split(';')[0];
  });

  it('3. POST /api/v1/auth/login authenticates student HILL-STU01 and rotates session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        loginId: 'HILL-STU01',
        password: 'StudentPass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('authenticated');

    const cookies = res.headers['set-cookie'];
    sessionCookie = cookies[0].split(';')[0];
  });

  it('4. POST /api/v1/auth/device registers device and issues HttpOnly credential', async () => {
    // Get fresh CSRF token after login
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie);

    expect(meRes.status).toBe(200);
    csrfToken = meRes.body.csrfToken;
    expect(meRes.body.user.loginId).toBe('HILL-STU01');

    const devRes = await request(app.getHttpServer())
      .post('/api/v1/auth/device')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ deviceId });

    expect(devRes.status).toBe(200);
    expect(devRes.body.deviceId).toBe(deviceId);

    const rawCookies = devRes.headers['set-cookie'];
    expect(rawCookies).toBeDefined();
    const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies as string];
    const credCookie = cookieList.find((c: string) => c.startsWith('nexora_device_cred='));
    expect(credCookie).toBeDefined();
    deviceCookie = credCookie!.split(';')[0];
  });

  it('5. GET /api/v1/me/exams lists eligible sittings', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/exams')
      .set('Cookie', [sessionCookie, deviceCookie]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);

    const targetExam = res.body.items[0];
    expect(targetExam).toBeDefined();
    preparingSessionId = targetExam.sessionId;

    // Set mock time deterministically to 2 minutes after preparation opens (8 mins before startsAt)
    const prepStart = new Date(targetExam.preparationVisibleAt).getTime();
    clock.setMockTime(prepStart + 2 * 60 * 1000);
  });

  it('6. GET /api/v1/me/exams/:sessionId returns detail without creating attempt', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/me/exams/${preparingSessionId}`)
      .set('Cookie', [sessionCookie, deviceCookie]);

    expect(res.status).toBe(200);
    expect(res.body.exam.sessionId).toBe(preparingSessionId);
    expect(res.body.exam.phase).toBe('preparing');
  });

  it('7. POST /api/v1/sessions/:sessionId/attempts creates unique attempt (201)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${preparingSessionId}/attempts`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('x-csrf-token', csrfToken)
      .send({ deviceId });

    expect([200, 201]).toContain(res.status);
    expect(res.body.attemptId).toBeDefined();
    expect(res.body.deviceGeneration).toBe(1);

    createdAttemptId = res.body.attemptId;
  });

  it('8. GET /api/v1/attempts/:attemptId/package returns encrypted AES-GCM package', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${createdAttemptId}/package`)
      .set('Cookie', [sessionCookie, deviceCookie]);

    expect(res.status).toBe(200);
    expect(res.body.algorithm).toBe('AES-GCM');
    expect(res.body.iv).toBeDefined();
    expect(res.body.ciphertext).toBeDefined();
    expect(res.body.sha256).toBeDefined();

    encryptedPackage = res.body;
  });

  it('9. POST /api/v1/attempts/:attemptId/unlock before start returns 409 NOT_STARTED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${createdAttemptId}/unlock`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        packageId: encryptedPackage.packageId,
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 1,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_STARTED');
  });

  it('10. Unlock at/after start succeeds, returns key, and enables payload decryption', async () => {
    // Advance clock by 10 minutes to cross startsAt
    clock.advanceByMs(10 * 60 * 1000);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${createdAttemptId}/unlock`)
      .set('Cookie', [sessionCookie, deviceCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        packageId: encryptedPackage.packageId,
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.key).toBeDefined();
    expect(Array.isArray(res.body.questionOrder)).toBe(true);
    expect(res.body.optionOrders).toBeDefined();

    // Verify decryption of the downloaded package with the released key
    const decrypted = decryptExamPackage<any>(
      encryptedPackage.ciphertext,
      encryptedPackage.iv,
      res.body.key,
    );

    expect(decrypted.title).toBe('Grade 10 Mathematics Midterm');
    expect(decrypted.items.length).toBe(10);
    // Crucial security verification: Correct keys and explanations are NEVER in student package!
    expect(decrypted.items[0].correct_key).toBeUndefined();
    expect(decrypted.items[0].correct).toBeUndefined();
    expect(decrypted.items[0].explanation).toBeUndefined();
  });

  it('11. Multi-Tenant Isolation: School 2 student cannot access School 1 attempt', async () => {
    // Login as School 2 student
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    const sch2SessionCookie = csrfRes.headers['set-cookie'][0].split(';')[0];

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', sch2SessionCookie)
      .set('x-csrf-token', csrfRes.body.csrfToken)
      .send({
        loginId: 'MARY-STU01',
        password: 'StudentPass123!',
      });

    expect(loginRes.status).toBe(200);
    const authedSch2Cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    // Attempting to read School 1's attemptId must return 404 NOT_FOUND
    const crossRes = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${createdAttemptId}`)
      .set('Cookie', authedSch2Cookie);

    expect(crossRes.status).toBe(404);
    expect(crossRes.body.code).toBe('NOT_FOUND');
  });
});
