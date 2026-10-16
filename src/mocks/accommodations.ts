import { z } from 'zod';
import { accommodationChangeSchema } from '@/features/exams/admin/accommodation-schemas';
import type { AuthoringStore, DemoSitting } from './authoring-store';
import { practiceAccess } from './practice';

export function accommodationRoster(s: DemoSitting) {
  return (
    s.accommodations ?? [
      {
        studentId: 'demo-student',
        loginId: 'DEMO-STUDENT',
        studentName: 'Samira',
        extraMinutes: 0,
        deadlineAt: s.session.endsAt,
        lastChange: null,
      },
    ]
  ).map((student) => ({
    ...student,
    deadlineAt: new Date(Date.parse(s.session.endsAt) + student.extraMinutes * 60000).toISOString(),
  }));
}
export function latestDeadline(s: DemoSitting) {
  return Math.max(
    Date.parse(s.session.endsAt),
    ...accommodationRoster(s).map((r) => Date.parse(r.deadlineAt)),
  );
}
export function createAccommodationDemo(store: AuthoringStore, clock: () => number = Date.now) {
  const replays = new Map<string, { body: string; result: unknown }>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  const fail = (message: string, code = 'REVISION_CONFLICT', status = 409) =>
    json({ code, message, details: [], requestId: 'demo-accommodations' }, status);
  function editable(s: DemoSitting) {
    const approved = store.approved.get(s.session.examId);
    const practice = practiceAccess(store, s.session.examId, clock);
    return (
      approved?.version === s.session.approvedVersion &&
      clock() < Date.parse(s.session.preparationVisibleAt) &&
      !store.resultAttempts.has(s.session.sessionId) &&
      !practice?.enabled &&
      !practice?.contentReleasedAt
    );
  }
  function session(s: DemoSitting) {
    return {
      ...s.session,
      canReschedule: editable(s),
      title: s.title,
      latestDeadlineAt: new Date(latestDeadline(s)).toISOString(),
      canEdit: editable(s),
    };
  }
  return async (url: URL, method: string, body: unknown, headers: Headers) => {
    const match = /\/(?:admin\/)?sessions\/([^/]+)\/accommodations$/.exec(url.pathname);
    const s = store.sessions.get(match?.[1] ?? '');
    if (!s) return fail('Sitting not found.', 'NOT_FOUND', 404);
    if (method === 'GET' && url.pathname.includes('/admin/')) {
      const cursor = url.searchParams.get('cursor');
      const offset = cursor ? Number(cursor.split(':')[1]) : 0;
      if (
        cursor &&
        (!/^\d+:\d+$/.test(cursor) ||
          Number(cursor.split(':')[0]) !== s.session.scheduleRevision ||
          !Number.isSafeInteger(offset))
      )
        return fail('Roster changed. Return to the first page.');
      const rows = accommodationRoster(s);
      return json({
        session: session(s),
        items: rows.slice(offset, offset + 25),
        nextCursor:
          offset + 25 < rows.length ? `${s.session.scheduleRevision}:${offset + 25}` : null,
        serverNow: new Date(clock()).toISOString(),
      });
    }
    if (method !== 'PATCH' || url.pathname.includes('/admin/'))
      return fail('Endpoint not found.', 'NOT_FOUND', 404);
    const key = headers.get('Idempotency-Key');
    if (!z.uuid().safeParse(key).success)
      return fail('A request key is required.', 'VALIDATION_ERROR', 422);
    const replayKey = `${s.session.sessionId}:${key}`;
    const serialized = JSON.stringify(body);
    const previous = replays.get(replayKey);
    if (previous)
      return previous.body === serialized
        ? json(previous.result)
        : fail('Request key was reused with different content.');
    const input = accommodationChangeSchema.safeParse(body);
    if (!input.success)
      return fail('Enter whole extra minutes from 0 to 480 and a reason.', 'VALIDATION_ERROR', 422);
    const v = input.data;
    if (v.scheduleRevision !== s.session.scheduleRevision)
      return fail('The schedule changed. Refresh before editing.');
    if (!editable(s))
      return fail(
        'Extra time is locked once preparation opens or delivery/practice has begun.',
        'ACCOMMODATIONS_LOCKED',
      );
    const rows = accommodationRoster(s);
    const student = rows.find((r) => r.studentId === v.studentId);
    if (!student) return fail('Student is not in the frozen roster.', 'NOT_FOUND', 404);
    const oldMinutes = student.extraMinutes;
    if (oldMinutes === v.extraMinutes)
      return fail('Choose a different extra-time allowance.', 'VALIDATION_ERROR', 422);
    student.extraMinutes = v.extraMinutes;
    student.deadlineAt = new Date(
      Date.parse(s.session.endsAt) + v.extraMinutes * 60000,
    ).toISOString();
    const updated = { ...s, accommodations: rows };
    if (latestDeadline(updated) > Date.parse(s.session.resultsReleaseAt))
      return fail(
        'Move planned results to at or after the extended deadline using Change schedule first.',
        'RESULTS_TIME_CONFLICT',
      );
    if (
      [...store.sessions.values()].some(
        (other) =>
          other !== s &&
          other.session.examId === s.session.examId &&
          Date.parse(s.session.preparationVisibleAt) < latestDeadline(other) &&
          latestDeadline(updated) > Date.parse(other.session.preparationVisibleAt),
      )
    )
      return fail('The extended deadline overlaps another sitting.', 'SCHEDULE_OVERLAP');
    student.lastChange = {
      auditId: crypto.randomUUID(),
      actorName: 'Hana',
      at: new Date(clock()).toISOString(),
      reason: v.reason,
      previousExtraMinutes: oldMinutes,
      extraMinutes: v.extraMinutes,
    };
    s.accommodations = rows;
    s.session.latestDeadlineAt = new Date(latestDeadline(s)).toISOString();
    s.session.scheduleRevision++;
    const draft = store.drafts.get(s.session.examId);
    if (draft) draft.revision++;
    const history = store.history.get(s.session.examId) ?? [];
    history.push({
      action: 'accommodation_changed',
      actorName: 'Hana',
      at: student.lastChange.at,
      comment: `${student.loginId}: ${oldMinutes} → ${v.extraMinutes} extra minutes. ${v.reason}`,
      revision: draft?.revision ?? s.session.scheduleRevision,
    });
    store.history.set(s.session.examId, history);
    const result = { session: session(s), student, serverNow: new Date(clock()).toISOString() };
    replays.set(replayKey, { body: serialized, result: structuredClone(result) });
    return json(result);
  };
}
