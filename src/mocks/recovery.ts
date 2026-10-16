import { z } from 'zod';
import type { Attempt } from '@/features/exams/schemas';
import type { FinalBody, Paper } from '@/features/runner/schemas';
import { decisionRequestSchema, type RecoveryDetail } from '@/features/exams/recovery/schemas';
import type { AuthoringStore } from './authoring-store';

export function captureRecovery(
  store: AuthoringStore,
  attempt: Attempt,
  snapshot: FinalBody,
  reason: string,
  key: string,
  digest: string,
  paper: Paper,
) {
  if (!attempt.recovery) return;
  const detail: RecoveryDetail = {
    recoveryId: attempt.recovery.recoveryId,
    attemptId: attempt.attemptId,
    sessionId: attempt.sessionId,
    title: paper.title,
    className: 'Grade 10 A',
    studentName: 'Samira',
    loginId: 'DEMO-STUDENT',
    receivedAt: attempt.recovery.receivedAt,
    status: 'recovery_pending',
    serverNow: attempt.recovery.receivedAt,
    reason,
    deadlineAt: attempt.deadlineAt,
    finalAcceptUntil: attempt.finalAcceptUntil,
    snapshotDigest: digest,
    snapshot: structuredClone(snapshot),
    currentDeviceGeneration: attempt.deviceGeneration,
    latestTimelySave: {
      savedAt: attempt.lastServerSaveAt,
      highestAcceptedSeq: attempt.highestAcceptedSeq,
      answers: structuredClone(attempt.answers),
    },
    paper: structuredClone(paper),
    relatedUploads: [],
    canAccept: true,
    acceptanceBlocker: null,
    decision: null,
  };
  store.recoveries.set(detail.recoveryId, { detail, uploadKey: key });
}

