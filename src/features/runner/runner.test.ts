/// <reference types="node" />
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { examApi } from '@/features/exams/api';
import { preparePaper } from '@/features/exams/preparation';
import { packageSchema, type Attempt } from '@/features/exams/schemas';
import fixture from '../../../nexora-backend/docs/Nexora_Backend_BE10_v0.11/docs/fixtures/student-exam-v1.json';
import { paperSchema, type Unlock } from './schemas';
import { decryptPaper, snapshotDigest } from './crypto';
import { ExamClock } from './clock';
import { RunnerEngine } from './engine';
import * as store from './store';
import { acquireWriter } from './lock';
const engines: RunnerEngine[] = [];
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  engines.forEach((engine) => engine.dispose());
  engines.length = 0;
  vi.restoreAllMocks();
});
const dependencies = {
  acquireWriter: async () => () => undefined,
  ensureOfflineShell: async (): Promise<'ready'> => 'ready',
};
const owner = { schoolId: 'runner-school', userId: 'runner-student' };
async function setup(
  intercept?: (url: string, init: RequestInit, next: Transport) => Promise<Response>,
) {
  let now = Date.parse('2026-10-17T06:00:00Z');
  const demo = createDemoTransport('student', () => now);
  const client = new ApiClient(
    '/api/v1',
    intercept ? (url, init) => intercept(url, init, demo) : demo,
  );
  client.setCsrfToken('demo-authenticated-csrf');
  const api = examApi(client);
  const prepared = await preparePaper(api, owner, (await api.detail('demo-session-3')).exam);
  const make = () => {
    const engine = new RunnerEngine(client, owner, prepared.attempt.attemptId, dependencies);
    engines.push(engine);
    return engine;
  };
  return {
    api,
    make,
    attempt: prepared.attempt,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
async function answer(engine: RunnerEngine, itemId = 'q1', value = 'true') {
  engine.edit(itemId, value);
  await vi.waitFor(() => expect(engine.snapshot().saving).toBe(false));
  expect(engine.snapshot().row?.answers.find((a) => a.itemId === itemId)?.value).toBe(value);
}
describe('exam crypto and clock', () => {
  it('matches the published canonical digest exactly', async () => {
    expect(await snapshotDigest(fixture.attemptId, fixture.finalRequest)).toBe(
      fixture.snapshotDigest,
    );
    expect(
      await snapshotDigest(fixture.attemptId, {
        ...fixture.finalRequest,
        answers: [...fixture.finalRequest.answers].reverse(),
      }),
    ).toBe(fixture.snapshotDigest);
  });
  it('decrypts the issued fixture and rejects early unlock, wrong order and forbidden grading fields', async () => {
    const attempt: Attempt = {
      attemptId: fixture.attemptId,
      sessionId: 'fixture-session',
      examVersion: 1,
      scheduleRevision: 1,
      deviceGeneration: 1,
      state: 'active',
      serverNow: '2026-10-17T06:00:00Z',
      startsAt: '2026-10-17T06:00:00Z',
      deadlineAt: '2026-10-17T07:00:00Z',
      finalAcceptUntil: '2026-10-17T07:00:05Z',
      lastServerSaveAt: null,
      highestAcceptedSeq: 0,
      answers: [],
      receipt: null,
      recovery: null,
    };
    const unlock: Unlock = {
      packageId: fixture.package.packageId,
      key: fixture.unlockKey,
      serverNow: attempt.serverNow,
      deadlineAt: attempt.deadlineAt,
      finalAcceptUntil: attempt.finalAcceptUntil,
      deviceGeneration: 1,
      questionOrder: fixture.questionOrder,
      optionOrders: fixture.optionOrders,
    };
    const packet = packageSchema.parse(fixture.package);
    expect((await decryptPaper(packet, unlock, attempt)).items).toHaveLength(2);
    await expect(
      decryptPaper(packet, { ...unlock, serverNow: '2026-10-17T05:59:59Z' }, attempt),
    ).rejects.toThrow('window');
    await expect(
      decryptPaper(packet, { ...unlock, questionOrder: ['q1', 'q1'] }, attempt),
    ).rejects.toThrow('order');
    await expect(
      decryptPaper(packet, { ...unlock, key: 'A'.repeat(43) }, attempt),
    ).rejects.toThrow();
    expect(paperSchema.safeParse({ ...fixture.plaintext, answerKey: [] }).success).toBe(false);
  });
  it('does not extend the clock for backward server samples or wall-clock changes', () => {
    let monotonic = 100;
    const clock = new ExamClock('2026-10-17T06:00:00Z', () => monotonic);
    monotonic += 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(0);
    clock.sync('2026-10-17T05:00:00Z');
    expect(clock.now()).toBe(Date.parse('2026-10-17T06:01:00Z'));
  });
});
describe('runner durability and final submission', () => {
  it('automatically freezes and submits at the deadline without a user click', async () => {
    let elapsed = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const { make, advance } = await setup();
    const engine = make();
    await engine.start();
    await answer(engine);
    elapsed += 180_001;
    advance(180_001);
    await vi.waitFor(() => expect(engine.snapshot().status).toBe('submitted'));
    expect(engine.snapshot().row?.final?.body.answers).toHaveLength(10);
    engine.edit('q1', 'false');
    expect(engine.snapshot().row?.answers[0]?.value).toBe('true');
  });
  it('retains a frozen snapshot when authentication expires during submission', async () => {
    const { make } = await setup((url, init, next) =>
      url.endsWith('/submit') || url.endsWith('/receipt')
        ? Promise.resolve(
            Response.json(
              {
                code: 'AUTH_REQUIRED',
                message: 'Sign in again.',
                details: [],
                requestId: 'auth-expired',
              },
              { status: 401 },
            ),
          )
        : next(url, init),
    );
    const engine = make();
    await engine.start();
    await answer(engine);
    await engine.finish();
    expect(engine.snapshot().status).toBe('pending');
    const key = engine.snapshot().row?.key ?? '';
    engine.dispose();
    expect(
      (await store.readRecord(key))?.final?.body.answers.find((a) => a.itemId === 'q1')?.value,
    ).toBe('true');
  });
  it('stops a second writable tab and releases ownership on close', async () => {
    const held = new Set<string>();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (
          name: string,
          _options: unknown,
          callback: (lock: { name: string } | null) => Promise<void>,
        ) => {
          if (held.has(name)) return callback(null);
          held.add(name);
          try {
            await callback({ name });
          } finally {
            held.delete(name);
          }
        },
      },
    });
    try {
      const controller = new AbortController();
      await acquireWriter('same-attempt', controller.signal);
      await expect(acquireWriter('same-attempt', new AbortController().signal)).rejects.toThrow(
        'another tab',
      );
      controller.abort();
      await vi.waitFor(() => expect(held.size).toBe(0));
      const release = await acquireWriter('same-attempt', new AbortController().signal);
      release();
      const remount = new AbortController();
      const cancelled = acquireWriter('strict-remount', remount.signal);
      remount.abort();
      const reopened = acquireWriter('strict-remount', new AbortController().signal);
      await expect(cancelled).rejects.toThrow();
      const close = await reopened;
      close();
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });
  it('saves answers and outbox together, then commits a complete snapshot and matching receipt', async () => {
    const { make } = await setup();
    const engine = make();
    await engine.start();
    expect(engine.snapshot().status).toBe('active');
    await answer(engine);
    const key = engine.snapshot().row?.key ?? '';
    const row = await store.readRecord(key);
    expect(row?.outbox).toEqual(row?.answers);
    await engine.finish();
    expect(engine.snapshot().status).toBe('submitted');
    expect(engine.snapshot().row?.final?.body.answers).toHaveLength(10);
    expect(engine.snapshot().row?.final?.body.answers.filter((a) => a.value === null)).toHaveLength(
      9,
    );
    await expect(store.saveAnswer(key, 'q1', 'false', Date.now())).rejects.toThrow('closed');
  });
  it('never lets an old acknowledgement erase a newer answer', async () => {
    const { make } = await setup();
    const engine = make();
    await engine.start();
    await answer(engine);
    const key = engine.snapshot().row?.key ?? '';
    const old = (await store.readRecord(key))?.outbox ?? [];
    await answer(engine, 'q1', 'false');
    await store.acknowledge(key, old, {
      acknowledged: old.map((a) => ({ itemId: a.itemId, clientSeq: a.clientSeq })),
      superseded: [],
      highestAcceptedSeq: 1,
      serverNow: '2026-10-17T06:00:00Z',
      lastServerSaveAt: '2026-10-17T06:00:00Z',
    });
    expect((await store.readRecord(key))?.outbox).toEqual([
      { itemId: 'q1', value: 'false', clientSeq: 2 },
    ]);
  });
  it('continues local editing during network loss and uploads after reconnect', async () => {
    let offline = false;
    const { make } = await setup((url, init, next) => {
      if (offline) throw new Error('Offline');
      return next(url, init);
    });
    const engine = make();
    await engine.start();
    offline = true;
    await answer(engine);
    await engine.sync();
    expect(engine.snapshot().status).toBe('active');
    expect(engine.snapshot().row?.outbox).toHaveLength(1);
    offline = false;
    await engine.sync();
    expect(engine.snapshot().row?.outbox).toHaveLength(0);
    expect(engine.snapshot().row?.attempt.lastServerSaveAt).not.toBeNull();
  });
  it('restores local answers after a new runner instance revalidates online', async () => {
    const { make } = await setup();
    const first = make();
    await first.start();
    await answer(first);
    first.dispose();
    const second = make();
    await second.start();
    expect(second.snapshot().status).toBe('active');
    expect(second.snapshot().row?.answers[0]?.value).toBe('true');
  });
  it('keeps saved answers read-only when reopening without a network', async () => {
    let offline = false;
    const { make } = await setup((url, init, next) => {
      if (offline) throw new Error('Offline');
      return next(url, init);
    });
    const first = make();
    await first.start();
    await answer(first);
    first.dispose();
    offline = true;
    const second = make();
    await second.start();
    expect(second.snapshot().status).toBe('blocked');
    expect(second.snapshot().row?.answers[0]?.value).toBe('true');
    second.edit('q1', 'false');
    expect(second.snapshot().row?.answers[0]?.value).toBe('true');
  });
  it('retains the exact frozen request across a lost response and replays after deadline', async () => {
    let lost = true;
    const sent: { key: string | null; body: BodyInit | null | undefined }[] = [];
    const { make, advance } = await setup(async (url, init, next) => {
      if (url.endsWith('/receipt') && lost) throw new Error('Offline');
      if (url.endsWith('/submit')) {
        sent.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: init.body });
        const result = await next(url, init);
        if (lost) throw new Error('Response lost');
        return result;
      }
      return next(url, init);
    });
    const engine = make();
    await engine.start();
    await answer(engine);
    await engine.finish();
    expect(engine.snapshot().status).toBe('pending');
    const frozen = engine.snapshot().row?.final;
    advance(3_600_000);
    lost = false;
    await engine.retrySubmission();
    expect(engine.snapshot().status).toBe('submitted');
    expect(engine.snapshot().row?.final).toEqual(frozen);
    expect(sent[1]).toEqual(sent[0]);
  });
  it('submits without waiting for an in-flight interim save and ignores its late failure', async () => {
    let rejectSave: ((reason: Error) => void) | undefined;
    const { make } = await setup((url, init, next) =>
      url.endsWith('/answers')
        ? new Promise<Response>((_resolve, reject) => {
            rejectSave = reject;
          })
        : next(url, init),
    );
    const engine = make();
    await engine.start();
    await answer(engine);
    const sync = engine.sync();
    await vi.waitFor(() => expect(rejectSave).toBeDefined());
    await engine.finish();
    expect(engine.snapshot().status).toBe('submitted');
    rejectSave?.(new Error('Late save failed'));
    await sync;
    expect(engine.snapshot().status).toBe('submitted');
  });
  it('freezes at the deadline and sends late evidence to review without inventing a receipt', async () => {
    const { make, advance } = await setup();
    const engine = make();
    await engine.start();
    await answer(engine);
    advance(190_000);
    await engine.sync();
    expect(engine.snapshot().status).toBe('pending');
    expect(engine.snapshot().row?.final).not.toBeNull();
    await engine.recover('Connection failed at the deadline.');
    expect(engine.snapshot().status).toBe('recovery');
    expect(engine.snapshot().row?.receipt).toBeNull();
  });
  it('rejects a receipt for different answers', async () => {
    const { make } = await setup(async (url, init, next) => {
      const response = await next(url, init);
      if (url.endsWith('/submit'))
        return Response.json({
          status: 'submitted',
          receiptId: 'wrong',
          acceptedAt: '2026-10-17T06:00:00Z',
          snapshotDigest: '0'.repeat(64),
        });
      if (url.endsWith('/receipt'))
        return Response.json({
          attemptId: url.split('/').at(-2),
          state: 'submitted',
          receipt: {
            status: 'submitted',
            receiptId: 'wrong',
            acceptedAt: '2026-10-17T06:00:00Z',
            snapshotDigest: '0'.repeat(64),
            idempotencyKey: crypto.randomUUID(),
            finalSeq: 0,
          },
          recovery: null,
        });
      return response;
    });
    const engine = make();
    await engine.start();
    await answer(engine);
    await engine.finish();
    expect(engine.snapshot().status).toBe('pending');
    expect(engine.snapshot().row?.receipt).toBeNull();
    expect(engine.snapshot().row?.final).not.toBeNull();
  });
  it('does not claim a save when storage rejects an edit', async () => {
    const { make } = await setup();
    const engine = make();
    await engine.start();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    engine.edit('q1', 'true');
    await vi.waitFor(() => expect(engine.snapshot().saving).toBe(false));
    expect(engine.snapshot().row?.answers).toHaveLength(0);
    expect(engine.snapshot().message).toContain('not saved');
    expect((await store.readRecord(engine.snapshot().row?.key ?? ''))?.seq).toBe(0);
  });
  it('preserves old-device work for recovery when revalidation rejects the binding', async () => {
    let replaced = false;
    const { make } = await setup((url, init, next) =>
      replaced && /\/attempts\/[^/]+$/.test(url)
        ? Promise.resolve(
            Response.json(
              {
                code: 'DEVICE_REPLACED',
                message: 'Device replaced.',
                details: [],
                requestId: 'replaced',
              },
              { status: 409 },
            ),
          )
        : next(url, init),
    );
    const first = make();
    await first.start();
    await answer(first);
    first.dispose();
    replaced = true;
    const second = make();
    await second.start();
    expect(second.snapshot().status).toBe('pending');
    expect(second.snapshot().row?.final?.body.answers.find((a) => a.itemId === 'q1')?.value).toBe(
      'true',
    );
  });
  it('does not read another account’s stored evidence', async () => {
    const { make, attempt } = await setup();
    const engine = make();
    await engine.start();
    await answer(engine);
    expect(
      await store.recordsFor({ ...owner, userId: 'other-student' }, attempt.attemptId),
    ).toHaveLength(0);
    expect(
      await store.recordsFor({ ...owner, schoolId: 'other-school' }, attempt.attemptId),
    ).toHaveLength(0);
  });
  it('fails closed if the browser cannot coordinate writable tabs', async () => {
    await expect(acquireWriter('test-attempt', new AbortController().signal)).rejects.toThrow(
      'coordinate',
    );
  });
});
