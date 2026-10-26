import { isConnectionError } from '@/lib/api-client';
import { formatEatClock } from '@/lib/ethiopian-date';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ShieldCheck, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/shared/ErrorState';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiClient } from '@/lib/ApiProvider';
import { ApiError, errorMessage } from '@/lib/api-client';
import { examApi } from './api';
import { preparePaper, type PreparationStep } from './preparation';
import { eatTime, examStatus } from './ExamsPage';
export function clockSample(serverNow: string, receivedAt = performance.now()) {
  return { epoch: Date.parse(serverNow), receivedAt };
}
export function serverTime(sample: ReturnType<typeof clockSample>, now = performance.now()) {
  return sample.epoch + Math.max(0, now - sample.receivedAt);
}
function Countdown({
  sample,
  target,
  label = 'exam starts',
}: {
  sample: ReturnType<typeof clockSample>;
  target: string;
  label?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(target) - serverTime(sample)) / 1000));
  return (
    <p className="mt-4 rounded-xl bg-muted p-4 text-lg font-semibold tabular-nums text-foreground">
      {seconds
        ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s until ${label}`
        : `${label === 'exam starts' ? 'Start' : 'Preparation'} time reached. Refresh the schedule for the latest status.`}
    </p>
  );
}
export function PreparationPage() {
  const { sessionId = '' } = useParams();
  const { session } = useAuth();
  // Route identity owns mutation state; navigating to another paper resets it.
  return (
    <PreparationContent
      key={JSON.stringify([session?.school.id, session?.user.id, sessionId])}
      sessionId={sessionId}
    />
  );
}
function PreparationContent({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [refreshMessage, setRefreshMessage] = useState('');
  const [step, setStep] = useState<PreparationStep | null>(null);
  const [percentage, setPercentage] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const { session } = useAuth();
  const client = useApiClient();
  const api = examApi(client);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const query = useQuery({
    queryKey: ['exam', session?.school.id, session?.user.id, sessionId],
    queryFn: async ({ signal }) => {
      const result = await api.detail(sessionId, signal);
      return { ...result, clock: clockSample(result.serverNow) };
    },
    refetchInterval: 15_000,
  });
  const preparation = useMutation({
    mutationFn: async () => {
      if (!session || !query.data) throw new Error('Session unavailable.');
      operation.current?.abort();
      const controller = new AbortController();
      operation.current = controller;
      setPercentage(null);
      return preparePaper(
        api,
        { schoolId: session.school.id, userId: session.user.id },
        query.data.exam,
        controller.signal,
        setStep,
        (loaded, total) =>
          setPercentage(total ? Math.min(100, Math.floor((loaded / total) * 100)) : null),
      );
    },
    onSuccess: () => {
      void query.refetch();
    },
  });
  const exam = query.data?.exam;
  useEffect(() => {
    if (
      preparation.data &&
      query.data &&
      serverTime(query.data.clock) >= Date.parse(preparation.data.attempt.startsAt) &&
      serverTime(query.data.clock) < Date.parse(preparation.data.attempt.deadlineAt)
    ) {
      void navigate(`/student/attempts/${encodeURIComponent(preparation.data.attempt.attemptId)}`);
    }
  }, [preparation.data, query.data, navigate, tick]);
  const canPrepare =
    exam &&
    ['preparing', 'open'].includes(exam.phase) &&
    (!exam.attemptState || exam.attemptState === 'preparing');
  const deviceError =
    preparation.error instanceof ApiError && preparation.error.code === 'DEVICE_REPLACED';
  return (
    <div className="space-y-6">
      <Link
        to="/student"
        className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
      >
        ← My exams
      </Link>
      {query.isPending ? <p role="status">Loading schedule…</p> : null}
      {query.error && !isConnectionError(query.error) ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {exam && query.data ? (
        <>
          <div className="page-intro">
            <p className="mb-2 text-sm text-muted-foreground">
              {exam.subjectName} · {exam.className}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{exam.title}</h1>
            <p className="mt-3 text-sm font-medium">{examStatus(exam)}</p>
          </div>
          <dl className="grid gap-5 nexora-surface rounded-xl border bg-background p-6 sm:grid-cols-2">
            {[
              ['Preparation opens', exam.preparationVisibleAt],
              ['Exam starts', exam.startsAt],
              ['Scheduled end', exam.endsAt],
              ['Your deadline', exam.deadlineAt],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-medium">
                  {value ? eatTime(value) : 'Unavailable'}
                </dd>
              </div>
            ))}
          </dl>
          <section className="nexora-surface rounded-xl border bg-background p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <LockKeyhole className="size-5" aria-hidden="true" />
              Get ready for your exam
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Download the exam onto this device before it starts. You will be able to see the
              questions at the scheduled start time. Stay connected to open the exam.
            </p>
            {exam.phase === 'scheduled' ? (
              <div>
                <Countdown
                  sample={query.data.clock}
                  target={exam.preparationVisibleAt}
                  label="preparation"
                />
                <p className="mt-4 text-sm">
                  Return at {eatTime(exam.preparationVisibleAt)} to download your exam.
                </p>
              </div>
            ) : null}
            {canPrepare ? (
              <>
                <Countdown sample={query.data.clock} target={exam.startsAt} />
                <Button
                  data-tour="download-exam"
                  className="mt-5 h-auto min-h-11 whitespace-normal py-3"
                  disabled={preparation.isPending || !!query.error}
                  onClick={() => preparation.mutate()}
                >
                  {preparation.isPending
                    ? 'Getting your exam ready…'
                    : preparation.data
                      ? 'Download again'
                      : preparation.isError
                        ? 'Try download again'
                        : 'Download exam'}
                </Button>
              </>
            ) : null}
            {exam.attemptState === 'active' ? (
              <p className="mt-4 text-sm">
                You have already started this exam. Open it in the same browser to continue. Your
                original deadline still applies.
              </p>
            ) : null}
            {exam.phase === 'ended' && !exam.attemptState ? (
              <p className="mt-4 text-sm">
                This exam window has ended. A new attempt cannot be started.
              </p>
            ) : null}
            {exam.attemptState &&
            ['awaiting_upload', 'recovery_pending', 'submitted', 'invalidated'].includes(
              exam.attemptState,
            ) ? (
              <p className="mt-4 text-sm">
                {exam.attemptState === 'submitted'
                  ? 'Your submission has been recorded. Open your saved exam to check the confirmation for the answers on this device.'
                  : 'You do not need to download this exam again. Open your saved exam for its status, or ask your school for help. Keep any unsent answers in the original browser.'}
              </p>
            ) : null}
          </section>
          {exam.attemptId ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link to={`/student/attempts/${encodeURIComponent(exam.attemptId)}`}>
                Open saved exam
              </Link>
            </Button>
          ) : null}
          {exam.attemptId && (
            <Link
              to="/student/device"
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Need a replacement browser? Register it for school approval.
            </Link>
          )}
          <section
            className="nexora-surface rounded-xl border bg-background p-5"
            aria-label="Exam download"
          >
            <h2 className="font-semibold">Exam download</h2>
            <p role="status" className="mt-2 text-sm">
              {preparation.isPending
                ? percentage === 100
                  ? 'Finishing download…'
                  : percentage === null
                    ? 'Downloading exam…'
                    : 'Downloading exam: ' + percentage + '%'
                : preparation.isError
                  ? 'Download could not finish. Please try again.'
                  : preparation.isSuccess
                    ? 'Exam downloaded. Keep this page open.'
                    : 'Not started'}
            </p>
            {preparation.isPending && (
              <progress
                className="mt-3 w-full"
                aria-label="Exam download progress"
                max={100}
                value={percentage ?? undefined}
              />
            )}
          </section>
          {preparation.error ? (
            <div role="alert" className="rounded-xl border border-destructive/30 p-5 text-sm">
              <p>{errorMessage(preparation.error)}</p>
              {step === 'report' && (
                <p className="mt-2">
                  Your exam is saved, but we could not confirm that your school received your ready
                  status. Try the download again. Your exam deadline stays the same.
                </p>
              )}
              <p className="mt-2">
                Keep this page open and do not clear your browser data. Check your connection, then
                try again. If the exam has ended, contact your school.
              </p>
              {deviceError ? (
                <p className="mt-2">
                  Ask your school to approve this device. Keep any saved answers in the original
                  browser; do not clear its data.
                </p>
              ) : null}
            </div>
          ) : null}
          {preparation.isSuccess &&
          preparation.data &&
          preparation.data.attempt.scheduleRevision === exam.scheduleRevision ? (
            <div role="status" className="rounded-xl border bg-primary/5 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5" aria-hidden="true" />
                {preparation.data.shell === 'ready'
                  ? 'Ready for your exam'
                  : 'Exam saved for this demo'}
              </h2>
              <p className="mt-2 text-sm">
                {preparation.data.shell === 'ready'
                  ? 'Your exam is saved on this device and your school has been notified. Keep this tab open and stay connected until the exam starts.'
                  : 'Your exam is saved on this device. Offline access is not checked in this demo, and your school has not been notified that you are ready. Keep the demo running and stay connected.'}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border border-dashed p-5 text-sm leading-relaxed text-muted-foreground">
            Keep this tab open. You need an internet connection to start the exam or reopen it after
            refreshing. Once the exam opens, your answers can still save on this device if the
            connection drops.
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={query.isFetching}
            onClick={async () => {
              setRefreshMessage('Checking the latest schedule…');
              const result = await query.refetch();
              setRefreshMessage(
                result.error
                  ? 'Schedule could not be updated. Check your connection and try again.'
                  : `Schedule updated. Last checked: ${formatEatClock(result.data?.serverNow ?? query.data.serverNow, true)}.`,
              );
            }}
          >
            {query.isFetching ? 'Checking schedule…' : 'Refresh schedule'}
          </Button>
          {refreshMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {refreshMessage}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
