import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { eatTime } from '@/features/exams/ExamsPage';
import { RunnerEngine } from './engine';
export function RunnerPage() {
  const { attemptId = '' } = useParams();
  const { session } = useAuth();
  if (!session) return null;
  return (
    <RunnerSession
      key={JSON.stringify([session.school.id, session.user.id, attemptId])}
      attemptId={attemptId}
      schoolId={session.school.id}
      userId={session.user.id}
    />
  );
}
function RunnerSession({
  attemptId,
  schoolId,
  userId,
}: {
  attemptId: string;
  schoolId: string;
  userId: string;
}) {
  const client = useApiClient();
  const [engine, setEngine] = useState<RunnerEngine | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const instance = new RunnerEngine(client, { schoolId, userId }, attemptId);
    setEngine(instance);
    void instance.start();
    return () => instance.dispose();
  }, [client, schoolId, userId, attemptId, revision]);
  return engine ? (
    <RunnerScreen engine={engine} reopen={() => setRevision((n) => n + 1)} />
  ) : (
    <p role="status">Restoring local work…</p>
  );
}
function RunnerScreen({ engine, reopen }: { engine: RunnerEngine; reopen: () => void }) {
  const view = useSyncExternalStore(engine.subscribe, engine.snapshot);
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const active = view.status === 'active';
  const unresolved = !!view.row && !view.row.receipt;
  const blocker = useBlocker(active || view.saving || view.status === 'finalizing');
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (unresolved) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [unresolved]);
  const item = view.paper?.items[index];
  const answered = view.row?.answers.filter((a) => a.value !== null).length ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Official exam</p>
          <h1 className="mt-1 text-2xl font-semibold">
            {view.paper?.title ?? 'Your exam attempt'}
          </h1>
        </div>
        {active ? (
          <div className="rounded-xl border bg-background px-4 py-3">
            <p className="text-xs text-muted-foreground">Time remaining</p>
            <p className="text-2xl font-semibold tabular-nums" aria-label="Time remaining">
              {Math.floor(view.seconds / 60)}:{String(view.seconds % 60).padStart(2, '0')}
            </p>
          </div>
        ) : null}
      </div>
      <div role="status" className="rounded-xl border bg-background p-4 text-sm leading-relaxed">
        <p>{view.message || 'Revalidating your session, device and exam…'}</p>
        {!online ? (
          <p className="mt-2 font-medium">
            Offline. Keep this tab open. Saved answers will wait for a connection.
          </p>
        ) : null}
        {view.row ? (
          <p className="mt-2 text-muted-foreground">
            {view.saving ? 'Saving on this device…' : `${answered} answers saved on this device`} ·{' '}
            {view.row.receipt ? 0 : view.row.outbox.length} pending upload
            <br />
            Last server save:{' '}
            {view.row.attempt.lastServerSaveAt
              ? eatTime(view.row.attempt.lastServerSaveAt)
              : 'Not confirmed yet'}
          </p>
        ) : null}
      </div>
      {view.status === 'loading' ? <p>Opening your paper…</p> : null}
      {view.status === 'blocked' ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Editing is paused</h2>
          <p className="text-sm">
            Saved evidence remains on this device. Reconnect before reopening.
          </p>
          <Button className="min-h-11" onClick={reopen}>
            Revalidate and reopen
          </Button>
          <Button asChild variant="outline" className="ml-2 min-h-11">
            <Link to="/student">My exams</Link>
          </Button>
        </div>
      ) : null}
      {active && view.paper && item ? (
        <>
          <p className="text-sm text-muted-foreground">{view.paper.instructions}</p>
          <nav aria-label="Questions" className="flex flex-wrap gap-2">
            {view.paper.items.map((question, position) => (
              <Button
                key={question.itemId}
                variant={position === index ? 'default' : 'outline'}
                className="min-h-11 min-w-11"
                aria-current={position === index ? 'step' : undefined}
                aria-label={`Question ${position + 1}${view.row?.answers.some((a) => a.itemId === question.itemId && a.value !== null) ? ', answered' : ', unanswered'}`}
                onClick={() => setIndex(position)}
              >
                {position + 1}
                {view.row?.answers.some((a) => a.itemId === question.itemId && a.value !== null)
                  ? ' ✓'
                  : ''}
              </Button>
            ))}
          </nav>
          <section className="rounded-xl border bg-background p-5 sm:p-6">
            <p className="mb-3 text-xs text-muted-foreground">
              Question {index + 1} of {view.paper.items.length} · {item.marks} marks
            </p>
            <fieldset disabled={view.saving || view.seconds === 0}>
              <legend className="mb-5 text-lg font-medium">{item.stem}</legend>
              <div className="space-y-3">
                {item.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      className="mt-1 size-4 shrink-0 accent-primary"
                      type="radio"
                      name={item.itemId}
                      value={option.id}
                      checked={
                        view.row?.answers.find((a) => a.itemId === item.itemId)?.value === option.id
                      }
                      onChange={() => engine.edit(item.itemId, option.id)}
                    />
                    <span className="text-sm leading-relaxed">{option.text}</span>
                  </label>
                ))}
              </div>
              <Button
                variant="ghost"
                className="mt-3 min-h-11"
                onClick={() => engine.edit(item.itemId, null)}
              >
                Clear answer
              </Button>
            </fieldset>
          </section>
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={index === 0}
              onClick={() => setIndex((n) => n - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={index >= view.paper.items.length - 1}
              onClick={() => setIndex((n) => n + 1)}
            >
              Next question
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={view.uploading || view.saving}
              onClick={() => {
                void engine.sync();
              }}
            >
              {view.uploading ? 'Uploading…' : 'Upload saved answers'}
            </Button>
            <Button className="min-h-11" disabled={view.saving} onClick={() => setReview(true)}>
              Review and submit
            </Button>
          </div>
          {review ? (
            <section
              aria-label="Confirm final submission"
              className="space-y-4 rounded-xl border border-primary bg-background p-5"
            >
              <h2 className="text-lg font-semibold">Submit your final answers?</h2>
              <p className="text-sm">
                {answered} answered · {view.paper.items.length - answered} unanswered. You cannot
                edit after confirming. If the connection fails, your final answers stay on this
                device for retry.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-11"
                  onClick={() => {
                    setReview(false);
                    void engine.finish();
                  }}
                >
                  Confirm submission
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => setReview(false)}>
                  Keep working
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {view.status === 'pending' || view.status === 'finalizing' ? (
        <section className="space-y-4 rounded-xl border bg-background p-5">
          <h2 className="text-xl font-semibold">
            {view.status === 'finalizing' ? 'Finalizing answers' : 'Pending upload'}
          </h2>
          <p className="text-sm">
            Do not clear browser storage. Submission is complete only when a matching server receipt
            is confirmed.
          </p>
          <Button
            className="min-h-11"
            disabled={view.uploading || view.status === 'finalizing'}
            onClick={() => {
              void engine.retrySubmission();
            }}
          >
            {view.uploading ? 'Checking receipt…' : 'Retry submission'}
          </Button>
          {view.row?.final ? (
            <details>
              <summary className="cursor-pointer py-3 text-sm font-medium">
                Late upload or device dispute: request school review
              </summary>
              <p className="mb-3 text-sm text-muted-foreground">
                Use this after the submission window has closed. The school must decide whether to
                accept your retained answers.
              </p>
              <label className="block text-sm" htmlFor="recovery-reason">
                Reason for school review
              </label>
              <textarea
                id="recovery-reason"
                className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3 text-sm"
                value={reason}
                disabled={!!view.row.recovery}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                className="mt-3 min-h-11"
                disabled={view.uploading || (!reason.trim() && !view.row.recovery)}
                onClick={() => {
                  void engine.recover(view.row?.recovery?.reason ?? reason);
                }}
              >
                Send retained answers for review
              </Button>
            </details>
          ) : null}
        </section>
      ) : null}
      {view.status === 'recovery' ? (
        <section className="space-y-4 rounded-xl border bg-background p-5">
          <h2 className="text-xl font-semibold">School review pending</h2>
          <p className="text-sm">
            Your evidence is awaiting a school decision. It is not yet an accepted submission.
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={view.uploading}
            onClick={() => {
              void engine.retrySubmission();
            }}
          >
            Check school decision
          </Button>
        </section>
      ) : null}
      {view.status === 'submitted' && view.row?.receipt ? (
        <section className="space-y-3 rounded-xl border bg-primary/5 p-6">
          <h2 className="text-2xl font-semibold">Submitted</h2>
          <p className="text-sm">
            Your final answers were accepted. Results will appear only after your school releases
            them.
          </p>
          <p className="break-all text-sm">Receipt: {view.row.receipt.receiptId}</p>
          <p className="text-sm">Accepted: {eatTime(view.row.receipt.acceptedAt)}</p>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/student">Return to my exams</Link>
          </Button>
        </section>
      ) : null}
      {blocker.state === 'blocked' ? (
        <section role="alert" className="space-y-3 rounded-xl border p-5">
          <h2 className="font-semibold">Leave this exam?</h2>
          <p className="text-sm">
            The timer continues. Reopening requires an internet connection. Saved answers remain on
            this device.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => blocker.reset()}>Keep exam open</Button>
            <Button
              variant="outline"
              disabled={view.saving || view.status === 'finalizing'}
              onClick={() => blocker.proceed()}
            >
              Leave with saved work
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
