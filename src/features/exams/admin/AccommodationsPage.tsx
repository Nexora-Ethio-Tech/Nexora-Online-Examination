import { Pagination, useCursorPages } from '@/components/shared/Pagination';
import { EditDialog } from '@/components/shared/EditDialog';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiClient } from '@/lib/ApiProvider';
import { ApiError } from '@/lib/api-client';
import { control, Failure, panel, useTeacherScope } from '../authoring/TeacherPage';
import { eatTime } from '../ExamsPage';
import { adminExamApi } from './api';
import {
  accommodationChangeSchema,
  type AccommodationChange,
  type AccommodationStudent,
} from './accommodation-schemas';

export function AccommodationsPage() {
  const { sessionId = '' } = useParams();
  const api = adminExamApi(useApiClient());
  const scope = useTeacherScope();
  const cache = useQueryClient();
  const pages = useCursorPages();
  const cursor = pages.cursor;
  const [selected, setSelected] = useState<{
    student: AccommodationStudent;
    revision: number;
  } | null>(null);
  const [minutes, setMinutes] = useState('0');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState('');
  const [request, setRequest] = useState<{ body: AccommodationChange; key: string } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['accommodations', ...scope, sessionId, cursor],
    queryFn: async ({ signal }) => ({
      ...(await api.accommodations(sessionId, cursor, signal)),
      receivedAt: performance.now(),
    }),
    refetchInterval: 15000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (operation: { body: AccommodationChange; key: string }) =>
      api.setAccommodation(sessionId, operation.body, operation.key),
    retry: false,
    onSuccess: () => {
      setRequest(null);
      setSelected(null);
      setConfirmed(false);
      setNotice('Extra time saved. Refreshing the authoritative schedule…');
      // Replayed serverNow can be old. Only a new GET supplies the usable clock.
      void cache.invalidateQueries();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
      ) {
        setRequest(null);
        setSelected(null);
        setConfirmed(false);
        void query.refetch();
      }
    },
  });
  const data = query.data;
  const elapsed = data ? Math.max(0, performance.now() - data.receivedAt) : Infinity;
  const locked =
    !data ||
    !data.session.canEdit ||
    Date.parse(data.serverNow) + elapsed >= Date.parse(data.session.preparationVisibleAt);
  const stale = elapsed >= 60000 || !!query.error || query.isFetching;
  const changed = !!selected && selected.revision !== data?.session.scheduleRevision;
  const parsed = accommodationChangeSchema.safeParse({
    scheduleRevision: selected?.revision,
    studentId: selected?.student.studentId,
    extraMinutes: minutes.trim() ? Number(minutes) : NaN,
    reason,
  });
  const preview =
    data && parsed.success
      ? new Date(Date.parse(data.session.endsAt) + parsed.data.extraMinutes * 60000).toISOString()
      : null;
  const resultsConflict =
    !!preview && !!data && Date.parse(preview) > Date.parse(data.session.resultsReleaseAt);
  function refresh() {
    setConfirmed(false);
    if (cursor) pages.first();
    else void query.refetch();
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Extra-time accommodations</h1>
      <p className="text-muted-foreground">
        Set approved extra minutes for individual students before preparation opens. Everyone keeps
        the common start. Joining late never adds time.
      </p>
      <Failure error={query.error} />
      <Failure action error={mutation.error} />
      {notice && <p role="status">{notice}</p>}
      {query.isPending && <p role="status">Loading frozen roster…</p>}
      <Button variant="outline" onClick={refresh} disabled={mutation.isPending}>
        Refresh roster and time
      </Button>
      {data && (
        <>
          <section className={`${panel} space-y-3`}>
            <h2 className="font-semibold">{data.session.title}</h2>
            <Link
              className="underline"
              to={`/admin/exams/${encodeURIComponent(data.session.examId)}`}
            >
              Back to approval and schedule
            </Link>
            <p>Preparation opens / editing locks: {eatTime(data.session.preparationVisibleAt)}</p>
            <p>Common start: {eatTime(data.session.startsAt)}</p>
            <p>Common end: {eatTime(data.session.endsAt)}</p>
            <p>Latest student deadline: {eatTime(data.session.latestDeadlineAt)}</p>
            <p>Planned results: {eatTime(data.session.resultsReleaseAt)}</p>
            <p>
              {data.session.rosterCount} students in the frozen roster. Zero extra minutes uses the
              common end.
            </p>
            {locked && !selected && (
              <p role="status">
                Extra time is locked. Preparation or delivery has begun, or practice prevents
                changes.
              </p>
            )}
            {stale && (
              <p role="status">
                Refreshing or unable to verify the schedule. Editing is paused until a fresh read
                succeeds.
              </p>
            )}
          </section>
          {!data.items.length && <p>No students on this roster page.</p>}
          {data.items.map((student) => (
            <section className={`${panel} space-y-3`} key={student.studentId}>
              <h2 className="font-semibold">
                {student.studentName} · {student.loginId}
              </h2>
              <p>
                {student.extraMinutes} extra minutes · Deadline: {eatTime(student.deadlineAt)}
              </p>
              {student.lastChange && (
                <p className="text-sm">
                  Last change: {student.lastChange.previousExtraMinutes} →{' '}
                  {student.lastChange.extraMinutes} minutes by {student.lastChange.actorName},{' '}
                  {eatTime(student.lastChange.at)}. Reason: {student.lastChange.reason}
                </p>
              )}
              <Button
                variant="outline"
                disabled={locked || stale || !!request}
                onClick={() => {
                  setSelected({ student, revision: data.session.scheduleRevision });
                  setMinutes(String(student.extraMinutes));
                  setReason('');
                  setConfirmed(false);
                  setNotice('');
                  mutation.reset();
                }}
              >
                Edit extra time for {student.studentName}
              </Button>
            </section>
          ))}
          <Pagination
            page={pages.number}
            busy={!!request || query.isFetching}
            hasNext={!!data.nextCursor}
            previous={() => {
              pages.previous();
              setSelected(null);
            }}
            next={() => {
              if (data.nextCursor) pages.next(data.nextCursor);
              setSelected(null);
            }}
          />
          {selected && (
            <EditDialog
              title={`Extra time for ${selected.student.studentName}`}
              close={() => setSelected(null)}
              locked={!!request}
            >
              <Button
                type="button"
                variant="outline"
                disabled={!!request || query.isFetching}
                onClick={() => void query.refetch()}
              >
                Refresh roster and time
              </Button>
              {locked && (
                <p role="status">
                  Extra time is locked. Preparation has opened or delivery has started.
                </p>
              )}
              <form
                className={`${panel} space-y-4`}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    !parsed.success ||
                    locked ||
                    stale ||
                    changed ||
                    resultsConflict ||
                    !confirmed ||
                    request ||
                    parsed.data.extraMinutes === selected.student.extraMinutes
                  )
                    return;
                  const operation = { body: parsed.data, key: crypto.randomUUID() };
                  setRequest(operation);
                  mutation.mutate(operation);
                }}
              >
                <h2 className="font-semibold">Extra time for {selected.student.studentName}</h2>
                <label className="block">
                  <span className="field-label">Extra minutes (0–480, whole minutes)</span>
                  <Input
                    required
                    type="number"
                    min={0}
                    max={480}
                    step={1}
                    value={minutes}
                    disabled={!!request || locked}
                    onChange={(event) => {
                      setMinutes(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <label className="block">
                  <span className="field-label">Reason for the change</span>
                  <textarea
                    required
                    className={control}
                    maxLength={2000}
                    value={reason}
                    disabled={!!request || locked}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <p className="text-sm text-muted-foreground">
                  Record the approval reference or operational reason. Do not enter medical details.
                </p>
                {preview && <p>New student deadline: {eatTime(preview)}</p>}
                {resultsConflict && (
                  <p role="alert">
                    Move planned results to at or after this deadline using Change schedule, then
                    return here.
                  </p>
                )}
                {changed && (
                  <p role="alert">
                    The schedule changed. Select the student again and review the new deadline.
                  </p>
                )}
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!!request || locked || changed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I checked the student, approved extra minutes and resulting deadline.
                </label>
                <Button
                  disabled={
                    locked ||
                    stale ||
                    changed ||
                    !!request ||
                    !parsed.success ||
                    !confirmed ||
                    resultsConflict ||
                    Number(minutes) === selected.student.extraMinutes
                  }
                >
                  Save extra time
                </Button>
              </form>
              {request && (
                <div className="space-y-3" role="status">
                  <p>
                    {mutation.isPending
                      ? 'Saving extra time…'
                      : 'The save outcome is not confirmed. Retry the same request.'}
                  </p>
                  <Failure action error={mutation.error} />
                  {!mutation.isPending && (
                    <Button onClick={() => mutation.mutate(request)}>Retry the same save</Button>
                  )}
                </div>
              )}
            </EditDialog>
          )}
        </>
      )}
    </div>
  );
}
