import { formatEatDateTime } from '@/lib/ethiopian-date';
import { SupervisionPanel } from './SupervisionPanel';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiClient } from '@/lib/ApiProvider';
import { ApiError } from '@/lib/api-client';
import { control, panel, Failure, useTeacherScope } from '../authoring/TeacherPage';
import { clockSample, serverTime } from '../PreparationPage';
import { monitorApi } from './api';
import {
  monitorStatus,
  statusLabels,
  transferRequestSchema,
  type MonitorAttempt,
  type MonitorRow,
  type MonitorSitting,
  type TransferRequest,
  type TransferResponse,
} from './schemas';

const eatTime = (value: string) => formatEatDateTime(value, true);

function useLiveRead<T extends { serverNow: string }>(
  queryKey: QueryKey,
  read: (signal: AbortSignal) => Promise<T>,
) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const data = await read(signal);
      return { ...data, clock: clockSample(data.serverNow) };
    },
    retry: false,
    refetchInterval: (q) => Math.min(60_000, 15_000 * 2 ** q.state.fetchFailureCount),
    refetchIntervalInBackground: false,
  });
  const fresh =
    !!query.data &&
    !query.error &&
    navigator.onLine &&
    document.visibilityState !== 'hidden' &&
    performance.now() - query.data.clock.receivedAt < 30_000;
  return { query, fresh };
}
function usePages() {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  return {
    cursor: cursors.at(-1) ?? null,
    number: cursors.length,
    previous: () => setCursors((c) => c.slice(0, -1)),
    next: (cursor: string) => setCursors((c) => [...c, cursor]),
  };
}
function Pagination({
  pages,
  next,
  pending,
}: {
  pages: ReturnType<typeof usePages>;
  next: string | null;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={pending || pages.number === 1} onClick={pages.previous}>
        Previous page
      </Button>
      <span className="text-sm">Page {pages.number}</span>
      <Button
        variant="outline"
        disabled={pending || !next}
        onClick={() => next && pages.next(next)}
      >
        Next page
      </Button>
    </div>
  );
}
function Refresh({
  fresh,
  at,
  pending,
  refresh,
}: {
  fresh: boolean;
  at?: string;
  pending: boolean;
  refresh: () => void;
}) {
  return (
    <div className={`${panel} space-y-3`}>
      <p className="text-sm">
        {at ? `Last updated: ${eatTime(at)}.` : 'Waiting for the latest exam information.'}{' '}
        {at && !fresh
          ? 'This information may be out of date. Refresh before approving a replacement device.'
          : ''}
      </p>
      <p className="text-sm text-muted-foreground">
        Refreshes every 15 seconds while this page is visible, with slower retries after errors.
        Last contact is evidence of a request, not proof that a student is online. Preparing does
        not confirm that the paper is saved on their device.
      </p>
      <Button variant="outline" disabled={pending} onClick={refresh}>
        {pending ? 'Refreshing monitor…' : 'Refresh monitor'}
      </Button>
    </div>
  );
}
function SittingInfo({ sitting: s }: { sitting: MonitorSitting }) {
  return (
    <section className={`${panel} space-y-4`}>
      <h2 className="break-words text-lg font-semibold">
        {s.className} · {s.subjectName}
      </h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {[
          ['Preparation opens', s.preparationVisibleAt],
          ['Common start', s.startsAt],
          ['Common end', s.endsAt],
          ['Latest student deadline', s.latestDeadlineAt],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{eatTime(value ?? '')}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        Students scheduled for this exam: {s.rosterCount} students · Schedule revision{' '}
        {s.scheduleRevision}
      </p>
      <p className="border-b py-4 text-sm">
        Ready (last reported): <strong>{s.readyCount}</strong> of {s.counts.preparing} preparing
        students. This is a subset, not an additional roster count.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {monitorStatus.options.map((status) => (
          <div key={status} className="border-b py-4 text-sm">
            {statusLabels[status]}
            <strong className="mt-2 block font-heading text-3xl">{s.counts[status]}</strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Counts cover the whole frozen roster. Each student’s own approved deadline applies. Reading
        this screen never submits answers or changes an attempt.
      </p>
    </section>
  );
}
function StudentInfo({ student: s }: { student: MonitorRow }) {
  const a = s.attempt;
  return (
    <div className="space-y-3 break-words text-sm">
      <h3 className="font-semibold">
        {s.studentName} · {s.loginId}
      </h3>
      <p className="font-medium">{statusLabels[s.status]}</p>
      <p>
        Preparation report:{' '}
        {a?.readiness
          ? `Verified checks reported at ${eatTime(a.readiness.receivedAt)}`
          : 'No current verified report'}
        . This was checked at that time; the student may have disconnected or cleared their browser
        data since then.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Student deadline</dt>
          <dd>{eatTime(s.deadlineAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last student contact</dt>
          <dd>{a?.lastContactAt ? eatTime(a.lastContactAt) : 'No contact recorded'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last answers received</dt>
          <dd>{a?.lastServerSaveAt ? eatTime(a.lastServerSaveAt) : 'No answer save recorded'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Answers received by the school</dt>
          <dd>
            {a?.serverAnsweredCount ?? 0} · Answers saved only on the student’s device are not shown
          </dd>
        </div>
        {a?.receiptAcceptedAt && (
          <div>
            <dt className="text-muted-foreground">Committed submission</dt>
            <dd>{eatTime(a.receiptAcceptedAt)}</dd>
          </div>
        )}
      </dl>
      {a?.recoveryId && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          to={`/admin/recovery/${encodeURIComponent(a.recoveryId)}`}
        >
          Review recovery evidence
        </Link>
      )}
      {s.status === 'recovery_needed' && !a?.recoveryId && (
        <p>
          No recovery upload is recorded. Ask the student to retain the original browser and send
          its saved final answers for school review.
        </p>
      )}
    </div>
  );
}
export function MonitorPage() {
  const client = useApiClient();
  const api = monitorApi(client);
  const navigate = useNavigate();
  const example = useMutation({
    mutationFn: async () => {
      if (!import.meta.env.DEV || import.meta.env.MODE !== 'demo')
        throw new Error('Development example unavailable.');
      const { loadMonitorExample } = await import('./demo-api');
      return loadMonitorExample(client);
    },
    onSuccess: (value) => {
      void navigate(`/admin/monitor/attempts/${encodeURIComponent(value.attemptId)}`);
    },
  });
  const scope = useTeacherScope();
  const pages = usePages();
  const { query, fresh } = useLiveRead(['monitor-sittings', ...scope, pages.cursor], (signal) =>
    api.list(pages.cursor, signal),
  );
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Live exam monitor</h1>
      {import.meta.env.DEV && import.meta.env.MODE === 'demo' && (
        <section className={`${panel} space-y-3`}>
          <p className="text-sm">
            Development demo: load a synthetic active attempt with one saved answer and a 60-minute
            exam window. Register the replacement browser as DEMO-STUDENT, then return here in the
            same tab to approve its ID.
          </p>
          <Button variant="outline" disabled={example.isPending} onClick={() => example.mutate()}>
            {example.isPending ? 'Loading example…' : 'Load synthetic monitoring example'}
          </Button>
          <Failure error={example.error} />
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        Open a class sitting to check progress and manage a replacement browser. All times are East
        Africa Time (EAT).
      </p>
      <Refresh
        at={query.data?.serverNow}
        fresh={fresh}
        pending={query.isFetching}
        refresh={() => void query.refetch()}
      />
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading sittings…</p>}
      {query.data && (
        <>
          {!query.data.items.length && (
            <p className={panel}>No scheduled sittings are available.</p>
          )}
          {query.data.items.map((s) => (
            <article key={s.sessionId} className={`${panel} space-y-3`}>
              <h2 className="break-words text-lg font-semibold">{s.title}</h2>
              <p className="text-sm">
                {s.className} · {eatTime(s.startsAt)}
              </p>
              <p className="text-sm">
                {s.rosterCount} students · {s.counts.active} active · {s.counts.submitted} submitted
                · {s.counts.recovery_needed} need recovery
              </p>
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-11 max-w-full whitespace-normal break-words text-left"
              >
                <Link to={`/admin/monitor/${encodeURIComponent(s.sessionId)}`}>
                  Monitor {s.title}
                </Link>
              </Button>
            </article>
          ))}
          <Pagination pages={pages} next={query.data.nextCursor} pending={query.isFetching} />
        </>
      )}
    </div>
  );
}
export function MonitorSittingPage() {
  const { sessionId = '' } = useParams();
  return <MonitorSittingContent key={sessionId} sessionId={sessionId} />;
}
function MonitorSittingContent({ sessionId }: { sessionId: string }) {
  const api = monitorApi(useApiClient());
  const pages = usePages();
  const scope = useTeacherScope();
  const { query, fresh } = useLiveRead(
    ['monitor-sitting', ...scope, sessionId, pages.cursor],
    (signal) => api.sitting(sessionId, pages.cursor, signal),
  );
  return (
    <div className="space-y-5">
      <Link to="/admin/monitor" className="inline-flex min-h-11 items-center underline">
        All sittings
      </Link>
      <h1 className="break-words text-3xl font-semibold">
        {query.data?.sitting.title ?? 'Sitting monitor'}
      </h1>
      <Refresh
        at={query.data?.serverNow}
        fresh={fresh}
        pending={query.isFetching}
        refresh={() => void query.refetch()}
      />
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading the frozen roster…</p>}
      {query.data && (
        <>
          <SittingInfo sitting={query.data.sitting} />
          <h2 className="text-xl font-semibold">Student progress</h2>
          {!query.data.rows.length && <p>No students on this page.</p>}
          {query.data.rows.map((s) => (
            <article key={s.studentId} className={`${panel} space-y-3`}>
              <StudentInfo student={s} />
              {s.attempt ? (
                <Button
                  asChild
                  variant="outline"
                  className="h-auto min-h-11 max-w-full whitespace-normal break-words text-left"
                >
                  <Link to={`/admin/monitor/attempts/${encodeURIComponent(s.attempt.attemptId)}`}>
                    Device and history for {s.studentName}
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No attempt exists. The student must prepare their browser first.
                </p>
              )}
            </article>
          ))}
          <Pagination pages={pages} next={query.data.nextCursor} pending={query.isFetching} />
        </>
      )}
    </div>
  );
}
export function MonitorAttemptPage() {
  const { attemptId = '' } = useParams();
  return <MonitorAttemptContent key={attemptId} attemptId={attemptId} />;
}
function MonitorAttemptContent({ attemptId }: { attemptId: string }) {
  const api = monitorApi(useApiClient());
  const pages = usePages();
  const scope = useTeacherScope();
  const { query, fresh } = useLiveRead(
    ['monitor-attempt', ...scope, attemptId, pages.cursor],
    (signal) => api.attempt(attemptId, pages.cursor, signal),
  );
  const d = query.data;
  return (
    <div className="space-y-5">
      <Link
        className="inline-flex min-h-11 items-center underline"
        to={d ? `/admin/monitor/${encodeURIComponent(d.sitting.sessionId)}` : '/admin/monitor'}
      >
        Back to sitting monitor
      </Link>
      <h1 className="text-3xl font-semibold">Device replacement</h1>
      <SupervisionPanel
        attemptId={attemptId}
        studentLoginId={d?.student.loginId}
        studentName={d?.student.studentName}
        examTitle={d?.sitting.title}
      />
      <Refresh
        at={d?.serverNow}
        fresh={fresh}
        pending={query.isFetching}
        refresh={() => void query.refetch()}
      />
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading attempt and transfer history…</p>}
      {d && (
        <>
          <section className={`${panel} space-y-3`}>
            <h2 className="break-words text-lg font-semibold">{d.sitting.title}</h2>
            <StudentInfo student={d.student} />
          </section>
          <TransferForm
            detail={d}
            fresh={fresh && serverTime(d.clock) < Date.parse(d.student.deadlineAt)}
          />
          <section className={`${panel} space-y-4`}>
            <h2 className="text-xl font-semibold">Device transfer history</h2>
            {!d.history.length && <p className="text-sm">No transfers on this page.</p>}
            <ol className="space-y-4">
              {d.history.map((h) => (
                <li key={h.transferId} className="space-y-1 text-sm">
                  <p className="font-semibold">
                    Generation {h.fromGeneration} → {h.toGeneration} · {h.actorName}
                  </p>
                  <p>{eatTime(h.transferredAt)}</p>
                  <p className="whitespace-pre-wrap break-words">{h.reason}</p>
                </li>
              ))}
            </ol>
            <Pagination pages={pages} next={d.nextCursor} pending={query.isFetching} />
          </section>
        </>
      )}
    </div>
  );
}
function TransferForm({ detail: d, fresh }: { detail: MonitorAttempt; fresh: boolean }) {
  const api = monitorApi(useApiClient());
  const qc = useQueryClient();
  const [deviceId, setDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [request, setRequest] = useState<{ body: TransferRequest; key: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<TransferResponse | null>(null);
  const a = d.student.attempt;
  const body = transferRequestSchema.safeParse({
    newDeviceId: deviceId.trim(),
    reason,
    expectedDeviceGeneration: a?.deviceGeneration,
  });
  const allowed =
    fresh && d.transferBlocker === null && a && confirmed === a.deviceGeneration && body.success;
  async function send(operation: NonNullable<typeof request>) {
    if (!a || pending) return;
    setPending(true);
    setError(null);
    setRequest(operation);
    try {
      const value = await api.transfer(a.attemptId, operation.body, operation.key);
      if (
        value.attemptId !== a.attemptId ||
        value.deviceGeneration !== operation.body.expectedDeviceGeneration + 1 ||
        value.deadlineAt !== d.student.deadlineAt
      )
        throw new ApiError(
          'INVALID_RESPONSE',
          'Transfer response did not match. Refresh history, then retry the same request.',
        );
      setResult(value);
      setRequest(null);
      await qc.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('monitor-'),
      });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        setRequest(null);
        setConfirmed(null);
        void qc.invalidateQueries({
          predicate: (q) => String(q.queryKey[0]).startsWith('monitor-'),
        });
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={`${panel} space-y-4`}>
      <h2 className="text-xl font-semibold">Approve a replacement browser</h2>
      <p className="text-sm">
        Verify the student in person. On the replacement browser, the student signs in and opens
        “Register replacement browser”. Enter the registered ID below. The old browser loses write
        access. Only answers already received by the school carry over; keep any unsent answers on
        the original device for recovery review.
      </p>
      <p className="text-sm font-medium">
        Device approval version: {a?.deviceGeneration ?? 'None'} · Deadline remains{' '}
        {eatTime(d.student.deadlineAt)}.
      </p>
      {d.transferBlocker && (
        <p role="status">
          {d.transferBlocker === 'deadline_passed'
            ? 'The deadline has passed. Use recovery review; a replacement cannot add time.'
            : 'This attempt is closed or has no transferable device.'}
        </p>
      )}
      <Failure error={error} />
      {result ? (
        <p role="status" className="rounded-lg bg-primary/10 p-4 text-sm">
          Replacement approved. Device approval version {result.deviceGeneration}. Ask the student
          to return to My exams and open this sitting on the registered browser. It needs to check
          access online and unlock online. The deadline remains {eatTime(result.deadlineAt)}.
        </p>
      ) : request ? (
        <div className="space-y-3">
          <p role="status" className="text-sm">
            {pending
              ? 'Waiting for the server to confirm this transfer…'
              : 'The outcome is not confirmed. Check transfer history and retry this exact request; it cannot create a second transfer. Do not issue a different replacement yet.'}
          </p>
          <Button disabled={pending} onClick={() => void send(request)}>
            Retry same transfer
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (allowed && body.success) void send({ body: body.data, key: crypto.randomUUID() });
          }}
        >
          <fieldset
            disabled={pending || !fresh || d.transferBlocker !== null}
            className="space-y-4"
          >
            <label className="block text-sm">
              Registered replacement browser ID
              <Input
                className="mt-2"
                value={deviceId}
                required
                autoComplete="off"
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setConfirmed(null);
                }}
              />
            </label>
            <label className="block text-sm">
              Reason for replacement
              <textarea
                className={`${control} mt-2`}
                rows={3}
                maxLength={2000}
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setConfirmed(null);
                }}
              />
            </label>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={!!a && confirmed === a.deviceGeneration}
                onChange={(e) =>
                  setConfirmed(e.target.checked ? (a?.deviceGeneration ?? null) : null)
                }
              />
              I verified this student, the registered browser ID and the unchanged deadline. Answers
              not yet sent stay on the old device.
            </label>
          </fieldset>
          <Button className="min-h-11" disabled={!allowed || pending}>
            Approve device replacement
          </Button>
        </form>
      )}
    </section>
  );
}
