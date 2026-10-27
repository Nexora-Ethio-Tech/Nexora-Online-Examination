import { accommodationRoster, latestDeadline } from './accommodations';
import { z } from 'zod';
import { practiceAccess } from './practice';
import {
  decisionSchema,
  scheduleSchema,
  rescheduleSchema,
  scheduleTimes,
  type AdminDetail,
} from '@/features/exams/admin/schemas';
import { reviewProblems } from '@/features/exams/authoring/schemas';
import type { AuthoringStore, DemoSitting } from './authoring-store';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string, code = 'REVISION_CONFLICT', status = 409) =>
  json({ code, message, details: [], requestId: 'demo-admin' }, status);
export function createAdminDemo(store: AuthoringStore, clock: () => number = Date.now) {
  const replays = new Map<string, { body: string; result: AdminDetail; status: number }>();
  function detail(id: string): AdminDetail | null {
    const exam = store.drafts.get(id);
    if (!exam || (exam.status === 'draft' && !store.history.has(id))) return null;
    const approved = store.approved.get(id);
    const assignment = store.directory.assignments.get(exam.assignmentId);
    return {
      exam: structuredClone(exam),
      grade: assignment ? (store.directory.classes.get(assignment.classId)?.grade ?? null) : null,
      submittedAt:
        store.history
          .get(id)
          ?.filter((h) => h.action === 'submitted')
          .at(-1)?.at ?? null,
      teacherName:
        store.directory.accounts.get(store.draftOwners.get(id) ?? 'demo-teacher')?.displayName ??
        'Dawit',
      subjectName: assignment
        ? (store.directory.subjects.get(assignment.subjectId)?.name ?? 'Mathematics')
        : 'Mathematics',
      className: assignment
        ? (store.directory.classes.get(assignment.classId)?.name ?? 'Grade 10 A')
        : 'Grade 10 A',
      approvedVersion: approved?.version ?? null,
      packageState: approved ? 'ready' : 'not_requested',
      packageError: null,
      items: structuredClone(approved?.items ?? store.papers.get(id) ?? []),
      serverNow: new Date(clock()).toISOString(),
      sessions: [...store.sessions.values()]
        .filter((s) => s.session.examId === id)
        .map((s) => ({
          ...s.session,
          latestDeadlineAt: new Date(latestDeadline(s)).toISOString(),
          canReschedule: clock() < Date.parse(s.session.preparationVisibleAt),
        })),
      history: structuredClone(store.history.get(id) ?? []),
    };
  }
  return async (
    path: string,
    method: string,
    body: unknown,
    headers: Headers,
    filters = new URLSearchParams(),
  ): Promise<Response> => {
    if (method === 'GET' && path === '/admin/exams') {
      const items = [...store.drafts.keys()]
        .reverse()
        .flatMap((id) => {
          const d = detail(id);
          if (!d) return [];
          if (filters.get('status') && d.exam.status !== filters.get('status')) return [];
          const assignment = d.exam.assignmentId
            ? store.directory.assignments.get(d.exam.assignmentId)
            : null;
          if (filters.get('classId') && assignment?.classId !== filters.get('classId')) return [];
          if (filters.get('grade') && (d.grade ?? 'unclassified') !== filters.get('grade'))
            return [];
          if (
            !d.teacherName.toLowerCase().includes((filters.get('teacher') ?? '').toLowerCase()) ||
            !d.subjectName.toLowerCase().includes((filters.get('subject') ?? '').toLowerCase())
          )
            return [];
          if (
            ![
              d.exam.title,
              d.teacherName,
              d.subjectName,
              d.className,
              assignment ? (store.directory.subjects.get(assignment.subjectId)?.code ?? '') : '',
            ].some((v) => v.toLowerCase().includes((filters.get('search') ?? '').toLowerCase()))
          )
            return [];
          if (
            filters.get('from') &&
            (!d.submittedAt || d.submittedAt < (filters.get('from') ?? ''))
          )
            return [];
          if (filters.get('to') && (!d.submittedAt || d.submittedAt > (filters.get('to') ?? '')))
            return [];
          return [d];
        })
        .sort((a, b) =>
          filters.get('status') === 'in_review'
            ? (a.submittedAt ?? '9999').localeCompare(b.submittedAt ?? '9999') ||
              a.exam.examId.localeCompare(b.exam.examId)
            : (b.exam.createdAt ?? '').localeCompare(a.exam.createdAt ?? '') ||
              b.exam.examId.localeCompare(a.exam.examId),
        );
      const offset = Number(filters.get('cursor') ?? 0),
        limit = Number(filters.get('limit') ?? 25);
      return json({
        items: items.slice(offset, offset + limit),
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
        serverNow: new Date(clock()).toISOString(),
      });
    }
    if (method === 'GET' && path.startsWith('/admin/exams/')) {
      const d = detail(path.slice('/admin/exams/'.length));
      return d ? json(d) : fail('Exam not found.', 'NOT_FOUND', 404);
    }
    const match = /^\/exams\/([^/]+)\/(approve|return|sessions|package-retry)$/.exec(path);
    const scheduleMatch = /^\/sessions\/([^/]+)\/schedule$/.exec(path);
    const sitting = scheduleMatch ? store.sessions.get(scheduleMatch[1] ?? '') : undefined;
    const id = match?.[1] ?? sitting?.session.examId ?? '';
    const d = detail(id);
    const exam = store.drafts.get(id);
    if (!d || !exam) return fail('Exam not found.', 'NOT_FOUND', 404);
    if (
      (match && method !== 'POST') ||
      (scheduleMatch && method !== 'PATCH') ||
      (!match && !scheduleMatch)
    )
      return fail('Endpoint not found.', 'NOT_FOUND', 404);
    if (!z.uuid().safeParse(headers.get('Idempotency-Key')).success)
      return fail('A request key is required.', 'VALIDATION_ERROR', 422);
    const key = `${path}:${headers.get('Idempotency-Key')}`;
    const serialized = JSON.stringify(body);
    const old = replays.get(key);
    if (old)
      return old.body === serialized
        ? json(old.result, old.status)
        : fail('Request key was reused with different content.');
    function audit(action: AdminDetail['history'][number]['action'], comment: string) {
      const history = store.history.get(id) ?? [];
      history.push({
        action,
        comment,
        actorName: 'Hana',
        at: new Date(clock()).toISOString(),
        revision: exam?.revision ?? 1,
      });
      store.history.set(id, history);
    }
    function commit(status = 200) {
      const result = detail(id);
      if (!result) return fail('Exam not found.', 'NOT_FOUND', 404);
      replays.set(key, { body: serialized, result: structuredClone(result), status });
      return json(result, status);
    }
    if (match?.[2] === 'approve' || match?.[2] === 'return') {
      const parsed = decisionSchema.safeParse(body);
      if (!parsed.success || (match[2] === 'return' && !parsed.data.comment.trim()))
        return fail('Enter corrections when returning a paper.', 'VALIDATION_ERROR', 422);
      if (exam.status !== 'in_review' || parsed.data.revision !== exam.revision)
        return fail('This paper changed. Reload before deciding.');
      if (match[2] === 'approve') {
        const items = store.papers.get(id) ?? [];
        if (!items.length || reviewProblems(items).length)
          return fail('All questions must be reviewed.', 'AI_REVIEW_REQUIRED');
        exam.status = 'approved';
        exam.revision++;
        store.approved.set(id, {
          version: 1,
          items: structuredClone(items),
          draft: structuredClone(exam),
        });
        audit('approved', parsed.data.comment);
      } else {
        exam.status = 'returned';
        exam.returnComment = parsed.data.comment;
        exam.revision++;
        audit('returned', parsed.data.comment);
      }
      return commit();
    }
    const approved = store.approved.get(id);
    if (exam.status !== 'approved' || !approved)
      return fail('Approve the paper before scheduling.');
    if (match?.[2] === 'package-retry') return fail('No failed package job exists.');
    const practice = practiceAccess(store, id, clock);
    if (practice?.contentReleasedAt)
      return fail(
        'This paper was released for practice and cannot be used for another official sitting.',
      );
    if (practice?.enabled)
      return fail('Disable scheduled practice before changing official sittings.');
    const create = match?.[2] === 'sessions';
    if (create) {
      const roster = [...store.directory.accounts.values()].filter(
        (a) => a.role === 'student' && a.status === 'active' && a.classId === 'demo-class-10a',
      );
      // Delivery/results fixtures have one learner; never pretend a new roster was scheduled.
      if (
        exam.assignmentId !== 'demo-math-10a' ||
        roster.length !== 1 ||
        roster[0]?.userId !== 'demo-student'
      )
        return fail(
          'This demo can schedule only the original Grade 10 A Mathematics assignment with Samira as its sole active student. School setup is simulated separately; full roster delivery requires the real backend.',
          'DEMO_FIXTURE_LIMIT',
          409,
        );
    }
    const input = create ? scheduleSchema.safeParse(body) : rescheduleSchema.safeParse(body);
    if (!input.success) return fail('Check the schedule fields.', 'VALIDATION_ERROR', 422);
    if (create) {
      const v = scheduleSchema.parse(body);
      if (v.revision !== exam.revision || v.approvedVersion !== approved.version)
        return fail('This paper changed. Reload before scheduling.');
    } else {
      const v = rescheduleSchema.parse(body);
      if (
        !sitting ||
        store.resultAttempts.has(sitting.session.sessionId) ||
        sitting.session.scheduleRevision !== v.scheduleRevision ||
        clock() >= Date.parse(sitting.session.preparationVisibleAt)
      )
        return fail('Preparation has opened or this schedule changed. It cannot be edited.');
    }
    const v = input.data;
    const start = Date.parse(v.preparationVisibleAt);
    const times = scheduleTimes(
      v.preparationVisibleAt,
      approved.draft.durationMinutes,
      v.preparationMinutes ??
        (sitting
          ? (Date.parse(sitting.session.startsAt) -
              Date.parse(sitting.session.preparationVisibleAt)) /
            60000
          : 10),
    );
    const extraMs = sitting ? latestDeadline(sitting) - Date.parse(sitting.session.endsAt) : 0;
    const proposedDeadline = Date.parse(times.endsAt) + extraMs;
    if (start <= clock() || Date.parse(v.resultsReleaseAt) < proposedDeadline)
      return fail(
        'Preparation must be in the future and planned results cannot precede the end.',
        'VALIDATION_ERROR',
        422,
      );
    const overlap = [...store.sessions.values()].some(
      (s) =>
        s.session.examId === id &&
        s !== sitting &&
        start < latestDeadline(s) &&
        proposedDeadline > Date.parse(s.session.preparationVisibleAt),
    );
    if (overlap) return fail('This paper already has an overlapping sitting.');
    const session = {
      sessionId: sitting?.session.sessionId ?? crypto.randomUUID(),
      examId: id,
      approvedVersion: approved.version,
      scheduleRevision: (sitting?.session.scheduleRevision ?? 0) + 1,
      preparationVisibleAt: v.preparationVisibleAt,
      ...times,
      latestDeadlineAt: new Date(proposedDeadline).toISOString(),
      resultsReleaseAt: v.resultsReleaseAt,
      rosterCount: 1,
      canReschedule: true,
    };
    const linked: DemoSitting = {
      accommodations: sitting ? accommodationRoster(sitting) : undefined,
      session,
      title: approved.draft.title,
      durationMinutes: approved.draft.durationMinutes,
      shuffle: approved.draft.ordering === 'shuffle_questions_and_options',
      paper: {
        examVersion: approved.version,
        title: approved.draft.title,
        instructions: approved.draft.instructions,
        items: approved.items.map((i) => ({
          itemId: i.itemId,
          type: i.type,
          stem: i.stem,
          marks: i.marks,
          options: structuredClone(i.options),
        })),
      },
    };
    linked.accommodations = accommodationRoster(linked);
    store.sessions.set(session.sessionId, linked);
    exam.revision++;
    audit(
      create ? 'scheduled' : 'rescheduled',
      create ? 'Created sitting for frozen class roster.' : rescheduleSchema.parse(body).reason,
    );
    return commit(create ? 201 : 200);
  };
}