export function createRecoveryDemo(
  store: AuthoringStore,
  resultRevision: (id: string) => number | null,
  clock = Date.now,
) {
  const replays = new Map<string, { payload: string; response: unknown }>();
  const now = () => new Date(clock()).toISOString();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  const error = (code: string, message: string, status = 409) =>
    json({ code, message, details: [], requestId: 'demo-recovery' }, status);
  function read(detail: RecoveryDetail): RecoveryDetail {
    const attempt = store.resultAttempts.get(detail.sessionId)?.attempt;
    const approved = store.approved.get(store.sessions.get(detail.sessionId)?.session.examId ?? '');
    const canAccept =
      detail.status === 'recovery_pending' &&
      !!attempt &&
      !attempt.receipt &&
      attempt.state !== 'invalidated' &&
      approved?.version === detail.snapshot.examVersion;
    return {
      ...structuredClone(detail),
      serverNow: now(),
      canAccept,
      acceptanceBlocker: canAccept
        ? null
        : detail.status !== 'recovery_pending'
          ? 'This upload already has a decision.'
          : 'A valid, unfinalized attempt and its approved paper are required.',
      relatedUploads: [...store.recoveries.values()]
        .filter(
          (r) =>
            r.detail.attemptId === detail.attemptId && r.detail.recoveryId !== detail.recoveryId,
        )
        .map((r) => summary(r.detail)),
    };
  }
  return (url: URL, method: string, body: unknown, headers: Headers) => {
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/admin/recovery' && method === 'GET') {
      const status = url.searchParams.get('status') ?? 'pending';
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      if (
        !['pending', 'all'].includes(status) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0
      )
        return error('VALIDATION_ERROR', 'Invalid recovery list filter.', 422);
      const rows = [...store.recoveries.values()]
        .map((r) => r.detail)
        .filter((r) => status === 'all' || r.status === 'recovery_pending')
        .sort(
          (a, b) =>
            a.receivedAt.localeCompare(b.receivedAt) || a.recoveryId.localeCompare(b.recoveryId),
        );
      return json({
        items: rows.slice(offset, offset + limit).map(summary),
        nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
        serverNow: now(),
      });
    }
    const match = /^\/(?:admin\/recovery\/([^/]+)|recovery\/([^/]+)\/decision)$/.exec(path);
    const id = match?.[1] ?? match?.[2];
    const entry = id ? store.recoveries.get(id) : undefined;
    if (!entry) return error('NOT_FOUND', 'Recovery upload not found.', 404);
    if (match?.[1] && method === 'GET') return json(read(entry.detail));
    if (!match?.[2] || method !== 'POST') return error('NOT_FOUND', 'Endpoint not found.', 404);
    const parsed = decisionRequestSchema.safeParse(body);
    const key = headers.get('Idempotency-Key');
    if (!parsed.success || !key || !z.uuid().safeParse(key).success)
      return error('VALIDATION_ERROR', 'Choose a decision and enter its reason.', 422);
    const payload = JSON.stringify(parsed.data);
    const replayKey = `${id}:${key}`;
    const replay = replays.get(replayKey);
    if (replay)
      return replay.payload === payload
        ? json(replay.response)
        : error('REVISION_CONFLICT', 'This decision key was already used with different content.');
    const detail = entry.detail;
    const record = store.resultAttempts.get(detail.sessionId);
    if (detail.status !== 'recovery_pending')
      return error(
        'REVISION_CONFLICT',
        'Another administrator already decided this upload. Refresh the case.',
      );
    if (!record || record.attempt.attemptId !== detail.attemptId)
      return error('NOT_FOUND', 'Attempt not found.', 404);
    const attempt = record.attempt;
    const decision = parsed.data.decision;
    const decidedAt = now();
    if (decision === 'accept' && !read(detail).canAccept)
      return error(
        'ALREADY_FINALIZED',
        'This upload cannot replace an existing or invalidated result.',
      );
    resultRevision(detail.sessionId);
    detail.status = decision === 'accept' ? 'accepted' : 'rejected';
    if (decision === 'accept') {
      attempt.receipt = {
        status: 'submitted',
        receiptId: crypto.randomUUID(),
        acceptedAt: decidedAt,
        snapshotDigest: detail.snapshotDigest,
        idempotencyKey: entry.uploadKey,
        finalSeq: detail.snapshot.finalSeq,
      };
      attempt.state = 'submitted';
      record.answers = structuredClone(detail.snapshot.answers);
      for (const other of store.recoveries.values())
        if (
          other.detail.attemptId === detail.attemptId &&
          other.detail.status === 'recovery_pending'
        ) {
          other.detail.status = 'rejected';
          other.detail.decision = {
            decision: 'reject',
            reason: `Superseded by accepted recovery ${detail.recoveryId}.`,
            decidedAt,
            decidedBy: 'Hana',
            resultRevision: null,
          };
        }
    }
    const unresolved = [...store.recoveries.values()]
      .filter(
        (r) => r.detail.attemptId === detail.attemptId && r.detail.status === 'recovery_pending',
      )
      .at(-1)?.detail;
    if (!attempt.receipt) attempt.state = unresolved ? 'recovery_pending' : 'awaiting_upload';
    const active = decision === 'accept' ? detail : (unresolved ?? detail);
    attempt.recovery = {
      recoveryId: active.recoveryId,
      status: active.status,
      receivedAt: active.receivedAt,
    };
    const revision = resultRevision(detail.sessionId);
    detail.decision = {
      decision,
      reason: parsed.data.reason,
      decidedAt,
      decidedBy: 'Hana',
      resultRevision: decision === 'accept' ? revision : null,
    };
    const response = {
      recoveryId: detail.recoveryId,
      decision,
      decidedAt,
      resultRevision: detail.decision.resultRevision,
    };
    replays.set(replayKey, { payload, response: structuredClone(response) });
    return json(response);
  };
}
function summary(detail: RecoveryDetail) {
  const {
    recoveryId,
    attemptId,
    sessionId,
    title,
    className,
    studentName,
    loginId,
    receivedAt,
    status,
  } = detail;
  return {
    recoveryId,
    attemptId,
    sessionId,
    title,
    className,
    studentName,
    loginId,
    receivedAt,
    status,
  };
}
