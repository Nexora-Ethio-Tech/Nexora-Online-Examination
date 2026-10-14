// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthApi } from '@/features/auth/api';
import type { Role } from '@/features/auth/schemas';
import { markResults, reportsCsv } from '@/mocks/result-math';
import { resultsApi } from './api';
import { resultsFixture } from './test-fixture';

async function setup(role: Role = 'school_admin') {
  const fixture = resultsFixture();
  let time = Date.parse('2026-10-17T06:30:00.000Z');
  const transport = createDemoTransport(role, () => time, fixture.store);
  const client = new ApiClient('/api/v1', transport);
  const auth = createAuthApi(client);
  await auth.session();
  return {
    ...fixture,
    api: resultsApi(client),
    transport,
    setTime: (value: string) => {
      time = Date.parse(value);
    },
    login: async (name: string) => {
      await auth.logout();
      await auth.login({ loginId: `DEMO-${name}`, password: 'NexoraDemo!' });
      if (name === 'ADMIN') await auth.verify({ code: '123456' });
      await auth.session();
    },
  };
}
const publishBody = {
  revision: 1,
  releaseAt: '2026-10-17T07:00:00.000Z',
  reason: 'Checked official results.',
  exclusions: [],
};
describe('official result rules', () => {
  it('paginates the sitting list while exporting every authorized sitting', async () => {
    const c = await setup();
    const original = c.store.sessions.get('sitting');
    if (!original) throw new Error('fixture');
    for (let n = 1; n <= 25; n++)
      c.store.sessions.set(`sitting-${n}`, {
        ...structuredClone(original),
        title: `Paper ${n}`,
        session: { ...original.session, sessionId: `sitting-${n}` },
      });
    const first = await c.api.sessions(null);
    expect(first.items).toHaveLength(25);
    expect((await c.api.sessions(first.nextCursor)).items).toHaveLength(1);
    const csv = await c.api.csv();
    expect(csv.split('\r\n')).toHaveLength(27);
    expect(csv).toContain('"Paper 25"');
  });
  it('uses competition ranks, counts unanswered marks, and excludes status rows and secondary topics', () => {
    const { items } = resultsFixture();
    const inputs = [2, 1, 1, 0].map((correct, n) => ({
      studentId: String(n),
      studentName: String(n),
      loginId: String(n),
      attemptId: String(n),
      status: 'finalized' as const,
      answers: items.map((i, index) => ({
        itemId: i.itemId,
        value: index < correct ? i.correctOptionId : null,
      })),
    }));
    const marked = markResults(
      items,
      [
        ...inputs,
        {
          studentId: 'absent',
          studentName: 'Absent',
          loginId: 'absent',
          attemptId: null,
          status: 'absent',
          answers: [],
        },
      ],
      50,
    );
    expect(marked.rows.map((r) => r.rank)).toEqual([1, 2, 2, 4, null]);
    expect(marked.rows.map((r) => r.score)).toEqual([4, 2, 2, 0, null]);
    expect(marked.analytics.topics.reduce((n, t) => n + t.availableMarks, 0)).toBe(16);
    expect(marked.analytics.topics.reduce((n, t) => n + t.earnedMarks, 0)).toBe(8);
    expect(marked.analytics.topics.every((t) => t.studentCount === 4)).toBe(true);
    expect(marked.analytics.distribution.map((b) => b.count)).toEqual([1, 0, 2, 0, 1]);
  });
  it('keeps scores out of raw student payloads until both approval and exact release time', async () => {
    const c = await setup();
    await c.login('STUDENT');
    const raw = await c.transport('/api/v1/me/results', { method: 'GET' });
    expect(await raw.text()).not.toMatch(/"score"|"rank"|"correctOptionId"|"explanation"/);
    c.setTime('2026-10-17T08:00:00.000Z');
    expect((await c.api.mine(null)).items[0]?.result).toBeNull();
    await c.login('ADMIN');
    c.setTime('2026-10-17T06:30:00.000Z');
    await c.api.publish('sitting', publishBody, crypto.randomUUID());
    await c.login('STUDENT');
    c.setTime('2026-10-17T06:59:59.999Z');
    expect((await c.api.mine(null)).items[0]?.result).toBeNull();
    c.setTime('2026-10-17T07:00:00.000Z');
    expect((await c.api.mine(null)).items[0]?.result).toMatchObject({
      score: 4,
      percent: 100,
      rank: 1,
    });
  });
  it('waits beyond final acceptance and accommodation windows, and replays approval safely', async () => {
    const c = await setup();
    c.attempt.finalAcceptUntil = '2026-10-17T06:40:05.000Z';
    const key = crypto.randomUUID();
    await expect(c.api.publish('sitting', publishBody, key)).rejects.toMatchObject({
      code: 'RESULTS_NOT_RELEASED',
    });
    c.setTime('2026-10-17T06:40:05.000Z');
    await expect(c.api.publish('sitting', publishBody, key)).rejects.toMatchObject({
      code: 'RESULTS_NOT_RELEASED',
    });
    c.setTime('2026-10-17T06:40:05.001Z');
    const approved = await c.api.publish('sitting', publishBody, key);
    expect(await c.api.publish('sitting', publishBody, key)).toEqual(approved);
    await expect(
      c.api.publish('sitting', { ...publishBody, reason: 'Changed' }, key),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it('requires explicit recovery exclusion and preserves the released snapshot after a later acceptance', async () => {
    const c = await setup();
    c.attempt.state = 'recovery_pending';
    c.attempt.receipt = null;
    await expect(c.api.publish('sitting', publishBody, crypto.randomUUID())).rejects.toMatchObject({
      code: 'RECOVERY_REQUIRED',
    });
    await c.api.publish(
      'sitting',
      {
        ...publishBody,
        exclusions: [{ attemptId: 'attempt', reason: 'Upload evidence still under review.' }],
      },
      crypto.randomUUID(),
    );
    c.setTime('2026-10-17T07:01:00.000Z');
    await c.login('STUDENT');
    expect((await c.api.mine(null)).items[0]?.result).toMatchObject({
      status: 'excluded',
      score: null,
      rank: null,
    });
    c.attempt.state = 'submitted';
    c.attempt.receipt = resultsFixture().attempt.receipt;
    expect((await c.api.mine(null)).items[0]?.result?.status).toBe('excluded');
    await c.login('ADMIN');
    const current = await c.api.results('sitting', null);
    expect(current.summary.revision).toBe(2);
    expect((await c.api.report('sitting', 1)).rows[0]?.status).toBe('excluded');
    await expect(c.api.publish('sitting', publishBody, crypto.randomUUID())).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await c.api.publish(
      'sitting',
      { ...publishBody, revision: 2, reason: 'Recovery accepted; reviewed revision.' },
      crypto.randomUUID(),
    );
    await c.login('STUDENT');
    expect((await c.api.mine(null)).items[0]?.result?.score).toBe(4);
  });
  it('enforces staff roles and assigned scope on results, reports, analytics and CSV', async () => {
    const c = await setup('student');
    await expect(c.api.sessions(null)).rejects.toMatchObject({ status: 403 });
    await expect(c.api.csv()).rejects.toMatchObject({ status: 403 });
    await c.login('TEACHER');
    await expect(c.api.publish('sitting', publishBody, crypto.randomUUID())).rejects.toMatchObject({
      status: 403,
    });
    expect((await c.api.sessions(null)).items).toHaveLength(1);
    const approved = c.store.approved.get('paper');
    if (!approved) throw new Error('fixture');
    approved.draft.assignmentId = 'other-assignment';
    expect((await c.api.sessions(null)).items).toHaveLength(0);
    await expect(c.api.report('sitting', 1)).rejects.toMatchObject({ status: 404 });
    await expect(c.api.analytics('sitting', 1)).rejects.toMatchObject({ status: 404 });
    expect(await c.api.csv()).not.toContain('Algebra official results');
  });
  it('exports the full authorized revision and protects CSV cells from formula injection', async () => {
    const c = await setup();
    const report = await c.api.report('sitting', 1);
    expect(await c.api.csv('sitting', 1)).toContain('"4","4","100","1"');
    expect((await c.api.analytics('sitting', 1)).includedCount).toBe(1);
    report.summary.title = '=IMPORTXML("malicious")';
    expect(reportsCsv([report])).toContain('"\'=IMPORTXML(""malicious"")"');
    await expect(c.api.csv('sitting', 999)).rejects.toMatchObject({ status: 404 });
  });
});
