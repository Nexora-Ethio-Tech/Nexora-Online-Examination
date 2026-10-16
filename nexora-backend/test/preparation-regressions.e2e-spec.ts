import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { ClockService } from '../src/common/clock/clock.service';
import { encryptExamPackage } from '../src/common/crypto/package-cipher';
import { hashPassword } from '../src/common/crypto/password';
import { attemptResponseSchema } from '../src/modules/delivery/preparation-schemas';
import { responseCookie, responseCookies } from './http-helpers';

type Identity = { id: string; cookie: string; csrf: string };
const examSchema = z
  .object({
    examId: z.string().uuid(),
    sessionId: z.string().uuid(),
    title: z.string(),
    subjectName: z.string(),
    className: z.string(),
    durationMinutes: z.number(),
    preparationVisibleAt: z.string().datetime(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    deadlineAt: z.string().datetime(),
    scheduleRevision: z.number().int().positive(),
    phase: z.enum(['scheduled', 'preparing', 'open', 'ended']),
    attemptId: z.string().uuid().nullable(),
    attemptState: z.string().nullable(),
  })
  .strict();

describe('BE-02A preparation regressions (disposable PostgreSQL)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const clock = new ClockService();
  const schoolId = randomUUID();
  const otherSchoolId = randomUUID();
  const classId = randomUUID();
  const subjectId = randomUUID();
  const examId = randomUUID();
  const versionId = randomUUID();
  const packageId = randomUUID();
  const browserIds = new Set<string>();
  const prepAt = new Date();
  const startsAt = new Date(prepAt.getTime() + 600000);
  const endsAt = new Date(startsAt.getTime() + 3600000);
  let app: INestApplication;
  let student: Identity;
  let peer: Identity;
  let foreign: Identity;
  let teacher: Identity;
  let sessionId: string;
  let deviceId: string;
  let deviceCookie: string;

  async function startApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClockService)
      .useValue(clock)
      .compile();
    const application = module.createNestApplication();
    application.use(cookieParser());
    application.setGlobalPrefix('api/v1');
    application.useLogger(false);
    await application.init();
    return application;
  }

  function read(path: string, actor = student, browser: string | undefined = deviceCookie) {
    return request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set('Cookie', browser ? [actor.cookie, browser] : [actor.cookie]);
  }

  function post(
    path: string,
    body: object,
    actor = student,
    browser: string | undefined = deviceCookie,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', actor.csrf)
      .set('Cookie', browser ? [actor.cookie, browser] : [actor.cookie])
      .send(body);
  }

  async function identity(
    school: string,
    role: 'student' | 'teacher' = 'student',
  ): Promise<Identity> {
    const id = randomUUID();
    const loginId = `BE02A-${id}`;
    const password = randomUUID();
    await pool.query(
      `INSERT INTO users (id, school_id, login_id, display_name, role, password_hash)
      VALUES ($1, $2, $3, 'Synthetic learner', $4, $5)`,
      [id, school, loginId, role, await hashPassword(password)],
    );
    const csrf = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', responseCookie(csrf, 'nexora_session'))
      .set('X-CSRF-Token', z.string().parse(csrf.body.csrfToken))
      .send({ loginId, password });
    expect(login.status).toBe(200);
    const cookie = responseCookie(login, 'nexora_session');
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    return { id, cookie, csrf: z.string().parse(me.body.csrfToken) };
  }

  async function sitting(extraMinutes = 0) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO exam_sessions (id, school_id, exam_id, exam_version_id,
      preparation_visible_at, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, schoolId, examId, versionId, prepAt, startsAt, endsAt],
    );
    await pool.query(
      `INSERT INTO session_roster (school_id, session_id, student_id, extra_time_minutes)
      VALUES ($1, $2, $3, $4)`,
      [schoolId, id, student.id, extraMinutes],
    );
    return id;
  }

  async function enroll(actor = student, id = randomUUID(), cookie?: string) {
    browserIds.add(id);
    const result = await post('/auth/device', { deviceId: id }, actor, cookie ?? '');
    expect(result.status).toBe(200);
    return { id, cookie: cookie ?? responseCookie(result, 'nexora_device_cred'), response: result };
  }

  function create(key: string = randomUUID(), id = sessionId, browserId = deviceId) {
    return post(`/sessions/${id}/attempts`, { deviceId: browserId }).set('Idempotency-Key', key);
  }

  async function attempt() {
    const result = await create();
    expect(result.status).toBe(201);
    return attemptResponseSchema.parse(result.body);
  }

  function unlock(id: string, changes: Record<string, unknown> = {}, browser = deviceCookie) {
    return post(
      `/attempts/${id}/unlock`,
      {
        packageId,
        examVersion: 1,
        scheduleRevision: 1,
        deviceGeneration: 1,
        ...changes,
      },
      student,
      browser,
    );
  }

  beforeAll(async () => {
    const url = new URL(z.string().parse(process.env.DATABASE_URL));
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/nexora_be02a_test') {
      throw new Error(
        'Preparation regressions require the disposable localhost nexora_be02a_test database',
      );
    }
    clock.setMockTime(prepAt);
    app = await startApp();
    await pool.query(
      "INSERT INTO schools (id, name, slug) VALUES ($1::uuid, 'Preparation test school', $1::text), ($2::uuid, 'Other preparation school', $2::text)",
      [schoolId, otherSchoolId],
    );
    student = await identity(schoolId);
    peer = await identity(schoolId);
    foreign = await identity(otherSchoolId);
    teacher = await identity(schoolId, 'teacher');
    await pool.query(
      "INSERT INTO classes (id, school_id, name, code_or_year) VALUES ($1, $2, 'Grade 10', '2026')",
      [classId, schoolId],
    );
    await pool.query(
      "INSERT INTO subjects (id, school_id, name, code) VALUES ($1, $2, 'Mathematics', 'MATH')",
      [subjectId, schoolId],
    );
    await pool.query(
      `INSERT INTO exams (id, school_id, owner_id, title, subject_id, class_id, state)
      VALUES ($1, $2, $3, 'Preparation regression paper', $4, $5, 'approved')`,
      [examId, schoolId, teacher.id, subjectId, classId],
    );
    await pool.query(
      'INSERT INTO exam_versions (id, school_id, exam_id, version, approved_at) VALUES ($1, $2, $3, 1, $4)',
      [versionId, schoolId, examId, prepAt],
    );
    const options = [
      { id: 'true', text: 'True' },
      { id: 'false', text: 'False' },
    ];
    await pool.query(
      `INSERT INTO exam_items (school_id, exam_version_id, item_id, position, type, stem, options, correct_key, marks)
      VALUES ($1, $2, 'q1', 1, 'true_false', 'One is less than two.', $3, 'true', 2)`,
      [schoolId, versionId, JSON.stringify(options)],
    );
    const encrypted = encryptExamPackage({
      examVersion: 1,
      title: 'Preparation regression paper',
      instructions: '',
      items: [
        { itemId: 'q1', type: 'true_false', stem: 'One is less than two.', options, marks: 2 },
      ],
    });
    await pool.query(
      `INSERT INTO exam_packages (id, school_id, exam_version_id, iv_base64url, ciphertext_base64url, sha256_hex, key_enc)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        packageId,
        schoolId,
        versionId,
        encrypted.iv,
        encrypted.ciphertext,
        encrypted.sha256,
        encrypted.keyBase64url,
      ],
    );
  });

  beforeEach(async () => {
    clock.setMockTime(prepAt);
    sessionId = await sitting();
    const browser = await enroll();
    deviceId = browser.id;
    deviceCookie = browser.cookie;
  });

  afterAll(async () => {
    if (app) {
      await pool.query('DELETE FROM schools WHERE id = ANY($1::uuid[])', [
        [schoolId, otherSchoolId],
      ]);
      await pool.query('DELETE FROM browser_devices WHERE device_id = ANY($1::text[])', [
        [...browserIds],
      ]);
      await app.close();
    }
    await pool.end();
  });

  it('returns exact list/detail fields and keeps detail read-only', async () => {
    const detail = await read(`/me/exams/${sessionId}`);
    expect(detail.status).toBe(200);
    const exam = examSchema.parse(detail.body.exam);
    expect(exam).toMatchObject({
      deadlineAt: endsAt.toISOString(),
      scheduleRevision: 1,
      attemptId: null,
      phase: 'preparing',
    });
    const list = await read('/me/exams?limit=100');
    const items = z.array(examSchema).parse(list.body.items);
    expect(items.find((row) => row.sessionId === sessionId)).toEqual(exam);
    expect(
      (await pool.query('SELECT id FROM attempts WHERE session_id = $1', [sessionId])).rowCount,
    ).toBe(0);
    const empty = await read('/me/exams', peer, '');
    expect(empty.body.items).toEqual([]);
  });

  it.each(['0', '101', '2x', '-1', '1.5', ''])('rejects malformed limit %j', async (limit) => {
    expect((await read(`/me/exams?limit=${limit}`)).status).toBe(422);
  });

  it('paginates beyond 25 and rejects malformed or foreign cursors', async () => {
    for (let index = 0; index < 27; index++) await sitting();
    const first = await read('/me/exams?limit=25');
    expect(first.body.items).toHaveLength(25);
    const cursor = z.string().parse(first.body.nextCursor);
    const second = await read(`/me/exams?limit=100&cursor=${encodeURIComponent(cursor)}`);
    const firstItems = z.array(examSchema).parse(first.body.items);
    const secondItems = z.array(examSchema).parse(second.body.items);
    expect(secondItems.length).toBeGreaterThan(0);
    expect(new Set([...firstItems, ...secondItems].map((row) => row.sessionId)).size).toBe(
      firstItems.length + secondItems.length,
    );
    expect(second.body.nextCursor).toBeNull();
    expect((await read(`/me/exams?cursor=${encodeURIComponent(cursor)}`, peer, '')).status).toBe(
      422,
    );
    expect((await read('/me/exams?cursor=not-a-cursor')).status).toBe(422);
  });

  it('uses the accommodated deadline after common end and never resets it on late entry', async () => {
    sessionId = await sitting(15);
    clock.setMockTime(endsAt.getTime() + 60000);
    const expected = new Date(endsAt.getTime() + 900000).toISOString();
    const detail = await read(`/me/exams/${sessionId}`);
    expect(detail.body.exam).toMatchObject({ phase: 'open', deadlineAt: expected });
    const created = await attempt();
    expect(created.deadlineAt).toBe(expected);
    expect(created.finalAcceptUntil).toBe(new Date(endsAt.getTime() + 905000).toISOString());
    const opened = await unlock(created.attemptId);
    expect(opened.status).toBe(200);
    expect(opened.body.deadlineAt).toBe(expected);
  });

  it('issues only a 30-day HttpOnly credential and returns only the browser ID', async () => {
    const enrolled = await enroll();
    expect(enrolled.response.body).toEqual({ deviceId: enrolled.id });
    const cookie = responseCookies(enrolled.response).join(';');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');
    const registry = await pool.query<{ credential_hash: string }>(
      'SELECT credential_hash FROM browser_devices WHERE device_id = $1',
      [enrolled.id],
    );
    expect(registry.rows[0]?.credential_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(registry.rows[0]?.credential_hash).not.toBe(enrolled.cookie.split('=')[1]);
  });

  it('rejects credential takeover without changing the existing credential', async () => {
    const before = await pool.query('SELECT * FROM browser_devices WHERE device_id = $1', [
      deviceId,
    ]);
    const missing = await post('/auth/device', { deviceId }, student, '');
    const forged = await post('/auth/device', { deviceId }, student, 'nexora_device_cred=forged');
    expect(missing.status).toBe(409);
    expect(forged.body.code).toBe('DEVICE_REPLACED');
    expect(missing.headers['set-cookie']).toBeUndefined();
    expect(
      (await pool.query('SELECT * FROM browser_devices WHERE device_id = $1', [deviceId])).rows,
    ).toEqual(before.rows);
    const valid = await post('/auth/device', { deviceId });
    expect(valid.status).toBe(200);
    expect(valid.headers['set-cookie']).toBeUndefined();
  });

  it('allows verified shared-browser enrollment without granting another student attempt access', async () => {
    const created = await attempt();
    const shared = await post('/auth/device', { deviceId }, peer, deviceCookie);
    expect(shared.status).toBe(200);
    expect(shared.headers['set-cookie']).toBeUndefined();
    expect((await read(`/attempts/${created.attemptId}`, peer, deviceCookie)).status).toBe(404);
    const unrelated = await post('/auth/device', { deviceId }, foreign, '');
    expect(unrelated.status).toBe(409);
    const foreignShared = await post('/auth/device', { deviceId }, foreign, deviceCookie);
    expect(foreignShared.status).toBe(200);
    expect((await read(`/attempts/${created.attemptId}`, foreign, deviceCookie)).status).toBe(404);
  });

  it.each(['expires_at', 'revoked_at'])(
    'refuses an expired/revoked browser (%s)',
    async (column) => {
      if (column === 'expires_at')
        await pool.query('UPDATE browser_devices SET expires_at = $1 WHERE device_id = $2', [
          prepAt,
          deviceId,
        ]);
      else
        await pool.query('UPDATE browser_devices SET revoked_at = $1 WHERE device_id = $2', [
          prepAt,
          deviceId,
        ]);
      expect((await post('/auth/device', { deviceId })).body.code).toBe('DEVICE_REPLACED');
      expect((await create()).body.code).toBe('DEVICE_REPLACED');
    },
  );

  it('enforces student-only enrollment and strict request validation', async () => {
    expect((await post('/auth/device', { deviceId: randomUUID() }, teacher, '')).status).toBe(403);
    expect((await post('/auth/device', { deviceId: 'visible-id' })).status).toBe(422);
    expect((await post('/auth/device', { deviceId, schoolId })).status).toBe(422);
  });

  it('serializes concurrent enrollment of the same ID', async () => {
    const id = randomUUID();
    browserIds.add(id);
    const results = await Promise.all([
      post('/auth/device', { deviceId: id }, student, ''),
      post('/auth/device', { deviceId: id }, student, ''),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(
      (await pool.query('SELECT device_id FROM browser_devices WHERE device_id = $1', [id]))
        .rowCount,
    ).toBe(1);
  });

  it('requires a UUID idempotency key and rejects changed payload reuse', async () => {
    expect((await post(`/sessions/${sessionId}/attempts`, { deviceId })).status).toBe(422);
    expect((await create('not-a-uuid')).status).toBe(422);
    const key = randomUUID();
    expect((await create(key)).status).toBe(201);
    expect((await create(key, await sitting())).body.code).toBe('REVISION_CONFLICT');
  });

  it.each([true, false])(
    'creates one attempt under concurrent requests (same key: %s)',
    async (sameKey) => {
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => create(sameKey ? key : randomUUID())),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 200, 200, 201]);
      expect(
        new Set(results.map((result) => attemptResponseSchema.parse(result.body).attemptId)).size,
      ).toBe(1);
      expect(
        (await pool.query('SELECT id FROM attempts WHERE session_id = $1', [sessionId])).rowCount,
      ).toBe(1);
    },
  );

  it('replays the original creation after restart/deadline and reconciles current state with a new key', async () => {
    const key = randomUUID();
    const first = await create(key);
    const created = attemptResponseSchema.parse(first.body);
    await app.close();
    app = await startApp();
    clock.setMockTime(endsAt.getTime() + 10000);
    const replay = await create(key);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    const receiptId = randomUUID();
    const uploadKey = randomUUID();
    await pool.query(
      `INSERT INTO submissions (id, school_id, attempt_id, exam_version, schedule_revision,
      device_generation, final_seq, answers_snapshot, snapshot_digest, idempotency_key, received_at)
      VALUES ($1, $2, $3, 1, 1, 1, 4, '[]', $4, $5, $6)`,
      [receiptId, schoolId, created.attemptId, 'a'.repeat(64), uploadKey, endsAt],
    );
    await pool.query("UPDATE attempts SET state = 'submitted' WHERE id = $1", [created.attemptId]);
    const current = await create();
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      state: 'submitted',
      deadlineAt: created.deadlineAt,
      receipt: { receiptId, idempotencyKey: uploadKey, finalSeq: 4 },
    });
    expect((await read(`/attempts/${created.attemptId}/receipt`, student, '')).status).toBe(200);
  });

  it('returns unresolved recovery metadata on retrieval of an existing attempt', async () => {
    const created = await attempt();
    const recoveryId = randomUUID();
    await pool.query(
      `INSERT INTO recovery_uploads (id, school_id, attempt_id, exam_version, schedule_revision,
      device_generation, final_seq, answers_snapshot, snapshot_digest, reason, idempotency_key)
      VALUES ($1, $2, $3, 1, 1, 1, 0, '[]', $4, 'Synthetic retained evidence', $5)`,
      [recoveryId, schoolId, created.attemptId, 'b'.repeat(64), randomUUID()],
    );
    await pool.query("UPDATE attempts SET state = 'recovery_pending' WHERE id = $1", [
      created.attemptId,
    ]);
    const current = await create();
    expect(current.body).toMatchObject({
      state: 'recovery_pending',
      receipt: null,
      recovery: { recoveryId, status: 'recovery_pending' },
    });
  });

  it('rejects a new attempt before preparation and at its personal deadline', async () => {
    clock.setMockTime(prepAt.getTime() - 1);
    expect((await create()).body.code).toBe('NOT_PREPARING');
    clock.setMockTime(endsAt);
    expect((await create()).body.code).toBe('RECOVERY_REQUIRED');
    expect(
      (await pool.query('SELECT id FROM attempts WHERE session_id = $1', [sessionId])).rowCount,
    ).toBe(0);
  });

  it('checks ownership before device errors, and requires the bound browser for active operations', async () => {
    const created = await attempt();
    for (const suffix of ['', '/package']) {
      expect((await read(`/attempts/${created.attemptId}${suffix}`, peer, '')).status).toBe(404);
      expect((await read(`/attempts/${created.attemptId}${suffix}`, foreign, '')).status).toBe(404);
      expect((await read(`/attempts/${created.attemptId}${suffix}`, student, '')).body.code).toBe(
        'DEVICE_REPLACED',
      );
    }
    const other = await enroll();
    expect((await read(`/attempts/${created.attemptId}`, student, other.cookie)).body.code).toBe(
      'DEVICE_REPLACED',
    );
    expect((await create(randomUUID(), sessionId, other.id)).body.code).toBe('DEVICE_REPLACED');
    expect((await unlock(created.attemptId, {}, '')).body.code).toBe('DEVICE_REPLACED');
    const forged = await read(`/attempts/${created.attemptId}`).set('X-Device-Id', randomUUID());
    expect(forged.body.code).toBe('DEVICE_REPLACED');
  });

  it.each([
    { packageId: randomUUID() },
    { examVersion: 2 },
    { scheduleRevision: 2 },
    { deviceGeneration: 2 },
    { packageId: 'bad-id' },
    { examVersion: 1.5 },
    { extra: true },
  ])('validates unlock identity and revisions: %j', async (changes) => {
    const created = await attempt();
    clock.setMockTime(startsAt);
    const result = await unlock(created.attemptId, changes);
    expect([409, 422]).toContain(result.status);
    expect(result.body.key).toBeUndefined();
    expect(
      (await pool.query('SELECT unlocked_at FROM attempts WHERE id = $1', [created.attemptId]))
        .rows[0]?.unlocked_at,
    ).toBeNull();
  });

  it('releases the key exactly at start, preserves orders on retry and refuses it at deadline', async () => {
    const created = await attempt();
    const encrypted = await read(`/attempts/${created.attemptId}/package`);
    expect(encrypted.status).toBe(200);
    expect(encrypted.body.key).toBeUndefined();
    clock.setMockTime(startsAt.getTime() - 1);
    expect((await unlock(created.attemptId)).body.code).toBe('NOT_STARTED');
    clock.setMockTime(startsAt);
    const first = await unlock(created.attemptId);
    expect(first.status).toBe(200);
    clock.advanceByMs(1000);
    const second = await unlock(created.attemptId);
    expect(second.body.questionOrder).toEqual(first.body.questionOrder);
    expect(second.body.optionOrders).toEqual(first.body.optionOrders);
    expect(second.body.deadlineAt).toBe(created.deadlineAt);
    clock.setMockTime(endsAt);
    const late = await unlock(created.attemptId);
    expect(late.body.code).toBe('RECOVERY_REQUIRED');
    expect(late.body.key).toBeUndefined();
    expect((await read(`/attempts/${created.attemptId}/package`)).body.code).toBe(
      'RECOVERY_REQUIRED',
    );
  });

  it.each(['submitted', 'invalidated', 'recovery_pending', 'awaiting_upload'])(
    'never releases a key for state %s',
    async (state) => {
      const created = await attempt();
      await pool.query('UPDATE attempts SET state = $1 WHERE id = $2', [state, created.attemptId]);
      clock.setMockTime(startsAt);
      const result = await unlock(created.attemptId);
      expect(result.status).toBe(409);
      expect(result.body.key).toBeUndefined();
      expect((await read(`/attempts/${created.attemptId}/package`)).status).toBe(409);
    },
  );

  it('denies the previous browser after replacement while retaining the original deadlines', async () => {
    const created = await attempt();
    const replacement = await enroll();
    await pool.query(
      "UPDATE attempts SET device_id = $1, device_generation = 2, state = 'preparing' WHERE id = $2",
      [replacement.id, created.attemptId],
    );
    clock.setMockTime(startsAt);
    expect((await unlock(created.attemptId)).body.code).toBe('DEVICE_REPLACED');
    expect((await read(`/attempts/${created.attemptId}/package`)).body.code).toBe(
      'DEVICE_REPLACED',
    );
    const current = await unlock(created.attemptId, { deviceGeneration: 2 }, replacement.cookie);
    expect(current.status).toBe(200);
    expect(current.body.deadlineAt).toBe(created.deadlineAt);
  });

  it('refuses a barred roster member even with an existing attempt and valid browser', async () => {
    const created = await attempt();
    await pool.query(
      "UPDATE session_roster SET admission_status = 'barred' WHERE session_id = $1",
      [sessionId],
    );
    clock.setMockTime(startsAt);
    expect((await read(`/attempts/${created.attemptId}`)).status).toBe(404);
    expect((await read(`/attempts/${created.attemptId}/package`)).status).toBe(404);
    const result = await unlock(created.attemptId);
    expect(result.status).toBe(404);
    expect(result.body.key).toBeUndefined();
  });

  it('uses the Secure host-only production cookie for enrollment and preparation', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const id = randomUUID();
    browserIds.add(id);
    try {
      const registered = await post('/auth/device', { deviceId: id }, student, '');
      expect(registered.status).toBe(200);
      const cookies = responseCookies(registered).join(';');
      expect(cookies).toContain('__Host-nexora_device=');
      expect(cookies).toContain('Secure');
      expect(cookies).toContain('HttpOnly');
      expect(cookies).not.toContain('Domain=');
      const cookie = responseCookie(registered, '__Host-nexora_device');
      const created = await post(
        `/sessions/${sessionId}/attempts`,
        { deviceId: id },
        student,
        cookie,
      ).set('Idempotency-Key', randomUUID());
      expect(created.status).toBe(201);
      clock.setMockTime(startsAt);
      expect((await unlock(z.string().parse(created.body.attemptId), {}, cookie)).status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('migrates legacy enrollments, preserving evidence and revoking ambiguous credentials', async () => {
    const client = await pool.connect();
    const schema = `legacy_${randomUUID().replaceAll('-', '')}`;
    const createdAt = new Date();
    const ancient = new Date(createdAt.getTime() - 60 * 86400000);
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(
        'CREATE TABLE device_bindings (device_id TEXT, credential_hash TEXT, created_at TIMESTAMPTZ)',
      );
      await client.query(
        `INSERT INTO device_bindings VALUES
        ('shared', 'same-hash', $1), ('shared', 'same-hash', $1),
        ('ambiguous', 'hash-one', $1), ('ambiguous', 'hash-two', $1),
        ('expired', 'old-hash', $2)`,
        [createdAt, ancient],
      );
      await client.query(
        await readFile(
          path.resolve(__dirname, '../migrations/005_browser_device_credentials.sql'),
          'utf8',
        ),
      );
      const result = await client.query<{
        device_id: string;
        credential_hash: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>('SELECT * FROM browser_devices ORDER BY device_id');
      expect(result.rows).toHaveLength(3);
      expect(result.rows.find((row) => row.device_id === 'shared')).toMatchObject({
        credential_hash: 'same-hash',
        revoked_at: null,
      });
      expect(result.rows.find((row) => row.device_id === 'ambiguous')?.revoked_at).toBeInstanceOf(
        Date,
      );
      expect(result.rows.find((row) => row.device_id === 'expired')?.expires_at.getTime()).toBe(
        ancient.getTime() + 30 * 86400000,
      );
      expect((await client.query('SELECT * FROM device_bindings')).rowCount).toBe(5);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('rechecks time after waiting for an attempt lock', async () => {
    const created = await attempt();
    const blocker = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM attempts WHERE id = $1 FOR UPDATE', [created.attemptId]);
      clock.setMockTime(startsAt);
      pending = unlock(created.attemptId).then((result) => result);
      let waiting = false;
      for (let count = 0; count < 100 && !waiting; count++) {
        const activity = await pool.query<{ waiting: boolean }>(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'
          AND query LIKE 'SELECT a.* FROM attempts a%') AS waiting`);
        waiting = activity.rows[0]?.waiting ?? false;
        if (!waiting) await pool.query('SELECT pg_sleep(0.01)');
      }
      expect(waiting).toBe(true);
      clock.setMockTime(endsAt);
      await blocker.query('COMMIT');
      const result = await pending;
      expect(result.body.code).toBe('RECOVERY_REQUIRED');
      expect(result.body.key).toBeUndefined();
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      if (pending) await pending;
    }
  });

  it('refuses inactive school and student sessions without issuing credentials', async () => {
    await pool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [student.id]);
    try {
      expect((await read('/auth/me')).status).toBe(401);
    } finally {
      await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [student.id]);
    }
    await pool.query("UPDATE schools SET status = 'inactive' WHERE id = $1", [schoolId]);
    try {
      expect((await post('/auth/device', { deviceId: randomUUID() })).status).toBe(401);
    } finally {
      await pool.query("UPDATE schools SET status = 'active' WHERE id = $1", [schoolId]);
    }
  });
});
