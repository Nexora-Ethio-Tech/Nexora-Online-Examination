import type { Role } from '@/features/auth/schemas';
import { z } from 'zod';
import { publishSchema, type Report, type ResultRow } from '@/features/results/schemas';
import type { AuthoringStore } from './authoring-store';
import { markResults, reportsCsv } from './result-math';
import { practiceAccess, practiceBest } from './practice';

export function createResultsDemo(store: AuthoringStore, clock = Date.now) {
  const fingerprints = new Map<string, string>();
  const replays = new Map<string, { payload: string; result: unknown }>();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  const error = (code: string, message: string, status = 409) =>
    json({ code, message, details: [], requestId: 'demo-results' }, status);
  const now = () => new Date(clock()).toISOString();
  function current(id: string): Report | null {
    const sitting = store.sessions.get(id);
    if (!sitting) return null;
    const approved = store.approved.get(sitting.session.examId);
    if (!approved) return null;
    const record = store.resultAttempts.get(id);
    const attempt = record?.attempt;
    const status: ResultRow['status'] = !attempt
      ? 'absent'
      : attempt.state === 'submitted' && attempt.receipt
        ? 'finalized'
        : attempt.state === 'invalidated'
          ? 'invalidated'
          : attempt.state === 'recovery_pending'
            ? 'recovery_pending'
            : 'awaiting_upload';
    const calculated = markResults(
      approved.items,
      [
        {
          studentId: 'demo-student',
          studentName: 'Samira',
          loginId: 'DEMO-STUDENT',
          attemptId: attempt?.attemptId ?? null,
          status,
          answers: record?.answers ?? [],
        },
      ],
      approved.draft.passPercent,
    );
    const fingerprint = JSON.stringify([
      calculated,
      attempt?.receipt?.snapshotDigest,
      attempt?.finalAcceptUntil,
      [...store.recoveries.values()]
        .filter((r) => r.detail.sessionId === id)
        .map((r) => [r.detail.recoveryId, r.detail.snapshotDigest, r.detail.status]),
      sitting.session.scheduleRevision,
      sitting.session.resultsReleaseAt,
    ]);
    const snapshots = store.resultSnapshots.get(id) ?? [];
    const previous = snapshots.at(-1);
    const publication = store.publications.get(id)?.at(-1)?.summary.publication ?? null;
    if (previous && fingerprints.get(id) === fingerprint)
      return {
        ...structuredClone(previous),
        summary: { ...previous.summary, publication },
        serverNow: now(),
      };
    const revision = (previous?.summary.revision ?? 0) + 1;
    const report: Report = {
      summary: {
        sessionId: id,
        title: sitting.title,
        className: 'Grade 10 A',
        subjectName: 'Mathematics',
        endsAt: sitting.session.endsAt,
        publishableAfter: new Date(
          Math.max(
            Date.parse(sitting.session.endsAt) + 5000,
            attempt ? Date.parse(attempt.finalAcceptUntil) : 0,
          ),
        ).toISOString(),
        plannedReleaseAt: sitting.session.resultsReleaseAt,
        revision,
        publication,
      },
      rows: calculated.rows,
      analytics: { ...calculated.analytics, revision },
      serverNow: now(),
    };
    snapshots.push(structuredClone(report));
    store.resultSnapshots.set(id, snapshots);
    fingerprints.set(id, fingerprint);
    return report;
  }
  function version(id: string, revision: number) {
    current(id);
    return structuredClone(
      store.resultSnapshots.get(id)?.find((r) => r.summary.revision === revision) ?? null,
    );
  }
  function handle(url: URL, method: string, body: unknown, headers: Headers, role: Role) {
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const mine = path === '/me/results';
    if ((mine && role !== 'student') || (!mine && role === 'student'))
      return error('FORBIDDEN', 'This results view is not available to your role.', 403);
    const allowed = (id: string) =>
      role !== 'teacher' ||
      store.approved.get(store.sessions.get(id)?.session.examId ?? '')?.draft.assignmentId ===
        'demo-math-10a';
    const reports = [...store.sessions.keys()]
      .filter(allowed)
      .map(current)
      .filter((r): r is Report => r !== null);
    const cursor = url.searchParams.get('cursor');
    const offset = cursor ? Number(cursor) : 0;
    const limit = Number(url.searchParams.get('limit') ?? 25);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return error('VALIDATION_ERROR', 'Invalid page.', 422);
    function page<T>(items: T[]) {
      return {
        items: items.slice(offset, offset + limit),
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
        serverNow: now(),
      };
    }
    if (mine && method === 'GET')
      return json(
        page(
          reports.map((r) => {
            const published = store.publications
              .get(r.summary.sessionId)
              ?.filter(
                (p) =>
                  p.summary.publication && Date.parse(p.summary.publication.releaseAt) <= clock(),
              )
              .at(-1);
            const row = published?.rows.find((row) => row.studentId === 'demo-student');
            const sitting = store.sessions.get(r.summary.sessionId);
            const practice = sitting ? practiceAccess(store, sitting.session.examId, clock) : null;
            return {
              sessionId: r.summary.sessionId,
              title: r.summary.title,
              className: r.summary.className,
              plannedReleaseAt: r.summary.publication?.releaseAt ?? r.summary.plannedReleaseAt,
              publicationRevision: published?.summary.revision ?? null,
              result: row
                ? {
                    status: row.status,
                    score: row.score,
                    maxScore: row.maxScore,
                    percent: row.percent,
                    rank: row.rank,
                    passed: row.passed,
                    exclusionReason: row.exclusionReason,
                  }
                : null,
              bestPracticePercent: practice
                ? practiceBest(store, practice.examId, practice.examVersion).bestPercent
                : null,
              practice: practice
                ? {
                    examId: practice.examId,
                    examVersion: practice.examVersion,
                    available: practice.available,
                    blockedReason: practice.blockers.join(' ') || null,
                  }
                : null,
            };
          }),
        ),
      );
    if (path === '/results/sessions' && method === 'GET')
      return json(page(reports.map((r) => r.summary)));
    const match = /^\/sessions\/([^/]+)\/(results|analytics|results-publication)$/.exec(path);
    const id = match?.[1] ?? url.searchParams.get('sessionId');
    const report = id && allowed(id) ? current(id) : null;
    if (match && !report) return error('NOT_FOUND', 'Sitting not found.', 404);
    if (match && match[1] && report) {
      if (match[2] === 'results' && method === 'GET') {
        const p = page(report.rows);
        return json({
          summary: report.summary,
          rows: p.items,
          nextCursor: p.nextCursor,
          serverNow: now(),
        });
      }
      if (match[2] === 'analytics' && method === 'GET') {
        const r = version(match[1], Number(url.searchParams.get('revision')));
        return r
          ? json(r.analytics)
          : error('REVISION_CONFLICT', 'Refresh results to obtain a valid revision.');
      }
      if (match[2] === 'results-publication' && method === 'POST') {
        if (role !== 'school_admin')
          return error('FORBIDDEN', 'Only your school administrator can publish results.', 403);
        const parsed = publishSchema.safeParse(body);
        const key = headers.get('Idempotency-Key');
        if (!parsed.success || !key || !z.uuid().safeParse(key).success)
          return error(
            'VALIDATION_ERROR',
            'Enter the revision, release time and publication reason.',
            422,
          );
        const request = parsed.data;
        const payload = JSON.stringify(request);
        const replayKey = `${match[1]}:${key}`;
        const old = replays.get(replayKey);
        if (old)
          return old.payload === payload
            ? json(old.result)
            : error('REVISION_CONFLICT', 'This request key has already been used.');
        if (request.revision !== report.summary.revision)
          return error('REVISION_CONFLICT', 'Results changed. Refresh and review them again.');
        if (store.publications.get(match[1])?.some((p) => p.summary.revision === request.revision))
          return error('REVISION_CONFLICT', 'This revision already has publication approval.');
        if (
          clock() <= Date.parse(report.summary.publishableAfter) ||
          Date.parse(request.releaseAt) < Date.parse(report.summary.publishableAfter)
        )
          return error(
            'RESULTS_NOT_RELEASED',
            'Wait until every submission window closes and choose a release time after that boundary.',
          );
        const pending = report.rows.filter(
          (r) => r.status === 'recovery_pending' || r.status === 'awaiting_upload',
        );
        if (
          new Set(request.exclusions.map((e) => e.attemptId)).size !== request.exclusions.length ||
          request.exclusions.length !== pending.length ||
          pending.some((r) => !request.exclusions.some((e) => e.attemptId === r.attemptId))
        )
          return error(
            'RECOVERY_REQUIRED',
            'Every unresolved attempt needs an explicit exclusion reason, or a recovery decision first.',
          );
        report.rows = report.rows.map((row) => {
          const exclusion = request.exclusions.find((e) => e.attemptId === row.attemptId);
          return exclusion
            ? { ...row, status: 'excluded', exclusionReason: exclusion.reason }
            : row;
        });
        report.summary.publication = {
          revision: request.revision,
          approvedAt: now(),
          approvedBy: 'Hana',
          releaseAt: request.releaseAt,
          reason: request.reason,
          exclusions: request.exclusions,
        };
        const snapshots = store.resultSnapshots.get(match[1]);
        if (snapshots) snapshots[snapshots.length - 1] = structuredClone(report);
        store.publications.set(match[1], [
          ...(store.publications.get(match[1]) ?? []),
          structuredClone(report),
        ]);
        replays.set(replayKey, { payload, result: structuredClone(report.summary) });
        return json(report.summary);
      }
    }
    if (path.startsWith('/exports/') && method === 'GET') {
      const selected =
        id && allowed(id) ? version(id, Number(url.searchParams.get('revision'))) : null;
      if (id && !selected) return error('NOT_FOUND', 'Result revision not found.', 404);
      if (path === '/exports/report')
        return selected
          ? json({ ...selected, serverNow: now() })
          : error('VALIDATION_ERROR', 'A session and revision are required.', 422);
      if (path === '/exports/results.csv')
        return new Response(reportsCsv(selected ? [selected] : reports), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Cache-Control': 'private, no-store',
          },
        });
    }
    return error('NOT_FOUND', 'Results endpoint not found.', 404);
  }
  return Object.assign(handle, { current });
}
