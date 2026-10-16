import { z } from 'zod';
import type { Readiness } from '@/features/exams/readiness';
import type { Attempt, Exam } from '@/features/exams/schemas';
import {
  transferRequestSchema,
  type MonitorRow,
  type MonitorSitting,
  type TransferEvent,
  type TransferResponse,
} from '@/features/exams/monitor/schemas';

export function createMonitorDemo(
  source: {
    exams: () => Exam[];
    attempt: (sessionId: string) => Attempt | undefined;
    contact: (attemptId: string) => string | null;
    readiness: (attemptId: string) => Readiness | null;
    enrolled: (deviceId: string) => boolean;
    boundDevice: (attemptId: string) => string | undefined;
    replace: (attempt: Attempt, deviceId: string) => void;
  },
  clock: () => number,
) {
  const history = new Map<string, TransferEvent[]>();
  const replays = new Map<string, { body: string; result: TransferResponse }>();
  const now = () => new Date(clock()).toISOString();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  const error = (code: string, message: string, status = 409) =>
    json({ code, message, details: [], requestId: 'demo-monitor' }, status);
  function row(exam: Exam): MonitorRow {
    const a = source.attempt(exam.sessionId);
    const deadlineAt = a?.deadlineAt ?? exam.deadlineAt;
    const status = !a
      ? 'not_started'
      : a.receipt
        ? 'submitted'
        : a.state === 'invalidated'
          ? 'invalidated'
          : ['awaiting_upload', 'recovery_pending'].includes(a.state) ||
              clock() >= Date.parse(deadlineAt)
            ? 'recovery_needed'
            : a.state === 'active'
              ? 'active'
              : 'preparing';
    return {
      studentId: 'demo-student',
      loginId: 'DEMO-STUDENT',
      studentName: 'Samira',
      deadlineAt,
      status,
      attempt: a
        ? {
            attemptId: a.attemptId,
            readiness: source.readiness(a.attemptId),
            state: a.state,
            deviceGeneration: a.deviceGeneration,
            lastContactAt: source.contact(a.attemptId),
            lastServerSaveAt: a.lastServerSaveAt,
            serverAnsweredCount: a.answers.filter((v) => v.value !== null).length,
            receiptAcceptedAt: a.receipt?.acceptedAt ?? null,
            recoveryId: a.recovery?.recoveryId ?? null,
          }
        : null,
    };
  }
  function sitting(exam: Exam): MonitorSitting {
    const student = row(exam);
    return {
      sessionId: exam.sessionId,
      examId: exam.examId,
      title: exam.title,
      className: exam.className,
      subjectName: exam.subjectName,
      preparationVisibleAt: exam.preparationVisibleAt,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      latestDeadlineAt: student.deadlineAt,
      scheduleRevision: exam.scheduleRevision,
      rosterCount: 1,
      readyCount: student.status === 'preparing' && student.attempt?.readiness ? 1 : 0,
      counts: {
        not_started: 0,
        preparing: 0,
        active: 0,
        submitted: 0,
        recovery_needed: 0,
        invalidated: 0,
        [student.status]: 1,
      },
    };
  }
  return (url: URL, method: string, body: unknown, headers: Headers, actorId: string) => {
    const path = url.pathname.replace(/^\/api\/v1/, '');
    // The legacy completed/review student cards have no real attempt fixture.
    // Do not manufacture receipts or monitoring facts for those cards.
    const exams = source
      .exams()
      .filter((e) => !e.attemptId || source.attempt(e.sessionId))
      .sort(
        (a, b) => b.startsAt.localeCompare(a.startsAt) || a.sessionId.localeCompare(b.sessionId),
      );
    const match = /^\/attempts\/([^/]+)\/device-transfer$/.exec(path);
    if (match && method === 'POST') {
      const exam = exams.find((e) => source.attempt(e.sessionId)?.attemptId === match[1]);
      const attempt = exam && source.attempt(exam.sessionId);
      if (!attempt) return error('NOT_FOUND', 'Attempt unavailable.', 404);
      const parsed = transferRequestSchema.safeParse(body);
      const key = headers.get('Idempotency-Key');
      if (!parsed.success || !z.uuid().safeParse(key).success)
        return error(
          'VALIDATION_ERROR',
          'A registered device ID, generation, reason and idempotency key are required.',
          422,
        );
      const input = parsed.data;
      const fingerprint = JSON.stringify(input);
      const replayKey = `${actorId}:${attempt.attemptId}:${key}`;
      const old = replays.get(replayKey);
      if (old)
        return old.body === fingerprint
          ? json(old.result)
          : error('REVISION_CONFLICT', 'This request key already has different content.');
      if (attempt.deviceGeneration !== input.expectedDeviceGeneration)
        return error(
          'REVISION_CONFLICT',
          'Device generation changed. Refresh the attempt and check transfer history.',
        );
      if (attempt.deviceGeneration >= Number.MAX_SAFE_INTEGER)
        return error('REVISION_CONFLICT', 'Device generation limit reached.');
      if (attempt.receipt || !['preparing', 'active'].includes(attempt.state))
        return error('ALREADY_FINALIZED', 'This attempt cannot be transferred.');
      if (clock() >= Date.parse(attempt.deadlineAt))
        return error('RECOVERY_REQUIRED', 'The original deadline has passed. Use recovery review.');
      if (!source.enrolled(input.newDeviceId))
        return error(
          'VALIDATION_ERROR',
          'The replacement browser must be registered by this student.',
          422,
        );
      if (source.boundDevice(attempt.attemptId) === input.newDeviceId)
        return error('REVISION_CONFLICT', 'This is already the active browser.');
      const fromGeneration = attempt.deviceGeneration;
      source.replace(attempt, input.newDeviceId);
      const event: TransferEvent = {
        transferId: crypto.randomUUID(),
        actorId,
        actorName: 'Hana',
        reason: input.reason,
        transferredAt: now(),
        fromGeneration,
        toGeneration: attempt.deviceGeneration,
      };
      history.set(attempt.attemptId, [event, ...(history.get(attempt.attemptId) ?? [])]);
      const result: TransferResponse = {
        transferId: event.transferId,
        attemptId: attempt.attemptId,
        deviceGeneration: attempt.deviceGeneration,
        state: 'preparing',
        deadlineAt: attempt.deadlineAt,
        transferredAt: event.transferredAt,
      };
      replays.set(replayKey, { body: fingerprint, result });
      return json(result);
    }
    if (method !== 'GET') return error('NOT_FOUND', 'Monitor endpoint unavailable.', 404);
    const limit = Number(url.searchParams.get('limit') ?? 25);
    const cursor = url.searchParams.get('cursor');
    // Deterministic scope-bound cursors for this single-school simulator only.
    let offset = 0;
    if (cursor) {
      const parts = cursor.split('|');
      offset = Number(parts[1]);
      if (parts[0] !== path || !Number.isSafeInteger(offset) || offset < 1)
        return error('VALIDATION_ERROR', 'Invalid cursor.', 422);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      return error('VALIDATION_ERROR', 'Invalid limit.', 422);
    function page<T>(items: T[]) {
      return {
        items: items.slice(offset, offset + limit),
        nextCursor: offset + limit < items.length ? `${path}|${offset + limit}` : null,
      };
    }
    if (path === '/admin/monitor/sessions')
      return json({ ...page(exams.map(sitting)), serverNow: now() });
    const detail = /^\/admin\/monitor\/(sessions|attempts)\/([^/]+)$/.exec(path);
    const exam =
      detail &&
      exams.find((e) =>
        detail[1] === 'sessions'
          ? e.sessionId === detail[2]
          : source.attempt(e.sessionId)?.attemptId === detail[2],
      );
    if (!exam) return error('NOT_FOUND', 'Sitting or attempt unavailable.', 404);
    const student = row(exam);
    if (detail?.[1] === 'sessions') {
      const p = page([student]);
      return json({
        sitting: sitting(exam),
        rows: p.items,
        nextCursor: p.nextCursor,
        serverNow: now(),
      });
    }
    const a = source.attempt(exam.sessionId);
    const p = page(a ? (history.get(a.attemptId) ?? []) : []);
    return json({
      sitting: sitting(exam),
      student,
      history: p.items,
      nextCursor: p.nextCursor,
      serverNow: now(),
      transferBlocker: !a
        ? 'no_attempt'
        : a.receipt || !['preparing', 'active'].includes(a.state)
          ? 'closed'
          : clock() >= Date.parse(a.deadlineAt)
            ? 'deadline_passed'
            : null,
    });
  };
}
