import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Request, request as baseRequest } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbService } from '../../src/common/db/db.service';
import { ClockService } from '../../src/common/clock/clock.service';
import { AuthoringService, type Exam } from '../../src/modules/authoring/authoring.service';
import { ImportService } from '../../src/modules/authoring/import.service';
import {
  ImportWorkerService,
  QuestionAiService,
} from '../../src/modules/authoring/import-worker.service';
import { DirectoryService } from '../../src/modules/directory/directory.service';
import {
  allocateStudentNumbers,
  studentLoginId,
} from '../../src/modules/directory/student-numbering';
import { hasRetainedReferences } from '../../src/modules/directory/record-removal';
import type { Item } from '../../src/modules/authoring/schemas';
const mock = vi.hoisted(() => ({ query: vi.fn(), tenant: vi.fn() }));
vi.mock('../../src/common/db/db.service', () => ({
  DbService: class {
    withTenantTransaction(school: string, work: (c: { query: typeof mock.query }) => unknown) {
      mock.tenant(school);
      return work({ query: mock.query });
    }
  },
}));
const school = randomUUID(),
  teacher = randomUUID(),
  examId = randomUUID(),
  jobId = randomUUID();
function req(role: 'teacher' | 'school_admin' | 'student' = 'teacher'): Request {
  const r: Request = Object.create(baseRequest);
  r.school = { id: school, name: 'School', timezone: 'Africa/Addis_Ababa' };
  r.sessionUser = { id: teacher, role, loginId: 'TEST', displayName: 'Teacher' };
  return r;
}
const e: Exam = {
  id: examId,
  title: 'Paper',
  instructions: 'Answer',
  assignment_id: randomUUID(),
  language: 'en',
  duration_minutes: 30,
  pass_percent: 50,
  ordering: 'fixed',
  revision: 3,
  state: 'draft',
  import_id: jobId,
  return_comment: null,
  created_at: new Date(),
};
const db = new DbService();
const authoring = new AuthoringService(db);
const imports = new ImportService(db, authoring);
const directory = new DirectoryService(db, new ClockService());
const good: Item = {
  itemId: 'q1',
  externalId: 'Q1',
  type: 'mcq_single',
  stem: 'Question',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  correctOptionId: 'a',
  marks: 1,
  primaryTopic: 'Topic',
  secondaryTopics: [],
  explanation: 'Explanation',
  keyConsistent: true,
  reviewFlags: [],
  reviewed: false,
  reviewNote: '',
};
beforeEach(() => {
  vi.restoreAllMocks();
  mock.query.mockReset();
  mock.tenant.mockReset();
  mock.query.mockResolvedValue({ rows: [], rowCount: 0 });
});
describe('bulk teacher review', () => {
  it('reviews only eligible questions and records a single actor/revision snapshot', async () => {
    vi.spyOn(authoring, 'owned').mockResolvedValue({ ...e });
    vi.spyOn(authoring, 'mutable').mockResolvedValue(undefined);
    vi.spyOn(authoring, 'items').mockResolvedValue([
      good,
      { ...good, itemId: 'flagged', reviewFlags: ['Check key'] },
      { ...good, itemId: 'empty', explanation: '' },
    ]);
    vi.spyOn(authoring, 'snapshot').mockResolvedValue(undefined);
    vi.spyOn(authoring, 'dto').mockResolvedValue({
      examId,
      title: e.title,
      instructions: e.instructions,
      assignmentId: e.assignment_id ?? '',
      language: 'en',
      durationMinutes: 30,
      passPercent: 50,
      ordering: 'fixed',
      revision: 4,
      status: 'draft',
      totalMarks: 3,
      itemCount: 3,
      reviewedCount: 1,
      importId: jobId,
      returnComment: null,
    });
    mock.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('UPDATE exams') ? [{ ...e, revision: 4 }] : [],
      rowCount: 1,
    }));
    await authoring.reviewAll(req(), examId, { revision: 3, confirmed: true }, randomUUID());
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('SET reviewed=true'), [
      teacher,
      school,
      examId,
      ['q1'],
    ]);
    expect(authoring.snapshot).toHaveBeenCalledWith(
      expect.anything(),
      school,
      teacher,
      e,
      'before_bulk_review',
      expect.any(Array),
    );
  });
  it('requires teacher identity and an explicit confirmation', async () => {
    await expect(
      authoring.reviewAll(req('student'), examId, { revision: 3, confirmed: true }, randomUUID()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      authoring.reviewAll(req(), examId, { revision: 3, confirmed: false }, randomUUID()),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mock.query).not.toHaveBeenCalled();
  });
});
describe('import cancellation and stale workers', () => {
  function setup() {
    vi.spyOn(imports, 'job').mockResolvedValue({
      importId: jobId,
      examId,
      state: 'queued',
      parsedCount: 0,
      completedCount: 0,
      sourceName: 'paper.xlsx',
      sourceSha256: 'hash',
      failure: null,
      diagnostics: [],
    });
    vi.spyOn(authoring, 'owned').mockResolvedValue({ ...e });
  }
  it('cancels a queued import without invoking the busy-import guard or deleting existing questions', async () => {
    setup();
    const mutable = vi.spyOn(authoring, 'mutable');
    await imports.cancel(req(), jobId, { revision: 3, reason: 'Wrong file' }, randomUUID());
    expect(mutable).not.toHaveBeenCalled();
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining("state='cancelled'"), [
      school,
      jobId,
    ]);
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('SET import_id=NULL'), [
      school,
      examId,
    ]);
    expect(
      mock.query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM exam_items')),
    ).toBe(false);
  });
  it('rejects stale revisions and approved papers', async () => {
    setup();
    await expect(
      imports.cancel(req(), jobId, { revision: 2, reason: 'Wrong file' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    vi.mocked(authoring.owned).mockResolvedValue({ ...e, state: 'approved' });
    await expect(
      imports.cancel(req(), jobId, { revision: 3, reason: 'Wrong file' }, randomUUID()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(
      mock.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE import_jobs')),
    ).toBe(false);
  });
  it('does not replace draft content after a parsing lease has been cancelled', async () => {
    const bytes = readFileSync(resolve('../public/templates/nexora-questions.xlsx'));
    vi.spyOn(authoring, 'owned').mockResolvedValue({ ...e, import_id: null });
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT ((SELECT count(*)'))
        return { rows: [{ count: '0' }], rowCount: 1 };
      if (sql.startsWith('SELECT j.id,j.exam_id,j.source_bytes'))
        return {
          rows: [
            {
              id: jobId,
              exam_id: examId,
              source_bytes: bytes,
              generation_request: null,
              owner_id: teacher,
              subject_name: 'Math',
              class_name: 'Grade 10',
              language: 'en',
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    });
    await new ImportWorkerService(db, authoring, new QuestionAiService()).run(school);
    expect(authoring.owned).toHaveBeenCalled();
    expect(
      mock.query.mock.calls.some(
        ([sql]) =>
          String(sql).startsWith('DELETE FROM exam_items') ||
          String(sql).startsWith('INSERT INTO exam_items'),
      ),
    ).toBe(false);
  });
});
describe('school-wide numbering', () => {
  it('formats minimum four digits, keeps school prefix and never wraps after 9999', () => {
    expect(studentLoginId('nexora-school', 1)).toBe('NEXORA-SCHOOL-STU-0001');
    expect(studentLoginId('nexora-school', 1001)).toBe('NEXORA-SCHOOL-STU-1001');
    expect(studentLoginId('nexora-school', 10000)).toBe('NEXORA-SCHOOL-STU-10000');
  });
  it('allocates after existing IDs and retains the high-water mark across batches', async () => {
    let counter = 1000;
    mock.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes(' highest')) return { rows: [{ highest: '1000' }] };
      if (sql.startsWith('UPDATE school_student_counters')) {
        counter += Number(params[1]);
        return { rows: [{ last_number: counter }] };
      }
      return { rows: [] };
    });
    // Pass the real transaction callback's typed client through the database abstraction.
    const first = await db.withTenantTransaction(school, (c) =>
      allocateStudentNumbers(c, school, 2),
    );
    const second = await db.withTenantTransaction(school, (c) =>
      allocateStudentNumbers(c, school, 3),
    );
    expect(first).toBe(1001);
    expect(second).toBe(1003);
    expect(counter).toBe(1005);
  });
});
describe('directory removal', () => {
  it('preserves assignments used by exams through their logical teacher/class/subject link', async () => {
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM teacher_assignments'))
        return { rows: [{ revision: 1 }], rowCount: 1 };
      if (sql.includes('JOIN teacher_assignments a'))
        return { rows: [{ id: examId }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(
      directory.remove(
        req('school_admin'),
        'teacher-assignments',
        randomUUID(),
        { revision: 1, reason: 'Cleanup', confirmed: true },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(mock.query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });
  it('deletes an unused record but archives referenced records', async () => {
    let used = false;
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM classes'))
        return { rows: [{ revision: 1, name: 'Grade 1' }], rowCount: 1 };
      if (sql.includes('FROM pg_constraint'))
        return { rows: [{ check_sql: 'SELECT retained reference' }], rowCount: 1 };
      if (sql === 'SELECT retained reference')
        return { rows: used ? [{ id: 'history' }] : [], rowCount: used ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    });
    const id = randomUUID();
    const body = { revision: 1, reason: 'Cleanup', confirmed: true };
    await expect(
      directory.remove(req('school_admin'), 'classes', id, body, randomUUID()),
    ).resolves.toMatchObject({ outcome: 'deleted' });
    used = true;
    await expect(
      directory.remove(req('school_admin'), 'classes', id, body, randomUUID()),
    ).resolves.toMatchObject({ outcome: 'archived' });
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('SET active=false'), [
      school,
      id,
    ]);
  });
  it('denies teachers and stale revisions before removal', async () => {
    await expect(
      directory.remove(
        req(),
        'students',
        randomUUID(),
        { revision: 1, reason: 'Cleanup', confirmed: true },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mock.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('SELECT * FROM users') ? [{ revision: 2 }] : [],
      rowCount: 1,
    }));
    await expect(
      directory.remove(
        req('school_admin'),
        'students',
        randomUUID(),
        { revision: 1, reason: 'Cleanup', confirmed: true },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(mock.query.mock.calls.some(([sql]) => String(sql).startsWith('DELETE'))).toBe(false);
  });
  it('fails closed if a retained-reference inspection is denied', async () => {
    mock.query.mockRejectedValue(new Error('permission denied'));
    await expect(
      db.withTenantTransaction(school, (c) =>
        hasRetainedReferences(c, 'users', school, randomUUID()),
      ),
    ).rejects.toThrow('permission denied');
  });
});
