// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiClient } from '@/lib/api-client';
import { createAuthApi } from '@/features/auth/api';
import { authoringApi } from '@/features/exams/authoring/api';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthoringStore } from '@/mocks/authoring-store';
import { parseRosterCsv } from '@/mocks/roster-csv';
import { resultsFixture } from '@/features/results/test-fixture';
import { schoolApi } from './api';
import { credentialsCsv } from './csv';

const key = () => crypto.randomUUID();
const file = (csv: string) => new File([csv], 'students.csv', { type: 'text/csv' });
const reason = 'School intake';
describe('class-scoped account management', () => {
  it('filters students by class and continues numbering across classes and removal', async () => {
    const { api, store } = await setup();
    const cls = await api.saveClass(
      null,
      { name: 'Grade 11', academicYear: '2026', reason },
      key(),
    );
    await importStudents(api);
    const preview = await api.preview(
      file('studentRef,displayName\nB-1,Second Student\n'),
      cls.classId,
      key(),
    );
    await api.commit(preview.importId, preview.revision, reason, key());
    const first = await api.accounts('student', '', null, undefined, 'demo-class-10a');
    const second = await api.accounts('student', '', null, undefined, cls.classId);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.loginId).toBe('DEMO-STU-0002');
    expect(first.items.some((a) => a.loginId === 'DEMO-STU-0001')).toBe(true);
    const created = second.items[0];
    if (!created) throw new Error('Missing fixture');
    await api.remove('students', created.userId, created.revision, 'Duplicate intake', key());
    expect(store.directory.accounts.has(created.userId)).toBe(false);
    const next = await api.preview(
      file('studentRef,displayName\nC-1,Third Student\n'),
      cls.classId,
      key(),
    );
    await api.commit(next.importId, next.revision, reason, key());
    expect(
      (await api.accounts('student', '', null, undefined, cls.classId)).items[0]?.loginId,
    ).toBe('DEMO-STU-0003');
  });
});
async function setup(store = createAuthoringStore(), clock = Date.now) {
  const client = new ApiClient('/api/v1', createDemoTransport('school_admin', clock, store));
  await createAuthApi(client).session();
  return { store, client, api: schoolApi(client) };
}
async function importStudents(
  api: ReturnType<typeof schoolApi>,
  csv = 'studentRef,displayName\nA-1,Test Student\n',
) {
  const preview = await api.preview(file(csv), 'demo-class-10a', key());
  return api.commit(preview.importId, preview.revision, reason, key());
}
async function login(
  store: ReturnType<typeof createAuthoringStore>,
  credentials: { loginId: string; password: string },
) {
  const client = new ApiClient('/api/v1', createDemoTransport(undefined, undefined, store));
  const auth = createAuthApi(client);
  await auth.login(credentials);
  await auth.session();
  return { client, auth };
}
describe('school directory contract and demo', () => {
  it('requires admin MFA and rejects other roles, unknown IDs and privilege fields', async () => {
    for (const role of [undefined, 'student', 'teacher'] as const) {
      const client = new ApiClient('/api/v1', createDemoTransport(role));
      await expect(schoolApi(client).classes(null)).rejects.toMatchObject({
        status: role ? 403 : 401,
      });
    }
    const pending = new ApiClient('/api/v1', createDemoTransport());
    await createAuthApi(pending).login({ loginId: 'DEMO-ADMIN', password: 'NexoraDemo!' });
    await expect(schoolApi(pending).classes(null)).rejects.toMatchObject({ status: 401 });
    const { client, api } = await setup();
    await expect(
      api.reset({ role: 'student', userId: 'foreign', revision: 1 }, reason, key()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      client.request('/teachers', z.unknown(), {
        method: 'POST',
        body: { displayName: 'Test', reason, role: 'school_admin' },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('protects class/subject identity, revisions and dependencies while permitting empty archives', async () => {
    const { api } = await setup();
    const c = await api.saveClass(null, { name: 'Grade 9 B', academicYear: '2026', reason }, key());
    await expect(
      api.saveClass(null, { name: ' grade  9 b ', academicYear: '2026', reason }, key()),
    ).rejects.toMatchObject({ status: 409 });
    const updated = await api.saveClass(
      c.classId,
      { name: c.name, academicYear: c.academicYear, revision: 1, active: false, reason },
      key(),
    );
    expect(updated.active).toBe(false);
    await expect(
      api.saveClass(
        c.classId,
        { name: c.name, academicYear: c.academicYear, revision: 1, active: true, reason },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      api.saveClass(
        'demo-class-10a',
        { name: 'Grade 10 A', academicYear: '2026', revision: 1, active: false, reason },
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      api.saveSubject(null, { name: 'Other mathematics', code: 'math', reason }, key()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('parses BOM, quoted commas/newlines/quotes and reports interior blank records accurately', async () => {
    const { api, store } = await setup();
    const preview = await api.preview(
      file(
        '\ufeffstudentRef,displayName\r\nA-1,"First, Last"\r\nA-2,"Test ""Name""\nSecond"\r\n\r\n',
      ),
      'demo-class-10a',
      key(),
    );
    expect(preview.canCommit).toBe(true);
    expect(preview.rows.map((r) => r.displayName)).toEqual(['First, Last', 'Test "Name"\nSecond']);
    expect(store.directory.accounts.size).toBe(2);
    const blank = await api.preview(
      file('studentRef,displayName\n\nB-1,Test'),
      'demo-class-10a',
      key(),
    );
    expect(blank.rows[1]?.row).toBe(3);
    expect(blank.canCommit).toBe(false);
    expect(() => parseRosterCsv('studentRef,displayName\nA,"unterminated')).toThrow();
    await expect(
      api.preview(file('name,email\nA,test'), 'demo-class-10a', key()),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('rejects malformed, oversized and non-UTF8 uploads and reports duplicate references before commit', async () => {
    const { api, store } = await setup();
    for (const upload of [
      file('studentRef,displayName\nA,"bad"tail'),
      new File([new Uint8Array([0xff])], 'bad.csv'),
    ])
      await expect(api.preview(upload, 'demo-class-10a', key())).rejects.toMatchObject({
        status: 422,
      });
    await expect(
      api.preview(
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.csv'),
        'demo-class-10a',
        key(),
      ),
    ).rejects.toMatchObject({ status: 413 });
    const p = await api.preview(
      file('studentRef,displayName\nA-1,First\na-1,Second\nDEMO-001,Duplicate\nBad Ref,Name\nN,\n'),
      'demo-class-10a',
      key(),
    );
    expect(p.rows.every((r) => r.errors.length)).toBe(true);
    await expect(api.commit(p.importId, p.revision, reason, key())).rejects.toMatchObject({
      status: 409,
    });
    expect(store.directory.accounts.size).toBe(2);
  });
  it('commits all or none, revalidates concurrent duplicates and replays without duplication', async () => {
    const { api, store } = await setup();
    const a = await api.preview(file('studentRef,displayName\nA,First'), 'demo-class-10a', key());
    const b = await api.preview(
      file('studentRef,displayName\nB,Second\nA,Conflict'),
      'demo-class-10a',
      key(),
    );
    const k = key();
    const outcomes = await Promise.allSettled([
      api.commit(a.importId, 1, reason, k),
      api.commit(b.importId, 1, reason, key()),
    ]);
    expect(outcomes.map((v) => v.status)).toEqual(['fulfilled', 'rejected']);
    expect(store.directory.accounts.size).toBe(3);
    const result = await api.commit(a.importId, 1, reason, k);
    expect(await api.commit(a.importId, 1, reason, key())).toEqual(result);
    expect(store.directory.accounts.size).toBe(3);
    await expect(api.commit(a.importId, 1, 'different request', k)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('expires previews and rejects changed classes, but preserves committed replay after expiry', async () => {
    let now = Date.now();
    const { api, store } = await setup(undefined, () => now);
    const p = await api.preview(file('studentRef,displayName\nA,First'), 'demo-class-10a', key());
    now += 30 * 60000;
    await expect(api.commit(p.importId, 1, reason, key())).rejects.toMatchObject({ status: 409 });
    const q = await api.preview(file('studentRef,displayName\nB,Second'), 'demo-class-10a', key());
    await api.saveClass(
      'demo-class-10a',
      { name: 'Grade Ten A', academicYear: '2026', revision: 1, active: true, reason },
      key(),
    );
    await expect(api.commit(q.importId, 1, reason, key())).rejects.toMatchObject({ status: 409 });
    const r = await api.preview(file('studentRef,displayName\nC,Third'), 'demo-class-10a', key());
    const committed = await api.commit(r.importId, 1, reason, key());
    now += 31 * 60000;
    expect(await api.commit(r.importId, 1, reason, key())).toEqual(committed);
    expect(store.directory.accounts.size).toBe(3);
  });
  it('paginates beyond 25 and searches references literally without revealing passwords', async () => {
    const { api } = await setup();
    await importStudents(
      api,
      'studentRef,displayName\n' +
        Array.from({ length: 30 }, (_, i) => `R-${i},Student ${i}`).join('\n'),
    );
    const page = await api.accounts('student', '', null);
    expect(page.items).toHaveLength(25);
    const next = await api.accounts('student', '', page.nextCursor);
    expect(next.items).toHaveLength(6);
    expect(new Set([...page.items, ...next.items].map((a) => a.userId)).size).toBe(31);
    expect((await api.accounts('student', 'r-29', null)).items[0]?.studentRef).toBe('R-29');
    expect((await api.accounts('student', '.*', null)).items).toEqual([]);
    expect(JSON.stringify(page)).not.toMatch(/password|hash/i);
  });
  it('issues independent passwords once, keeps only hashes and returns safe identity metadata on replay', async () => {
    const { api, store } = await setup();
    const imported = await importStudents(api, 'studentRef,displayName\nA,First\nB,Second');
    const targets = imported.userIds.map((userId) => ({ userId, revision: 1 }));
    const k = key();
    const [issued, replay] = await Promise.all([
      api.generate(targets, reason, k),
      api.generate(targets, reason, k),
    ]);
    expect(issued.credentials).toHaveLength(2);
    expect(new Set(issued.credentials?.map((c) => c.password)).size).toBe(2);
    expect(replay).toEqual({ ...issued, credentials: null });
    expect(replay.accounts).toHaveLength(2);
    const retained = JSON.stringify({
      replay: [...store.directory.replays.values()],
      audit: store.directory.audit,
      issues: [...store.directory.issues.values()],
    });
    for (const c of issued.credentials ?? []) {
      expect(c.password.length).toBeGreaterThanOrEqual(32);
      expect(retained).not.toContain(c.password);
      expect(await store.directory.passwords.get(c.userId)?.hash).not.toBe(c.password);
      const session = await login(store, c);
      expect((await session.auth.session())?.user.id).toBe(c.userId);
      expect(
        await session.client.request('/me/results', z.object({ items: z.array(z.unknown()) })),
      ).toMatchObject({ items: [] });
      await expect(
        session.client.request('/sessions/sitting/results', z.unknown()),
      ).rejects.toMatchObject({ status: 404 });
    }
    await expect(api.generate(targets, reason, key())).rejects.toMatchObject({ status: 409 });
  });
  it('does not issue part of a mixed invalid batch or accept unissued account logins', async () => {
    const { api, store } = await setup();
    const result = await importStudents(api);
    const student = store.directory.accounts.get(result.userIds[0] ?? '');
    if (!student) throw new Error('Missing imported student');
    await expect(
      api.generate(
        [
          { userId: student.userId, revision: 1 },
          { userId: 'demo-student', revision: 1 },
        ],
        reason,
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.directory.passwords.has(student.userId)).toBe(false);
    await expect(
      login(store, { loginId: student.loginId, password: 'NexoraDemo!' }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('revokes sessions and old passwords on reset while retaining submitted exam evidence and frozen rosters', async () => {
    const { store, attempt } = resultsFixture();
    const { api } = await setup(store);
    const oldSession = await login(store, { loginId: 'DEMO-STUDENT', password: 'NexoraDemo!' });
    const student = structuredClone(store.directory.accounts.get('demo-student'));
    if (!student) throw new Error('Missing fixture student');
    const resetKey = key();
    const issue = await api.reset(student, 'Lost password', resetKey);
    expect((await api.reset(student, 'Lost password', resetKey)).credentials).toBeNull();
    expect(await oldSession.auth.session()).toBeNull();
    await expect(
      login(store, { loginId: student.loginId, password: 'NexoraDemo!' }),
    ).rejects.toMatchObject({ status: 401 });
    const c = issue.credentials?.[0];
    if (!c) throw new Error('Missing reset credentials');
    const current = await login(store, c);
    expect((await current.auth.session())?.user.id).toBe(student.userId);
    const newClass = await api.saveClass(
      null,
      { name: 'Grade 11 A', academicYear: '2027', reason },
      key(),
    );
    await api.editAccount(
      'student',
      student.userId,
      {
        revision: 2,
        displayName: student.displayName,
        classId: newClass.classId,
        status: 'inactive',
        reason,
      },
      key(),
    );
    expect(await current.auth.session()).toBeNull();
    expect(store.resultAttempts.get('sitting')?.attempt.receipt).toEqual(attempt.receipt);
    expect(store.sessions.get('sitting')?.session.rosterCount).toBe(1);
  });
  it('gives generated teachers only their assigned classes and their own drafts', async () => {
    const { api, store } = await setup();
    const issue = await api.createTeacher('Teacher Example', reason, key());
    const c = issue.credentials?.[0];
    if (!c) throw new Error('Missing credentials');
    const { client } = await login(store, c);
    const teacher = authoringApi(client);
    expect((await teacher.assignments(null)).items).toEqual([]);
    const a = await api.assign(
      { teacherId: c.userId, classId: 'demo-class-10a', subjectId: 'demo-subject-math', reason },
      key(),
    );
    expect((await teacher.assignments(null)).items.map((a) => a.assignmentId)).toEqual([
      a.assignmentId,
    ]);
    const metadata = {
      title: 'New teacher draft',
      assignmentId: a.assignmentId,
      language: 'en' as const,
      instructions: 'Choose one answer.',
      durationMinutes: 20,
      passPercent: 50,
      ordering: 'fixed' as const,
    };
    const draft = await teacher.create(metadata, key());
    const other = authoringApi(
      (await login(store, { loginId: 'DEMO-TEACHER', password: 'NexoraDemo!' })).client,
    );
    expect((await other.list(null)).items).toEqual([]);
    await expect(other.get(draft.examId)).rejects.toMatchObject({ status: 404 });
    await expect(
      teacher.create({ ...metadata, assignmentId: 'demo-math-10a' }, key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      api.setAssignment(a.assignmentId, { revision: 1, active: false, reason }, key()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('escapes exported credentials against formula evaluation, including leading whitespace', () => {
    const csv = credentialsCsv([
      { displayName: ' \t=HYPERLINK("url")', loginId: '+123', password: 'safe' },
    ]);
    expect(csv).toContain('"\' \t=HYPERLINK(""url"")"');
    expect(csv).toContain('"\'+123"');
    expect(csv.startsWith('\ufeff')).toBe(true);
  });
});
