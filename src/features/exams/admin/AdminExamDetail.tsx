import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiClient } from '@/lib/ApiProvider';
import { control, Failure, panel, useTeacherScope } from '../authoring/TeacherPage';
import { eatTime } from '../ExamsPage';
import { reviewProblems } from '../authoring/schemas';
import { adminExamApi } from './api';
import {
  parseEatInput,
  toEatInput,
  scheduleTimes,
  type AdminDetail,
  type Sitting,
} from './schemas';

function ScheduleForm({
  detail,
  initial,
  pending,
  onSave,
}: {
  detail: AdminDetail;
  initial?: Sitting;
  pending: boolean;
  onSave: (preparationVisibleAt: string, resultsReleaseAt: string, reason: string) => void;
}) {
  const suggested = new Date(
    Math.ceil((Date.parse(detail.serverNow) + 120000) / 60000) * 60000,
  ).toISOString();
  const [prep, setPrep] = useState(toEatInput(initial?.preparationVisibleAt ?? suggested));
  const [release, setRelease] = useState(
    toEatInput(
      initial?.resultsReleaseAt ??
        new Date(
          Date.parse(suggested) + (10 + detail.exam.durationMinutes + 60) * 60000,
        ).toISOString(),
    ),
  );
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const iso = parseEatInput(prep);
  const times = iso ? scheduleTimes(iso, detail.exam.durationMinutes) : null;
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseEatInput(release);
        if (
          !iso ||
          !times ||
          !result ||
          Date.parse(iso) <= Date.parse(detail.serverNow) ||
          Date.parse(result) < Date.parse(times.endsAt)
        ) {
          setError(
            'Choose a future preparation time and a planned result time at or after the exam ends.',
          );
          return;
        }
        if (initial && !reason.trim()) {
          setError('Explain why the schedule is changing.');
          return;
        }
        setError('');
        if (confirmed) onSave(iso, result, reason.trim());
      }}
    >
      <h3 className="text-lg font-semibold">
        {initial ? 'Change this schedule' : 'Schedule a class sitting'}
      </h3>
      <p className="text-sm text-muted-foreground">
        Enter all dates and times in East Africa Time (EAT, UTC+3). The full ten-minute preparation
        period applies, including in the demo.
      </p>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          Preparation date and time (EAT)
          <Input
            type="datetime-local"
            required
            value={prep}
            onChange={(e) => {
              setPrep(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <label className="space-y-2">
          Planned results date and time (EAT)
          <Input
            type="datetime-local"
            required
            value={release}
            onChange={(e) => {
              setRelease(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        {initial && (
          <label className="space-y-2 sm:col-span-2">
            Reason for changing the schedule
            <textarea
              className={control}
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
      </fieldset>
      {times && (
        <div className="rounded-lg bg-muted p-4 text-sm leading-7">
          <p>
            Common start: <strong>{eatTime(times.startsAt)}</strong>
          </p>
          <p>
            Common end: <strong>{eatTime(times.endsAt)}</strong>
          </p>
          <p>Duration: {detail.exam.durationMinutes} minutes</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Scheduling snapshots eligible students in {detail.className}. Planned results stay hidden
        until separately approved for publication. Practice stays disabled.
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          disabled={pending}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I checked the EAT dates, common start and end, and the intended class.
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={pending || !confirmed} className="min-h-11">
        {pending ? 'Saving schedule…' : initial ? 'Save schedule change' : 'Confirm schedule'}
      </Button>
    </form>
  );
}

export function AdminExamDetail() {
  const { examId = '' } = useParams();
  const scope = useTeacherScope();
  const api = adminExamApi(useApiClient());
  const qc = useQueryClient();
  const queryKey = ['admin-exam', ...scope, examId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.get(examId, signal),
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.data?.packageState === 'pending' ? 2000 : false),
  });
  const [comment, setComment] = useState('');
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const keys = useRef(new Map<string, { body: string; key: string }>());
  function key(operation: string, body: unknown) {
    const value = JSON.stringify(body);
    const old = keys.current.get(operation);
    if (old?.body === value) return old.key;
    const next = { body: value, key: crypto.randomUUID() };
    keys.current.set(operation, next);
    return next.key;
  }
  const mutation = useMutation({
    mutationFn: (run: () => Promise<AdminDetail>) => run(),
    onSuccess: (data) => {
      qc.setQueryData(queryKey, data);
      void qc.invalidateQueries({ queryKey: ['admin-exams', ...scope] });
      setConfirmedRevision(null);
      setComment('');
      setEditing(null);
      setAdding(false);
      setMessage('Confirmed by the server. The latest status is shown below.');
    },
  });
  if (query.isPending) return <p role="status">Loading the paper and approval history…</p>;
  if (!query.data)
    return (
      <>
        <Failure error={query.error} />
        <Button onClick={() => void query.refetch()}>Retry paper</Button>
      </>
    );
  const d = query.data;
  const e = d.exam;
  const reviewed = d.items.length > 0 && reviewProblems(d.items).length === 0;
  const pending = mutation.isPending;
  function run(fn: () => Promise<AdminDetail>) {
    setMessage('');
    mutation.mutate(fn);
  }
  return (
    <div className="space-y-5">
      <Link to="/admin" className="text-sm underline">
        Back to school papers
      </Link>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-sm capitalize text-muted-foreground">
            {e.status.replace('_', ' ')} · Revision {e.revision}
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold">{e.title}</h1>
        </div>
        <Button
          variant="outline"
          disabled={pending || query.isFetching}
          onClick={() => {
            mutation.reset();
            void query.refetch();
          }}
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh paper'}
        </Button>
      </div>
      <Failure error={mutation.error || query.error} />
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      <section className={panel}>
        <h2 className="font-semibold">Paper details</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Teacher and class</dt>
            <dd>
              {d.teacherName} · {d.className}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Subject and language</dt>
            <dd>
              {d.subjectName} · {e.language === 'am' ? 'Amharic' : 'English'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Questions and marks</dt>
            <dd>
              {e.itemCount} questions · {e.totalMarks} marks · {e.reviewedCount} reviewed
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Duration and pass threshold</dt>
            <dd>
              {e.durationMinutes} minutes · {e.passPercent}%
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Ordering</dt>
            <dd>
              {e.ordering === 'fixed'
                ? 'Template order'
                : 'Shuffle questions and options per student'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 whitespace-pre-wrap text-sm">{e.instructions}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Questions, keys and reviewed explanations</h2>
        {d.items.map((item, index) => (
          <article key={item.itemId} className={panel}>
            <h3 className="font-semibold">
              {index + 1}. {item.externalId} · {item.marks} marks
            </h3>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="whitespace-pre-wrap text-sm">{item.stem}</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {item.options.map((o) => (
                    <li key={o.id} className={o.id === item.correctOptionId ? 'font-semibold' : ''}>
                      {o.id}: {o.text}
                      {o.id === item.correctOptionId ? ' (teacher key)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Primary topic:</strong> {item.primaryTopic || 'Missing'}
                </p>
                <p>
                  <strong>Secondary topics:</strong> {item.secondaryTopics.join(', ') || 'None'}
                </p>
                <p className="whitespace-pre-wrap">{item.explanation || 'Explanation missing'}</p>
                <p>Teacher review: {item.reviewed ? 'Confirmed' : 'Missing'}</p>
                {item.keyConsistent === false && (
                  <p className="font-semibold">AI flagged an answer-key conflict.</p>
                )}
                {item.reviewFlags.map((flag) => (
                  <p key={flag}>Flag: {flag}</p>
                ))}
                {item.reviewNote && (
                  <p className="whitespace-pre-wrap">Teacher resolution: {item.reviewNote}</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
      {e.status === 'in_review' && (
        <section className={`${panel} space-y-4`}>
          <h2 className="text-xl font-semibold">Approval decision</h2>
          <p className="text-sm text-muted-foreground">
            Approve freezes this exact paper. Return sends your feedback to the teacher for
            correction.
          </p>
          <label className="block text-sm">
            Review comment or required corrections
            <textarea
              className={`${control} mt-2`}
              rows={3}
              maxLength={2000}
              value={comment}
              disabled={pending}
              onChange={(ev) => setComment(ev.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmedRevision === e.revision}
              disabled={pending || !reviewed}
              onChange={(ev) => setConfirmedRevision(ev.target.checked ? e.revision : null)}
            />
            I reviewed the questions, teacher keys, topics, explanations and flag resolutions.
          </label>
          {!reviewed && (
            <p role="alert">Teacher review is incomplete. Return the paper for correction.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11"
              disabled={
                pending ||
                !!query.error ||
                !comment.trim() ||
                confirmedRevision !== e.revision ||
                !reviewed
              }
              onClick={() => {
                const body = { revision: e.revision, comment: comment.trim() };
                run(() => api.decide(examId, 'approve', body, key('approve', body)));
              }}
            >
              Approve paper
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={pending || !!query.error || !comment.trim()}
              onClick={() => {
                const body = { revision: e.revision, comment: comment.trim() };
                run(() => api.decide(examId, 'return', body, key('return', body)));
              }}
            >
              Return to teacher
            </Button>
          </div>
        </section>
      )}
      {e.status === 'returned' && (
        <p role="status" className={panel}>
          Returned to the teacher: {e.returnComment}
        </p>
      )}
      {e.status === 'approved' && (
        <section className={`${panel} space-y-3`}>
          <h2 className="text-xl font-semibold">Approved version {d.approvedVersion}</h2>
          <p role="status" className="text-sm">
            Student package: {d.packageState}. Approval does not start the exam; create a schedule
            below.
          </p>
          {d.packageError && <p role="alert">{d.packageError}</p>}
          {d.packageState === 'pending' && (
            <p className="text-sm">
              Preparing the approved student artifact. Scheduling opens when it is ready.
            </p>
          )}
          {d.packageState === 'failed' && (
            <Button
              disabled={pending}
              onClick={() =>
                run(() => api.retryPackage(examId, e.revision, key('package', e.revision)))
              }
            >
              Retry package preparation
            </Button>
          )}
        </section>
      )}
      {d.sessions.map((s) => (
        <section key={s.sessionId} className={panel}>
          <h2 className="text-lg font-semibold">Scheduled sitting · {s.rosterCount} students</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt>Preparation</dt>
              <dd>{eatTime(s.preparationVisibleAt)}</dd>
            </div>
            <div>
              <dt>Common start</dt>
              <dd>{eatTime(s.startsAt)}</dd>
            </div>
            <div>
              <dt>Common end</dt>
              <dd>{eatTime(s.endsAt)}</dd>
            </div>
            <div>
              <dt>Planned results (publication approval still required)</dt>
              <dd>{eatTime(s.resultsReleaseAt)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Schedule revision {s.scheduleRevision} · Approved version {s.approvedVersion}
          </p>
          {s.canReschedule ? (
            <Button
              className="mt-4 min-h-11"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setEditing(editing === s.sessionId ? null : s.sessionId);
                setAdding(false);
              }}
            >
              Change schedule
            </Button>
          ) : (
            <p className="mt-3 text-sm">Preparation has opened. This schedule is locked.</p>
          )}
          {editing === s.sessionId && s.canReschedule && (
            <div className="mt-4">
              <ScheduleForm
                key={`${s.sessionId}-${s.scheduleRevision}`}
                detail={d}
                initial={s}
                pending={pending}
                onSave={(preparationVisibleAt, resultsReleaseAt, reason) => {
                  const body = {
                    scheduleRevision: s.scheduleRevision,
                    preparationVisibleAt,
                    resultsReleaseAt,
                    reason,
                  };
                  run(() =>
                    api.reschedule(s.sessionId, body, key(`reschedule-${s.sessionId}`, body)),
                  );
                }}
              />
            </div>
          )}
        </section>
      ))}
      {e.status === 'approved' && d.packageState === 'ready' && (
        <>
          {d.sessions.length > 0 && !adding && (
            <Button
              variant="outline"
              disabled={pending || editing !== null}
              onClick={() => setAdding(true)}
            >
              Schedule another sitting
            </Button>
          )}
          {(d.sessions.length === 0 || adding) && (
            <ScheduleForm
              key={`new-${e.revision}`}
              detail={d}
              pending={pending}
              onSave={(preparationVisibleAt, resultsReleaseAt) => {
                if (d.approvedVersion !== null) {
                  const body = {
                    revision: e.revision,
                    approvedVersion: d.approvedVersion,
                    preparationVisibleAt,
                    resultsReleaseAt,
                  };
                  run(() => api.schedule(examId, body, key('schedule', body)));
                }
              }}
            />
          )}
        </>
      )}
      <section className={panel}>
        <h2 className="text-lg font-semibold">Approval and schedule history</h2>
        {!d.history.length && <p className="mt-3 text-sm">No decisions recorded yet.</p>}
        <ol className="mt-3 space-y-4">
          {d.history.map((h, i) => (
            <li key={i} className="text-sm">
              <p className="capitalize font-medium">
                {h.action} · {h.actorName}
              </p>
              <p className="text-xs text-muted-foreground">
                {eatTime(h.at)} · Revision {h.revision}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{h.comment}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
