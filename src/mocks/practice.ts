import { latestDeadline } from './accommodations';
import { z } from 'zod';
import type { Role } from '@/features/auth/schemas';
import {
  practiceSettingsSchema,
  practiceAnswerSchema,
  type PracticeAccess,
  type PracticeAttempt,
} from '@/features/practice/schemas';
import type { AuthoringStore } from './authoring-store';

export function practiceBest(store: AuthoringStore, examId: string, examVersion: number) {
  const completed = [...store.practiceAttempts.values()].filter(
    (r) =>
      r.valid &&
      r.studentId === 'demo-student' &&
      r.attempt.examId === examId &&
      r.attempt.examVersion === examVersion &&
      r.attempt.state === 'completed',
  );
  return {
    bestPercent: completed.length
      ? Math.max(...completed.map((r) => r.attempt.percent ?? 0))
      : null,
    completedCount: completed.length,
  };
}
export function practiceAccess(
  store: AuthoringStore,
  examId: string,
  clock = Date.now,
): PracticeAccess | null {
  const approved = store.approved.get(examId);
  if (!approved) return null;
  const data = store.practiceAccess.get(examId) ?? {
    examId,
    examVersion: approved.version,
    title: approved.draft.title,
    revision: 1,
    enabled: false,
    releaseAt: null,
    available: false,
    blockers: [],
    contentReleasedAt: null,
    serverNow: new Date(clock()).toISOString(),
    history: [],
  };
  const sessions = [...store.sessions.values()].filter(
    (s) => s.session.examId === examId && s.session.approvedVersion === approved.version,
  );
  const blockers: string[] = [];
  if (!data.enabled) blockers.push('Your administrator has not enabled practice.');
  if (!data.releaseAt || Date.parse(data.releaseAt) > clock())
    blockers.push('The practice release time has not arrived.');
  if (!sessions.length) blockers.push('This paper has no scheduled cohort.');
  if (
    sessions.some(
      (s) =>
        clock() <=
        Math.max(
          latestDeadline(s) + 5000,
          Date.parse(
            store.resultAttempts.get(s.session.sessionId)?.attempt.finalAcceptUntil ??
              s.session.endsAt,
          ),
        ),
    )
  )
    blockers.push(
      'All related sittings, including extra-time submission windows, must close first.',
    );
  if (
    sessions.some(
      (s) =>
        !store.publications
          .get(s.session.sessionId)
          ?.some(
            (p) => p.summary.publication && Date.parse(p.summary.publication.releaseAt) <= clock(),
          ),
    )
  )
    blockers.push('Official results must be approved and released for every related cohort.');
  const result = {
    ...data,
    available: blockers.length === 0,
    blockers,
    serverNow: new Date(clock()).toISOString(),
  };
  if (result.available && !result.contentReleasedAt) result.contentReleasedAt = result.serverNow;
  store.practiceAccess.set(examId, result);
  return structuredClone(result);
}

