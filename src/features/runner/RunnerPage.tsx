import { errorMessage } from '@/lib/api-client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { CircleCheck, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { eatTime } from '@/features/exams/ExamsPage';
import { RunnerEngine } from './engine';
import { ExamSecurityShield } from './ExamSecurityShield';
import { ExamQuestionSurface } from './ExamQuestionSurface';
import { QuestionNavigator } from './QuestionNavigator';
import { StudentAssistance } from '@/features/assistance/StudentAssistance';
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
    instance.useExternalSecurityShield();
    setEngine(instance);
    void instance.start();
    return () => instance.dispose();
  }, [client, schoolId, userId, attemptId, revision]);
  return engine ? (
    <RunnerScreen engine={engine} reopen={() => setRevision((n) => n + 1)} />
  ) : (
    <p role="status">Opening your saved answers…</p>
  );
}
function RunnerScreen({ engine, reopen }: { engine: RunnerEngine; reopen: () => void }) {
  const view = useSyncExternalStore(engine.subscribe, engine.snapshot);
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState('');
  const [assistanceError, setAssistanceError] = useState('');
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
      {!active && (
        <Link to="/student" className="inline-flex min-h-11 items-center text-sm underline">
          Back to my exams
        </Link>
      )}
      <div className="exam-topbar flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-sidebar-foreground">Official exam</p>
          <h1 className="mt-1 text-lg font-semibold sm:text-2xl">
            {view.paper?.title ?? 'Your exam'}
          </h1>
        </div>
        {active ? (
          <div className="shrink-0 rounded-xl bg-sidebar-accent/15 px-3 py-2">
            <p className="text-xs text-sidebar-foreground">Time remaining</p>
            <p className="text-2xl font-semibold tabular-nums" aria-label="Time remaining">
              {Math.floor(view.seconds / 60)}:{String(view.seconds % 60).padStart(2, '0')}
            </p>
          </div>
        ) : null}
      </div>
      <div role="status" className="border-b py-3 text-xs leading-relaxed">
        <p>{view.message || 'Checking that you can continue this exam…'}</p>
        {!online ? (
          <p className="mt-2 font-medium">
            Offline. Keep this tab open. Saved answers will wait for a connection.
          </p>
        ) : null}
        {view.row ? (
          <p className="mt-2 text-muted-foreground">
            {view.saving ? 'Saving on this device…' : `${answered} answers saved on this device`} ·{' '}
            {view.row.receipt ? 0 : view.row.outbox.length} changes waiting to send
            <br />
            Last answers received by your school:{' '}
            {view.row.attempt.lastServerSaveAt
              ? eatTime(view.row.attempt.lastServerSaveAt)
              : 'Not confirmed yet'}
          </p>
        ) : null}
      </div>
      {view.status === 'loading' ? <p>Opening your paper…</p> : null}
      {(active || view.status === 'blocked') && view.row && !view.row.final && (
        <StudentAssistance
          engine={engine}
          attemptId={view.row.attempt.attemptId}
          paused={!active}
          saving={view.saving}
        />
      )}
      {assistanceError && (
        <p role="alert">{assistanceError} Use Pause and request assistance to retry.</p>
      )}
      {view.status === 'blocked' ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Editing is paused</h2>
          <p className="text-sm">
            Your saved answers remain on this device. Connect to the internet before reopening.
          </p>
          <Button className="min-h-11" onClick={reopen}>
            Try opening exam again
          </Button>
          <Button asChild variant="outline" className="ml-2 min-h-11">
            <Link to="/student">My exams</Link>
          </Button>
        </div>
      ) : null}
      {active && view.paper && item ? (
        <ExamSecurityShield
          engine={engine}
          attemptId={view.row?.attempt.attemptId ?? 'Unavailable'}
          examTitle={view.paper.title}
          onRequestAssistance={async () => {
            setAssistanceError('');
            try {
              await engine.requestAssistance(crypto.randomUUID());
            } catch (failure) {
              setAssistanceError(errorMessage(failure));
              throw failure;
            }
          }}
        >
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Instructions and browser controls
            </summary>
            <div className="space-y-3 rounded-xl border bg-background p-4">
              <p>{view.paper.instructions}</p>
              <p>
                Browser interruptions are recorded for school review, not automatic penalties. The
                timer continues while you are away. Fullscreen is required. Each security
                interruption requires staff approval. Browser controls cannot guarantee screenshot
                prevention.
              </p>
              <Link to="/student" className="ml-4 inline-flex min-h-11 items-center underline">
                Back to my exams
              </Link>
            </div>
          </details>
          <QuestionNavigator
            items={view.paper.items}
            answers={view.row?.answers ?? []}
            index={index}
            onSelect={setIndex}
            reviewItemIds={view.row?.reviewItemIds ?? []}
          />
          <ExamQuestionSurface attemptId={view.row?.attempt.attemptId ?? 'Unavailable'}>
            <p className="mb-3 text-xs text-muted-foreground">
              Question {index + 1} of {view.paper.items.length} · {item.marks} marks
            </p>
            <fieldset disabled={view.saving || view.seconds === 0}>
              <legend className="exam-question-text mb-5 text-lg font-medium">{item.stem}</legend>
              <div className="space-y-3">
                {item.options.map((option, optionIndex) => (
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
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold"
                    >
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span className="exam-question-text text-sm leading-relaxed">
                      {option.text}
                    </span>
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
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              disabled={view.saving || view.seconds === 0}
              aria-pressed={view.row?.reviewItemIds?.includes(item.itemId) ?? false}
              onClick={() =>
                engine.markForReview(item.itemId, !view.row?.reviewItemIds?.includes(item.itemId))
              }
            >
              <Flag aria-hidden="true" />
              {view.row?.reviewItemIds?.includes(item.itemId)
                ? 'Remove review mark'
                : 'Mark for review'}
            </Button>
          </ExamQuestionSurface>
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
              <p className="text-sm">
                {view.row?.reviewItemIds?.length ?? 0} questions marked for review. You can still
                submit with review marks.
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
        </ExamSecurityShield>
      ) : null}
      {view.status === 'pending' || view.status === 'finalizing' ? (
        <section className="space-y-4 rounded-xl border-2 border-amber-500 bg-background p-5">
          <h2 className="text-xl font-semibold">
            {view.status === 'finalizing'
              ? 'Saving your final answers'
              : 'Waiting to send your answers'}
          </h2>
          <p className="text-sm">
            Keep this page open and do not clear your browser data. Wait until you see “Submitted
            successfully” before you leave.
          </p>
          <Button
            className="min-h-11"
            disabled={view.uploading || view.status === 'finalizing'}
            onClick={() => {
              void engine.retrySubmission();
            }}
          >
            {view.uploading ? 'Checking submission…' : 'Retry submission'}
          </Button>
          {view.row?.final ? (
            <details>
              <summary className="cursor-pointer py-3 text-sm font-medium">
                Could not submit on time? Ask your school for help
              </summary>
              <p className="mb-3 text-sm text-muted-foreground">
                Use this after the submission window has closed. The school must decide whether to
                accept your saved answers.
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
                Send saved answers for review
              </Button>
            </details>
          ) : null}
        </section>
      ) : null}
      {view.status === 'recovery' ? (
        <section className="space-y-4 rounded-xl border-2 border-amber-500 bg-background p-5">
          <h2 className="text-xl font-semibold">School review pending</h2>
          <p className="text-sm">
            Your saved answers are waiting for your school to review them. Your submission has not
            been accepted yet.
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
        <section
          role="status"
          className="space-y-3 rounded-xl border-2 border-emerald-600 bg-emerald-50 p-6 text-emerald-950"
        >
          <CircleCheck className="size-12 text-emerald-700" aria-hidden="true" />
          <h2 className="text-2xl font-semibold">Submitted successfully</h2>
          <p className="text-sm">
            Your final answers were accepted. Results will appear only after your school releases
            them.
          </p>
          <p className="break-all text-sm">Confirmation number: {view.row.receipt.receiptId}</p>
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
