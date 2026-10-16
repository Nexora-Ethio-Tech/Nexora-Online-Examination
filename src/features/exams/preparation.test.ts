/// <reference types="node" />
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { examApi } from './api';
import { preparePaper, verifyPackage } from './preparation';
import { packageSchema } from './schemas';
import { retainedId, storageKey } from './storage';
import * as storage from './storage';
import * as shell from '@/lib/offline-shell';
import { clockSample, serverTime } from './PreparationPage';
import fixture from '../../../docs/fixtures/student-exam-v1.json';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});
function setup(change?: (response: Response, url: string) => Promise<Response>) {
  const demo = createDemoTransport('student');
  const calls: { url: string; init: RequestInit }[] = [];
  const transport: Transport = async (url, init) => {
    calls.push({ url, init });
    const response = await demo(url, init);
    return change ? change(response, url) : response;
  };
  const client = new ApiClient('/api/v1', transport);
  client.setCsrfToken('demo-authenticated-csrf');
  return { api: examApi(client), calls };
}
const owner = { schoolId: 'test-school', userId: 'test-student' };
describe('student preparation integrity', () => {
  it('reports only reached phases, retries a failed shell check and never succeeds after cancellation', async () => {
    const { api, calls } = setup();
    const exam = (await api.detail('demo-session-4')).exam;
    const phases: string[] = [];
    const check = vi
      .spyOn(shell, 'ensureOfflineShell')
      .mockRejectedValueOnce(new Error('Cache unavailable'))
      .mockResolvedValue('ready');
    try {
      await expect(
        preparePaper(api, owner, exam, undefined, (step) => phases.push(step)),
      ).rejects.toMatchObject({ code: 'SHELL_UNAVAILABLE' });
      expect(phases).toEqual([
        'eligibility',
        'attempt',
        'download',
        'integrity',
        'storage',
        'shell',
      ]);
      const first = calls.find((c) => c.url.endsWith('/attempts'));
      await expect(preparePaper(api, owner, exam)).resolves.toMatchObject({ shell: 'ready' });
      const posts = calls.filter((c) => c.url.endsWith('/attempts'));
      expect(new Headers(posts.at(-1)?.init.headers).get('Idempotency-Key')).toBe(
        new Headers(first?.init.headers).get('Idempotency-Key'),
      );
      const controller = new AbortController();
      check.mockImplementationOnce(async () => {
        controller.abort();
        return 'ready';
      });
      await expect(preparePaper(api, owner, exam, controller.signal)).rejects.toThrow();
    } finally {
      check.mockRestore();
    }
  });
  it('reports storage failure without claiming the paper was saved', async () => {
    const { api } = setup();
    const write = vi
      .spyOn(storage, 'savePackage')
      .mockRejectedValue(new DOMException('Quota exceeded', 'QuotaExceededError'));
    try {
      const phases: string[] = [];
      await expect(
        preparePaper(api, owner, (await api.detail('demo-session-4')).exam, undefined, (step) =>
          phases.push(step),
        ),
      ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
      expect(phases.at(-1)).toBe('storage');
      expect(phases).not.toContain('shell');
    } finally {
      write.mockRestore();
    }
  });
  it('stops before device enrollment if the operation was cancelled', async () => {
    const controller = new AbortController();
    const { api, calls } = setup();
    const exam = (await api.detail('demo-session-4')).exam;
    controller.abort();
    await expect(preparePaper(api, owner, exam, controller.signal)).rejects.toThrow();
    expect(calls.every((call) => call.init.method === 'GET')).toBe(true);
  });
  it('rejects mismatching package revisions', async () => {
    const { api } = setup(async (response, url) =>
      url.endsWith('/package')
        ? Response.json({ ...packageSchema.parse(await response.json()), scheduleRevision: 2 })
        : response,
    );
    await expect(
      preparePaper(api, owner, (await api.detail('demo-session-4')).exam),
    ).rejects.toMatchObject({ code: 'VERSION_CHANGED' });
  });
  it('verifies the issued interoperability ciphertext and rejects tampering', async () => {
    const packet = packageSchema.parse(fixture.package);
    await expect(verifyPackage(packet)).resolves.toBeUndefined();
    await expect(
      verifyPackage({ ...packet, ciphertext: `A${packet.ciphertext.slice(1)}` }),
    ).rejects.toThrow('checksum');
    expect(packageSchema.safeParse({ ...packet, key: fixture.unlockKey }).success).toBe(false);
  });
  it('reads lists and direct schedules without a mutation, and refuses early preparation', async () => {
    const { api, calls } = setup();
    await api.list(null);
    const { exam } = await api.detail('demo-session-5');
    await expect(preparePaper(api, owner, exam)).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    expect(calls.every((call) => call.init.method === 'GET')).toBe(true);
  });
  it('stores verified ciphertext and retries creation with the same device and request key', async () => {
    const { api, calls } = setup();
    const { exam } = await api.detail('demo-session-4');
    const first = await preparePaper(api, owner, exam);
    const second = await preparePaper(api, owner, exam);
    expect(first.attempt.attemptId).toBe(second.attempt.attemptId);
    const posts = calls.filter(
      (call) => call.url.endsWith('/attempts') && call.init.method === 'POST',
    );
    expect(posts).toHaveLength(2);
    expect(new Headers(posts[0]?.init.headers).get('Idempotency-Key')).toBe(
      new Headers(posts[1]?.init.headers).get('Idempotency-Key'),
    );
    expect(posts[0]?.init.body).toBe(posts[1]?.init.body);
    expect(calls.some((call) => call.url.endsWith('/unlock'))).toBe(false);
  });
  it('rejects a damaged download before reporting storage success', async () => {
    const { api } = setup(async (response, url) =>
      url.endsWith('/package')
        ? Response.json({ ...packageSchema.parse(await response.json()), sha256: '0'.repeat(64) })
        : response,
    );
    await expect(
      preparePaper(api, owner, (await api.detail('demo-session-4')).exam),
    ).rejects.toMatchObject({ code: 'PACKAGE_INTEGRITY' });
  });
  it('does not download for a recorded submission or unresolved recovery', async () => {
    const { api, calls } = setup();
    for (const id of ['demo-session-0', 'demo-session-1']) {
      await expect(preparePaper(api, owner, (await api.detail(id)).exam)).rejects.toMatchObject({
        code: 'STATE_CHANGED',
      });
    }
    expect(calls.every((call) => call.init.method === 'GET')).toBe(true);
  });
  it('keeps retry identifiers separate by school and student', async () => {
    const first = storageKey('school-a', 'student', 'session');
    expect(await retainedId(first)).toBe(await retainedId(first));
    expect(await retainedId(first)).not.toBe(
      await retainedId(storageKey('school-b', 'student', 'session')),
    );
    expect(await retainedId(first)).not.toBe(
      await retainedId(storageKey('school-a', 'other', 'session')),
    );
  });
  it('uses monotonic elapsed time rather than the wall clock', () => {
    const sample = clockSample('2026-10-17T06:00:00Z', 100);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    expect(serverTime(sample, 2100)).toBe(Date.parse('2026-10-17T06:00:02Z'));
    vi.restoreAllMocks();
  });
});

it('reports only after verified production shell checks and retains the report key after a lost response', async () => {
  const check = vi.spyOn(shell, 'ensureOfflineShell').mockResolvedValue('ready');
  let lost = true;
  const { api, calls } = setup(async (response, url) => {
    if (url.endsWith('/readiness') && lost) {
      lost = false;
      throw new TypeError('Lost response');
    }
    return response;
  });
  try {
    const exam = (await api.detail('demo-session-4')).exam;
    await expect(preparePaper(api, owner, exam)).rejects.toThrow();
    await expect(preparePaper(api, owner, exam)).resolves.toMatchObject({ shell: 'ready' });
    const reports = calls.filter((call) => call.url.endsWith('/readiness'));
    expect(reports).toHaveLength(2);
    expect(reports[0]?.init.body).toEqual(reports[1]?.init.body);
    expect(new Headers(reports[0]?.init.headers).get('Idempotency-Key')).toBe(
      new Headers(reports[1]?.init.headers).get('Idempotency-Key'),
    );
  } finally {
    check.mockRestore();
  }
});
it('never sends verified readiness when production shell verification is skipped or fails', async () => {
  const check = vi
    .spyOn(shell, 'ensureOfflineShell')
    .mockResolvedValueOnce('development')
    .mockRejectedValueOnce(new Error('Shell unavailable'));
  const { api, calls } = setup();
  try {
    const exam = (await api.detail('demo-session-4')).exam;
    await expect(preparePaper(api, owner, exam)).resolves.toMatchObject({ shell: 'development' });
    await expect(preparePaper(api, owner, exam)).rejects.toMatchObject({
      code: 'SHELL_UNAVAILABLE',
    });
    expect(calls.filter((call) => call.url.endsWith('/readiness'))).toHaveLength(0);
  } finally {
    check.mockRestore();
  }
});