export function createPracticeDemo(store: AuthoringStore, clock = Date.now) {
  const replays = new Map<string, { payload: string; response: unknown }>();
  const now = () => new Date(clock()).toISOString();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  const error = (code: string, message: string, status = 409) =>
    json({ code, message, details: [], requestId: 'demo-practice' }, status);
  const enrolled = (id: string) =>
    [...store.sessions.values()].some((s) => s.session.examId === id && s.session.rosterCount > 0);
  function summary(id: string) {
    const access = practiceAccess(store, id, clock);
    if (!access) return null;
    return {
      examId: id,
      examVersion: access.examVersion,
      title: access.title,
      available: access.available,
      blockers: access.blockers,
      releaseAt: access.releaseAt,
      ...practiceBest(store, id, access.examVersion),
      activeAttemptId:
        [...store.practiceAttempts.values()]
          .filter(
            (r) =>
              r.valid &&
              r.studentId === 'demo-student' &&
              r.attempt.examId === id &&
              r.attempt.examVersion === access.examVersion &&
              r.attempt.state === 'active',
          )
          .at(-1)?.attempt.practiceAttemptId ?? null,
    };
  }
  function view(attempt: PracticeAttempt) {
    return {
      ...structuredClone(attempt),
      bestPercent: practiceBest(store, attempt.examId, attempt.examVersion).bestPercent,
      serverNow: now(),
    };
  }
  return (url: URL, method: string, body: unknown, headers: Headers, role: Role) => {
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const admin = path.startsWith('/admin/') || path.endsWith('/practice-access');
    if ((admin && role !== 'school_admin') || (!admin && role !== 'student'))
      return error('FORBIDDEN', 'This practice operation is not available to your role.', 403);
    if ((path === '/admin/practice-exams' || path === '/me/practice') && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0
      )
        return error('VALIDATION_ERROR', 'Invalid page.', 422);
      const ids = [...store.approved.keys()].filter((id) => admin || enrolled(id));
      return json({
        items: ids
          .slice(offset, offset + limit)
          .map((id) => (admin ? practiceAccess(store, id, clock) : summary(id))),
        nextCursor: offset + limit < ids.length ? String(offset + limit) : null,
        serverNow: now(),
      });
    }
    const exam = /^\/exams\/([^/]+)\/(practice-access|practice-attempts)$/.exec(path);
    const match = /^\/practice-attempts\/([^/]+)(?:\/(answers|complete))?$/.exec(path);
    const record = match?.[1] ? store.practiceAttempts.get(match[1]) : undefined;
    const id = exam?.[1] ?? record?.attempt.examId;
    if (
      !id ||
      (!admin && !enrolled(id)) ||
      (match && (!record || !record.valid || record.studentId !== 'demo-student'))
    )
      return error('NOT_FOUND', 'Practice paper or attempt not found.', 404);
    const access = practiceAccess(store, id, clock);
    const approved = store.approved.get(id);
    if (!access || !approved) return error('NOT_FOUND', 'Approved paper not found.', 404);
    if (method === 'GET' && admin) return json(access);
    if (!admin && !access.available)
      return error('PRACTICE_NOT_RELEASED', access.blockers.join(' '));
    if (method === 'GET' && record && !match?.[2]) return json(view(record.attempt));
    if (method !== 'POST') return error('NOT_FOUND', 'Practice endpoint not found.', 404);
    const key = headers.get('Idempotency-Key');
    if (!key || !z.uuid().safeParse(key).success)
      return error('VALIDATION_ERROR', 'A retained request key is required.', 422);
    const payload = JSON.stringify(body);
    const replayKey = `${role}:${path}:${key}`;
    const replay = replays.get(replayKey);
    if (replay)
      return replay.payload === payload
        ? json(replay.response)
        : error('REVISION_CONFLICT', 'This request key was used for different content.');
    const commit = (response: unknown) => {
      replays.set(replayKey, { payload, response: structuredClone(response) });
      return json(response);
    };
    if (admin) {
      const parsed = practiceSettingsSchema.safeParse(body);
      if (!parsed.success)
        return error('VALIDATION_ERROR', 'Check the version, release time and reason.', 422);
      const input = parsed.data;
      if (input.revision !== access.revision || input.examVersion !== approved.version)
        return error('REVISION_CONFLICT', 'Practice settings changed. Refresh before saving.');
      store.practiceAccess.set(id, {
        ...access,
        enabled: input.enabled,
        releaseAt: input.releaseAt,
        revision: access.revision + 1,
        history: [
          ...access.history,
          {
            enabled: input.enabled,
            releaseAt: input.releaseAt,
            reason: input.reason,
            actorName: 'Hana',
            at: now(),
          },
        ],
      });
      return commit(practiceAccess(store, id, clock));
    }
    if (exam?.[2] === 'practice-attempts') {
      const input = z.object({ examVersion: z.number().int().positive() }).safeParse(body);
      if (!input.success || input.data.examVersion !== approved.version)
        return error('REVISION_CONFLICT', 'The approved paper version changed. Refresh practice.');
      const attempt: PracticeAttempt = {
        practiceAttemptId: crypto.randomUUID(),
        examId: id,
        examVersion: approved.version,
        title: approved.draft.title,
        instructions: approved.draft.instructions,
        state: 'active',
        items: approved.items.map(({ itemId, type, stem, marks, options }) => ({
          itemId,
          type,
          stem,
          marks,
          options: structuredClone(options),
          feedback: null,
        })),
        score: null,
        maxScore: approved.items.reduce((n, i) => n + i.marks, 0),
        percent: null,
        completedAt: null,
        bestPercent: practiceBest(store, id, approved.version).bestPercent,
        serverNow: now(),
      };
      store.practiceAttempts.set(attempt.practiceAttemptId, {
        studentId: 'demo-student',
        valid: true,
        attempt,
      });
      return commit(view(attempt));
    }
    if (!record) return error('NOT_FOUND', 'Practice attempt not found.', 404);
    const attempt = record.attempt;
    if (match?.[2] === 'answers') {
      const parsed = practiceAnswerSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', 'Choose one answer.', 422);
      const item = attempt.items.find((i) => i.itemId === parsed.data.itemId);
      const keyItem = approved.items.find((i) => i.itemId === parsed.data.itemId);
      if (!item || !keyItem || !item.options.some((o) => o.id === parsed.data.value))
        return error('VALIDATION_ERROR', 'Choose a valid option for this question.', 422);
      if (item.feedback)
        return item.feedback.chosenOptionId === parsed.data.value
          ? commit(view(attempt))
          : error(
              'ALREADY_ANSWERED',
              'Your first answer is already recorded. Start a new practice attempt to try again.',
            );
      if (attempt.state === 'completed')
        return error('ALREADY_FINALIZED', 'This practice attempt is complete.');
      const correct = parsed.data.value === keyItem.correctOptionId;
      item.feedback = {
        chosenOptionId: parsed.data.value,
        correctOptionId: keyItem.correctOptionId,
        correct,
        explanation: keyItem.explanation,
        earnedMarks: correct ? item.marks : 0,
      };
      return commit(view(attempt));
    }
    if (match?.[2] === 'complete') {
      if (attempt.items.some((i) => !i.feedback))
        return error('PRACTICE_INCOMPLETE', 'Answer every question before completing practice.');
      if (attempt.state !== 'completed') {
        attempt.score = attempt.items.reduce((n, i) => n + (i.feedback?.earnedMarks ?? 0), 0);
        attempt.percent = (attempt.score / attempt.maxScore) * 100;
        attempt.completedAt = now();
        attempt.state = 'completed';
      }
      return commit(view(attempt));
    }
    return error('NOT_FOUND', 'Practice endpoint not found.', 404);
  };
}
