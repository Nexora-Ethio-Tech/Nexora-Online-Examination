// @vitest-environment node
import { expect, it } from 'vitest';
import { ApiClient } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { createAuthoringStore } from '@/mocks/authoring-store';
import { authoringApi } from './authoring/api';
import { adminExamApi } from './admin/api';

function fixture() {
  const store = createAuthoringStore();
  for (let i = 0; i < 30; i++) {
    const id = `paper-${String(i).padStart(2, '0')}`;
    const at = new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
    store.drafts.set(id, {
      examId: id,
      createdAt: at,
      revision: 1,
      title: id,
      assignmentId: 'demo-math-10a',
      instructions: 'Answer all.',
      language: 'en',
      durationMinutes: 60,
      passPercent: 50,
      ordering: 'fixed',
      status: 'in_review',
      itemCount: 0,
      totalMarks: 0,
      reviewedCount: 0,
      importId: null,
      returnComment: null,
    });
    store.history.set(id, [
      { action: 'submitted', actorName: 'Teacher', at, comment: '', revision: 1 },
    ]);
  }
  return store;
}

it('keeps newest-first teacher ordering across pages and approved unscheduled papers active', async () => {
  const store = fixture();
  const draft = store.drafts.get('paper-29');
  if (!draft) throw new Error('Missing fixture');
  draft.status = 'approved';
  const api = authoringApi(
    new ApiClient('/api/v1', createDemoTransport('teacher', Date.now, store)),
  );
  const first = await api.list(null, undefined, 'active');
  const second = await api.list(first.nextCursor, undefined, 'active');
  expect(first.items).toHaveLength(25);
  expect(second.items).toHaveLength(5);
  expect(first.items[0]?.examId).toBe('paper-29');
  expect(second.items.at(-1)?.examId).toBe('paper-00');
  expect((await api.list(null, undefined, 'past')).items).toHaveLength(0);
  expect(
    (await api.list(null, undefined, 'active', 'approved')).items.map((d) => d.examId),
  ).toEqual(['paper-29']);
});

it('places resubmissions at their latest submission position in the FIFO queue across pages', async () => {
  const store = fixture();
  store.history.get('paper-00')?.push({
    action: 'submitted',
    actorName: 'Teacher',
    at: '2026-10-02T00:00:00.000Z',
    comment: 'Revised',
    revision: 2,
  });
  const api = adminExamApi(
    new ApiClient('/api/v1', createDemoTransport('school_admin', Date.now, store)),
  );
  const filters = { status: 'in_review' };
  const first = await api.list(null, undefined, filters);
  const second = await api.list(first.nextCursor, undefined, filters);
  expect(first.items).toHaveLength(25);
  expect(first.items[0]?.exam.examId).toBe('paper-01');
  expect(second.items.at(-1)?.exam.examId).toBe('paper-00');
  expect(new Set([...first.items, ...second.items].map((d) => d.exam.examId)).size).toBe(30);
  expect((await api.list(null, undefined, { status: 'returned' })).items).toHaveLength(0);
  expect(
    (await api.list(null, undefined, { ...filters, search: 'paper-12' })).items.map(
      (d) => d.exam.examId,
    ),
  ).toEqual(['paper-12']);
});
